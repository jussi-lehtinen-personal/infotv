const { SignJWT, jwtVerify } = require('jose');

// Stateless WebAuthn challenge: instead of a challenges table + cleanup, we
// sign the challenge (and any flow context) into a short-lived (5 min) token
// that the client echoes back at the verify step. Same JWT_SECRET as sessions.
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

async function issueChallenge(data) {
  return new SignJWT(data)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret());
}

// Returns the payload ({ challenge, flow, ... }) or throws if invalid/expired.
async function readChallenge(token) {
  const { payload } = await jwtVerify(token, secret());
  return payload;
}

module.exports = { issueChallenge, readChallenge };
