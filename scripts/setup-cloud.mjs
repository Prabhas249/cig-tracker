import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "@neondatabase/serverless";

// Run explicitly after review: node --env-file=/path/to/env scripts/setup-cloud.mjs --apply
// No automatic migration runs in web requests. No connection string is printed.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv.includes("--apply")) {
  console.log("Review scripts/cloudschema.sql, then run with DATABASE_URL set and --apply. This only creates/updates the isolated ashtray schema; legacy public tables are untouched.");
} else if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. No changes were made."); process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  let client;
  try {
    client = await pool.connect();
    await client.query(await readFile(join(root, "scripts", "cloudschema.sql"), "utf8"));
    console.log("Ashtray cloud schema is ready. Legacy public tables were not modified.");
  } catch {
    if (client) { try { await client.query("ROLLBACK"); } catch {} }
    console.error("Cloud schema setup failed. Credentials and remote error details were not printed."); process.exitCode = 1;
  } finally { client?.release(); await pool.end(); }
}
