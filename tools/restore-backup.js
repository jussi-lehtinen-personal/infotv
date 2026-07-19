// Restore a Table Storage backup (writeBackup / GH-artifact format: a gzipped
// { tables: { name: [rows] } } snapshot) into the TARGET connection. Defaults to
// local Azurite — NEVER point this at prod by accident. For diagnosing the mid-season
// re-settle: restore the pre-re-settle backup locally, then analyze.
//
//   node tools/restore-backup.js <backup.json.gz> [tableSubstringFilter]

process.env.TABLES_CONNECTION_STRING = process.env.TABLES_CONNECTION_STRING || 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const zlib = require('zlib');
const { ensureTables, upsertEntity } = require('../api/src/lib/tables');
const { TableClient } = require('../api/node_modules/@azure/data-tables');

const CONN = process.env.TABLES_CONNECTION_STRING;
async function ensureTable(name) {
  try { await TableClient.fromConnectionString(CONN, name, { allowInsecureConnection: true }).createTable(); }
  catch (e) { if (e.statusCode !== 409) throw e; }
}

const gzPath = process.argv[2];
const filter = process.argv[3] || '';
if (!gzPath) { console.error('usage: node tools/restore-backup.js <backup.json.gz> [filter]'); process.exit(1); }

const chunk = async (items, size, fn) => { for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn)); };

(async () => {
  const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8'));
  console.log(`backup createdAt=${snap.createdAt} version=${snap.version}`);
  await ensureTables();
  const tables = snap.tables || {};
  let total = 0;
  for (const [name, rows] of Object.entries(tables)) {
    if (filter && !name.includes(filter)) continue;
    await ensureTable(name);
    await chunk(rows, 25, async (r) => {
      const { etag, timestamp, ...clean } = r; // strip server metadata
      await upsertEntity(name, clean);
    });
    console.log(`  ${name}: ${rows.length}`);
    total += rows.length;
  }
  console.log(`restored ${total} rows into ${process.env.TABLES_CONNECTION_STRING}`);
  process.exit(0);
})().catch((e) => { console.error('THREW', e && e.stack || e); process.exit(1); });
