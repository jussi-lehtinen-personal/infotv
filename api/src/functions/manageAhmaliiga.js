const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { envAdminIds } = require('../lib/admin');
const { seedSeason, settleRound, seedBots, resetSim, recomputeBanks, stepSim, setAutoStep, getSimStatus, enrichPhotos, getActiveSeason, getRounds, activeRoundNo, syncSeasonGames, validateRoundResults, generateVouchers } = require('../lib/ahmaliiga');

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


      if (action === 'seedBots') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await seedBots(season.rowKey);
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'enrichPhotos') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await enrichPhotos(season.rowKey);
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'resetSim' || action === 'resetAll') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await resetSim(season.rowKey, { hard: action === 'resetAll' });
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'recomputeBanks') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await recomputeBanks(season.rowKey);
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'step') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await stepSim(season.rowKey, Number(body.days) || 1);
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'setAuto') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await setAutoStep(season.rowKey, !!body.on);
        return { jsonBody: { ok: true, ...result } };
      }

      // LIVE (Phase 2): pull the game schedule (+ team ids) from the Worker.
      if (action === 'syncGames') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await syncSeasonGames(season.rowKey);
        return { jsonBody: { ok: true, ...result } };
      }

      // LIVE (Phase 2): safety gate — runtime engine vs precomputed results for a round.
      if (action === 'validateResults') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const rounds = await getRounds(season.rowKey);
        const round = body.round != null ? Number(body.round) : Math.max(0, activeRoundNo(season, rounds) - 1);
        const result = await validateRoundResults(season.rowKey, round);
        return { jsonBody: { ok: true, ...result } };
      }

      // F10: award top-3 prize vouchers for a round (scope 'round' + round=N) or
      // the whole season (scope 'season'). Idempotent; notifies winners.
      if (action === 'generateVouchers') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const result = await generateVouchers(season.rowKey, {
          scope: body.scope, round: body.round, prizes: body.prizes, top: body.top,
        });
        return { jsonBody: { ok: true, ...result } };
      }

      if (action === 'status') {
        const season = await getActiveSeason();
        if (!season) return { jsonBody: { active: false } };
        const result = await getSimStatus(season.rowKey);
        return { jsonBody: { active: true, ...result } };
      }

      if (action === 'settleRound' || action === 'settleAll') {
        const season = await getActiveSeason();
        if (!season) return { status: 400, jsonBody: { error: 'Ei aktiivista kautta.' } };
        const rounds = await getRounds(season.rowKey);
        const last = rounds.length - 1;
        if (action === 'settleRound') {
          const j = body.round != null ? Number(body.round) : activeRoundNo(season, rounds);
          const result = await settleRound(season.rowKey, j);
          return { jsonBody: { ok: true, ...result } };
        }
        // settleAll: from the current pointer to the last round
        const from = activeRoundNo(season, rounds);
        const settled = [];
        for (let j = from; j <= last; j++) { const r = await settleRound(season.rowKey, j); settled.push(r.round); }
        return { jsonBody: { ok: true, settled } };
      }

      return { status: 400, jsonBody: { error: `Tuntematon action: ${action}` } };
    } catch (err) {
      context.log('manageAhmaliiga failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});
