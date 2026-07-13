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

  // too many players: 3 players + 2 teams
  const tooMany = [...players.slice(0, 3).map(id), ...teams.slice(0, 2).map(id)];
  await rejects(() => saveSquad(U, tooMany, tooMany[0]), 'pelaaja', 'too-many-players rejected');

  // captain not in squad
  await rejects(() => saveSquad(U, valid, id(teams[6])), 'Kapteeni', 'captain-not-in-squad rejected');

  // wrong size
  await rejects(() => saveSquad(U, valid.slice(0, 4), valid[0]), 'tasan', 'wrong-size rejected');

  // transfers: swap 1 card (ok), then a save changing 3 (reject)
  const swap1 = [teams[5], ...teams.slice(1, 5)].map(id);
  const r2 = await saveSquad(U, swap1, swap1[0]);
  ok(r2.transfersUsedThisJakso === 1, `1-card swap → transfersUsed ${r2.transfersUsedThisJakso}`);
  const swap3 = [teams[5], teams[6], teams[7], teams[3], teams[4]].map(id);
  await rejects(() => saveSquad(U, swap3, swap3[0]), 'siirtoja', '3-card swap over transfer cap rejected');

  console.log(`\nM1 e2e: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
