const crypto = require('crypto');

// App-to-app sign-in handover (see valmennus/AUTH.md). Gamezone is the identity
// provider: a signed-in user mints a single-use code (issueAppCode) that another
// club app's BACKEND trades — server to server, with a shared secret — for the
// user's identity (exchangeAppCode). This module holds the pieces both endpoints
// share, so the security invariants live in one place.
//
// Config is read per app id from settings:
//   APP_SECRET_<APP>     — shared client secret (32 random bytes, base64url)
//   APP_REDIRECTS_<APP>  — comma-separated allowlisted redirect ORIGINS
// An app is "known" only when BOTH are present. <APP> is the upper-cased id with
// non-alphanumerics stripped, e.g. app "valmennus" → APP_SECRET_VALMENNUS.
function appConfig(appId) {
  const key = String(appId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!key) return null;
  const secret = process.env[`APP_SECRET_${key}`];
  const redirects = process.env[`APP_REDIRECTS_${key}`];
  if (!secret || !redirects) return null;
  const origins = redirects.split(',').map((s) => s.trim()).filter(Boolean);
  if (!origins.length) return null;
  return { secret, origins };
}

// Is `redirect` allowed for this app? Matched by ORIGIN, EXACTLY — never by
// prefix, so "https://evil.test/?x=https://allowed.test" fails (its origin is
// evil.test). This exact-origin check is the security boundary of the whole
// design: without it /authorize is an open redirector handing out codes.
function redirectAllowed(cfg, redirect) {
  if (!cfg || !redirect) return false;
  let origin;
  try { origin = new URL(redirect).origin; } catch { return false; }
  return cfg.origins.includes(origin);
}

// Constant-time secret compare. crypto.timingSafeEqual throws on a length
// mismatch (and the throw itself would leak that the lengths differ), so hash
// both sides to a fixed 32-byte width first and compare those.
function secretMatches(expected, presented) {
  const a = crypto.createHash('sha256').update(String(expected || '')).digest();
  const b = crypto.createHash('sha256').update(String(presented || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

// 32 bytes from a CSPRNG, base64url — a Table Storage RowKey can't contain
// / \ # ? or control chars; base64url (A-Za-z0-9-_) is safe.
function newCode() {
  return crypto.randomBytes(32).toString('base64url');
}

const CODE_TTL_MS = 60 * 1000; // codes expire in 60 seconds
const CODES_TABLE = 'AppAuthCodes';
const CODES_PK = 'code'; // one bucket partition; volume is one row per sign-in

module.exports = {
  appConfig, redirectAllowed, secretMatches, newCode,
  CODE_TTL_MS, CODES_TABLE, CODES_PK,
};
