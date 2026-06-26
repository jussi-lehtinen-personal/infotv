const { verifySession } = require('./jwt');

// Reads the Bearer token from the request and returns the userId, or null if
// missing/invalid. Endpoints that require auth should 401 when this is null.
async function requireAuth(request) {
  const header = request.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    return await verifySession(m[1]);
  } catch {
    return null;
  }
}

module.exports = { requireAuth };
