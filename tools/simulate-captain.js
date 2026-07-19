// Counterfactual: recompute every manager's season total with a different CAPTAIN
// multiplier (default 1.5 vs the live 2.0). breakdown stores captain-doubled points,
// so raw = breakdown[captainId]/2; new effective = raw * mult. Read-only (Azurite).
//   node tools/simulate-captain.js [mult=1.5]

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities } = require('../api/src/lib/tables');

const MULT = Number(process.argv[2]) || 1.5;
const r1 = (n) => Math.round(n * 10) / 10;
const pad = (s, n) => String(s).padStart(n);

(async () => {
  await ensureTables();
  const mgr = {}; for (const m of await listEntities('AhmaliigaManagers')) mgr[m.partitionKey] = m.nickname || m.partitionKey;

  const cur = {}, alt = {};
  for (const s of await listEntities('AhmaliigaScores')) {
    const id = s.rowKey;
    let b = {}, ci = {}; try { b = JSON.parse(s.breakdown || '{}'); } catch { } try { ci = JSON.parse(s.cards || '{}'); } catch { }
    const cap = s.captainId || ci.captainId;
    const capEff = cap ? (Number(b[cap]) || 0) : 0; // doubled if it scored
    const raw = capEff / 2;
    const altEff = raw * MULT;
    cur[id] = (cur[id] || 0) + (Number(s.total) || 0);
    alt[id] = (alt[id] || 0) + (Number(s.total) || 0) - capEff + altEff;
  }

  const rows = Object.keys(cur).map((id) => ({ nick: mgr[id] || id, now: cur[id], alt: alt[id] }));
  const rankNow = [...rows].sort((a, b) => b.now - a.now).map((x) => x.nick);
  rows.sort((a, b) => b.alt - a.alt);
  console.log(`=== Kapteeni ×2.0 (nyt)  vs  ×${MULT} ===`);
  console.log(`  #  manageri        ×2.0    ×${MULT}   delta`);
  rows.forEach((x, i) => {
    const moved = rankNow.indexOf(x.nick) !== i ? ` (oli sija ${rankNow.indexOf(x.nick) + 1})` : '';
    console.log(`  ${pad(i + 1, 2)} ${x.nick.slice(0, 14).padEnd(14)} ${pad(r1(x.now), 6)}  ${pad(r1(x.alt), 6)}  ${pad(r1(x.alt - x.now), 6)}${moved}`);
  });
  const top2 = rows.slice(0, 2);
  console.log(`\n  Kärjen ero: ×2.0 = ${r1(top2[0].now - (rows.find((r)=>r.nick===rankNow[1])?.now||0))} → ×${MULT} = ${r1(top2[0].alt - top2[1].alt)}`);
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
