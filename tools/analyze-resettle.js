// Diagnose the mid-season re-settle. Assumes a pre-re-settle backup is already
// restored into Azurite (tools/restore-backup.js). Captures the season leaderboard,
// re-settles every settled round exactly like the admin "Päivitä trendit +
// kausipisteet", then diffs per-manager totals so we can see EXACTLY what moved and
// why. Uses the REAL worker for box scores (faithful to prod).
//
//   node tools/analyze-resettle.js [--resync]

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = process.env.TP_PROXY_URL || 'https://gamezone.zapmies.workers.dev';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const { ensureTables, listByPartition } = require('../api/src/lib/tables');
const { getActiveSeason, getRounds, listManagers, settleRound, syncSeasonGames } = require('../api/src/lib/ahmaliiga');

const resync = process.argv.includes('--resync');
const r1 = (n) => Math.round(n * 10) / 10;

async function seasonTotals(seasonId) {
  const rows = await listByPartition('AhmaliigaSeasonScores', seasonId);
  const m = {};
  for (const r of rows) m[r.rowKey] = { total: Number(r.total) || 0, rank: Number(r.rank) || 0 };
  return m;
}
// per-round per-manager totals, for drill-down
async function roundTotals(seasonId, settledRounds) {
  const out = {}; // userId -> { round -> total }
  for (const j of settledRounds) {
    const rows = await listByPartition('AhmaliigaScores', `${seasonId}|${j}`);
    for (const r of rows) { (out[r.rowKey] = out[r.rowKey] || {})[j] = Number(r.total) || 0; }
  }
  return out;
}

(async () => {
  await ensureTables();
  const season = await getActiveSeason();
  if (!season) { console.log('no active season'); return; }
  const sid = season.rowKey;
  const rounds = await getRounds(sid);
  const settled = rounds.filter((j) => j.status === 'settled').map((j) => Number(j.rowKey)).sort((a, b) => a - b);
  const managers = await listManagers();
  const nick = {}; for (const m of managers) nick[m.userId] = m.nickname || m.userId;

  console.log(`season ${sid} | settled rounds: ${settled.length} (${settled[0]}..${settled[settled.length - 1]}) | managers: ${managers.length}`);

  const before = await seasonTotals(sid);
  const beforeR = await roundTotals(sid, settled);

  if (resync) { console.log('re-syncing games (worker)...'); const s = await syncSeasonGames(sid); console.log('  synced:', JSON.stringify(s)); }

  console.log(`re-settling ${settled.length} rounds...`);
  for (const j of settled) { process.stdout.write(` ${j}`); await settleRound(sid, j); }
  console.log('\ndone.');

  const after = await seasonTotals(sid);
  const afterR = await roundTotals(sid, settled);

  // per-manager season diff
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const diffs = ids.map((id) => ({ id, nick: nick[id] || id, b: before[id]?.total ?? 0, a: after[id]?.total ?? 0 }))
    .map((x) => ({ ...x, d: r1(x.a - x.b) }))
    .sort((x, y) => x.d - y.d);

  console.log('\n=== SEASON TOTAL: before -> after (delta) ===');
  for (const x of diffs) console.log(`  ${x.nick.padEnd(20)} ${String(x.b).padStart(7)} -> ${String(x.a).padStart(7)}   ${x.d > 0 ? '+' : ''}${x.d}`);

  // biggest mover round-by-round detail
  const worst = diffs[0];
  if (worst && Math.abs(worst.d) > 0.5) {
    console.log(`\n=== ROUND DETAIL for biggest mover: ${worst.nick} (${worst.d}) ===`);
    for (const j of settled) {
      const b = beforeR[worst.id]?.[j] ?? 0, a = afterR[worst.id]?.[j] ?? 0;
      if (r1(a - b) !== 0) console.log(`  round ${String(j).padStart(2)}: ${String(b).padStart(6)} -> ${String(a).padStart(6)}   ${a - b > 0 ? '+' : ''}${r1(a - b)}`);
    }
  }
  process.exit(0);
})().catch((e) => { console.error('THREW', e && e.stack || e); process.exit(1); });
