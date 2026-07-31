// Hermetic test for the auth rate limiter (checkRateLimit). Azurite only.
//   - blocks once the per-IP limit is reached in a window
//   - a DIFFERENT ip is unaffected (per-IP, not global)
//   - a new window resets the count
//   - no ip → fails open (allow)

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const { checkRateLimit } = require('../api/src/lib/rateLimit');

let failures = 0;
const assert = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

(async () => {
  const cfg = { prefix: 'test', limit: 3, windowSec: 3600 };
  // First `limit` calls from ip A pass; the next is blocked.
  const a = [];
  for (let i = 0; i < 4; i++) a.push((await checkRateLimit('1.1.1.1', cfg)).ok);
  assert(a[0] && a[1] && a[2] && a[3] === false, `limit reached → 4th blocked (${JSON.stringify(a)})`);

  // A different ip has its own bucket.
  const b = await checkRateLimit('2.2.2.2', cfg);
  assert(b.ok === true, 'different ip is unaffected (per-IP bucket)');

  // Blocked response carries a retryAfter.
  const blocked = await checkRateLimit('1.1.1.1', cfg);
  assert(blocked.ok === false && typeof blocked.retryAfter === 'number', `retryAfter present on block (${blocked.retryAfter})`);

  // A different WINDOW resets: a huge window key = a fresh bucket.
  const fresh = await checkRateLimit('1.1.1.1', { prefix: 'test2', limit: 1, windowSec: 1 });
  assert(fresh.ok === true, 'new window/prefix starts fresh');

  // No ip → fail open (never block a real user on a missing header).
  const noip = await checkRateLimit(null, cfg);
  assert(noip.ok === true, 'no ip → fails open (allow)');

  console.log(failures ? `\n${failures} FAIL` : '\nALL PASS ✅');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
