// Web Push (free: VAPID + web-push, no 3rd-party service). Stores each browser push
// subscription per user in AhmaliigaPushSubs (PK=userId, RK=endpoint hash) and sends
// notifications straight to the browser push endpoints. VAPID keys come from app-settings
// (VAPID_PUBLIC/VAPID_PRIVATE); if unset, sending is a safe no-op so the app still runs.
const crypto = require('crypto');
const webpush = require('web-push');
const { listByPartition, upsertEntity, deleteEntity } = require('./tables');

const T_SUBS = 'AhmaliigaPushSubs';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'https://gamezone.kiekko-ahma.fi';

let configured = null;
function ready() {
  if (configured === null) {
    configured = !!(VAPID_PUBLIC && VAPID_PRIVATE);
    if (configured) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  }
  return configured;
}

const endpointHash = (endpoint) => crypto.createHash('sha256').update(String(endpoint || '')).digest('hex').slice(0, 32);

async function saveSubscription(userId, sub) {
  if (!sub || !sub.endpoint) return;
  await upsertEntity(T_SUBS, {
    partitionKey: userId, rowKey: endpointHash(sub.endpoint),
    sub: JSON.stringify(sub), createdAt: new Date().toISOString(),
  });
}

async function removeSubscription(userId, endpoint) {
  await deleteEntity(T_SUBS, userId, endpointHash(endpoint)).catch(() => {});
}

// Best-effort push to all of a user's subscriptions. Prunes dead endpoints (404/410).
// payload: { title, body, url, tag }. Returns { sent }.
async function sendPush(userId, payload) {
  if (!ready()) return { sent: 0, skipped: 'no-vapid' };
  const subs = await listByPartition(T_SUBS, userId);
  if (!subs.length) return { sent: 0 };
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const row of subs) {
    let sub; try { sub = JSON.parse(row.sub); } catch { continue; }
    try { await webpush.sendNotification(sub, body); sent++; }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await deleteEntity(T_SUBS, userId, row.rowKey).catch(() => {}); }
  }
  return { sent };
}

module.exports = { saveSubscription, removeSubscription, sendPush, vapidPublicKey: () => VAPID_PUBLIC, isConfigured: ready, T_SUBS };
