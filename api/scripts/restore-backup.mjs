// Restore a backup snapshot (from /api/exportBackup or the `backups` Blob /
// GitHub artifact) back into Table Storage. DRY-RUN by default — prints counts;
// pass --apply to actually upsert. Run from the api/ dir (uses @azure/data-tables
// from api/node_modules). See memory: project_backups.
//
//   TABLES_CONNECTION_STRING="<conn>" node scripts/restore-backup.mjs backup.json.gz          # dry run
//   TABLES_CONNECTION_STRING="<conn>" node scripts/restore-backup.mjs backup.json.gz --apply  # write
//
// SAFETY: test into a SCRATCH/staging storage account first. upsert(Replace) does
// not delete rows that exist in the target but not the backup.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { webcrypto } from "node:crypto";
// Some Node builds (e.g. the 32-bit Azure Functions Core Tools runtime) don't
// expose a global `crypto`, which @azure/data-tables needs at load time. Set the
// polyfill BEFORE importing it — so it's a dynamic import (ESM static imports are
// hoisted and would run first).
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const { TableClient } = await import("@azure/data-tables");

const conn = process.env.TABLES_CONNECTION_STRING;
const file = process.argv[2];
const apply = process.argv.includes("--apply");

if (!conn) {
  console.error("Set TABLES_CONNECTION_STRING (target account).");
  process.exit(1);
}
if (!file) {
  console.error("Usage: node scripts/restore-backup.mjs <backup.json[.gz]> [--apply]");
  process.exit(1);
}

const raw = readFileSync(file);
const json = file.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
const snap = JSON.parse(json);
console.log("Snapshot createdAt:", snap.createdAt, "| counts:", JSON.stringify(snap.counts));
console.log(apply ? "\n=== APPLYING ===" : "\n=== DRY RUN (no writes) ===");

for (const [table, rows] of Object.entries(snap.tables || {})) {
  console.log(`\n${table}: ${rows.length} rows`);
  if (!apply) continue;
  const client = TableClient.fromConnectionString(conn, table, { allowInsecureConnection: true });
  try { await client.createTable(); } catch { /* exists */ }
  let n = 0;
  for (const e of rows) {
    const { etag, timestamp, ...ent } = e; // eslint-disable-line no-unused-vars
    await client.upsertEntity(ent, "Replace");
    if (++n % 50 === 0) console.log(`  ${n}/${rows.length}`);
  }
  console.log(`  done ${n}`);
}
console.log(apply ? "\nRestore complete." : "\nDry-run only. Re-run with --apply to write.");
