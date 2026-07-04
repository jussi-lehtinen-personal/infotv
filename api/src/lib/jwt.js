// `jose` uses the Web Crypto API via the global `crypto`. Node exposes it as a
// global by default, but the 32-bit Azure Functions Core Tools (local SWA
// emulator) does NOT — which threw "crypto is not defined" at load and killed
// the whole function app (every /api → 404). Polyfill it from node:crypto;
// guarded so it never overrides the real global in production.
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const { SignJWT, jwtVerify } = require('jose');

// App session token (HS256). Low-stakes club app → long-lived (90d) + silent
// re-auth is enough; refresh tokens can be added later. Secret = JWT_SECRET.
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

async function signSession(userId) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('90d')
    .sign(secret());
}

// Returns the userId (sub) or throws if invalid/expired.
async function verifySession(token) {
  const { payload } = await jwtVerify(token, secret());
  return payload.sub;
}

module.exports = { signSession, verifySession };
