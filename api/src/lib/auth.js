const { verifySession } = require('./jwt');

// Reads the session token and returns the userId, or null if missing/invalid.
// Primary transport is the custom X-Ahma-Auth header (SWA forwards custom
// headers to managed functions untouched); falls back to Authorization: Bearer.
async function requireAuth(request) {
  const token =
    request.headers.get('x-ahma-auth') ||
    (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    return await verifySession(token);
  } catch {
    return null;
  }
}

module.exports = { requireAuth };
