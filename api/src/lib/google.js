const { jwtVerify, createRemoteJWKSet } = require('jose');

// Verify a Google Identity ID token (the `credential` from GIS) against
// Google's published JWKS. Checks issuer + audience (our OAuth client id).
// Returns the stable Google user id (sub) + email/name.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
);

async function verifyGoogleToken(credential) {
  const { payload } = await jwtVerify(credential, JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return {
    sub: payload.sub,
    email: payload.email || null,
    name: payload.name || null,
  };
}

module.exports = { verifyGoogleToken };
