import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// This is intentionally separate from npm test. Run only against a database
// explicitly approved for this test, for example:
// ASHTRAY_CLOUD_TEST=1 node --env-file=/approved/path.env scripts/test-cloud-social.mjs
// No env file is loaded implicitly, no schema is created, and credentials are
// never printed. Only uniquely generated test-owned accounts are removed.
if (process.env.ASHTRAY_CLOUD_TEST !== "1" || !process.env.DATABASE_URL) {
  console.error("Cloud tests were not run. Supply an approved DATABASE_URL and set ASHTRAY_CLOUD_TEST=1 explicitly.");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const library = join(root, "lib");
const temp = await mkdtemp(join(tmpdir(), "ashtray-cloud-test-"));
const databaseURL = process.env.DATABASE_URL;
const suffix = `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const names = { owner: `qa_${suffix}_a`, viewer: `qa_${suffix}_b` };
const testPassword = `Qa1!${randomBytes(22).toString("base64url")}`;
const privateNote = `Private QA context ${randomUUID()}`;
const owned = [];
const stores = [];
let pool;
let qaNamesReserved = false;
let phase = "prepare isolated module";
let failure;
let cleanupFailure;
let passed = false;
const startedAt = Date.now();

function checkpoint(value) {
  phase = value;
  console.log(`Cloud QA (${((Date.now() - startedAt) / 1000).toFixed(1)}s): ${value}.`);
}

const safeCode = (value) => typeof value === "string" && /^[A-Z0-9_]{1,40}$/.test(value) ? value : "UNSPECIFIED";
function reportFailure(label, error) {
  // Driver messages can include a connection string. Never print them or stacks.
  console.error(`${label} during ${phase} (${safeCode(error?.code)}).`);
  if (error?.code === "ERR_ASSERTION") console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted database URL]"));
}

// Transpile actual source, resolving runtime imports without changing the app.
const staged = new Map();
async function stageModule(sourcePath) {
  const path = resolve(sourcePath);
  assert.ok(path.startsWith(`${library}/`), "Only app library modules can be staged");
  if (staged.has(path)) return staged.get(path);
  const outputPath = join(temp, relative(library, path).replace(/\.tsx?$/, ".mjs"));
  staged.set(path, outputPath);
  const source = await readFile(path, "utf8");
  let output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText;
  const specifiers = [...output.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
  for (const specifier of new Set(specifiers)) {
    let replacement = specifier;
    if (specifier.startsWith(".")) {
      const dependency = resolve(dirname(path), specifier);
      replacement = pathToFileURL(await stageModule(extname(dependency) ? dependency : `${dependency}.ts`)).href;
    } else if (!specifier.startsWith("node:")) replacement = import.meta.resolve(specifier);
    output = output.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(replacement)}`)
      .replaceAll(`from '${specifier}'`, `from ${JSON.stringify(replacement)}`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  return outputPath;
}

