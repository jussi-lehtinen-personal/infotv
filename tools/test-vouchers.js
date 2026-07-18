// Hermetic e2e for PRIZE VOUCHERS (F10). Azurite only, no network. Seeds a season,
// gives three human managers a squad, settles round 0, then exercises the whole
// voucher flow: generate top-3 → own list → kiosk resolve by QR code → redeem once
// (OK) → redeem again (REJECTED) → re-generate (idempotent, 0 new). Throwaway.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables, listByPartition } = require('../api/src/lib/tables');
const {
  seedSeason, loadGames, saveSquad, settleRound, getActiveSeason, getCards, getLeaderboard,
  generateVouchers, getMyVouchers, getVouchersForKiosk, redeemVoucher, ensureQrCode,
} = require('../api/src/lib/ahmaliiga');
const { upsertEntity } = require('../api/src/lib/tables');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
let failures = 0;
const assert = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  await loadGames('2026', read('games-2026.json').games);

  const season = await getActiveSeason();
  const budget = Number(season.budget);
  const cards = await getCards('2026');
  // Cheapest 5 team cards → an affordable squad shared by all three managers.
  const squad = cards.filter((c) => c.kind === 'team').sort((a, b) => a.price - b.price).slice(0, 5).map((c) => c.rowKey);
  const cost = squad.reduce((t, id) => t + Number(cards.find((c) => c.rowKey === id).price), 0);
  if (squad.length < 5 || cost > budget) { console.log(`SKIP — squad not affordable (${cost}/${budget})`); return; }

  const R = 0;
  await upsertEntity('AhmaliigaSeason', { ...season, simMode: true, simDate: '2099-01-01', currentRound: R });

  // Three human managers, then settle round 0 so a leaderboard exists.
  await saveSquad('mgrA', squad, squad[0], 'Manageri A');
  await saveSquad('mgrB', squad, squad[0], 'Manageri B');
  await saveSquad('mgrC', squad, squad[0], 'Manageri C');
  await settleRound('2026', R);

  const board = await getLeaderboard('2026', 'round', R);
  const humanRows = board.filter((r) => ['mgrA', 'mgrB', 'mgrC'].includes(r.userId));
  assert(humanRows.length === 3, `leaderboard has the 3 human managers (${humanRows.length})`);

  // --- generate top-3 vouchers for round 0 ---
  const gen = await generateVouchers('2026', { scope: 'round', round: R });
  assert(gen.created === 3, `generateVouchers created 3 (${gen.created})`);

  // --- re-generate is idempotent ---
  const gen2 = await generateVouchers('2026', { scope: 'round', round: R });
  assert(gen2.created === 0, `re-generate created 0 (idempotent) (${gen2.created})`);

  // --- each manager has exactly one issued voucher + a reward notification ---
  const vA = await getMyVouchers('mgrA');
  assert(vA.length === 1 && vA[0].status === 'issued', `mgrA has 1 issued voucher (${vA.length}/${vA[0] && vA[0].status})`);
  const msgs = await listByPartition('AhmaliigaMessages', 'mgrA');
  assert(msgs.some((m) => m.kind === 'reward'), 'mgrA got a reward notification');

  // --- kiosk resolves the manager's QR code → their vouchers ---
  const code = await ensureQrCode('mgrA', 'Manageri A');
  assert(!!code, `mgrA has a QR code (${code})`);
  const kiosk = await getVouchersForKiosk(code);
  assert(kiosk && kiosk.userId === 'mgrA' && kiosk.vouchers.length === 1, 'kiosk resolves QR → mgrA + 1 voucher');
  const bad = await getVouchersForKiosk('deadbeefdeadbeef');
  assert(bad === null, 'unknown QR code resolves to null');

  // --- redeem once (OK) → the prize flips to redeemed ---
  const prizeId = vA[0].prizeId;
  const red = await redeemVoucher('mgrA', prizeId, 'staff1', 'Toimari');
  assert(red.ok === true, 'first redeem succeeds');
  const vA2 = await getMyVouchers('mgrA');
  assert(vA2[0].status === 'redeemed' && vA2[0].redeemedByName === 'Toimari', 'voucher now redeemed + records operator');

  // --- redeem again → REJECTED (one token, one redemption) ---
  let rejected = false;
  try { await redeemVoucher('mgrA', prizeId, 'staff2', 'Toinen'); } catch { rejected = true; }
  assert(rejected, 'second redeem of the same prize is REJECTED');

  // --- season-scope vouchers generate independently of the round ones ---
  const genS = await generateVouchers('2026', { scope: 'season' });
  assert(genS.created === 3 && genS.round === -1, `season top-3 vouchers created (${genS.created}, round ${genS.round})`);
  const vAall = await getMyVouchers('mgrA');
  assert(vAall.length === 2, `mgrA now has a round + a season voucher (${vAall.length})`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('THREW', e); process.exit(1); });
