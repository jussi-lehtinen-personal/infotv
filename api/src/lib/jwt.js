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