try {
  const modulePath = await stageModule(join(library, "cloud-store.ts"));
  const { CloudStore } = await import(pathToFileURL(modulePath));
  const { DEFAULT_FAVORITES, DEFAULT_DRINK_FAVORITES } = await import(pathToFileURL(await stageModule(join(library, "catalog.ts"))));
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  if (typeof globalThis.WebSocket !== "function") throw Object.assign(new Error(), { code: "NODE_WEBSOCKET_REQUIRED" });
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  pool = new Pool({ connectionString: databaseURL, max: 1, connectionTimeoutMillis: 8000, idleTimeoutMillis: 1000 });
  // An idle socket error must not bypass the exact-account cleanup in finally.
  pool.on("error", () => {});

  checkpoint("read-only schema preflight");
  const schema = await pool.query("SELECT to_regclass('ashtray.users')::text AS users");
  assert.equal(schema.rows[0]?.users, "ashtray.users", "Apply the approved cloud schema before running cloud tests");
  const store = new CloudStore(databaseURL);
  const peer = new CloudStore(databaseURL);
  stores.push(store, peer);
  const rejects = (action, status) => assert.rejects(action, (error) => error.status === status);
  assert.equal((await store.state()).user, null);
  await rejects(() => store.mutate({ action: "log", productId: "marlboro-red" }), 401);

  checkpoint("create two isolated QA accounts");
  const existing = await pool.query("SELECT id FROM ashtray.users WHERE username = ANY($1::text[])", [Object.values(names)]);
  assert.equal(existing.rows.length, 0, "Generated QA usernames must not already belong to anyone");
  qaNamesReserved = true;
  const a = await store.mutate({ action: "register", name: "Cloud QA owner", username: names.owner, password: testPassword });
  owned.push({ id: a.state.user.id, username: names.owner });
  const b = await peer.mutate({ action: "register", name: "Cloud QA viewer", username: names.viewer, password: testPassword });
  owned.push({ id: b.state.user.id, username: names.viewer });
  let ownerToken = a.sessionToken;
  const viewerToken = b.sessionToken;
  assert.ok(typeof ownerToken === "string" && ownerToken.length > 20);
  assert.ok(typeof viewerToken === "string" && viewerToken.length > 20);
  assert.equal(a.state.user.sharing, "summary", "Registration must not silently enable detailed sharing");
  assert.equal(JSON.stringify(a.state).includes(testPassword), false, "Passwords must never appear in responses");
  assert.equal(/"(?:password(?:[_A-Z][^"]*)?|token_hash|password_salt|password_hash)"\s*:/i.test(JSON.stringify(a.state)), false, "Authentication internals must never appear in tracker data");
  await writeFile(join(temp, "cleanup.json"), JSON.stringify({ owned }, null, 2), { mode: 0o600 });

  checkpoint("authentication across store instances");
  assert.equal((await peer.state(ownerToken)).user.id, owned[0].id);
  await rejects(() => peer.mutate({ action: "login", username: names.owner, password: "incorrect-qa-password" }), 401);
  const login = await peer.mutate({ action: "login", username: names.owner.toUpperCase(), password: testPassword }, ownerToken);
  assert.equal((await store.state(ownerToken)).user, null, "Login rotates the previous session across instances");
  ownerToken = login.sessionToken;
  assert.equal((await store.state(ownerToken)).user.id, owned[0].id);
  await store.mutate({ action: "settings", timezone: "UTC" }, ownerToken);

  checkpoint("ordered favorites, account isolation and concurrent editors");
  assert.deepEqual(a.state.user.favoriteIds, [...DEFAULT_FAVORITES, ...DEFAULT_DRINK_FAVORITES], "New cloud accounts seed both shelves");
  const initialFavorites = [...a.state.user.favoriteIds];
  const favoriteOrder = ["kingfisher-premium", "classic-milds", "marlboro-red"];
  const beforeFavorites = await store.syncRevision(ownerToken);
  const viewerFavoriteRevision = await peer.syncRevision(viewerToken);
  const favoriteSave = await store.mutate({ action: "settings", favoriteIds: [...favoriteOrder, "classic-milds"], expectedFavoriteIds: initialFavorites, userId: owned[1].id }, ownerToken);
  assert.deepEqual(favoriteSave.state.user.favoriteIds, favoriteOrder, "Cloud favorites preserve the first occurrence order");
  assert.notEqual(favoriteSave.state.revision, beforeFavorites);
  assert.deepEqual((await peer.state(viewerToken)).user.favoriteIds, b.state.user.favoriteIds, "A forged user ID cannot change another account's favorites");
  assert.equal(await peer.syncRevision(viewerToken), viewerFavoriteRevision);
  await assert.rejects(() => peer.mutate({ action: "settings", favoriteIds: ["marlboro-red"], expectedFavoriteIds: initialFavorites, name: "Must not save" }, ownerToken), error => error.status === 409 && error.message === "Your favorites changed on another device. Reload your saved favorites and try again.");
  assert.equal((await store.state(ownerToken)).user.name, "Cloud QA owner", "A cloud conflict cannot partially save unrelated settings");
  await rejects(() => store.mutate({ action: "settings", favoriteIds: [], expectedFavoriteIds: [...favoriteOrder].reverse() }, ownerToken), 409);
  for (const invalid of [["not-in-catalog"], [42], Array(13).fill("marlboro-red")]) {
    await rejects(() => store.mutate({ action: "settings", favoriteIds: invalid }, ownerToken), 400);
  }
  await rejects(() => store.mutate({ action: "settings", favoriteIds: [], expectedFavoriteIds: "invalid" }, ownerToken), 400);
  await store.mutate({ action: "settings", favoriteIds: [], expectedFavoriteIds: favoriteOrder }, ownerToken);
  assert.deepEqual((await peer.state(ownerToken)).user.favoriteIds, [], "An empty shelf persists across cloud instances");
  const favoriteContenders = await Promise.allSettled([
    store.mutate({ action: "settings", favoriteIds: ["marlboro-red"], expectedFavoriteIds: [] }, ownerToken),
    peer.mutate({ action: "settings", favoriteIds: ["classic-milds"], expectedFavoriteIds: [] }, ownerToken),
  ]);
  assert.equal(favoriteContenders.filter(result => result.status === "fulfilled").length, 1, "Only one cloud editor can save against the same original snapshot");
  assert.equal(favoriteContenders.filter(result => result.status === "rejected" && result.reason.status === 409).length, 1);
  const favoriteWinner = favoriteContenders.find(result => result.status === "fulfilled").value;
  assert.deepEqual((await peer.state(ownerToken)).user.favoriteIds, favoriteWinner.state.user.favoriteIds, "A conflicting concurrent save cannot overwrite the winner");
  await store.mutate({ action: "settings", favoriteIds: ["marlboro-red", "classic-milds"] }, ownerToken);

  checkpoint("owner isolation and historical costs");
  const viewerRevision = await peer.syncRevision(viewerToken);
  const original = await store.mutate({ action: "log", productId: "classic-milds", quantity: 2, unitCostInr: 27.25, note: privateNote }, ownerToken);
  const originalId = original.state.events[0].id;
  assert.equal((await peer.state(viewerToken)).events.length, 0);
  assert.equal(await peer.syncRevision(viewerToken), viewerRevision, "Unconnected users must not receive log invalidations");
  await rejects(() => peer.mutate({ action: "delete", id: originalId }, viewerToken), 404);
  await store.mutate({ action: "settings", defaultPrice: 30, priceOverrides: { "classic-milds": 31 } }, ownerToken);
  assert.equal((await peer.state(ownerToken)).events.find((event) => event.id === originalId).unitCostInr, 27.25);

  checkpoint("concurrent first-write idempotency");
  const concurrentInput = { action: "log", productId: "marlboro-red", quantity: 1, unitCostInr: 25, requestId: randomUUID(), note: privateNote };
  const concurrentResults = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => (index % 2 ? store : peer).mutate(concurrentInput, ownerToken)));
  // Let every request finish before cleanup, including when one request fails.
  const concurrentFailure = concurrentResults.find((result) => result.status === "rejected");
  if (concurrentFailure) throw concurrentFailure.reason;
  let ownerState = await peer.state(ownerToken);
  const concurrentEntries = ownerState.events.filter((event) => event.requestId === concurrentInput.requestId);
  assert.equal(concurrentEntries.length, 1, "Concurrent requests from separate instances must produce one entry");
  assert.equal(ownerState.events.length, 2);
  const afterConcurrent = await store.syncRevision(ownerToken);
  await peer.mutate(concurrentInput, ownerToken);
  assert.equal(await store.syncRevision(ownerToken), afterConcurrent, "An identical retry must not change the revision");
  await rejects(() => peer.mutate({ ...concurrentInput, quantity: 3 }, ownerToken), 409);

  checkpoint("accepted connection and optional activity sharing");
  await store.mutate({ action: "request", code: b.state.user.inviteCode }, ownerToken);
  let viewerState = await peer.state(viewerToken);
  assert.equal(viewerState.friends.length, 0, "A pending request must not expose a friend snapshot");
  const request = viewerState.requests.find((item) => item.fromId === owned[0].id);
  assert.ok(request);
  await rejects(() => store.mutate({ action: "respond", id: request.id, accept: true }, ownerToken), 404);
  await peer.mutate({ action: "respond", id: request.id, accept: true }, viewerToken);
  viewerState = await peer.state(viewerToken);
  assert.equal(viewerState.friends[0].activity, null, "Existing summary mode must not expose the detailed timeline");
  assert.equal(viewerState.friends[0].stats.todayCigs, 3);
  assert.equal(JSON.stringify(viewerState.friends).includes("favoriteIds"), false);
  const connectedFavoritesRevision = await peer.syncRevision(viewerToken);
  await store.mutate({ action: "settings", favoriteIds: ["classic-milds", "marlboro-red"], expectedFavoriteIds: ["marlboro-red", "classic-milds"] }, ownerToken);
  assert.equal(await peer.syncRevision(viewerToken), connectedFavoritesRevision, "Accepted friends do not receive favorite-change invalidations");
  const beforeOptIn = await peer.syncRevision(viewerToken);
  await store.mutate({ action: "settings", sharing: "activity" }, ownerToken);
  assert.notEqual(await peer.syncRevision(viewerToken), beforeOptIn);
  let friend = (await peer.state(viewerToken)).friends[0];
  assert.equal(friend.activity.timezone, "UTC");
  assert.equal(friend.activity.today.length, 2);
  assert.equal(friend.stats.todayCigs, 3);
  const allowed = ["id", "productId", "productName", "quantity", "loggedAt", "localDate", "localTime"].sort();
  for (const entry of friend.activity.today) {
    assert.deepEqual(Object.keys(entry).sort(), allowed, "Friend rows must use the explicit public allowlist");
    assert.ok(["marlboro-red", "classic-milds"].includes(entry.productId));
    const personal = ownerState.events.find((event) => event.id === entry.id);
    assert.equal(entry.loggedAt, personal.loggedAt, "Exact canonical timestamps must survive cloud serialization");
    assert.equal(entry.quantity, personal.quantity);
    const date = new Date(entry.loggedAt);
    assert.equal(entry.localDate, date.toISOString().slice(0, 10));
    assert.equal(entry.localTime, date.toISOString().slice(11, 16));
  }
  assert.equal(JSON.stringify(friend).includes(privateNote), false);
  assert.equal(JSON.stringify(friend).includes("inviteCode"), false);

  checkpoint("friend timezone changes re-bucket existing timestamps");
  await store.mutate({ action: "settings", timezone: "Asia/Kolkata" }, ownerToken);
  friend = (await peer.state(viewerToken)).friends[0];
  assert.equal(friend.activity.timezone, "Asia/Kolkata");
  const indiaDate = (value) => new Date(new Date(value).getTime() + 330 * 60_000).toISOString();
  const indiaToday = indiaDate(new Date()).slice(0, 10);
  const expectedIndiaEntries = ownerState.events.filter((event) => indiaDate(event.loggedAt).slice(0, 10) === indiaToday);
  assert.equal(friend.activity.today.length, expectedIndiaEntries.length);
  assert.equal(friend.stats.todayCigs, expectedIndiaEntries.reduce((sum, event) => sum + event.quantity, 0));
  for (const entry of friend.activity.today) {
    assert.equal(entry.localDate, indiaDate(entry.loggedAt).slice(0, 10));
    assert.equal(entry.localTime, indiaDate(entry.loggedAt).slice(11, 16));
  }
  await store.mutate({ action: "settings", timezone: "UTC" }, ownerToken);

  checkpoint("private-note updates do not reveal their timing");
  const beforeNotePeer = await peer.syncRevision(viewerToken);
  const beforeNoteOwner = await store.syncRevision(ownerToken);
  const editedNote = `${privateNote} edited`;
  const noteUpdate = await pool.query(
    "UPDATE ashtray.tracker_events SET event_json = jsonb_set(event_json, '{note}', to_jsonb($3::text), true) WHERE id = $1 AND user_id = $2",
    [originalId, owned[0].id, editedNote],
  );
  assert.equal(noteUpdate.rowCount, 1, "Only this run's captured event may be updated");
  assert.notEqual(await store.syncRevision(ownerToken), beforeNoteOwner, "The owner must receive their own private edit invalidation");
  assert.equal(await peer.syncRevision(viewerToken), beforeNotePeer, "A private-note-only edit must not reveal timing to friends");
  assert.equal(JSON.stringify((await peer.state(viewerToken)).friends[0]).includes(editedNote), false);

  checkpoint("drink and private-mode suppression");
  const beforeDrink = await peer.syncRevision(viewerToken);
  await store.mutate({ action: "log", productId: "kingfisher-premium", quantity: 1, unitCostInr: 987.65, note: privateNote }, ownerToken);
  assert.equal(await peer.syncRevision(viewerToken), beforeDrink, "Drink logs must not reveal even invalidation timing");
  friend = (await peer.state(viewerToken)).friends[0];
  assert.equal(friend.activity.today.length, 2);
  assert.equal(JSON.stringify(friend).includes("Kingfisher"), false);
  await store.mutate({ action: "settings", sharing: "private" }, ownerToken);
  friend = (await peer.state(viewerToken)).friends[0];
  assert.equal(friend.activity, null);
  assert.equal(friend.stats, null);
  const beforePrivate = await peer.syncRevision(viewerToken);
  await store.mutate({ action: "log", productId: "marlboro-red", quantity: 1, note: privateNote }, ownerToken);
  assert.equal(await peer.syncRevision(viewerToken), beforePrivate);
  await store.mutate({ action: "settings", sharing: "summary" }, ownerToken);
  friend = (await peer.state(viewerToken)).friends[0];
  assert.equal(friend.activity, null);
  assert.equal(friend.stats.todayCigs, 4);

  checkpoint("durable sessions, logs and connections in a fresh instance");
  const fresh = new CloudStore(databaseURL);
  stores.push(fresh);
  ownerState = await fresh.state(ownerToken);
  assert.equal(ownerState.user.id, owned[0].id);
  assert.deepEqual(ownerState.user.favoriteIds, ["classic-milds", "marlboro-red"], "Saved order and an explicitly empty drink shelf survive a fresh cloud instance");
  assert.equal(ownerState.events.length, 4);
  assert.equal(ownerState.events.find((event) => event.id === originalId).unitCostInr, 27.25);
  assert.equal((await fresh.state(viewerToken)).friends[0].id, owned[0].id);
  assert.equal(await fresh.syncRevision(ownerToken), await store.syncRevision(ownerToken));
  await peer.mutate({ action: "remove", id: owned[0].id }, viewerToken);
  assert.equal((await fresh.state(ownerToken)).friends.length, 0, "Removing a friend revokes access for both accounts");
  await store.mutate({ action: "logout" }, ownerToken);
  assert.equal((await fresh.state(ownerToken)).user, null);
  passed = true;
} catch (error) {
  failure = error;
  reportFailure("Cloud test failed", error);
} finally {
  checkpoint("cleanup of captured QA accounts");
  if (qaNamesReserved && pool) {
    try {
      // Recover a successful registration whose response failed before its ID
      // reached the test. These exact unpredictable names were absent above.
      const recovered = await pool.query("SELECT id, username FROM ashtray.users WHERE username = ANY($1::text[])", [Object.values(names)]);
      for (const account of recovered.rows) if (!owned.some((item) => item.id === account.id)) owned.push(account);
      for (const account of owned) assert.ok(account.username.startsWith(`qa_${suffix}_`) && account.id, "Cleanup is restricted to this run's generated accounts");
      await writeFile(join(temp, "cleanup.json"), JSON.stringify({ owned }, null, 2), { mode: 0o600 });
      if (owned.length) {
        const values = owned.flatMap((account) => [account.id, account.username]);
        const pairs = owned.map((_, index) => `($${index * 2 + 1}::text,$${index * 2 + 2}::text)`).join(",");
        // Both the captured UUID and exact generated username must match.
        await pool.query(`DELETE FROM ashtray.users WHERE (id,username) IN (VALUES ${pairs})`, values);
        const remaining = await pool.query("SELECT count(*)::int AS count FROM ashtray.users WHERE id = ANY($1::text[])", [owned.map((account) => account.id)]);
        assert.equal(remaining.rows[0].count, 0, "All test-owned accounts must be cleaned up");
      }
      // These keys are scoped to this run's exact generated names/IDs. Global
      // registration/authentication limits belong to everyone and stay intact.
      const rateKeys = [
        ...Object.values(names).map((name) => `authentication:${name}`),
        ...owned.flatMap((account) => [`mutation:${account.id}`, `invites:${account.id}`]),
      ].map((value) => createHash("sha256").update(value).digest("hex"));
      await pool.query("DELETE FROM ashtray.rate_limits WHERE key = ANY($1::text[])", [rateKeys]);
      const remainingRates = await pool.query("SELECT count(*)::int AS count FROM ashtray.rate_limits WHERE key = ANY($1::text[])", [rateKeys]);
      assert.equal(remainingRates.rows[0].count, 0, "Only this run's account-specific rate rows must be cleaned up");
    } catch (error) {
      cleanupFailure = error;
      reportFailure("QA cleanup failed", error);
      console.error(`A nonsecret cleanup manifest was retained at ${join(temp, "cleanup.json")}.`);
    }
  }
  await Promise.allSettled(stores.map((store) => store.close()));
  if (pool) { try { await pool.end(); } catch {} }
  if (!cleanupFailure) await rm(temp, { recursive: true, force: true });
}

if (failure || cleanupFailure || !passed) process.exitCode = 1;
else console.log("PASS: cloud authentication, owner isolation, concurrent idempotence, optional brand/time sharing, privacy, cross-instance durability and QA cleanup.");
