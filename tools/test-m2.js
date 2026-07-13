// Local e2e for Ahmaliiga M2 (results + settlement replay) against Azurite. Seeds
// the season, loads the 2026 results, adds bots + a human squad, settles all 17
// jaksot, and prints leaderboards + reband + idempotency checks. Throwaway.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables } = require('../api/src/lib/tables');
const {
  seedSeason, loadResults, seedBots, saveSquad, settleJakso,
  getJaksot, getCards, getLeaderboard, getStanding, getActiveSeason,
} = require('../api/src/lib/ahmaliiga');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  const lr = await loadResults('2026', read('results-2026.json').results);
  console.log('loadResults →', lr);
  console.log('seedBots →', await seedBots('2026'));

  // a human squad: 5 cheapest teams (will finish low — that's fine)
  const cards = await getCards('2026');
  const priceBefore = {}; for (const c of cards) priceBefore[c.rowKey] = c.price;
  const teams = cards.filter((c) => c.kind === 'team').sort((a, b) => a.price - b.price);
  const my = teams.slice(0, 5).map((c) => c.rowKey);
  await saveSquad('me', my, my[0]);

  const jaksot = await getJaksot('2026');
  const last = jaksot.length - 1;
  for (let j = 0; j <= last; j++) await settleJakso('2026', j);

  const j0 = await getLeaderboard('2026', 'jakso', 0);
  console.log(`\njakso 0 leaderboard (${j0.length}):`);
  j0.slice(0, 6).forEach((r) => console.log(`  ${r.rank}. ${r.nickname} — ${r.total}`));

  const kausi = await getLeaderboard('2026', 'kausi');
  console.log(`\nseason leaderboard (${kausi.length}):`);
  kausi.forEach((r) => console.log(`  ${r.rank}. ${r.nickname} — ${r.total}`));

  console.log('\nmy standing (last jakso):', await getStanding('2026', last, 'me'));

  // reband check: did any card price change vs seed?
  const after = await getCards('2026');
  const changed = after.filter((c) => c.price !== priceBefore[c.rowKey]).length;
  console.log(`\nreband: ${changed}/${after.length} cards changed price since seed`);

  // idempotency: re-settle jakso 0 → season total for the winner must not change
  const winnerBefore = (await getLeaderboard('2026', 'kausi'))[0];
  await settleJakso('2026', 0);
  const winnerAfter = (await getLeaderboard('2026', 'kausi'))[0];
  console.log(`idempotent re-settle jakso0: winner ${winnerBefore.total} → ${winnerAfter.total}`,
    winnerBefore.total === winnerAfter.total ? '(OK)' : '(CHANGED!)');

  console.log('\nM2 e2e done');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
