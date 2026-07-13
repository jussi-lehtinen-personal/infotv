// Local e2e for Ahmaliiga M3 (Veikkaus) against Azurite: load games, save a
// prediction, settle, and check the bonus lands in the jakso score. Throwaway.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables } = require('../api/src/lib/tables');
const {
  seedSeason, loadResults, loadGames, seedBots, saveSquad, savePrediction,
  settleJakso, getJaksoGames, getJaksoScore, getCards, predictionBonus,
} = require('../api/src/lib/ahmaliiga');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); c ? pass++ : fail++; };

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  await loadResults('2026', read('results-2026.json').results);
  await loadGames('2026', read('games-2026.json').games);
  await seedBots('2026');

  const games = await getJaksoGames('2026', 0);
  ok(games.length > 0, `jakso 0 has ${games.length} games`);
  const g = games[0];
  console.log(`  picked: ${g.home} ${g.homeGoals}-${g.awayGoals} ${g.away} (id ${g.gameId})`);

  // human squad (cheapest teams) + EXACT prediction on g
  const teams = (await getCards('2026')).filter((c) => c.kind === 'team').sort((a, b) => a.price - b.price).slice(0, 5).map((c) => c.rowKey);
  await saveSquad('me', teams, teams[0]);
  await savePrediction('2026', 0, 'me', g.gameId, g.homeGoals, g.awayGoals); // exact → +3

  // unit checks on the bonus function
  ok(predictionBonus({ homeGoals: g.homeGoals, awayGoals: g.awayGoals }, g) === 3, 'exact prediction = +3');
  ok(predictionBonus({ homeGoals: g.homeGoals + 1, awayGoals: g.awayGoals + 1 }, g) === (g.homeGoals - g.awayGoals === (g.homeGoals + 1) - (g.awayGoals + 1) ? 2 : 0), 'shifted-by-1 keeps margin (=+2 if same winner)');

  await settleJakso('2026', 0);
  const score = await getJaksoScore('2026', 0, 'me');
  ok(score && score.breakdown._predict === 3, `settle: prediction bonus in breakdown (_predict=${score && score.breakdown._predict})`);

  // wrong prediction → no bonus
  await savePrediction('2026', 0, 'me', g.gameId, 9, 0); // likely wrong exact, maybe wrong winner
  await settleJakso('2026', 0);
  const score2 = await getJaksoScore('2026', 0, 'me');
  const wrongBonus = (score2.breakdown._predict || 0);
  ok(wrongBonus === predictionBonus({ homeGoals: 9, awayGoals: 0 }, g), `re-settle uses new prediction (bonus=${wrongBonus})`);

  console.log(`\nM3 e2e: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
