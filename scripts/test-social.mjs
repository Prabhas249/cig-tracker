import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

// Transpile the actual store into an isolated temporary directory. Tests use a
// temporary SQLite database and never create accounts in the running app.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(join(tmpdir(), "ashtray-social-test-"));
let store;
let routeStore;
const streams = [];
const aborts = [];
const originalDirectory = process.cwd();
try {
  for (const file of ["pricing", "catalog", "time", "local-store"]) {
    const source = await readFile(join(root, "lib", `${file}.ts`), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    } }).outputText.replace(/from "\.\/(pricing|catalog|time)"/g, 'from "./$1.mjs"');
    await writeFile(join(temp, `${file}.mjs`), output);
  }
  const { LocalStore, getLocalStore } = await import(pathToFileURL(join(temp, "local-store.mjs")));
  const database = join(temp, "data");
  store = new LocalStore(database);
  const rejects = (action, status) => assert.rejects(action, (error) => error.status === status);
  assert.equal(store.state().user, null);
  await rejects(() => store.mutate({ action: "log", productId: "marlboro-red" }), 401);

  const a = await store.mutate({ action: "register", name: "Alice", username: "alice", password: "alice-test-password" });
  const b = await store.mutate({ action: "register", name: "Bob", username: "bob", password: "bob-test-password" });
  let aliceToken = a.sessionToken;
  const bobToken = b.sessionToken;
  assert.equal(a.state.user.defaultPrice, 25);
  assert.equal(a.state.user.sharing, "summary", "New accounts do not opt into cigarette details implicitly");
  assert.equal(JSON.stringify(a.state).includes("password"), false);
  await rejects(() => store.mutate({ action: "register", name: "Other", username: "ALICE", password: "duplicate-test-password" }), 409);
  await rejects(() => store.mutate({ action: "login", username: "alice", password: "wrong-password" }), 401);
  const login = await store.mutate({ action: "login", username: "ALICE", password: "alice-test-password" }, aliceToken);
  assert.equal(store.state(aliceToken).user, null, "Login rotates the prior session token");
  aliceToken = login.sessionToken;

  const logInput = { action: "log", productId: "marlboro-red", quantity: 2, unitCostInr: 25, note: "Personal note", requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  const bobBeforeLog = store.syncRevision(bobToken);
  const logged = await store.mutate(logInput, aliceToken);
  assert.equal(logged.state.events.length, 1);
  assert.equal(logged.state.events[0].unitCostInr, 25);
  assert.equal(logged.state.events[0].quantity, 2);
  assert.equal(logged.state.events[0].requestId, logInput.requestId);
  assert.equal(logged.state.revision, store.syncRevision(aliceToken));
  const repeated = await store.mutate(logInput, aliceToken);
  assert.equal(repeated.state.events.length, 1, "Network retries deduplicate within the account");
  assert.equal(repeated.state.revision, logged.state.revision, "An idempotent retry does not produce a false sync change");
  await rejects(() => store.mutate({ ...logInput, quantity: 3 }, aliceToken), 409);
  assert.equal(store.syncRevision(bobToken), bobBeforeLog, "Unconnected accounts do not receive activity invalidations");
  assert.equal(store.state(bobToken).events.length, 0, "Other users cannot read personal entries");
  const bobIndependent = await store.mutate(logInput, bobToken);
  assert.equal(bobIndependent.state.events.length, 1, "Idempotency keys are scoped to the authenticated account");
  await store.mutate({ action: "delete", id: bobIndependent.state.events[0].id }, bobToken);
  const entryId = logged.state.events[0].id;
  await rejects(() => store.mutate({ action: "delete", id: entryId }, bobToken), 404);
  for (const values of [
    { productId: "unknown-product" }, { quantity: -1 }, { quantity: 1.5 },
    { unitCostInr: -5 }, { unitCostInr: 25.123 }, { loggedAt: "2099-01-01T00:00:00Z" },
    { loggedAt: "2026-02-30T00:00:00Z" }, { loggedAt: "2026-10-01T00:00" },
  ]) await rejects(() => store.mutate({ action: "log", productId: "marlboro-red", quantity: 1, unitCostInr: 25, ...values }, aliceToken), 400);
  await rejects(() => store.mutate({ action: "settings", timezone: "made/up" }, aliceToken), 400);
  await rejects(() => store.mutate({ action: "settings", priceOverrides: { nonexistent: 20 } }, aliceToken), 400);

  await store.mutate({ action: "settings", defaultPrice: 30, dailyLimit: 6, priceOverrides: { "marlboro-red": 27 } }, aliceToken);
  const newer = await store.mutate({ action: "log", productId: "marlboro-red" }, aliceToken);
  assert.equal(newer.state.events.find((entry) => entry.id !== entryId).unitCostInr, 27);
  assert.equal(newer.state.events.find((entry) => entry.id === entryId).unitCostInr, 25, "Changing prices preserves historic costs");

  await rejects(() => store.mutate({ action: "request", code: a.state.user.inviteCode }, aliceToken), 400);
  await store.mutate({ action: "request", code: b.state.user.inviteCode.toLowerCase() }, aliceToken);
  const pendingRevision = store.syncRevision(bobToken);
  const pendingActivity = await store.mutate({ action: "log", productId: "marlboro-red" }, aliceToken);
  assert.equal(store.syncRevision(bobToken), pendingRevision, "Pending requests do not reveal activity timing");
  await store.mutate({ action: "delete", id: pendingActivity.state.events.find(event => !newer.state.events.some(old => old.id === event.id)).id }, aliceToken);
  assert.equal(store.state(aliceToken).friends.length, 0, "Requests do not share stats before consent");
  const pending = store.state(bobToken).requests[0];
  await rejects(() => store.mutate({ action: "respond", id: pending.id, accept: true }, aliceToken), 404);
  await rejects(() => store.mutate({ action: "request", code: b.state.user.inviteCode }, aliceToken), 409);
  const connected = await store.mutate({ action: "respond", id: pending.id, accept: true }, bobToken);
  assert.equal(connected.state.friends.length, 1);
  assert.equal(connected.state.friends[0].stats.todayCigs, 3);
  assert.equal(connected.state.friends[0].stats.weekSpend, 77);
  assert.equal(connected.state.friends[0].stats.weeklyCounts.length, 7);
  assert.equal(connected.state.friends[0].activity, null, "Existing summary mode stays counts-only");
  assert.equal(JSON.stringify(connected.state.friends).includes("Personal note"), false);
  assert.equal(JSON.stringify(connected.state.friends).includes("inviteCode"), false);
  assert.equal(JSON.stringify(connected.state.friends).includes("requestId"), false);
  let friendRevision = store.syncRevision(bobToken);
  const peerStore = new LocalStore(database);
  try {
    const before = peerStore.syncRevision(aliceToken);
    const changed = await store.mutate({ action: "log", productId: "marlboro-red" }, aliceToken);
    assert.notEqual(peerStore.syncRevision(aliceToken), before, "SQLite revisions update across connections and tabs");
    assert.notEqual(store.syncRevision(bobToken), friendRevision, "Accepted friends receive new cigarette invalidations");
    friendRevision = store.syncRevision(bobToken);
    const newId = changed.state.events.find(event => !newer.state.events.some(old => old.id === event.id)).id;
    await store.mutate({ action: "delete", id: newId }, aliceToken);
    assert.notEqual(store.syncRevision(bobToken), friendRevision, "Deleting a cigarette invalidates accepted friends");
  } finally { peerStore.close(); }
  friendRevision = store.syncRevision(bobToken);
  const drink = await store.mutate({ action: "log", productId: "kingfisher-premium" }, aliceToken);
  assert.equal(store.syncRevision(bobToken), friendRevision, "Drink activity remains private, including its timing");
  await store.mutate({ action: "delete", id: drink.state.events.find(event => event.kind === "drink").id }, aliceToken);
  await store.mutate({ action: "settings", name: "Alicia" }, aliceToken);
  assert.notEqual(store.syncRevision(bobToken), friendRevision, "Name changes update friends' identities");
  await store.mutate({ action: "settings", sharing: "private" }, aliceToken);
  assert.equal(store.state(bobToken).friends[0].stats, null, "Private mode hides the entire summary");
  friendRevision = store.syncRevision(bobToken);
  const privateLog = await store.mutate({ action: "log", productId: "marlboro-red" }, aliceToken);
  assert.equal(store.syncRevision(bobToken), friendRevision, "Private cigarette activity does not emit friend invalidations");
  await store.mutate({ action: "delete", id: privateLog.state.events.find(event => !newer.state.events.some(old => old.id === event.id)).id }, aliceToken);
  await store.mutate({ action: "settings", city: "Private city" }, aliceToken);
  assert.equal(store.syncRevision(bobToken), friendRevision, "Private settings never enter friend invalidations");
  await store.mutate({ action: "settings", sharing: "summary" }, aliceToken);

  store.close();
  store = new LocalStore(database);
  assert.equal(store.state(aliceToken).events.length, 2, "Entries survive reopening SQLite");
  assert.equal(store.state(bobToken).friends[0].stats.todayCigs, 3, "Sessions and connections survive restart");
  const { importSnapshot } = await import(pathToFileURL(join(root, "scripts", "import-legacy.mjs")));
  const legacy = { ...logged.state.events[0], id: "11111111-1111-4111-8111-111111111111", unitCostInr: 19 };
  const options = { databasePath: join(database, "ashtray.sqlite"), username: "alice", sourceKey: "fixture-source", snapshot: { events: [legacy], settings: { cig_baseline: 12, city: "Bengaluru" } } };
  const beforeImport = store.state(aliceToken).events.length;
  assert.equal(importSnapshot(options).imported, 1);
  assert.equal(store.state(aliceToken).events.length, beforeImport, "Dry run leaves local data unchanged");
  assert.equal(importSnapshot({ ...options, apply: true, includeSettings: true }).imported, 1);
  assert.equal(store.state(aliceToken).events.find(event => event.id === legacy.id).unitCostInr, 19, "Migration preserves historic price");
  assert.equal(store.state(aliceToken).user.cigBaseline, 12);
  assert.equal(importSnapshot({ ...options, apply: true }).skipped, 1, "Migration is idempotent");
  assert.throws(() => importSnapshot({ ...options, username: "bob", apply: true }), /different local account/);
  assert.throws(() => importSnapshot({ ...options, snapshot: { events: [{ ...legacy, id: "22222222-2222-4222-8222-222222222222" }, { ...legacy, quantity: -1 }] }, apply: true }), /quantity/);
  assert.equal(store.state(aliceToken).events.length, beforeImport + 1, "Invalid imports do not partially write data");
  await store.mutate({ action: "delete", id: legacy.id }, aliceToken);
  await store.mutate({ action: "remove", id: a.state.user.id }, bobToken);
  assert.equal(store.state(aliceToken).friends.length, 0, "Removing a connection is mutual");
  await store.mutate({ action: "delete", id: entryId }, aliceToken);
  assert.equal(store.state(aliceToken).events.length, 1);
  assert.equal((await store.mutate(logInput, aliceToken)).state.events.length, 1, "A retried request cannot resurrect a deleted entry");
  await store.mutate({ action: "logout" }, aliceToken);
  assert.equal(store.state(aliceToken).user, null, "Logout invalidates the server-side session");

  for (let index = 0; index < 12; index++) {
    try { await store.mutate({ action: "login", username: "missing_user", password: "incorrect-password" }); } catch (error) { assert.equal(error.status, 401); }
  }
  await rejects(() => store.mutate({ action: "login", username: "missing_user", password: "incorrect-password" }), 429);

  // Separate actors and a frozen clock make midnight/timezone boundaries and
  // the 50-entry cap deterministic without touching the real app database.
  const RealDate = Date;
  const frozen = RealDate.parse("2026-10-16T00:15:00Z");
  const detailStore = new LocalStore(join(temp, "detail-data"));
  globalThis.Date = class extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(frozen); }
    static now() { return frozen; }
  };
  try {
    const owner = await detailStore.mutate({ action: "register", name: "Details owner", username: "details_owner", password: "details-owner-password" });
    const viewer = await detailStore.mutate({ action: "register", name: "Viewer", username: "details_viewer", password: "details-viewer-password" });
    const stranger = await detailStore.mutate({ action: "register", name: "Stranger", username: "details_stranger", password: "details-stranger-password" });
    const ownerToken = owner.sessionToken;
    const viewerToken = viewer.sessionToken;
    await detailStore.mutate({ action: "request", code: viewer.state.user.inviteCode }, ownerToken);
    const request = detailStore.state(viewerToken).requests[0];
    await detailStore.mutate({ action: "respond", id: request.id, accept: true }, viewerToken);
    await detailStore.mutate({ action: "log", productId: "marlboro-red", quantity: 4, unitCostInr: 231, note: "Never share this note", loggedAt: "2026-10-15T03:59:00Z" }, ownerToken);
    await detailStore.mutate({ action: "log", productId: "classic-milds", quantity: 2, unitCostInr: 232, loggedAt: "2026-10-15T04:01:00Z" }, ownerToken);
    await detailStore.mutate({ action: "log", productId: "marlboro-red", quantity: 1, unitCostInr: 233, note: "Private context", requestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", source: "picker", loggedAt: "2026-10-16T00:10:00Z" }, ownerToken);
    await detailStore.mutate({ action: "log", productId: "kingfisher-premium", quantity: 1, unitCostInr: 234, loggedAt: "2026-10-16T00:12:00Z" }, ownerToken);
    assert.equal(detailStore.state(viewerToken).friends[0].activity, null);
    const beforeOptIn = detailStore.syncRevision(viewerToken);
    await detailStore.mutate({ action: "settings", sharing: "activity", timezone: "America/New_York" }, ownerToken);
    assert.notEqual(detailStore.syncRevision(viewerToken), beforeOptIn, "Activity opt-in invalidates accepted friends");
    let friend = detailStore.state(viewerToken).friends[0];
    assert.equal(friend.activity.timezone, "America/New_York");
    assert.equal(friend.activity.truncated, false);
    assert.equal(friend.activity.today.length, 2);
    assert.equal(friend.stats.todayCigs, 3, "Quantity is summed across today's shared entries");
    assert.deepEqual(friend.activity.today.map(entry => entry.productId), ["marlboro-red", "classic-milds"]);
    assert.deepEqual(friend.activity.today.map(entry => entry.quantity), [1, 2]);
    assert.deepEqual(friend.activity.today.map(entry => entry.localTime), ["20:10", "00:01"]);
    assert.deepEqual(friend.activity.today.map(entry => entry.localDate), ["2026-10-15", "2026-10-15"]);
    assert.equal(friend.activity.today[0].loggedAt, "2026-10-16T00:10:00.000Z");
    const allowed = ["id", "productId", "productName", "quantity", "loggedAt", "localDate", "localTime"].sort();
    for (const entry of friend.activity.today) assert.deepEqual(Object.keys(entry).sort(), allowed, "Shared entries use the exact public allowlist");
    assert.equal(JSON.stringify(friend.activity).includes("Private context"), false);
    assert.equal(JSON.stringify(friend.activity).includes("Kingfisher"), false);
    assert.equal(detailStore.state(stranger.sessionToken).friends.length, 0, "Activity never creates a public directory or stranger access");
    const beforeNewActivity = detailStore.syncRevision(viewerToken);
    for (let index = 0; index < 49; index++) await detailStore.mutate({ action: "log", productId: "marlboro-red", quantity: 1, unitCostInr: 25 }, ownerToken);
    assert.notEqual(detailStore.syncRevision(viewerToken), beforeNewActivity, "New detail entries trigger near-live invalidations");
    friend = detailStore.state(viewerToken).friends[0];
    assert.equal(friend.activity.today.length, 50);
    assert.equal(friend.activity.truncated, true);
    assert.equal(friend.stats.todayCigs, 52, "The shared list cap does not cap the quantity total");
    assert.ok(friend.activity.today.every((entry, index, entries) => index === 0 || entries[index - 1].loggedAt >= entry.loggedAt));
    await detailStore.mutate({ action: "delete", id: friend.activity.today[0].id }, ownerToken);
    friend = detailStore.state(viewerToken).friends[0];
    assert.equal(friend.activity.today.length, 50);
    assert.equal(friend.activity.truncated, false);
    await detailStore.mutate({ action: "settings", sharing: "private" }, ownerToken);
    friend = detailStore.state(viewerToken).friends[0];
    assert.equal(friend.activity, null);
    assert.equal(friend.stats, null);
    const privateRevision = detailStore.syncRevision(viewerToken);
    await detailStore.mutate({ action: "log", productId: "marlboro-red" }, ownerToken);
    assert.equal(detailStore.syncRevision(viewerToken), privateRevision);
    await detailStore.mutate({ action: "settings", sharing: "summary" }, ownerToken);
    friend = detailStore.state(viewerToken).friends[0];
    assert.equal(friend.activity, null, "Switching back to summary immediately removes brands and exact times");
    assert.equal(friend.stats.todayCigs, 52);
    await detailStore.mutate({ action: "remove", id: owner.state.user.id }, viewerToken);
    assert.equal(detailStore.state(viewerToken).friends.length, 0, "Removing a connection immediately revokes detail access");
  } finally {
    globalThis.Date = RealDate;
    detailStore.close();
  }

  const nextServer = pathToFileURL(join(root, "node_modules", "next", "server.js")).href;
  const routeSource = await readFile(join(root, "app", "api", "tracker", "route.ts"), "utf8");
  const routeOutput = ts.transpileModule(routeSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText.replace('from "next/server"', `from ${JSON.stringify(nextServer)}`)
    .replace('from "@/lib/local-store"', 'from "./local-store.mjs"');
  await writeFile(join(temp, "route.mjs"), routeOutput);
  const { NextRequest } = await import(nextServer);
  const route = await import(pathToFileURL(join(temp, "route.mjs")));
  process.chdir(temp);
  const base = "http://localhost:3187";
  const post = (body, cookie, headers = {}) => route.POST(new NextRequest(`${base}/api/tracker`, {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { origin: base, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
  }));
  const get = (cookie) => route.GET(new NextRequest(`${base}/api/tracker`, { headers: cookie ? { cookie } : {} }));
  assert.equal((await (await get()).json()).user, null);
  assert.equal((await post({ action: "register" }, undefined, { origin: "https://foreign.example" })).status, 403);
  assert.equal((await post({ action: "register" }, undefined, { "content-type": "text/plain" })).status, 415);
  assert.equal((await post("{broken")).status, 400);
  assert.equal((await post("x".repeat(33 * 1024))).status, 413);
  for (const host of ["192.168.1.42:3000", "127.0.0.1:3000"]) {
    const lanRequest = new NextRequest(`${base}/api/tracker`, {
      method: "POST", body: JSON.stringify({ action: "log", productId: "marlboro-red" }),
      headers: { host, origin: `http://${host}`, "content-type": "application/json", "sec-fetch-site": "same-origin" },
    });
    assert.equal((await route.POST(lanRequest)).status, 401, "Same-origin LAN and loopback IP requests pass CSRF and require login");
  }
  assert.equal((await post({ action: "log" }, undefined, { host: "192.168.1.42:3000" })).status, 403, "Host and Origin must match exactly");
  const registered = await post({ action: "register", name: "Route test", username: "route_test", password: "route-test-password" });
  assert.equal(registered.status, 200);
  const setCookie = registered.headers.get("set-cookie");
  assert.ok(setCookie.includes("HttpOnly"));
  assert.ok(setCookie.includes("SameSite=lax"));
  const cookie = setCookie.split(";")[0];
  assert.equal((await post({ action: "log", productId: "marlboro-red", unitCostInr: 25, quantity: 1 }, cookie)).status, 200);
  assert.equal((await (await get(cookie)).json()).events.length, 1);
  routeStore = getLocalStore();
  const syncSource = await readFile(join(root, "app", "api", "sync", "route.ts"), "utf8");
  const syncOutput = ts.transpileModule(syncSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText.replace('from "@/lib/local-store"', 'from "./local-store.mjs"');
  await writeFile(join(temp, "sync-route.mjs"), syncOutput);
  const sync = await import(pathToFileURL(join(temp, "sync-route.mjs")));
  const syncGet = (cookie, abort, headers = {}) => sync.GET(new NextRequest(`${base}/api/sync`, {
    signal: abort?.signal, headers: { ...(cookie ? { cookie } : {}), ...headers },
  }));
  assert.equal((await syncGet()).status, 401, "SSE requires authentication");
  assert.equal((await syncGet(cookie, undefined, { origin: "https://foreign.example" })).status, 403);
  const readEvent = async (reader, name) => {
    let buffer = "";
    while (true) {
      let timer;
      let result;
      try {
        result = await Promise.race([reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Timed out waiting for SSE")), 4500); })]);
      } finally { clearTimeout(timer); }
      assert.equal(result.done, false, `SSE closed before ${name}`);
      buffer += new TextDecoder().decode(result.value);
      const frame = buffer.split("\n\n").find(frame => frame.includes(`event: ${name}\n`));
      if (frame) return JSON.parse(frame.match(/data: (.+)/)[1]);
    }
  };
  const abort = new AbortController(); aborts.push(abort);
  const response = await syncGet(cookie, abort);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-type").includes("text/event-stream"));
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  const reader = response.body.getReader(); streams.push(reader);
  const initialSync = await readEvent(reader, "revision");
  assert.deepEqual(Object.keys(initialSync), ["revision"], "SSE frames contain only opaque invalidation tokens");
  assert.equal(initialSync.revision, (await (await get(cookie)).json()).revision);
  const secondAbort = new AbortController(); aborts.push(secondAbort);
  const second = await syncGet(cookie, secondAbort, { "last-event-id": "another-accounts-cursor" });
  const secondReader = second.body.getReader(); streams.push(secondReader);
  assert.equal((await readEvent(secondReader, "revision")).revision, initialSync.revision, "A second tab starts at the same account revision");
  secondAbort.abort();
  assert.equal((await secondReader.read()).done, true, "Aborting a tab closes and cleans up its SSE stream");
  await post({ action: "log", productId: "marlboro-red", quantity: 1, unitCostInr: 25, requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, cookie);
  const updatedSync = await readEvent(reader, "revision");
  assert.notEqual(updatedSync.revision, initialSync.revision, "SSE emits changed account revisions within its polling interval");
  assert.equal(updatedSync.revision, (await (await get(cookie)).json()).revision);
  const loggedOut = await post({ action: "logout" }, cookie);
  assert.equal(loggedOut.status, 200);
  assert.ok(loggedOut.headers.get("set-cookie").includes("Max-Age=0"));
  assert.equal((await (await get(cookie)).json()).user, null);
  assert.deepEqual(await readEvent(reader, "auth"), { authenticated: false }, "Revoked sessions close sync instead of leaking stale account state");
  assert.equal((await reader.read()).done, true);
  assert.equal((await syncGet(cookie)).status, 401, "A stale cookie cannot reconnect after logout");
  console.log("PASS: accounts, ownership, validation, prices, consent, privacy, persistence, migration, idempotent retries, cross-account revisions, SSE updates/cleanup, revocation, CSRF and body limits.");
} finally {
  for (const abort of aborts) abort.abort();
  for (const reader of streams) { try { await reader.cancel(); } catch {} }
  process.chdir(originalDirectory);
  routeStore?.close();
  store?.close();
  await rm(temp, { recursive: true, force: true });
}
