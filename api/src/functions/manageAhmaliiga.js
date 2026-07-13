const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { envAdminIds } = require('../lib/admin');
const { seedSeason, loadResults, loadGames, settleJakso, seedBots, resetSim, getSimStatus, getActiveSeason, getJaksot, activeJaksoNo } = require('../lib/ahmaliiga');

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

      if (action === 'loadResults') {
        if (!body.results || typeof body.results !== 'object') {
          return { status: 400, jsonBody: { error: 'results puuttuu.' } };
        }
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await loadResults(season.rowKey, body.results);
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'loadGames') {
        if (!body.games || typeof body.games !== 'object') {
          return { status: 400, jsonBody: { error: 'games puuttuu.' } };
        }
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await loadGames(season.rowKey, body.games);
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'seedBots') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await seedBots(season.rowKey);
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'resetSim') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await resetSim(season.rowKey);
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'status') {
        const season = await getActiveSeason();
        if (!season) return { jsonBody: { active: false } };
        const result = await getSimStatus(season.rowKey);
        return { jsonBody: { active: true, ...result } };
      }

      if (action === 'settleJakso' || action === 'settleAll') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const jaksot = await getJaksot(season.rowKey);
        const last = jaksot.length - 1;
        if (action === 'settleJakso') {
          const j = body.jakso != null ? Number(body.jakso) : activeJaksoNo(season, jaksot);
          const result = await settleJakso(season.rowKey, j);
          return { jsonBody: { ok: true, ...result } };
        }
        // settleAll: from the current pointer to the last jakso
        const from = activeJaksoNo(season, jaksot);
        const settled = [];
        for (let j = from; j <= last; j++) { const r = await settleJakso(season.rowKey, j); settled.push(r.jakso); }
        return { jsonBody: { ok: true, settled } };
      }

      return { status: 400, jsonBody: { error: `Tuntematon action: ${action}` } };
    } catch (err) {
      context.log('manageAhmaliiga failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});
