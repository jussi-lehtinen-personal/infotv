// Counterfactual: what if OLANDER had cost 70 at the start? Take Lasse's actual
// per-round squads; if bumping Olander's price to 70 breaks the 120 budget, drop his
// lowest-scoring card that round and recompute. Read-only (Azurite).
//   node tools/simulate-olander.js [newPrice=70]

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities } = require('../api/src/lib/tables');

const NEW = Number(process.argv[2]) || 70;
const OLANDER = 'P:OLANDER Anni';
const BUDGET = 120;
const r1 = (n) => Math.round(n * 10) / 10;
const pad = (s, n) => String(s).padStart(n);

(async () => {
  await ensureTables();
  const seed = {}, name = {};
  for (const c of await listEntities('AhmaliigaCards')) { seed[c.rowKey] = Number(c.seedPrice != null ? c.seedPrice : c.price) || 0; name[c.rowKey] = c.name + (c.sub ? ` (${c.sub})` : ''); }
  const mgr = {}; for (const m of await listEntities('AhmaliigaManagers')) mgr[m.partitionKey] = m.nickname || m.partitionKey;
  const lasseId = Object.keys(mgr).find((id) => mgr[id] === 'Lasse Ketvell');

  const rows = [];
  for (const s of await listEntities('AhmaliigaScores')) {
    if (s.rowKey !== lasseId) continue;
    const rnd = Number(String(s.partitionKey).split('|')[1]);
    let ci = {}, b = {}; try { ci = JSON.parse(s.cards || '{}'); } catch { } try { b = JSON.parse(s.breakdown || '{}'); } catch { }
    rows.push({ round: rnd, ids: ci.ids || [], breakdown: b, total: Number(s.total) || 0 });
  }
  rows.sort((a, b) => a.round - b.round);

  const delta = NEW - (seed[OLANDER] || 0);
  console.log(`Olander seed ${seed[OLANDER]}c → ${NEW}c (delta +${delta}). Lassen jaksot:`);
  console.log(`  jakso  budjetti→cf  pudotettu (pisteet)              jakson pisteet: oli→cf`);

  let actualTotal = 0, cfTotal = 0;
  for (const r of rows) {
    const cardPts = (id) => Number(r.breakdown[id]) || 0; // effective (incl captain)
    const roundPts = Object.entries(r.breakdown).reduce((s, [id, p]) => s + (id.startsWith('_') ? Number(p) || 0 : Number(p) || 0), 0);
    const budget = r.ids.reduce((s, id) => s + (seed[id] || 0), 0);
    const hasOl = r.ids.includes(OLANDER);
    let cfBudget = budget + (hasOl ? delta : 0);
    let cfIds = [...r.ids];
    const dropped = [];
    while (cfBudget > BUDGET) {
      // drop the lowest-scoring card that isn't Olander (keep the star)
      const cand = cfIds.filter((id) => id !== OLANDER);
      if (!cand.length) break;
      cand.sort((a, b) => cardPts(a) - cardPts(b));
      const d = cand[0];
      dropped.push(d);
      cfIds = cfIds.filter((id) => id !== d);
      cfBudget -= (seed[d] || 0);
    }
    // cf round points = round points minus dropped cards' contributions (non-card bonuses kept)
    const lost = dropped.reduce((s, id) => s + cardPts(id), 0);
    const cfPts = roundPts - lost;
    actualTotal += roundPts; cfTotal += cfPts;
    const dropStr = dropped.length ? dropped.map((id) => `${name[id]} (${r1(cardPts(id))})`).join(', ') : (hasOl ? 'mahtui' : '—');
    console.log(`  J${pad(r.round + 1, 2)}    ${pad(budget, 3)}→${pad(r1(cfBudget + lost * 0), 3)}   ${dropStr.slice(0, 38).padEnd(38)}  ${pad(r1(roundPts), 6)}→${pad(r1(cfPts), 6)}`);
  }

  console.log(`\n  Lasse actual total: ${r1(actualTotal)}`);
  console.log(`  Lasse Olander@${NEW}: ${r1(cfTotal)}  (menetys ${r1(actualTotal - cfTotal)})`);
  console.log(`  2. sija (Jussi) oli 514 → Lasse ${cfTotal >= 514 ? 'VOITTAA silti' : 'HÄVIÄISI'} (ero ${r1(cfTotal - 514)})`);
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
