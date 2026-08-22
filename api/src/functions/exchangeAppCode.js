const { app } = require('@azure/functions');
const { ensureTables, getEntity, deleteEntity } = require('../lib/tables');
const { parseRoles, isAdmin } = require('../lib/admin');
const { appConfig, secretMatches, CODES_TABLE, CODES_PK } = require('../lib/appAuth');

// POST /api/exchangeAppCode — SERVER TO SERVER. Another club app's backend trades
// a code (from /api/issueAppCode) for the user's identity, authenticated by that
// app's client secret in the `x-app-secret` header. There is NO user auth here and
// the browser never calls this: the client secret never leaves the caller's server.
// See valmennus/AUTH.md.
//
// Body: { code }. The app is resolved from the stored code row, so the secret is
// checked against the app the code was minted for. Single use + 60s expiry are
// enforced here.

// Uniform denial for every "bad code or bad secret" outcome — status, body and
// (approximately) work are identical whether the code was unknown, expired, or
// the secret was wrong. Two distinguishable errors would tell a brute-forcer which
// half they got right.
function deny() {
  return { status: 401, jsonBody: { error: 'invalid_code_or_secret' } };
}

app.http('exchangeAppCode', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'exchangeAppCode',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const code = String(body.code || '');
      const presented = request.headers.get('x-app-secret') || '';

      // Shape-check before the lookup, so a malformed code denies like any other
      // bad one. newCode() is 32 bytes base64url = 43 chars; Table Storage
      // rejects RowKeys containing / \ # ? or control characters, and getEntity
      // only swallows 404 - so without this a code containing them surfaces as a
      // 500 instead of the uniform 401, which is exactly the distinguishable
      // outcome deny() exists to avoid.
      if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return deny();

      await ensureTables();
      const row = await getEntity(CODES_TABLE, CODES_PK, code);

      // Verify the secret against the app the code was minted for, in constant
      // time. On an unknown code do an equivalent compare against a dummy so the
      // response doesn't reveal (by timing or outcome) which half was wrong.
      const cfg = row ? appConfig(row.app) : null;
      const ok = !!cfg && secretMatches(cfg.secret, presented);
      if (!ok) {
        if (!cfg) secretMatches('unused-dummy-secret', presented);
        return deny();
      }

      // Delete BEFORE returning the identity: if the response fails midway the
      // code must not stay replayable. This also enforces single use — a second
      // exchange of the same code finds nothing. (Only consumed once the secret
      // checked out, so a wrong-secret probe can't burn a legitimate user's code.)
      await deleteEntity(CODES_TABLE, CODES_PK, code);

      if (Number(row.expiresAt) <= Date.now()) return deny(); // expired (now also cleaned up)

      const user = await getEntity('Users', row.userId, 'profile');
      if (!user) return deny();

      // Identity hydrated at exchange time (roles are fresh, not frozen into the
      // code). Role/admin logic reuses lib/admin.js — the same source /api/me uses.
      return {
        jsonBody: {
          userId: row.userId,
          nickname: user.nickname || '',
          roles: parseRoles(user),
          isAdmin: await isAdmin(row.userId, user),
        },
      };
    } catch (err) {
      context.log('exchangeAppCode failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: 'server_error' } };
    }
  },
});
