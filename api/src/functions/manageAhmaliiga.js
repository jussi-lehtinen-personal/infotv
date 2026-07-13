const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { envAdminIds } = require('../lib/admin');
const { seedSeason } = require('../lib/ahmaliiga');

// POST /api/manageAhmaliiga — Ahmaliiga admin ops. Gated to the ADMIN_USER_IDS
// env allowlist (root operator) only, same as the preview gate. Route must NOT
// start with "admin" (SWA reserves /api/admin*).
//   { action: "seedSeason", seed: <tools/gen-cards.js output> }
app.http('manageAhmaliiga', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manageAhmaliiga',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      if (!envAdminIds().includes(userId)) return { status: 403, jsonBody: { error: 'Ei oikeuksia.' } };

      await ensureTables();
      const body = await request.json().catch(() => ({}));
      const action = body && body.action;

      if (action === 'seedSeason') {
        if (!body.seed || !Array.isArray(body.seed.cards)) {
          return { status: 400, jsonBody: { error: 'seed.cards puuttuu.' } };
        }
        const result = await seedSeason(body.seed);
        return { jsonBody: { ok: true, ...result } };
      }

      return { status: 400, jsonBody: { error: `Tuntematon action: ${action}` } };
    } catch (err) {
      context.log('manageAhmaliiga failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});
