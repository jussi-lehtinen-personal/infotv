// Hermetic regression test for the "reminder re-pushed every hour after the user
// clears it" bug (fix bed1b85). Azurite only, no network. Seeds a season, creates a
// manager, runs emitRoundReminders (round 0 → "Ahmaliiga alkoi" open reminder + push),
// then DELETES the in-app message (as the user did) and runs the tick AGAIN — asserting
// the message does NOT reappear and NO second push is sent (durable AhmaliigaNotifyLog
// marker blocks it). Also checks the deploy-backfill path. Throwaway.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
process.env.TP_PROXY_URL = 'http://127.0.0.1:1';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');

// Spy on sendPush BEFORE requiring ahmaliiga (which destructures it at load time) so we
// count every push ATTEMPT, independent of whether VAPID is configured locally.
const pushMod = require('../api/src/lib/push');
let pushCount = 0;
const pushLog = [];
pushMod.sendPush = async (uid, payload) => { pushCount++; pushLog.push(`${uid}:${payload && payload.tag}`); };

const { ensureTables, upsertEntity, getEntity, listByPartition } = require('../api/src/lib/tables');
const {
  seedSeason, loadGames, saveSquad, getActiveSeason, getRounds,
  emitRoundReminders, getNotifications, deleteNotification,
} = require('../api/src/lib/ahmaliiga');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
let failures = 0;
const assert = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const OPEN = '!remind|0|open';
const hasOpen = async (uid) => (await getNotifications(uid)).items.some((i) => i.id === OPEN);
const hasMarker = async (uid) => !!(await getEntity('AhmaliigaNotifyLog', uid, OPEN));

(async () => {
  await ensureTables();
  await seedSeason(read('cards-seed-2026.json'));
  await loadGames('2026', read('games-2026.json').games);

  const rounds = await getRounds('2026');
  const r0 = rounds.find((j) => Number(j.rowKey) === 0);
  const season = await getActiveSeason();
  // Park the clock at round 0's opening day → activeRound = 0 (fires the "Ahmaliiga
  // alkoi" open reminder), and BEFORE the lock window so only the open push fires.
  await upsertEntity('AhmaliigaSeason', { ...season, simMode: true, simDate: r0.startDate, currentRound: 0 });

  // One human manager (saveSquad registers them → listManagers picks them up).
  const { getCards } = require('../api/src/lib/ahmaliiga');
  const cards = await getCards('2026');
  const squad = cards.filter((c) => c.kind === 'team').sort((a, b) => a.price - b.price).slice(0, 5).map((c) => c.rowKey);
  await saveSquad('mgrX', squad, squad[0], 'Testaaja');

  // ---- Tick 1: first emit ----
  await emitRoundReminders('2026');
  const push1 = pushCount;
  assert(await hasOpen('mgrX'), 'tick 1: open reminder created in inbox');
  assert(await hasMarker('mgrX'), 'tick 1: durable notifyLog marker written');
  assert(push1 === 1, `tick 1: exactly one push sent (got ${push1})`);

  // ---- Tick 2 (no change): idempotent, no duplicate, no re-push ----
  await emitRoundReminders('2026');
  assert(pushCount === push1, `tick 2 (unchanged): no extra push (still ${push1})`);

  // ---- USER CLEARS the notification, then the hourly tick runs again ----
  await deleteNotification('mgrX', OPEN);
  assert(!(await hasOpen('mgrX')), 'after clear: inbox message gone');
  assert(await hasMarker('mgrX'), 'after clear: durable marker still present (survives clear)');

  await emitRoundReminders('2026'); // the tick that used to re-create + re-push
  assert(!(await hasOpen('mgrX')), 'THE FIX: cleared reminder does NOT reappear');
  assert(pushCount === push1, `THE FIX: no re-push after clear (still ${push1}, not ${push1 + 1})`);

  // ---- Deploy backfill path: a pre-marker message (no marker) must NOT re-push ----
  await saveSquad('mgrY', squad, squad[0], 'Vanha');
  // Simulate a message that existed before the fix shipped (no notifyLog marker).
  await upsertEntity('AhmaliigaMessages', { partitionKey: 'mgrY', rowKey: OPEN, kind: 'remind', title: 'Ahmaliiga alkoi! 🏒', body: 'x', points: null, round: null, createdAt: '2026-07-25T09:07:00.000Z', read: false });
  assert(!(await hasMarker('mgrY')), 'backfill setup: mgrY has message but no marker');
  const beforeBackfill = pushCount;
  await emitRoundReminders('2026');
  assert(await hasMarker('mgrY'), 'backfill: marker written for the pre-existing message');
  assert(pushCount === beforeBackfill, `backfill: NO re-push for the existing message (still ${beforeBackfill})`);
  const mgrYmsg = (await listByPartition('AhmaliigaMessages', 'mgrY')).find((m) => m.rowKey === OPEN);
  assert(mgrYmsg && mgrYmsg.createdAt === '2026-07-25T09:07:00.000Z', 'backfill: original message untouched (createdAt not rewritten)');

  console.log(`\npushLog: [${pushLog.join(', ')}]`);
  console.log(failures ? `\n${failures} FAIL` : '\nALL PASS ✅');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
