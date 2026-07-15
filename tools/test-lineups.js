// Hermetic e2e for the ROLLING-LOCK (Lineups per-game freeze). Azurite only, no
// network: loadGames leaves homeTeamId empty so fetchGameReport returns null → team
// cards score offline from the loaded results, players are simply absent. Throwaway.
//
// Scenario: a manager owns team card X (which plays in an already-STARTED game of a
// round) then swaps X→Z after kickoff. The lazy-freeze must keep X for the started
// game, and settlement must award X's started-game points to the manager even though
// the current squad no longer holds X. A control manager keeps X the whole round.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1'; // refuse fast if ever called
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables, getEntity, upsertEntity, listByPartition } = require('../api/src/lib/tables');
const {
  seedSeason, loadGames, saveSquad, settleRound, getActiveSeason, getCards,
  computeRoundResults,
} = require('../api/src/lib/ahmaliiga');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
const dayOf = (d) => String(d || '').slice(0, 10);
const r1 = (n) => Math.round(n * 10) / 10;
let failures = 0;
const assert = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  const games = read('games-2026.json').games;
  await loadGames('2026', games);
  const cards = await getCards('2026');
  const price = {}; const isTeam = {};
  for (const c of cards) { price[c.rowKey] = Number(c.price); isTeam[c.rowKey] = c.kind === 'team'; }

  // Pick a round with games on ≥2 distinct days so we can split started/not-started.
  let R = null, simDate = null, started = [], notStarted = [];
  for (const j of Object.keys(games)) {
    const gs = games[j] || [];
    const days = [...new Set(gs.map((g) => dayOf(g.date)))].sort();
    if (days.length < 2) continue;
    const cut = days[0]; // games on day-0 are "started", later days not
    const s = gs.filter((g) => dayOf(g.date) <= cut);
    const ns = gs.filter((g) => dayOf(g.date) > cut);
    if (s.length && ns.length) { R = Number(j); simDate = cut; started = s; notStarted = ns; break; }
  }
  if (R == null) { console.log('SKIP — no round with a started/not-started split'); return; }
  console.log(`round ${R}: simDate=${simDate}, started=${started.length} game(s), notStarted=${notStarted.length}`);

  // Per-game card points for the round (team cards score offline).
  const { perGame } = await computeRoundResults('2026', R);
  const startedIds = new Set(started.map((g) => String(g.gameId)));
  const notIds = new Set(notStarted.map((g) => String(g.gameId)));
  const sumOver = (ids, card) => [...ids].reduce((t, gid) => t + ((perGame[gid] && perGame[gid][card]) || 0), 0);

  // X = a TEAM card that scores in a STARTED game; Z = a TEAM card that scores in a
  // NOT-STARTED game (Z ≠ X). Prefer cheap cards so a 5-card squad fits the budget.
  const teamScoreIn = (ids) => {
    const tally = {};
    for (const gid of ids) for (const [c, p] of Object.entries(perGame[gid] || {})) if (isTeam[c] && p > 0) tally[c] = (tally[c] || 0) + p;
    return Object.keys(tally).sort((a, b) => price[a] - price[b]);
  };
  const X = teamScoreIn(startedIds)[0];
  const Z = teamScoreIn(notIds).find((c) => c !== X);
  if (!X || !Z) { console.log('SKIP — could not find scoring team cards X and Z'); return; }

  // 4 filler team cards (cheapest, distinct from X/Z) + budget check.
  const season = await getActiveSeason();
  const budget = Number(season.budget);
  const fillers = cards.filter((c) => c.kind === 'team' && c.rowKey !== X && c.rowKey !== Z)
    .sort((a, b) => a.price - b.price).slice(0, 4).map((c) => c.rowKey);
  const startCost = price[X] + fillers.reduce((t, id) => t + price[id], 0);
  if (fillers.length < 4 || startCost > budget) { console.log(`SKIP — squad not affordable (${startCost}/${budget})`); return; }
  const captain = fillers[0]; // captain is a filler → X/Z never doubled (clean compare)

  // Force the sim clock to mid-round R so `started` games are locked.
  await upsertEntity('AhmaliigaSeason', { ...season, simMode: true, simDate, currentRound: R });

  const expX = r1(sumOver(startedIds, X));  // X counts only for started games (frozen)
  const expZ = r1(sumOver(notIds, Z));      // Z counts only for not-started games
  const expXfull = r1(sumOver(startedIds, X) + sumOver(notIds, X)); // X across the whole round
  console.log(`X=${X} (${price[X]}) startedPts=${expX} fullPts=${expXfull} · Z=${Z} (${price[Z]}) notStartedPts=${expZ}`);

  // --- manager B: owns X at kickoff, swaps X→Z after the started games locked ---
  await saveSquad('mgrB', [X, ...fillers], captain, 'B');       // pre-edit squad (has X)
  const lineupsBefore = await listByPartition('AhmaliigaLineups', `2026|mgrB`);
  assert(lineupsBefore.length === 0, 'no snapshots before any edit');

  await saveSquad('mgrB', [Z, ...fillers], captain, 'B');       // swap X→Z (lazy-freeze fires)
  const snaps = await listByPartition('AhmaliigaLineups', `2026|mgrB`);
  assert(snaps.length === started.length, `lazy-freeze created ${started.length} snapshot(s), got ${snaps.length}`);
  const anySnapHasX = snaps.some((s) => { try { return JSON.parse(s.cards).includes(X); } catch { return false; } });
  assert(anySnapHasX, 'frozen snapshot keeps the PRE-edit card X');
  const curB = JSON.parse((await getEntity('AhmaliigaSquads', 'mgrB', 'current')).cards).map((c) => c.id);
  assert(curB.includes(Z) && !curB.includes(X), 'current squad now holds Z, not X');

  // --- control C: keeps X the whole round (no edit) ---
  await saveSquad('mgrC', [X, ...fillers], captain, 'C');

  await settleRound('2026', R);

  const scoreB = await getEntity('AhmaliigaScores', `2026|${R}`, 'mgrB');
  const scoreC = await getEntity('AhmaliigaScores', `2026|${R}`, 'mgrC');
  const bB = JSON.parse(scoreB.breakdown);
  const bC = JSON.parse(scoreC.breakdown);

  assert(r1(bB[X] || 0) === expX, `B: X scored its STARTED-game pts via snapshot (${bB[X] || 0} == ${expX})`);
  assert(r1(bB[Z] || 0) === expZ, `B: Z scored its NOT-STARTED-game pts (${bB[Z] || 0} == ${expZ})`);
  assert(r1(bC[X] || 0) === expXfull, `C (no edit): X scored the FULL round (${bC[X] || 0} == ${expXfull})`);
  // The rolling lock must MATTER: X in not-started games was dropped by the swap.
  const droppedByLock = r1(sumOver(notIds, X));
  assert(expXfull === r1(expX + droppedByLock), 'sanity: full = started + not-started for X');
  if (droppedByLock > 0) assert(r1(bB[X] || 0) < r1(bC[X] || 0), `swap removed X's not-started pts (${bB[X]} < ${bC[X]})`);

  // --- idempotency: re-settle reads the immutable snapshots → same totals ---
  const totalB1 = scoreB.total;
  await settleRound('2026', R);
  const totalB2 = (await getEntity('AhmaliigaScores', `2026|${R}`, 'mgrB')).total;
  assert(r1(totalB1) === r1(totalB2), `re-settle is stable (${totalB1} == ${totalB2})`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('THREW', e); process.exit(1); });
