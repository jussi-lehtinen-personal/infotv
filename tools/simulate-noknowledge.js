// Counterfactual: strip Lasse's domain-knowledge edge. Replace his captained star
// (Olander) with (a) an average player and (b) another top scorer he might've picked
// without knowing Anni was THE best — keeping his captain role. Read-only (Azurite).
//   node tools/simulate-noknowledge.js

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities, listByPartition } = require('../api/src/lib/tables');

const OL = 'P:OLANDER Anni';
const r1 = (n) => Math.round(n * 10) / 10;

(async () => {
  await ensureTables();
  const kind = {}; for (const c of await listEntities('AhmaliigaCards')) kind[c.rowKey] = c.kind || 'team';
  const mgr = {}; for (const m of await listEntities('AhmaliigaManagers')) mgr[m.partitionKey] = m.nickname || m.partitionKey;
  const lasse = Object.keys(mgr).find((id) => mgr[id] === 'Lasse Ketvell');

  // per-round raw card points + per-round mean player points (for the "average pick")
  const res = {}; const meanPl = {};
  for (let j = 0; j < 17; j++) {
    const rows = await listByPartition('AhmaliigaResults', `2026|${j}`);
    res[j] = {}; const pl = [];
    for (const r of rows) { res[j][r.rowKey] = Number(r.pts) || 0; if (kind[r.rowKey] !== 'team') pl.push(Number(r.pts) || 0); }
    meanPl[j] = pl.length ? pl.reduce((s, x) => s + x, 0) / pl.length : 0;
  }

  const rows = [];
  for (const s of await listEntities('AhmaliigaScores')) {
    if (s.rowKey !== lasse) continue;
    const j = Number(String(s.partitionKey).split('|')[1]);
    let ci = {}, b = {}; try { ci = JSON.parse(s.cards || '{}'); } catch { } try { b = JSON.parse(s.breakdown || '{}'); } catch { }
    rows.push({ j, ids: ci.ids || [], cap: s.captainId || ci.captainId, total: Number(s.total) || 0, olEff: Number(b[OL]) || 0 });
  }
  rows.sort((a, b) => a.j - b.j);

  const olRounds = rows.filter((r) => r.ids.includes(OL));
  const olTotal = olRounds.reduce((s, r) => s + r.olEff, 0);
  console.log(`Olander oli Lassen pakassa ${olRounds.length}/${rows.length} jaksossa, toi ${r1(olTotal)} p (efekt., kapteroituna).`);

  const sim = (label, rawFor) => {
    let tot = 0;
    for (const r of rows) {
      if (!r.ids.includes(OL)) { tot += r.total; continue; }
      const wasCap = r.cap === OL;
      const repl = rawFor(r.j) * (wasCap ? 2 : 1);
      tot += r.total - r.olEff + repl;
    }
    console.log(`  ${label.padEnd(46)} ${r1(tot)}   ${tot >= 514 ? 'VOITTAA' : 'HÄVIÄÄ Jussille (514)'}  (Δ ${r1(tot - 681)})`);
  };

  console.log('\nLassen kausi jos Olander korvattaisiin:');
  sim('(a) keskivertopelaaja (jakson pelaajien ka)', (j) => meanPl[j]);
  sim('(b) toinen tähti: Mäkinen Ville', (j) => res[j]['P:MÄKINEN Ville'] || 0);
  sim('(c) toinen tähti: Väisänen Jori', (j) => res[j]['P:VÄISÄNEN Jori'] || 0);
  sim('(d) 2. paras Naisten: Lipsonen Vilja', (j) => res[j]['P:LIPSONEN Vilja'] || 0);
  console.log('\n  (todellinen Lasse 681)');
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
