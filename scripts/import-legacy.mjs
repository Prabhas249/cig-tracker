import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
class ImportError extends Error {}

function check(condition, message) { if (!condition) throw new ImportError(message); }
function validDate(value) { return typeof value === "string" && Number.isFinite(new Date(value).getTime()); }

/** Preserve the original event's date, quantity and paid price; never reprice it. */
export function normalizeLegacyEvent(row) {
  const event = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()), value]));
  check(typeof event.id === "string" && /^[a-f0-9-]{36}$/i.test(event.id), "A source entry has an invalid ID; nothing was imported.");
  check(event.kind === "cig" || event.kind === "drink", "A source entry has an invalid kind; nothing was imported.");
  for (const key of ["productId", "productName", "brand", "variant", "manufacturer", "timezone", "localDate", "localTime", "source"]) {
    check(typeof event[key] === "string" && event[key].length <= 300, "A source entry is missing required text; nothing was imported.");
  }
  check(validDate(event.loggedAt) && validDate(event.createdAt), "A source entry has an invalid timestamp; nothing was imported.");
  try { new Intl.DateTimeFormat("en", { timeZone: event.timezone }).format(); }
  catch { throw new ImportError("A source entry has an invalid timezone; nothing was imported."); }
  check(/^\d{4}-\d{2}-\d{2}$/.test(event.localDate), "A source entry has an invalid calendar date; nothing was imported.");
  for (const key of ["weekday", "hour", "minute", "isoWeek", "month", "year", "quantity", "unitCostInr"]) {
    check(typeof event[key] === "number" && Number.isFinite(event[key]), "A source entry has invalid numeric data; nothing was imported.");
  }
  check(event.quantity > 0 && event.unitCostInr >= 0, "A source entry has an invalid quantity or cost; nothing was imported.");
  event.loggedAt = new Date(event.loggedAt).toISOString();
  event.createdAt = new Date(event.createdAt).toISOString();
  // No user ownership comes from the old shared database. The explicitly named
  // local account receives every imported event in one SQLite transaction.
  return event;
}

