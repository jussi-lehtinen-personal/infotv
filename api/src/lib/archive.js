const zlib = require('zlib');
const { BlobServiceClient } = require('@azure/storage-blob');
const { listEntities, deleteEntity } = require('./tables');

// Ahmaliiga season ARCHIVE (see docs/ahmaliiga-archive-spec.md). Model: the DB holds
// exactly ONE active season; a completed season is exported to a single gzipped JSON blob
// (own `ahmaliiga-archives` container) and then purged from Table Storage. History reads
// the blobs on demand. archiveSeason is read-only + safe; purgeSeason is destructive and
// never runs without explicit confirmation (Archive / Purge / Cancel).
const CONN = process.env.TABLES_CONNECTION_STRING;
const CONTAINER = 'ahmaliiga-archives';

let svc;
let ensured = false;
function service() {
  if (!svc) svc = BlobServiceClient.fromConnectionString(CONN, { allowInsecureConnection: true });
  return svc;
}
async function container() {
  const c = service().getContainerClient(CONTAINER);
  if (!ensured) { try { await c.createIfNotExists(); } catch { /* race */ } ensured = true; }
  return c;
}

// Season-scoped Ahmaliiga tables (PK = seasonId or `${seasonId}|…`).
const SEASON_SCOPED = [
  'AhmaliigaRounds', 'AhmaliigaCards', 'AhmaliigaCardHistory', 'AhmaliigaLineups',
  'AhmaliigaPredictions', 'AhmaliigaScores', 'AhmaliigaSeasonScores', 'AhmaliigaResults',
  'AhmaliigaGames', 'AhmaliigaSquadLog', 'AhmaliigaRosters',
];
// Global participant tables (PK = userId) — snapshotted INTO the archive; cleared at a
// rollover purge (clearGlobals) so the next season starts with a fresh set of managers.
const GLOBAL_PARTICIPANTS = ['AhmaliigaManagers', 'AhmaliigaSquads'];
// Global transient tables — cleared at a rollover purge, not meaningfully archived.
const GLOBAL_TRANSIENT = ['AhmaliigaVouchers', 'AhmaliigaMessages', 'AhmaliigaNotifyLog'];
// AhmaliigaPushSubs is intentionally NEVER touched (device-level subscription, not season state).

const blobName = (id) => `${String(id)}.json.gz`;
const inSeason = (r, id) => r.partitionKey === id || String(r.partitionKey).startsWith(id + '|');

function streamToBuffer(stream) {
  return new Promise((res, rej) => {
    const ch = [];
    stream.on('data', (d) => ch.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    stream.on('end', () => res(Buffer.concat(ch)));
    stream.on('error', rej);
  });
}

// ---------- collect ----------
async function collectSeasonTables(seasonId) {
  const tables = {};
  for (const t of SEASON_SCOPED) {
    const rows = (await listEntities(t)).filter((r) => inSeason(r, seasonId));
    if (rows.length) tables[t] = rows;
  }
  const seasonRows = (await listEntities('AhmaliigaSeason')).filter((r) => r.rowKey === seasonId);
  if (seasonRows.length) tables.AhmaliigaSeason = seasonRows;
  // Global participants: a full snapshot (at archive time they belong to this ending season).
  for (const t of GLOBAL_PARTICIPANTS) {
    const rows = await listEntities(t);
    if (rows.length) tables[t] = rows;
  }
  return tables;
}

// Denormalized summary for cheap history reads — nicknames baked in BEFORE purge clears
// the global managers, so a season page never needs the live DB.
function buildSummary(tables) {
  const managers = tables.AhmaliigaManagers || [];
  const nick = {}, isBot = {};
  for (const m of managers) { nick[m.partitionKey] = m.nickname || ''; isBot[m.partitionKey] = !!m.isBot; }
  const finalTop = (tables.AhmaliigaSeasonScores || [])
    .filter((s) => !isBot[s.rowKey])
    .map((s) => ({ rank: Number(s.rank) || 0, userId: s.rowKey, nickname: nick[s.rowKey] || 'Pelaaja', points: Number(s.total) || 0 }))
    .sort((a, b) => a.rank - b.rank);
  const topCards = (tables.AhmaliigaCards || [])
    .map((c) => ({ cardId: c.rowKey, name: c.name || '', kind: c.kind || '', seasonPts: Number(c.seasonPts) || 0 }))
    .sort((a, b) => b.seasonPts - a.seasonPts)
    .slice(0, 20);
  const rounds = tables.AhmaliigaRounds || [];
  let startDate = '', endDate = '';
  for (const r of rounds) {
    if (r.startDate && (!startDate || r.startDate < startDate)) startDate = r.startDate;
    if (r.endDate && r.endDate > endDate) endDate = r.endDate;
  }
  return { champion: finalTop[0] || null, finalTop, topCards, rounds: rounds.length, managers: finalTop.length, startDate, endDate };
}

// ---------- archive (safe, read-only on the DB) ----------
async function archiveSeason(seasonId, archivedAt) {
  const id = String(seasonId);
  const tables = await collectSeasonTables(id);
  if (!tables.AhmaliigaSeason) throw new Error(`Kausi ${id} puuttuu.`);
  const seasonRow = tables.AhmaliigaSeason.find((r) => r.partitionKey === 'season') || {};
  const summary = buildSummary(tables);
  const archive = { seasonId: id, name: seasonRow.name || `Kausi ${id}`, archivedAt: archivedAt || null, summary, tables };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(archive), 'utf8'));
  const c = await container();
  await c.getBlockBlobClient(blobName(id)).uploadData(gz, {
    blobHTTPHeaders: { blobContentType: 'application/gzip' },
    metadata: {
      seasonid: id, name: encodeURIComponent(archive.name), archivedat: String(archivedAt || ''),
      champion: encodeURIComponent(summary.champion ? summary.champion.nickname : ''),
      managers: String(summary.managers), rounds: String(summary.rounds), bytes: String(gz.length),
    },
  });
  const counts = {};
  for (const k of Object.keys(tables)) counts[k] = tables[k].length;
  return { seasonId: id, blob: blobName(id), bytes: gz.length, counts, summary };
}

