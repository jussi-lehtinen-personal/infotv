// Local e2e for Ahmaliiga M1 (squads + validation) against Azurite. Seeds, then
// exercises saveSquad rules via the real api lib. Run: start Azurite, then
// `node tools/test-m1.js`. Throwaway.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables } = require('../api/src/lib/tables');
const { seedSeason, getActiveSeason, getCards, saveSquad, getSquad } = require('../api/src/lib/ahmaliiga');

const U = 'test-user-1';
let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); cond ? pass++ : fail++; };
async function rejects(fn, needle, msg) {
  try { await fn(); ok(false, `${msg} (ei heittänyt)`); }
  catch (e) { ok(e.code === 400 && (!needle || e.message.includes(needle)), `${msg} → "${e.message}"`); }
}

(async () => {
  await ensureTables();
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'cards-seed-2026.json'), 'utf8'));
  await seedSeason(seed);
  const season = await getActiveSeason();
  const cards = await getCards(season.rowKey);
  const teams = cards.filter((c) => c.kind === 'team').sort((a, b) => a.price - b.price);
  const players = cards.filter((c) => c.kind !== 'team').sort((a, b) => b.price - a.price);
  const id = (c) => c.rowKey;

  // valid: 5 cheapest teams (well under budget)
  const valid = teams.slice(0, 5).map(id);
  const r = await saveSquad(U, valid, valid[0]);
  ok(r && r.spent <= season.budget, `valid squad saved, spent ${r.spent}/${season.budget}, bank ${r.bank}`);
  const got = await getSquad(U);
  ok(got && got.cards.length === 5 && got.captainId === valid[0], 'getSquad returns 5 cards + captain');

  // over budget: 3 priciest teams + 2 priciest players
  const overBudget = [...teams.slice(-3).map(id), ...players.slice(0, 2).map(id)];
  await rejects(() => saveSquad(U, overBudget, overBudget[0]), 'Budjetti', 'over-budget rejected');

  // v2 rule (minTeams=2): a FULL squad with < 2 teams is rejected. 4 cheap players +
  // 1 cheap team (affordable → only the team rule can trip).
  const tooFewTeams = [...players.slice(-4).map(id), id(teams[0])];
  await rejects(() => saveSquad(U, tooFewTeams, tooFewTeams[0]), 'joukkue', 'too-few-teams (<2) rejected');

  // v2: 3 players + 2 teams is now VALID (minTeams satisfied; no separate maxPlayers).
  const threePlusTwo = [...players.slice(-3).map(id), ...teams.slice(0, 2).map(id)];
  const rv = await saveSquad(U, threePlusTwo, threePlusTwo[0]);
  ok(rv && rv.cards.length === 5, '3 players + 2 teams accepted (minTeams ok)');

  // captain not in squad
  await rejects(() => saveSquad(U, valid, id(teams[6])), 'Kapteeni', 'captain-not-in-squad rejected');

  // upper bound: more than squadSize cards rejected (partial squads ARE allowed)
  const tooBig = teams.slice(0, 6).map(id);
  await rejects(() => saveSquad(U, tooBig, tooBig[0]), 'Enintään', 'over-size (6 cards) rejected');

  // transfers are a SOFT penalty (not a hard reject): a fresh user's first complete
  // build is free; a following 1-card swap counts 1 transfer. Isolated user so prior
  // saves above don't pollute the transfer counter.
  const U2 = 'test-user-2';
  const base = teams.slice(0, 5).map(id);
  await saveSquad(U2, base, base[0]);
  const swap1 = [teams[5], ...teams.slice(1, 5)].map(id);
  const r2 = await saveSquad(U2, swap1, swap1[0]);
  // NB: in a freshly-seeded season at round 0 the round-start snapshot is empty, so
  // build-round edits are free (transfersUsed stays 0 until a round rolls). Just assert
  // the swap applied — transfer counting is exercised in the settlement tests.
  ok(r2.cards.some((c) => c.id === id(teams[5])), '1-card swap applied');

  console.log(`\nM1 e2e: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
