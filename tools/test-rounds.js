// Hermetic e2e for GENERATED round schedules (F2.6). Azurite only, no network.
// Proves: (1) the pure cadence generator, (2) seedSeason generates rounds from a
// roundConfig (start+cadence) instead of a fixed list and tags the season roundGen,
// (3) ensureRoundsCover extends the windows forward to cover a late fixture
// (playoffs), idempotently, (4) a seed-defined replay season is NEVER extended
// (mechanism dormant unless roundGen). No running season is touched.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const { ensureTables, getEntity } = require('../api/src/lib/tables');
const { seedSeason, getRounds, buildRoundWindows, ensureRoundsCover } = require('../api/src/lib/ahmaliiga');

let failures = 0;
const assert = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };
const minimal = (extra) => ({ budget: 120, squadSize: 5, maxPlayers: 3, bands: {}, cards: [], ...extra });

(async () => {
  await ensureTables();

  // --- 1. pure cadence generator ---
  const w = buildRoundWindows('2026-09-01', 2, 3);
  assert(w.length === 3, `buildRoundWindows makes 3 windows (${w.length})`);
  assert(w[0].startDate === '2026-09-01' && w[0].endDate === '2026-09-14', `window 0 is a 2-week window (${w[0].startDate}..${w[0].endDate})`);
  assert(w[1].startDate === '2026-09-15', `window 1 starts the day after window 0 ends (${w[1].startDate})`);
  assert(w[2].endDate === '2026-10-12', `window 2 ends on cadence (${w[2].endDate})`);

  // --- 2. seedSeason GENERATES rounds from roundConfig (no seed.rounds) ---
  const res = await seedSeason(minimal({ season: 'GEN', roundConfig: { startDate: '2026-09-01', weeks: 2, count: 3 } }));
  assert(res.generated === true && res.rounds === 3, `seedSeason generated 3 rounds (${res.rounds}, gen=${res.generated})`);
  const seasonRow = await getEntity('AhmaliigaSeason', 'season', 'GEN');
  assert(seasonRow.roundGen === true && Number(seasonRow.roundWeeks) === 2 && seasonRow.roundStart === '2026-09-01',
    'season tagged roundGen + cadence + start');
  const r0 = await getRounds('GEN');
  assert(r0.length === 3 && r0[2].endDate === '2026-10-12', `rounds persisted from cadence (${r0.length}, last end ${r0[2] && r0[2].endDate})`);

  // --- 3. extend forward to cover a fixture beyond the last window ---
  // windows: 0(09-01..09-14) 1(09-15..09-28) 2(09-29..10-12) 3(10-13..10-26) 4(10-27..11-09)
  const ext = await ensureRoundsCover('GEN', '2026-11-01');
  assert(ext.length === 5, `ensureRoundsCover extended to 5 rounds (${ext.length})`);
  assert(ext[4].endDate === '2026-11-09', `new last window covers the day (${ext[4].endDate})`);

  // --- 4. idempotent + already-covered is a no-op ---
  const ext2 = await ensureRoundsCover('GEN', '2026-11-01');
  assert(ext2.length === 5, `ensureRoundsCover is idempotent (${ext2.length})`);
  const ext3 = await ensureRoundsCover('GEN', '2026-10-01');
  assert(ext3.length === 5, `covering an already-covered day is a no-op (${ext3.length})`);

  // --- 5. DORMANT for a seed-defined (replay) season ---
  await seedSeason(minimal({ season: 'REPLAY', rounds: [{ no: 0, startDate: '2025-09-01', endDate: '2025-09-14' }] }));
  const rep = await ensureRoundsCover('REPLAY', '2099-01-01');
  assert(rep.length === 1, `replay season is NOT extended (roundGen off) (${rep.length})`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('THREW', e); process.exit(1); });
