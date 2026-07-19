// Balance analysis of a completed/ongoing season (from a restored backup in Azurite).
// Answers: which card KIND was the best points-per-coin (overpowered?), the top cards,
// and whether the tulosveikkaus (prediction) bonus mattered. Read-only.
//
//   node tools/analyze-season.js

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const { ensureTables, listEntities } = require('../api/src/lib/tables');

const pad = (s, n) => String(s).padStart(n);
const padr = (s, n) => String(s).padEnd(n);

(async () => {
  await ensureTables();
  const cards = await listEntities('AhmaliigaCards');

  // Group cards by kind. seasonPts = raw points the card earned (not captain-doubled);
  // seed price = launch price (efficiency = value if you'd bought it at the start).
  const byKind = {};
  for (const c of cards) {
    const k = c.kind || 'team';
    const pts = Number(c.seasonPts) || 0;
    const seed = Number(c.seedPrice != null ? c.seedPrice : c.price) || 0;
    (byKind[k] = byKind[k] || []).push({ id: c.rowKey, name: c.name, sub: c.sub || '', pts, seed, price: Number(c.price) || 0, eff: seed ? pts / seed : 0 });
  }

  console.log('=== BY KIND — points & efficiency (season points, seed price) ===');
  console.log('  kind     n   Σpts   mean  played  meanIfPlayed  meanSeed  pts/coin(all)  pts/coin(played)');
  for (const k of Object.keys(byKind)) {
    const a = byKind[k];
    const n = a.length;
    const played = a.filter((x) => x.pts > 0);
    const sum = a.reduce((s, x) => s + x.pts, 0);
    const meanSeed = a.reduce((s, x) => s + x.seed, 0) / n;
    const effAll = a.reduce((s, x) => s + x.eff, 0) / n;
    const effPl = played.length ? played.reduce((s, x) => s + x.eff, 0) / played.length : 0;
    const meanPl = played.length ? sum / played.length : 0;
    console.log(`  ${padr(k, 7)} ${pad(n, 3)} ${pad(sum.toFixed(0), 6)} ${pad((sum / n).toFixed(1), 6)} ${pad(played.length, 6)} ${pad(meanPl.toFixed(1), 12)} ${pad(meanSeed.toFixed(1), 9)} ${pad(effAll.toFixed(2), 13)} ${pad(effPl.toFixed(2), 16)}`);
  }

  const all = Object.values(byKind).flat();
  console.log('\n=== TOP 15 by season points ===');
  all.sort((x, y) => y.pts - x.pts).slice(0, 15).forEach((x) => console.log(`  ${pad(x.pts.toFixed(0), 4)}pts  seed ${pad(x.seed, 3)}c  ${pad(x.eff.toFixed(2), 5)} p/c  [${padr(x.id.startsWith('T:') ? 'team' : 'plyr', 4)}] ${x.name} ${x.sub ? '(' + x.sub + ')' : ''}`));

  console.log('\n=== TOP 15 by points-per-coin (seed ≥ 10) ===');
  all.filter((x) => x.seed >= 10).sort((x, y) => y.eff - x.eff).slice(0, 15)
    .forEach((x) => console.log(`  ${pad(x.eff.toFixed(2), 5)} p/c  ${pad(x.pts.toFixed(0), 4)}pts  seed ${pad(x.seed, 3)}c  [${padr(x.id.startsWith('T:') ? 'team' : 'plyr', 4)}] ${x.name} ${x.sub ? '(' + x.sub + ')' : ''}`));

  // Prediction: sum the _predict bonus across every settled manager-round.
  const scores = await listEntities('AhmaliigaScores');
  let predTotal = 0, predNonzero = 0, predRows = 0, totalPts = 0, capTotal = 0;
  for (const s of scores) {
    totalPts += Number(s.total) || 0;
    let b = {}; try { b = JSON.parse(s.breakdown || '{}'); } catch { b = {}; }
    if (b._predict != null) { predRows++; if (b._predict) { predTotal += b._predict; predNonzero++; } }
  }
  const preds = await listEntities('AhmaliigaPredictions');
  console.log('\n=== TULOSVEIKKAUS (prediction) ===');
  console.log(`  predictions made: ${preds.length}`);
  console.log(`  manager-rounds with a prediction: ${predRows}  · of which SCORED a bonus: ${predNonzero}`);
  console.log(`  total prediction bonus points: ${predTotal}`);
  console.log(`  total manager points (all settled rounds): ${totalPts.toFixed(0)}`);
  console.log(`  prediction share of all points: ${totalPts ? (100 * predTotal / totalPts).toFixed(2) : 0}%`);
  console.log(`  hit rate: ${predRows ? (100 * predNonzero / predRows).toFixed(0) : 0}% of predictions scored`);

  process.exit(0);
})().catch((e) => { console.error('THREW', e && e.stack || e); process.exit(1); });
