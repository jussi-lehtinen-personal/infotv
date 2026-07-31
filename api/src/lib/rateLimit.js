// Coarse per-IP request limiter for the auth endpoints (new-account creation, login
// challenge minting), so a script can't mass-create accounts. Table Storage fixed
// window: ONE row per (prefix, ip) that self-resets each window → no accumulation, no
// cleanup. Approximate (read-modify-write isn't atomic → concurrent races undercount)
// but a ceiling is all we need. Fails OPEN (no ip / storage hiccup → allow) so it can
// only bound abuse, never lock a real user out.
const { getEntity, upsertEntity, createTable } = require('./tables');

const TABLE = 'RateLimits';
let ensured = false;
async function ensureRlTable() {
  if (ensured) return;
  try { await createTable(TABLE); } catch { /* idempotent */ }
  ensured = true;
}

// Client IP behind Azure SWA. `x-azure-clientip` is the raw client IP (no port); fall
// back to the first x-forwarded-for hop with any :port stripped (a changing port would
// otherwise make every request a new key and defeat the limit).
function clientIp(request) {
  const g = (n) => request.headers.get(n) || '';
  const azure = g('x-azure-clientip').trim();
  if (azure) return azure;
  const hop = g('x-forwarded-for').split(',')[0].trim();
  return hop.replace(/:\d+$/, '') || null;
}

// Returns { ok, retryAfter }. `ok:false` once `limit` requests from this ip land in the
// current `windowSec` window under `prefix`.
async function checkRateLimit(ip, { prefix, limit, windowSec }) {
  if (!ip) return { ok: true };
  try {
    await ensureRlTable();
    const nowS = Math.floor(Date.now() / 1000);
    const win = Math.floor(nowS / windowSec);
    const pk = `${prefix}|${ip}`;
    const row = await getEntity(TABLE, pk, 'c');
    const count = row && Number(row.win) === win ? (Number(row.count) || 0) : 0;
    if (count >= limit) return { ok: false, retryAfter: windowSec - (nowS % windowSec) };
    await upsertEntity(TABLE, { partitionKey: pk, rowKey: 'c', win, count: count + 1 });
    return { ok: true };
  } catch { return { ok: true }; } // fail open — never block sign-in on a storage error
}

// 429 response shaped like the other function errors.
function tooManyResponse(rl) {
  return { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) }, jsonBody: { error: 'Liian monta yritystä — yritä hetken kuluttua uudelleen.' } };
}

module.exports = { checkRateLimit, clientIp, tooManyResponse };
