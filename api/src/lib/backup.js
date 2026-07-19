const zlib = require('zlib');
const { BlobServiceClient } = require('@azure/storage-blob');
const { TableServiceClient } = require('@azure/data-tables');
const { TABLE_NAMES, listEntities, upsertEntity, createTable } = require('./tables');

// Backups of the stateful Table Storage (Users/Credentials/GoogleIndex/Usernames)
// — Table Storage has NO native point-in-time restore, so we export ourselves.
// Snapshots are gzipped JSON blobs in the `backups` container of the same
// `gamezonestore` account. All table columns are strings/numbers (passkey keys
// are base64url strings), so JSON round-trips losslessly. See memory:
// project_backups.
const CONN = process.env.TABLES_CONNECTION_STRING;
const CONTAINER = 'backups';

let svc;
let ensured = false;
function service() {
  if (!svc) svc = BlobServiceClient.fromConnectionString(CONN, { allowInsecureConnection: true });
  return svc;
}
async function container() {
  const c = service().getContainerClient(CONTAINER);
  if (!ensured) {
    try { await c.createIfNotExists(); } catch { /* race */ }
    ensured = true;
  }
  return c;
}

// ALL tables in the account, so a newly-added table is backed up automatically
// (no need to maintain a hardcoded list). Falls back to the known set on error.
async function allTableNames() {
  try {
    const svc = TableServiceClient.fromConnectionString(CONN, { allowInsecureConnection: true });
    const names = [];
    for await (const t of svc.listTables()) names.push(t.name);
    return names.length ? names : TABLE_NAMES;
  } catch {
    return TABLE_NAMES;
  }
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (d) => chunks.push(d instanceof Buffer ? d : Buffer.from(d)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Profile avatars (blob name = userId) as base64. They're capped at 600 kB and
// typically ~10-30 kB (256px webp), so a copy in the snapshot is cheap — and it
// makes the backup complete + portable (restore into a fresh account brings them).
async function snapshotAvatars() {
  const out = {};
  try {
    const c = service().getContainerClient('avatars');
    for await (const b of c.listBlobsFlat()) {
      const dl = await c.getBlockBlobClient(b.name).download();
      const buf = await streamToBuffer(dl.readableStreamBody);
      out[b.name] = { contentType: dl.contentType || 'image/webp', b64: buf.toString('base64') };
    }
  } catch {
    /* container may not exist yet */
  }
  return out;
}

// Read every table + avatars into one snapshot object.
async function snapshot() {
  const names = await allTableNames();
  const tables = {};
  const counts = {};
  for (const t of names) {
    const rows = await listEntities(t);
    tables[t] = rows;
    counts[t] = rows.length;
  }
  const avatars = await snapshotAvatars();
  counts.avatars = Object.keys(avatars).length;
  return { createdAt: new Date().toISOString(), version: 2, counts, tables, avatars };
}

// Run a backup: snapshot → gzip → upload to `backups/backup-<iso>.json.gz`.
async function writeBackup() {
  const snap = await snapshot();
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(snap), 'utf8'));
  const name = `backup-${snap.createdAt.replace(/[:.]/g, '-')}.json.gz`;
  const c = await container();
  await c.getBlockBlobClient(name).uploadData(gz, {
    blobHTTPHeaders: { blobContentType: 'application/gzip' },
    metadata: { createdat: snap.createdAt, users: String(snap.counts.Users || 0) },
  });
  return { name, gz, createdAt: snap.createdAt, counts: snap.counts, bytes: gz.length };
}

async function listBackups() {
  const c = await container();
  const out = [];
  for await (const b of c.listBlobsFlat({ includeMetadata: true })) {
    out.push({
      name: b.name,
      createdAt:
        (b.metadata && b.metadata.createdat) ||
        (b.properties.createdOn && b.properties.createdOn.toISOString()) ||
        null,
      size: b.properties.contentLength || 0,
    });
  }
  // ISO timestamp is embedded in the name → lexical desc = newest first.
  out.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  return out;
}

async function deleteBackup(name) {
  const c = await container();
  await c.getBlockBlobClient(name).deleteIfExists();
}

// Download + parse one backup blob → its snapshot object.
async function readBackupSnapshot(name) {
  const c = await container();
  const dl = await c.getBlockBlobClient(name).download();
  const gz = await streamToBuffer(dl.readableStreamBody);
  return JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
}

// Restore a backup's TABLE rows into Table Storage. UPSERT (rows added since the
// backup are NOT deleted). `filter` (substring) limits to matching tables, e.g.
// 'Ahmaliiga' to fix just the fantasy game. DESTRUCTIVE: overwrites current rows with
// the backup's. Table data only (avatars untouched). Returns per-table counts.
async function restore(name, opts = {}) {
  const filter = opts.filter || '';
  const snap = await readBackupSnapshot(name);
  const tables = snap.tables || {};
  const restored = {};
  for (const [tableName, rows] of Object.entries(tables)) {
    if (filter && !tableName.includes(filter)) continue;
    await createTable(tableName);
    for (let i = 0; i < rows.length; i += 25) {
      await Promise.all(rows.slice(i, i + 25).map((r) => {
        const { etag, timestamp, ...clean } = r; // strip server metadata
        return upsertEntity(tableName, clean);
      }));
    }
    restored[tableName] = rows.length;
  }
  return {
    name, createdAt: snap.createdAt, filter: filter || null,
    tables: Object.keys(restored).length,
    rows: Object.values(restored).reduce((a, b) => a + b, 0),
    restored,
  };
}

// GFS retention: keep every backup ≤14 days old, then 1 per week for ~8 weeks,
// then 1 per month for ~6 months; delete the rest. `backups` is newest-first.
function keepSet(backups, now) {
  const keep = new Set();
  const seenWeek = new Set();
  const seenMonth = new Set();
  for (const b of backups) {
    const t = Date.parse(b.createdAt || '');
    if (isNaN(t)) { keep.add(b.name); continue; } // never drop an unparseable one
    const ageDays = (now - t) / 86_400_000;
    if (ageDays <= 14) {
      keep.add(b.name);
    } else if (ageDays <= 14 + 8 * 7) {
      const wk = Math.floor(t / 604_800_000);
      if (!seenWeek.has(wk)) { seenWeek.add(wk); keep.add(b.name); }
    } else if (ageDays <= 14 + 8 * 7 + 6 * 31) {
      const mo = new Date(t).toISOString().slice(0, 7);
      if (!seenMonth.has(mo)) { seenMonth.add(mo); keep.add(b.name); }
    }
    // older than the whole window → drop
  }
  return keep;
}

async function pruneBackups(now = Date.now()) {
  const backups = await listBackups();
  const keep = keepSet(backups, now);
  const deleted = [];
  for (const b of backups) {
    if (!keep.has(b.name)) { await deleteBackup(b.name); deleted.push(b.name); }
  }
  return deleted;
}

module.exports = { writeBackup, listBackups, pruneBackups, deleteBackup, snapshot, keepSet, readBackupSnapshot, restore };