async function archiveExists(seasonId) {
  try { return await (await container()).getBlockBlobClient(blobName(seasonId)).exists(); }
  catch { return false; }
}

async function listArchives() {
  const out = [];
  try {
    const c = await container();
    for await (const b of c.listBlobsFlat({ includeMetadata: true })) {
      const m = b.metadata || {};
      out.push({
        seasonId: m.seasonid || b.name.replace(/\.json\.gz$/, ''),
        name: m.name ? decodeURIComponent(m.name) : '',
        archivedAt: m.archivedat || '',
        champion: m.champion ? decodeURIComponent(m.champion) : '',
        managers: Number(m.managers) || 0,
        rounds: Number(m.rounds) || 0,
        bytes: Number(m.bytes) || (b.properties && b.properties.contentLength) || 0,
      });
    }
  } catch { /* container may not exist yet */ }
  return out.sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1));
}

async function readArchive(seasonId) {
  try {
    const dl = await (await container()).getBlockBlobClient(blobName(seasonId)).download();
    const gz = await streamToBuffer(dl.readableStreamBody);
    return JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  } catch (e) { if (e.statusCode === 404) return null; throw e; }
}

// ---------- purge (destructive; never without confirm) ----------
async function seasonRowCounts(seasonId) {
  const id = String(seasonId);
  const counts = {};
  for (const t of SEASON_SCOPED) counts[t] = (await listEntities(t)).filter((r) => inSeason(r, id)).length;
  counts.AhmaliigaSeason = (await listEntities('AhmaliigaSeason')).filter((r) => r.rowKey === id).length;
  return counts;
}

async function deleteRows(table, rows) {
  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(rows.slice(i, i + 20).map((r) => deleteEntity(table, r.partitionKey, r.rowKey).catch(() => {})));
  }
}

// confirm !== 'purge' → DRY RUN (deletes nothing; caller/UI builds Archive/Purge/Cancel).
// isActive is passed in by the caller (from getActiveSeason) to avoid a dep cycle.
async function purgeSeason(seasonId, opts = {}) {
  const id = String(seasonId);
  const { confirm, clearGlobals = false, force = false, isActive = false } = opts;
  const archived = await archiveExists(id);
  const rowCounts = await seasonRowCounts(id);
  if (confirm !== 'purge') {
    return { dryRun: true, seasonId: id, archived, isActive, clearGlobals, rowCounts };
  }
  if (!archived) return { error: 'not_archived', message: `Kausi ${id} pitää arkistoida ennen poistoa.`, archived: false, rowCounts };
  if (isActive && !force) return { error: 'active', message: `Kausi ${id} on aktiivinen — poisto vaatii force.`, isActive: true, rowCounts };

  const deleted = {};
  for (const t of SEASON_SCOPED) {
    const rows = (await listEntities(t)).filter((r) => inSeason(r, id));
    await deleteRows(t, rows); deleted[t] = rows.length;
  }
  const seasonRows = (await listEntities('AhmaliigaSeason')).filter((r) => r.rowKey === id);
  await deleteRows('AhmaliigaSeason', seasonRows); deleted.AhmaliigaSeason = seasonRows.length;
  if (clearGlobals) {
    for (const t of [...GLOBAL_PARTICIPANTS, ...GLOBAL_TRANSIENT]) {
      const rows = await listEntities(t);
      await deleteRows(t, rows); deleted[t] = rows.length;
    }
  }
  return { purged: true, seasonId: id, clearGlobals, deleted };
}

module.exports = { archiveSeason, archiveExists, listArchives, readArchive, purgeSeason };