export function importSnapshot({ databasePath, username, snapshot, sourceKey, apply = false, includeSettings = false, catalogIds = [] }) {
  check(existsSync(databasePath), "No local database exists yet. Create your account in the app first.");
  const db = new DatabaseSync(databasePath, { readOnly: !apply });
  try {
    db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    const target = db.prepare("SELECT id, profile_json FROM users WHERE username = ? COLLATE NOCASE").get(username);
    check(target, "That local username does not exist. Create the account in the app first.");
    check(Array.isArray(snapshot.events), "The source snapshot is invalid.");
    const events = snapshot.events.map(normalizeLegacyEvent);
    check(new Set(events.map(event => event.id)).size === events.length, "The source contains duplicate entry IDs; nothing was imported.");
    const existing = db.prepare("SELECT user_id FROM tracker_events WHERE id = ?");
    let skipped = 0;
    for (const event of events) {
      const match = existing.get(event.id);
      check(!match || match.user_id === target.id, "This legacy history is already assigned to a different local account.");
      if (match) skipped++;
    }
    const result = { username, total: events.length, imported: events.length - skipped, skipped, applied: apply };
    if (!apply) return result;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("CREATE TABLE IF NOT EXISTS legacy_imports(source_key TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), imported_at TEXT NOT NULL)");
      const claimed = db.prepare("SELECT user_id FROM legacy_imports WHERE source_key = ?").get(sourceKey);
      check(!claimed || claimed.user_id === target.id, "This legacy source is already assigned to a different local account.");
      const insert = db.prepare("INSERT INTO tracker_events(id, user_id, logged_at, event_json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING");
      // Recheck ownership while holding the write lock, including concurrent
      // admin imports. An ID can never be reassigned to a second account.
      for (const event of events) {
        const match = existing.get(event.id);
        check(!match || match.user_id === target.id, "This legacy history is already assigned to a different local account.");
        insert.run(event.id, target.id, event.loggedAt, JSON.stringify(event));
      }
      if (includeSettings && !claimed && snapshot.settings) {
        const old = Object.fromEntries(Object.entries(snapshot.settings).map(([key, value]) => [key.replace(/_([a-z])/g, (_, char) => char.toUpperCase()), value]));
        const current = db.prepare("SELECT profile_json FROM users WHERE id = ?").get(target.id);
        check(current, "The target local account no longer exists.");
        const profile = JSON.parse(current.profile_json);
        if (Number.isInteger(old.cigBaseline) && old.cigBaseline >= 0 && old.cigBaseline <= 200) profile.cigBaseline = old.cigBaseline;
        if (Number.isInteger(old.drinkBaseline) && old.drinkBaseline >= 0 && old.drinkBaseline <= 100) profile.drinkBaseline = old.drinkBaseline;
        if (typeof old.city === "string" && old.city.length <= 100) profile.city = old.city;
        if (typeof old.timezone === "string") {
          try { new Intl.DateTimeFormat("en", { timeZone: old.timezone }).format(); profile.timezone = old.timezone; } catch { /* keep current timezone */ }
        }
        if (Array.isArray(old.favoriteIds)) {
          const favorites = old.favoriteIds.filter(id => typeof id === "string" && catalogIds.includes(id));
          if (favorites.length) profile.favoriteIds = [...new Set(favorites)].slice(0, 12);
        }
        db.prepare("UPDATE users SET profile_json = ? WHERE id = ?").run(JSON.stringify(profile), target.id);
      }
      db.prepare("INSERT INTO legacy_imports(source_key, user_id, imported_at) VALUES (?, ?, ?) ON CONFLICT(source_key) DO NOTHING")
        .run(sourceKey, target.id, new Date().toISOString());
      db.exec("COMMIT");
      return result;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node scripts/import-legacy.mjs --env /absolute/path/.env.local --username existing_username [--apply] [--include-settings]\nWithout --apply, reads and validates the legacy history but makes no local changes. The original Neon database is always read-only.");
    return;
  }
  const options = { apply: false, includeSettings: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--include-settings") options.includeSettings = true;
    else if (argument === "--env" || argument === "--username") {
      const value = args[++index];
      check(value && !value.startsWith("--"), `Missing value for ${argument}.`);
      options[argument.slice(2)] = value;
    } else throw new ImportError("Unknown option. Run with --help for usage.");
  }
  check(options.env && isAbsolute(options.env), "Pass the legacy .env.local as an explicit absolute --env path.");
  check(typeof options.username === "string" && /^[a-z0-9][a-z0-9_]{2,23}$/i.test(options.username), "Pass the existing local account with --username.");
  const databasePath = join(projectRoot, "data", "ashtray.sqlite");
  check(existsSync(databasePath), "Create your account in the local app before importing history.");
  // Validate the target before reading any remote source data.
  importSnapshot({ databasePath, username: options.username, snapshot: { events: [] }, sourceKey: "validation-only" });
  const env = dotenv.parse(await readFile(options.env));
  check(typeof env.DATABASE_URL === "string" && env.DATABASE_URL.length > 0, "The supplied file has no DATABASE_URL.");
  let parsedUrl;
  try { parsedUrl = new URL(env.DATABASE_URL); } catch { throw new ImportError("The supplied DATABASE_URL is invalid."); }
  check(parsedUrl.protocol === "postgres:" || parsedUrl.protocol === "postgresql:", "The supplied DATABASE_URL must use PostgreSQL.");
  const sourceKey = createHash("sha256").update(`${parsedUrl.hostname.replace("-pooler.", ".")}${parsedUrl.pathname}`).digest("hex");
  const sql = neon(env.DATABASE_URL);
  // PostgreSQL itself rejects mutations in this transaction. No seed, update,
  // schema migration or Server Action is invoked against the original database.
  const [events, settings] = await sql.transaction([
    sql`SELECT * FROM events ORDER BY logged_at, id`,
    sql`SELECT * FROM settings WHERE id = 1`,
  ], { readOnly: true, isolationLevel: "RepeatableRead" });
  const directory = await mkdtemp(join(tmpdir(), "ashtray-legacy-import-"));
  try {
    const snapshotPath = join(directory, "snapshot.json");
    await writeFile(snapshotPath, JSON.stringify({ events, settings: settings[0] ?? null }), { mode: 0o600 });
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    const catalogSource = await readFile(join(projectRoot, "lib", "catalog.ts"), "utf8");
    const catalogIds = [...catalogSource.matchAll(/id:\s*"([a-z0-9-]+)"/g)].map(match => match[1]);
    const result = importSnapshot({ databasePath, username: options.username, snapshot, sourceKey, apply: options.apply, includeSettings: options.includeSettings, catalogIds });
    console.log(`${result.applied ? "Imported" : "Dry run:"} ${result.imported} new entries for @${result.username}; ${result.skipped} already present. Historic prices are preserved. Original database unchanged.`);
    if (!options.apply) console.log("Run the same command with --apply to import. Add --include-settings only if you want the original baseline, timezone, city and favorites copied on the first import.");
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Driver errors can contain connection details. Only print our own safe
    // validation errors; never echo a connection string or remote error object.
    console.error(error instanceof ImportError ? error.message : "Import failed. Check source access and local database availability. Credentials and source contents were not printed.");
    process.exitCode = 1;
  });
}
