// Hermetic test for U5 LIVE reband (liveReband). Azurite only, no network
// (TP_PROXY_URL dead → box-score fetches fail gracefully; team cards score from the
// game result). Seeds a season, injects a decisive result into round 0's first game,
// then checks:
//   1) MID-ROUND: liveReband moves card livePrice within ±priceStepCap of the settled
//      price; the winning team's card moves UP (trend up); at least one card moves.
//   2) IDEMPOTENT: running liveReband twice at the same sim day gives the SAME
//      livePrice (it's a pure function of played results, not an accumulator).
//   3) THE INVARIANT: with the whole round played, liveReband's livePrice EQUALS the
//      price settleRound will assign — live == settled, so the mid-round price is a
//      true preview of the settlement price. Throwaway.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables, upsertEntity } = require('../api/src/lib/tables');
const { teamKey } = require('../api/src/lib/roundResults');
const {
  ECON, seedSeason, loadGames, settleRound, getActiveSeason,
  getCards, getRounds, getRoundGames, liveReband,
} = require('../api/src/lib/ahmaliiga');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
let failures = 0;
const assert = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 0.001;
const priceMap = (cards) => Object.fromEntries(cards.map((c) => [c.rowKey, Number(c.price)]));
const liveMap = (cards) => Object.fromEntries(cards.map((c) => [c.rowKey, c.livePrice != null ? Number(c.livePrice) : Number(c.price)]));

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  await loadGames('2026', read('games-2026.json').games);

  const season = await getActiveSeason();
  const rounds = await getRounds('2026');
  const r0 = rounds.find((j) => Number(j.rowKey) === 0);
  const cards0 = await getCards('2026');
  const games = (await getRoundGames('2026', 0)).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // A game whose Ahma team HAS a team card → its win moves that card's price.
  const g0 = games.find((g) => cards0.some((c) => c.rowKey === 'T:' + teamKey(g))) || games[0];
  const g0Card = g0 ? 'T:' + teamKey(g0) : null;
  const g0Exists = g0Card && cards0.some((c) => c.rowKey === g0Card);
  if (!g0 || !g0Exists) { console.log('SKIP — no round-0 game maps to a team card'); process.exit(0); }

  // Decisive Ahma win in g0 so its team card gets a high round form → price moves.
  await upsertEntity('AhmaliigaGames', {
    partitionKey: '2026|0', rowKey: String(g0.gameId),
    home: g0.home, away: g0.away, ahmaHome: !!g0.ahmaHome, homeLogo: '', awayLogo: '',
    homeGoals: g0.ahmaHome ? 6 : 1, awayGoals: g0.ahmaHome ? 1 : 6, date: g0.date, level: g0.level,
  });

  await upsertEntity('AhmaliigaSeason', { ...season, simMode: true, simDate: r0.startDate, currentRound: 0 });
  const seedPrice = priceMap(cards0);

  // ---- 1) MID-ROUND: only g0 played (simDate = g0's day) ----
  const midDay = String(g0.date).slice(0, 10);
  await upsertEntity('AhmaliigaSeason', { ...(await getActiveSeason()), simDate: midDay });
  const res1 = await liveReband('2026', 0);
  const cardsMid = await getCards('2026');
  const liveMid = liveMap(cardsMid);
  const withinCap = cardsMid.every((c) => Math.abs(liveMid[c.rowKey] - seedPrice[c.rowKey]) <= ECON.priceStepCap + 0.001);
  assert(res1.moved > 0, `mid-round: at least one card moved (${res1.moved} moved, ${res1.played} games played)`);
  assert(withinCap, `mid-round: every move is within ±priceStepCap (${ECON.priceStepCap})`);
  assert(liveMid[g0Card] > seedPrice[g0Card], `mid-round: winning team card ${g0Card} moved UP (${seedPrice[g0Card]} → ${liveMid[g0Card]})`);
  assert(cardsMid.find((c) => c.rowKey === g0Card).liveTrend === 'up', 'mid-round: winning card liveTrend = up');
  assert(Number(cardsMid.find((c) => c.rowKey === g0Card).liveRoundPts) > 0, `mid-round: winning card has live round points (liveRoundPts=${cardsMid.find((c) => c.rowKey === g0Card).liveRoundPts})`);
  assert(near(priceMap(cardsMid)[g0Card], seedPrice[g0Card]), 'mid-round: settled `price` is UNCHANGED (only livePrice moved)');

  // ---- 2) IDEMPOTENT: same sim day → same livePrice ----
  await liveReband('2026', 0);
  const liveMid2 = liveMap(await getCards('2026'));
  assert(Object.keys(liveMid).every((id) => near(liveMid[id], liveMid2[id])), 'idempotent: second liveReband at same sim day leaves livePrice unchanged');

  // ---- 3) THE INVARIANT: whole round played → livePrice == settled price ----
  await upsertEntity('AhmaliigaSeason', { ...(await getActiveSeason()), simDate: r0.endDate });
  await liveReband('2026', 0);
  const livePre = liveMap(await getCards('2026')); // live price with all games played
  await settleRound('2026', 0);
  const settled = priceMap(await getCards('2026')); // settlement's price
  let ok = true;
  for (const id of Object.keys(settled)) if (!near(livePre[id], settled[id])) { ok = false; console.log(`   mismatch ${id}: live=${livePre[id]} settled=${settled[id]}`); }
  assert(ok, 'THE INVARIANT — live price (round fully played) == settled price for every card');

  console.log(failures ? `\n${failures} FAIL` : '\nALL PASS ✅');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
