// How many squad changes each manager made over the season: compare each round's
// stored squad (AhmaliigaScores.cards) to the previous round's — new cards = transfers,
// plus captain switches. Read-only (Azurite).  node tools/analyze-transfers.js

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities } = require('../api/src/lib/tables');

const pad = (s, n) => String(s).padStart(n);

(async () => {
  await ensureTables();
  const mgr = {}; for (const m of await listEntities('AhmaliigaManagers')) mgr[m.partitionKey] = { nick: m.nickname || m.partitionKey, bot: !!m.isBot };

  const byMgr = {};
  for (const s of await listEntities('AhmaliigaScores')) {
    const rnd = Number(String(s.partitionKey).split('|')[1]);
    let ci = {}; try { ci = JSON.parse(s.cards || '{}'); } catch { ci = {}; }
    (byMgr[s.rowKey] = byMgr[s.rowKey] || []).push({ round: rnd, ids: ci.ids || [], captain: ci.captainId || null });
  }

  console.log('=== KOKOONPANOMUUTOKSET per manageri ===');
  console.log(`  ${'manageri'.padEnd(14)} jaksot  siirrot  kapt.vaihdot  siirrot/jakso`);
  const out = [];
  for (const [id, rows] of Object.entries(byMgr)) {
    rows.sort((a, b) => a.round - b.round);
    let transfers = 0, capChanges = 0;
    for (let i = 1; i < rows.length; i++) {
      const prev = new Set(rows[i - 1].ids);
      const added = rows[i].ids.filter((x) => !prev.has(x)).length; // new cards vs last round = net swaps
      transfers += added;
      if (rows[i].captain && rows[i - 1].captain && rows[i].captain !== rows[i - 1].captain) capChanges++;
    }
    out.push({ id, nick: mgr[id]?.nick || id, bot: mgr[id]?.bot, rounds: rows.length, transfers, capChanges });
  }
  out.sort((a, b) => b.transfers - a.transfers);
  for (const x of out) {
    console.log(`  ${(x.nick + (x.bot ? ' (botti)' : '')).slice(0, 14).padEnd(14)} ${pad(x.rounds, 5)}  ${pad(x.transfers, 6)}  ${pad(x.capChanges, 11)}  ${pad((x.transfers / Math.max(1, x.rounds - 1)).toFixed(1), 12)}`);
  }
  const humans = out.filter((x) => !x.bot);
  const th = humans.reduce((s, x) => s + x.transfers, 0);
  console.log(`\n  Ihmiset yhteensä: ${th} siirtoa · ka ${(th / (humans.length || 1)).toFixed(1)} / manageri`);
  console.log('  (siirto = jaksojen välillä vaihtunut kortti; free-limit oli 2/jakso ennen sakkoa)');
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
