// Hermetic tests for the LIVE-pool beta plumbing (Azurite only, NO network). The
// roster-driven reconcileCards pool build is verified live against Jopox separately;
// here we cover the parts that DON'T need network: live-seed config + seasonMeta storage,
// the reconcile no-op guard for non-live seasons, the empty-seed-doesn't-wipe guard, and
// scoring skipping UNPLAYED games. Throwaway.
process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, getEntity, upsertEntity } = require('../api/src/lib/tables');
const A = require('../api/src/lib/ahmaliiga');
const { computeRoundPoints } = require('../api/src/lib/roundResults');
const { teamGamePoints } = require('../api/src/lib/scoring');
let fail = 0;
const assert = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

(async () => {
  await ensureTables();

  const liveSeed = {
    season: 'TESTLIVE', pricedFrom: '2026', budget: 120, squadSize: 5, maxPlayers: 3,
    playerAges: ['U15'], livePool: true, includeFriendlies: true, startAt: '2026-08-12T12:00', u15Flat: 40,
    roundConfig: { startDate: '2026-08-11', weeks: 1, count: 3 },
    priorIndex: { 'olander anni': 12.5, 'test player': 5 }, teamPrior: { Naiset: 12.3 },
    priorMaxPlayer: 12.5, priorMaxTeam: 12.3, cards: [],
  };

  // 1. live seed → config persisted + seasonMeta written + 0 cards
  await A.seedSeason(liveSeed);
  const srow = await getEntity('AhmaliigaSeason', 'season', 'TESTLIVE');
  assert(srow && srow.active, 'live season active after seed');
  assert(!!srow.livePool && !!srow.includeFriendlies && Number(srow.u15Flat) === 40 && srow.startAt === '2026-08-12T12:00',
    'live config persisted (livePool/includeFriendlies/u15Flat/startAt)');
  const meta = await getEntity('AhmaliigaSeason', 'seasonMeta', 'TESTLIVE');
  assert(meta && JSON.parse(meta.priorIndex)['olander anni'] === 12.5, 'seasonMeta priorIndex stored (off the hot path)');
  assert((await A.getCards('TESTLIVE')).length === 0, 'live seed starts with 0 cards (reconcileCards fills)');

  // 2. reconcile no-op for a season WITHOUT seasonMeta (guard — no Jopox fetch)
  await A.seedSeason({ season: 'TESTPLAIN', budget: 120, roundConfig: { startDate: '2026-08-11', weeks: 1, count: 1 },
    cards: [{ id: 'T:U18', kind: 'team', name: 'U18', sub: 'U18', teamKey: 'U18', price: 30, band: 'keski' }] });
  const rec = await A.reconcileCards('TESTPLAIN');
  assert(rec.skipped === 'no-meta' && rec.addedPlayers === 0 && rec.addedTeams === 0, 'reconcile is a no-op for a non-live season');
  assert((await A.getCards('TESTPLAIN')).length === 1, 'non-live pool untouched by reconcile');

  // 3. empty LIVE seed does NOT wipe an existing reconciled pool
  await upsertEntity('AhmaliigaCards', { partitionKey: 'TESTLIVE', rowKey: 'P:Olander Anni', kind: 'player',
    name: 'Olander Anni', sub: 'Naiset', price: 60, band: 'kallis', priorForm: 12.5 });
  await A.seedSeason(liveSeed); // re-seed with cards:[]
  assert((await A.getCards('TESTLIVE')).some((c) => c.rowKey === 'P:Olander Anni'),
    'empty live seed does NOT wipe the existing pool (reconcileCards owns it)');

  // 4. scoring SKIPS unplayed games (upcoming fixtures are stored but score nothing)
  const games = [
    { gameId: '1', home: 'Kiekko-Ahma U18', away: 'X', ahmaHome: true, homeGoals: 3, awayGoals: 1, level: 'U18' }, // played
    { gameId: '2', home: 'Kiekko-Ahma U18', away: 'Y', ahmaHome: true, homeGoals: null, awayGoals: null, level: 'U18' }, // upcoming
  ];
  const { results } = computeRoundPoints({ games, reports: {} });
  const oneGame = teamGamePoints(3, 1).pts;
  assert(results['T:U18'] != null, 'played game scored the team card');
  assert(Math.abs((results['T:U18'] || 0) - oneGame) < 0.01, `unplayed game skipped (team pts = ONE game ${oneGame}, not two)`);

  console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILURE(S)'}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('THREW', e); process.exit(1); });
