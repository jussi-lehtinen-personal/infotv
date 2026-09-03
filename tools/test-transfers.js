// Hermetic test for the transfer limit + penalty ("free until kickoff, then 5 free
// swaps/round, extra = -5"). Azurite only.
//
// 2026-09-03 (user report, Rautakorpi): editing a squad you'd already completed — even
// BEFORE any game had kicked off — silently burned one of the 5 free transfers. Fixed:
// transfers now only start counting once one of the manager's HELD cards' games has
// actually kicked off (`roundStarted`, same signal the captain lock uses), mirroring the
// captain/trade-lock philosophy of "free exploration pre-kickoff, real economy after".
// This test proves BOTH halves: (1) a post-completion swap before kickoff is FREE, (2) once
// a held card's game has kicked off, transfers escalate 1..6 and the 6th costs -5 at settle.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables, upsertEntity } = require('../api/src/lib/tables');
const { teamKey } = require('../api/src/lib/roundResults');
const {
  ECON, seedSeason, loadGames, saveSquad, settleRound, getActiveSeason,
  getCards, getRounds, getRoundGames, getRoundScore,
} = require('../api/src/lib/ahmaliiga');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
let failures = 0;
const assert = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const dayBefore = (dateStr) => new Date(new Date(String(dateStr).replace(' ', 'T')).getTime() - 86400000).toISOString().slice(0, 10);

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  await loadGames('2026', read('games-2026.json').games);

  const season = await getActiveSeason();
  const rounds = await getRounds('2026');
  const r0 = rounds.find((j) => Number(j.rowKey) === 0);
  const cards = await getCards('2026');
  const teams = cards.filter((c) => c.kind === 'team');
  const edustus = teams.find((c) => c.teamKey === 'Edustus' || c.rowKey === 'T:Edustus');
  const r0games = await getRoundGames('2026', 0);
  const edGame = edustus && r0games.find((g) => teamKey(g) === (edustus.teamKey || 'Edustus'));
  if (!edustus || !edGame) { console.log('SKIP — round 0 has no Edustus game to key kickoff off of'); process.exit(0); }

  const teamsCheap = teams.filter((c) => c.rowKey !== edustus.rowKey).sort((a, b) => a.price - b.price);
  const byId = Object.fromEntries(teams.map((c) => [c.rowKey, Number(c.price) || 0]));
  if (teamsCheap.length < 6) { console.log('SKIP — not enough non-Edustus team cards'); process.exit(0); }

  const U = 'test-transfers-' + crypto.randomUUID().slice(0, 8); // fresh manager each run
  const captain = edustus.rowKey; // held (and captained) for the whole test — never removed

  // ---- Round 0, BEFORE Edustus's game kicks off ----
  await upsertEntity('AhmaliigaSeason', { ...season, simMode: true, simDate: dayBefore(edGame.date), currentRound: 0 });

  // First-ever build (captain + 4 cheapest others) → free, as always.
  let squad = [captain, ...teamsCheap.slice(0, 4).map((c) => c.rowKey)];
  const build = await saveSquad(U, squad, captain, 'T');
  assert(build.transfersUsed === 0 && build.freeTransfers === ECON.transfersPerRound, `round-0 build is free (used ${build.transfersUsed}, free ${build.freeTransfers})`);
  assert(ECON.transfersPerRound === 5, `free allowance is 5 (ECON.transfersPerRound=${ECON.transfersPerRound})`);

  // THE FIX: swap a non-captain slot BEFORE any held card's game has kicked off — must
  // stay free, even though the squad was already complete once.
  squad = [squad[0], teamsCheap[4].rowKey, squad[2], squad[3], squad[4]];
  const preKickoff = await saveSquad(U, squad, captain, 'T');
  assert(preKickoff.transfersUsed === 0, `swap BEFORE kickoff is free (used ${preKickoff.transfersUsed})`);

  // ---- Advance the sim clock to/past Edustus's game — roundStarted flips true ----
  await upsertEntity('AhmaliigaSeason', { ...(await getActiveSeason()), simDate: String(edGame.date).slice(0, 10) });

  // 6 more swaps of a non-captain slot, cycling through team ids (reuse is fine — each
  // "bring in a card not in the PREVIOUS save" counts once). Picks the cheapest candidate
  // that fits the budget so this stays valid however seed prices change.
  const used = [];
  for (let i = 0; i < 6; i++) {
    const outgoingPrice = byId[squad[1]];
    const bankNow = i === 0 ? preKickoff.bank : used.at(-1).bank;
    const incoming = teamsCheap.find((c) => c.rowKey !== squad[1] && !squad.includes(c.rowKey) && c.price <= bankNow + outgoingPrice);
    if (!incoming) { console.log('SKIP — ran out of affordable candidates mid-sequence'); process.exit(0); }
    squad = [squad[0], incoming.rowKey, squad[2], squad[3], squad[4]];
    const res = await saveSquad(U, squad, captain, 'T');
    used.push({ transfersUsed: res.transfersUsed, bank: res.bank });
  }
  const seq = used.map((u) => u.transfersUsed);
  assert(JSON.stringify(seq) === JSON.stringify([1, 2, 3, 4, 5, 6]), `transfers count up 1..6 AFTER kickoff (got ${JSON.stringify(seq)})`);
  assert(seq[4] === 5, '5th post-kickoff swap = 5 used (still within free allowance)');
  assert(seq[5] === 6, '6th post-kickoff swap = 6 used (1 over the 5 free)');

  // Settle round 0 → the 1 extra transfer costs exactly one TRANSFER_PENALTY.
  await upsertEntity('AhmaliigaSeason', { ...(await getActiveSeason()), simDate: r0.endDate });
  await settleRound('2026', 0);
  const score = await getRoundScore('2026', 0, U);
  const tp = score && score.breakdown ? score.breakdown._transfers : undefined;
  assert(tp === -ECON.transferPenalty, `settlement docks exactly -${ECON.transferPenalty} for the 1 extra transfer (breakdown._transfers=${tp})`);

  console.log(failures ? `\n${failures} FAIL` : '\nALL PASS ✅ — free until kickoff, then 5 free / extra = -5');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
