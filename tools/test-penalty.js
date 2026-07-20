// Hermetic e2e (Azurite) for the transfer-penalty tooling:
//   1. saveSquad writes an AhmaliigaSquadLog audit row (added/removed/counter).
//   2. resetSim (non-hard) resets a kept squad's roundNo + transfersUsedThisRound.
//   3. refundPenalty zeroes a settled round's penalty + adds it back to the total.
//   node tools/test-penalty.js   (start Azurite first)

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables, listByPartition, getEntity, upsertEntity } = require('../api/src/lib/tables');
const A = require('../api/src/lib/ahmaliiga');

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); c ? pass++ : fail++; };

(async () => {
  await ensureTables();
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'cards-seed-2026.json'), 'utf8'));
  await A.seedSeason(seed);
  const season = await A.getActiveSeason();
  const sid = season.rowKey;
  const cards = await A.getCards(sid);
  const teams = cards.filter((c) => c.kind === 'team').sort((a, b) => a.price - b.price).map((c) => c.rowKey);
  const U = 'test-penalty-user';

  // --- 1. audit log on save ---
  await A.saveSquad(U, teams.slice(0, 5), teams[0]);              // first build (free)
  await A.saveSquad(U, [teams[5], ...teams.slice(1, 5)], teams[5]); // swap teams[0]→teams[5]
  const log = await listByPartition(A.T.squadLog, `${sid}|${U}`);
  ok(log.length === 2, `two audit rows written (${log.length})`);
  const swap = log.sort((a, b) => String(a.rowKey).localeCompare(b.rowKey))[1];
  let added = []; try { added = JSON.parse(swap.added || '[]'); } catch {}
  ok(added.includes(teams[5]), `audit row records the added card`);

  // --- 2. resetSim resets a kept squad's counter ---
  // Force a stale counter to simulate the pre-fix bug.
  const sqRow = await getEntity(A.T.squads, U, 'current');
  await upsertEntity(A.T.squads, { ...sqRow, roundNo: 5, transfersUsedThisRound: 4 });
  await A.resetSim(sid, {}); // non-hard
  const afterReset = await getEntity(A.T.squads, U, 'current');
  ok(Number(afterReset.roundNo) === 0 && Number(afterReset.transfersUsedThisRound) === 0,
    `resetSim reset kept squad → roundNo ${afterReset.roundNo}, used ${afterReset.transfersUsedThisRound}`);

  // --- 3. refundPenalty ---
  // Fabricate a settled round-2 score with a -5 penalty.
  const R = 2;
  await upsertEntity(A.T.scores, {
    partitionKey: `${sid}|${R}`, rowKey: U, total: 9.5, rank: 3, captainId: teams[0],
    cards: JSON.stringify({ ids: teams.slice(0, 5), captainId: teams[0] }),
    breakdown: JSON.stringify({ [teams[0]]: 6, _transfers: -5 }), penalty: 5,
  });
  const res = await A.refundPenalty(sid, U, R);
  ok(res.changed && res.refunded === 5 && res.newTotal === 14.5, `refund: 9.5 → ${res.newTotal} (+${res.refunded})`);
  const fixed = await getEntity(A.T.scores, `${sid}|${R}`, U);
  let bd = {}; try { bd = JSON.parse(fixed.breakdown || '{}'); } catch {}
  ok(Number(fixed.penalty) === 0 && bd._transfers === undefined, `penalty zeroed + _transfers removed`);
  // idempotent: refunding again is a no-op.
  const again = await A.refundPenalty(sid, U, R);
  ok(again.changed === false, `second refund is a no-op (${again.message || ''})`);

  console.log(`\ntest-penalty: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
