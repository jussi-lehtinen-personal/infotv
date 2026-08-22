const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, insertEntity, listByPartition, deleteEntity } = require('../lib/tables');
const { appConfig, redirectAllowed, newCode, CODE_TTL_MS, CODES_TABLE, CODES_PK } = require('../lib/appAuth');

// POST /api/issueAppCode — a signed-in Gamezone user mints a single-use, 60-second
// authorisation code for another club app (e.g. valmennus). The code is an opaque
// handle: it carries NO claims and is worthless without the app's client secret,
// which is exchanged server-to-server at /api/exchangeAppCode. See valmennus/AUTH.md.
//
// Body: { app, redirect }. Both are validated against the app's config: an unknown
// app or a redirect whose ORIGIN isn't allowlisted is rejected outright (the
// exact-origin allowlist is what stops this from being an open redirector).

// Opportunistic cleanup: expired codes never accumulate as junk. Every mint first
// deletes any code past its expiry. Abandoned codes (issued, never exchanged) are
// the only ones that outlive their 60s — this sweep clears them on the next mint,
// so the table never grows unbounded. Volume is tiny (one row per sign-in), so a
// partition scan per mint is cheap. Best-effort: a sweep failure never blocks a login.
async function sweepExpired() {
  try {
    const now = Date.now();
    const rows = await listByPartition(CODES_TABLE, CODES_PK);
    await Promise.all(
      rows
        .filter((r) => Number(r.expiresAt) <= now)
        .map((r) => deleteEntity(CODES_TABLE, r.partitionKey, r.rowKey))
    );
  } catch { /* cleanup is best-effort */ }
}

app.http('issueAppCode', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'issueAppCode',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };

      const body = await request.json().catch(() => ({}));
      const appId = String(body.app || '');
      const redirect = String(body.redirect || '');

      const cfg = appConfig(appId);
      if (!cfg) return { status: 400, jsonBody: { error: 'Tuntematon sovellus.' } };
      if (!redirectAllowed(cfg, redirect)) return { status: 400, jsonBody: { error: 'Paluuosoite ei ole sallittu.' } };

      await ensureTables();
      await sweepExpired();

      const code = newCode();
      // Bind the code to (user, app, redirect) at mint time. exchangeAppCode
      // resolves the app from the row (so the secret is checked against the app
      // the code was minted for); the SPA redirects only to this stored redirect.
      await insertEntity(CODES_TABLE, {
        partitionKey: CODES_PK,
        rowKey: code,
        userId,
        app: appId,
        redirect,
        expiresAt: Date.now() + CODE_TTL_MS,
      });

      return { jsonBody: { code } };
    } catch (err) {
      context.log('issueAppCode failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});
