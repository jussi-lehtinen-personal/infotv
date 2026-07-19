// Tulosveikkaus stats from the test season: how many predictions, hit rate, and the
// tier breakdown (exact / goal-diff / correct-winner / miss). Read-only (Azurite).
//   node tools/analyze-predictions.js

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities } = require('../api/src/lib/tables');
const { predictionBonus, ECON } = require('../api/src/lib/ahmaliiga');

const pad = (s, n) => String(s).padStart(n);

(async () => {
  await ensureTables();
  console.log(`ECON.predict: winner ${ECON.predict.winner} · margin ${ECON.predict.margin} · exact ${ECON.predict.exact}`);

  // games by id (result)
  const gm = {};
  for (const g of await listEntities('AhmaliigaGames')) gm[g.rowKey] = { homeGoals: g.homeGoals, awayGoals: g.awayGoals, home: g.home, away: g.away, date: g.date };

  const preds = await listEntities('AhmaliigaPredictions');
  const perRound = {};
  const tier = { exact: 0, margin: 0, winner: 0, miss: 0, noresult: 0 };
  let totalPts = 0;
  for (const p of preds) {
    const rnd = Number(String(p.partitionKey).split('|')[1]);
    perRound[rnd] = (perRound[rnd] || 0) + 1;
    const g = gm[p.gameId];
    if (!g || g.homeGoals == null || g.awayGoals == null) { tier.noresult++; continue; }
    const b = predictionBonus({ homeGoals: p.homeGoals, awayGoals: p.awayGoals }, g);
    totalPts += b;
    if (b === ECON.predict.exact) tier.exact++;
    else if (b === ECON.predict.margin) tier.margin++;
    else if (b === ECON.predict.winner) tier.winner++;
    else tier.miss++;
  }

  const scored = tier.exact + tier.margin + tier.winner;
  const settled = scored + tier.miss;
  console.log(`\n=== VEIKKAUKSET ===`);
  console.log(`  veikkauksia tehty:        ${preds.length}`);
  console.log(`  ratkaistuja (tulos on):   ${settled}   (${tier.noresult} vielä ilman tulosta)`);
  console.log(`\n  Osumat:`);
  console.log(`    Tarkka tulos (+${ECON.predict.exact}):        ${tier.exact}`);
  console.log(`    Oikea voittaja+maaliero (+${ECON.predict.margin}): ${tier.margin}`);
  console.log(`    Oikea voittaja (+${ECON.predict.winner}):        ${tier.winner}`);
  console.log(`    Meni pieleen (0):           ${tier.miss}`);
  console.log(`\n  OSUI: ${scored}/${settled} = ${settled ? Math.round(100 * scored / settled) : 0} %`);
  console.log(`  Pisteitä yhteensä: ${totalPts}  (ka ${settled ? (totalPts / settled).toFixed(2) : 0} / veikkaus)`);

  console.log(`\n  Veikkauksia per jakso:`);
  console.log('    ' + Object.keys(perRound).map(Number).sort((a, b) => a - b).map((r) => `J${r + 1}:${perRound[r]}`).join('  '));

  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
