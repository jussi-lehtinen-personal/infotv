// Hermetic test for U1 LIVE ranking (getLiveLeaderboard). Azurite only, no network
// (TP_PROXY_URL dead → box-score fetches fail gracefully; all-team squads score from
// the game result). Seeds a season, gives three managers DIFFERENT captains, then:
//   1) mid-round → provisional standings computed from games played so far.
//   2) THE INVARIANT: after settling round 0, the live leaderboard (all games now
//      played) must EQUAL the persisted final leaderboard, manager for manager — this
//      is the whole point of reusing settleRound's scoring primitives. Throwaway.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables, upsertEntity } = require('../api/src/lib/tables');
const { teamKey } = require('../api/src/lib/roundResults');
const {
  seedSeason, loadGames, saveSquad, savePrediction, settleRound, getActiveSeason,
  getCards, getRounds, getRoundGames, getLeaderboard, getLiveLeaderboard,
} = require('../api/src/lib/ahmaliiga');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
let failures = 0;
const assert = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.001;

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  await loadGames('2026', read('games-2026.json').games);

  const season = await getActiveSeason();
  const rounds = await getRounds('2026');
  const r0 = rounds.find((j) => Number(j.rowKey) === 0);
  const cards = await getCards('2026');
  const games = (await getRoundGames('2026', 0)).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // Pick the first game whose Ahma team HAS a card → exercises the captain 2× team-points
  // path (not just the prediction bonus). Falls back to the first game otherwise.
  const g0 = games.find((g) => cards.some((c) => c.rowKey === 'T:' + teamKey(g))) || games[0];

  // Seed round-0 games carry no results (would leave every total 0) — inject a decisive
  // Ahma win into the first game so scoring is NON-ZERO and the captain 2× + prediction
  // paths are truly exercised, not just 0 == 0.
  if (g0) {
    await upsertEntity('AhmaliigaGames', {
      partitionKey: '2026|0', rowKey: String(g0.gameId),
      home: g0.home, away: g0.away, ahmaHome: !!g0.ahmaHome, homeLogo: '', awayLogo: '',
      homeGoals: g0.ahmaHome ? 6 : 1, awayGoals: g0.ahmaHome ? 1 : 6, date: g0.date, level: g0.level,
    });
  }
  // Squad OWNS g0's (scoring) team + 4 cheapest fillers. Fall back to cheapest-5 if g0's
  // team has no card (then totals stay 0, but the live == final invariant still holds).
  const g0Card = g0 ? 'T:' + teamKey(g0) : null;
  const g0Exists = g0Card && cards.some((c) => c.rowKey === g0Card);
  const fillers = cards.filter((c) => c.kind === 'team' && c.rowKey !== g0Card).sort((a, b) => a.price - b.price).slice(0, g0Exists ? 4 : 5).map((c) => c.rowKey);
  const squad = g0Exists ? [g0Card, ...fillers] : fillers;
  const cost = squad.reduce((t, id) => t + Number((cards.find((c) => c.rowKey === id) || {}).price || 0), 0);
  if (squad.length < 5 || cost > Number(season.budget)) { console.log(`SKIP — squad not affordable (${cost}/${season.budget})`); process.exit(0); }

  await upsertEntity('AhmaliigaSeason', { ...season, simMode: true, simDate: r0.startDate, currentRound: 0 });

  // Same squad, DIFFERENT captains → mgrA captains g0's scoring team (2×) + veikkaa its
  // exact result (+bonus) → a distinct, non-zero total. Discriminating.
  await saveSquad('mgrA', squad, squad[0], 'Manageri A');
  await saveSquad('mgrB', squad, squad[1], 'Manageri B');
  await saveSquad('mgrC', squad, squad[2], 'Manageri C');
  if (g0) await savePrediction('2026', 0, 'mgrA', g0.gameId, g0.ahmaHome ? 6 : 1, g0.ahmaHome ? 1 : 6);

  // ---- 1) Mid-round: only games up to simDate count ----
  const midDay = g0 ? String(g0.date).slice(0, 10) : r0.startDate;
  await upsertEntity('AhmaliigaSeason', { ...(await getActiveSeason()), simDate: midDay });
  const mid = await getLiveLeaderboard('2026', 0);
  assert(Array.isArray(mid.rows) && mid.rows.length === 3, `mid-round: 3 managers ranked (got ${mid.rows.length}), ${mid.playedGames} games played`);
  assert(mid.rows.every((r) => typeof r.total === 'number' && typeof r.rank === 'number'), 'mid-round: every row has numeric total + rank');
  assert(mid.rows.every((r, i) => i === 0 || mid.rows[i - 1].total >= r.total), 'mid-round: sorted by total desc');

  // ---- 2) THE INVARIANT: settled → live (all games played) == final ----
  await upsertEntity('AhmaliigaSeason', { ...(await getActiveSeason()), simDate: r0.endDate });
  await settleRound('2026', 0);
  const final = await getLeaderboard('2026', 'round', 0);
  const live = await getLiveLeaderboard('2026', 0); // simDate past round end → all games played
  const finalBy = Object.fromEntries(final.map((r) => [r.userId, r]));
  const liveBy = Object.fromEntries(live.rows.map((r) => [r.userId, r]));

  let totalsMatch = final.length > 0 && final.length === live.rows.length;
  for (const uid of Object.keys(finalBy)) {
    const f = finalBy[uid], l = liveBy[uid];
    if (!l || !near(f.total, l.total)) { totalsMatch = false; console.log(`   mismatch ${uid}: final=${f.total} live=${l && l.total}`); }
  }
  assert(totalsMatch, `THE INVARIANT — live total == final total for all ${final.length} managers`);
  assert(Object.keys(finalBy).every((uid) => liveBy[uid] && liveBy[uid].rank === finalBy[uid].rank), 'live rank == final rank for all managers');

  const totals = new Set(final.map((r) => r.total));
  assert(totals.size >= 2 || final.every((r) => r.total === 0), `discriminating totals (distinct: ${totals.size}${final.every((r) => r.total === 0) ? ', all 0 — no results in seed' : ''})`);
  console.log(`\nfinal totals: ${final.map((r) => `${r.nickname}=${r.total}`).join(', ')}`);

  console.log(failures ? `\n${failures} FAIL` : '\nALL PASS ✅');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
