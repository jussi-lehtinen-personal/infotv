// Hermetic e2e for the REAL-CLOCK mechanism (F2.5). Azurite only, no network.
// Proves: (1) the SIM branch is unchanged (a tick advances the compressed clock one
// day), (2) the REAL branch syncs the clock to today and settles every round whose
// window has really passed, (3) the real clock is monotonic (never rewinds). The
// seed season is entirely in the past, so under the real clock everything settles.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1'; // refuse fast if ever called
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables, getEntity, upsertEntity } = require('../api/src/lib/tables');
const { seedSeason, loadGames, getActiveSeason, getRounds, setRealClock, stepSim } = require('../api/src/lib/ahmaliiga');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
let failures = 0;
const assert = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };
const today = new Date().toISOString().slice(0, 10);

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  await loadGames('2026', read('games-2026.json').games);
  const season = await getActiveSeason();
  const rounds = await getRounds('2026');
  const lastEnd = rounds[rounds.length - 1].endDate;
  assert(lastEnd < today, `sanity: seed season is entirely in the past (last end ${lastEnd} < ${today})`);

  // --- SIM branch unchanged: one tick advances the compressed clock exactly one day ---
  await upsertEntity('AhmaliigaSeason', { ...season, realClock: false, simDate: '2025-09-06', currentRound: 0 });
  const sim1 = await stepSim('2026', 1);
  assert(sim1.mode === 'sim', 'sim tick reports mode=sim');
  assert(sim1.simDate === '2025-09-07', `sim tick advances +1 day (${sim1.simDate})`);

  // --- REAL branch: syncs the clock to today → every past round settles ---
  await setRealClock('2026', true);
  const s2 = await getActiveSeason();
  await upsertEntity('AhmaliigaSeason', { ...s2, simDate: '2025-09-06' }); // rewind so we see the jump
  const real = await stepSim('2026', 1);
  assert(real.mode === 'real', 'real tick reports mode=real');
  assert(real.simDate === today, `real clock synced to today (${real.simDate} == ${today})`);
  const settledCount = (await getRounds('2026')).filter((j) => j.status === 'settled').length;
  assert(settledCount === rounds.length, `all past rounds settled under the real clock (${settledCount}/${rounds.length})`);

  // --- monotonic: never rewind when the clock is already ahead of today ---
  const s3 = await getActiveSeason();
  await upsertEntity('AhmaliigaSeason', { ...s3, simDate: '2099-01-01' });
  const real2 = await stepSim('2026', 1);
  assert(real2.simDate === '2099-01-01', `real clock never rewinds (${real2.simDate})`);

  // --- the flag is dormant by default: a fresh season has no realClock → sim ---
  const fresh = await getEntity('AhmaliigaSeason', 'season', '2026');
  await upsertEntity('AhmaliigaSeason', { ...fresh, realClock: false });
  const back = await stepSim('2026', 1);
  assert(back.mode === 'sim', 'clearing the flag returns to sim mode');

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('THREW', e); process.exit(1); });
