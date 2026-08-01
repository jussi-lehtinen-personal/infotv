// Hermetic test for the transfer limit + penalty (does "max 5 free, rest cost -5"
// actually work?). Azurite only. Build a complete squad in round 0 (free), roll to
// round 1, make 6 swaps → the 6th is the 1 extra beyond the 5 free → settlement must
// dock TRANSFER_PENALTY (5) once.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables, upsertEntity } = require('../api/src/lib/tables');
const {
  ECON, seedSeason, loadGames, saveSquad, settleRound, getActiveSeason,
  getCards, getRounds, getRoundScore,
} = require('../api/src/lib/ahmaliiga');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
let failures = 0;
const assert = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  await loadGames('2026', read('games-2026.json').games);

  const season = await getActiveSeason();
  const rounds = await getRounds('2026');
  const r1 = rounds.find((j) => Number(j.rowKey) === 1);
  const cards = await getCards('2026');
  // Cheapest team cards → an all-team squad (minTeams always satisfied) that stays in budget.
  const teams = cards.filter((c) => c.kind === 'team').sort((a, b) => a.price - b.price);
  const pool = teams.slice(0, 11).map((c) => c.rowKey); // 11 distinct team cards
  if (pool.length < 11) { console.log('SKIP — not enough cheap team cards'); process.exit(0); }

  const U = 'test-transfers-' + crypto.randomUUID().slice(0, 8); // fresh manager each run
  // Round 0: first complete build → FREE.
  await upsertEntity('AhmaliigaSeason', { ...season, simMode: true, simDate: rounds[0].startDate, currentRound: 0 });
  const build = pool.slice(0, 5);
  const r0 = await saveSquad(U, build, build[0], 'T');
  assert(r0.transfersUsed === 0 && r0.freeTransfers === ECON.transfersPerRound, `round-0 build is free (used ${r0.transfersUsed}, free ${r0.freeTransfers})`);
  assert(ECON.transfersPerRound === 5, `free allowance is 5 (ECON.transfersPerRound=${ECON.transfersPerRound})`);

  // THE FIX (user's report): once the squad is COMPLETE, a swap the SAME (build) round
  // COUNTS — it isn't a free-forever build round any more. Swap slot 1, keep captain.
  const r0swap = await saveSquad(U, [build[0], pool[5], ...build.slice(2)], build[0], 'T');
  assert(r0swap.transfersUsed === 1, `swap in the build round (after completion) counts (used ${r0swap.transfersUsed})`);

  // Roll to round 1 — a fresh 5 free transfers; the carried-in complete squad counts.
  await upsertEntity('AhmaliigaSeason', { ...(await getActiveSeason()), currentRound: 1, simDate: r1.startDate });

  // 6 swaps: bring in one new card each time. Keep the CAPTAIN fixed (build[0]) and
  // swap slot 1 — so the captain lock (games may have "started" this round) never trips;
  // we're only exercising the transfer counter.
  const captain = build[0];
  let squad = [build[0], pool[5], ...build.slice(2)]; // actual squad after the round-0 swap
  // six incoming cards, each not currently held (pool[1] = build[1], freed in the r0 swap)
  const incomings = [pool[6], pool[7], pool[8], pool[9], pool[10], pool[1]];
  const used = [];
  for (const incoming of incomings) {
    squad = [squad[0], incoming, ...squad.slice(2)]; // replace slot 1
    const res = await saveSquad(U, squad, captain, 'T');
    used.push(res.transfersUsed);
  }
  assert(JSON.stringify(used) === JSON.stringify([1, 2, 3, 4, 5, 6]), `transfers count up 1..6 across the round (got ${JSON.stringify(used)})`);
  assert(used[4] === 5, '5th swap = 5 used (still within free allowance)');
  assert(used[5] === 6, '6th swap = 6 used (1 over the 5 free)');

  // Settle round 1 → the 1 extra transfer costs exactly one TRANSFER_PENALTY.
  await upsertEntity('AhmaliigaSeason', { ...(await getActiveSeason()), simDate: r1.endDate });
  await settleRound('2026', 1);
  const score = await getRoundScore('2026', 1, U);
  const tp = score && score.breakdown ? score.breakdown._transfers : undefined;
  assert(tp === -ECON.transferPenalty, `settlement docks exactly -${ECON.transferPenalty} for the 1 extra transfer (breakdown._transfers=${tp})`);

  console.log(failures ? `\n${failures} FAIL` : '\nALL PASS ✅ — transfer limit works (5 free, extra = -5)');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
