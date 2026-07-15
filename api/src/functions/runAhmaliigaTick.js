const { app } = require('@azure/functions');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, stepSim } = require('../lib/ahmaliiga');

// POST /api/runAhmaliigaTick — advance the Ahmaliiga sim clock one day and settle
// any round whose window has passed. Fired by a GitHub Actions cron (hourly), so
// it is key-gated by the `x-ahmaliiga-key` header matching the AHMALIIGA_CRON_KEY
// app-setting (same pattern as the backup cron). Only steps when the active
// season has autoStep on — the operator flips it from the admin panel.
app.http('runAhmaliigaTick', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'runAhmaliigaTick',
  handler: async (request, context) => {
    try {
      const key = process.env.AHMALIIGA_CRON_KEY;
      if (!key || request.headers.get('x-ahmaliiga-key') !== key) {
        return { status: 403, jsonBody: { error: 'Ei käyttöoikeutta.' } };
      }
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { ok: true, skipped: 'no-season' } };
      if (!season.autoStep) return { jsonBody: { ok: true, skipped: 'auto-off', simDate: season.simDate || '' } };

      const result = await stepSim(season.rowKey, Number(request.query.get('days')) || 1);
      return { jsonBody: { ok: true, ...result } };
    } catch (err) {
      context.log('runAhmaliigaTick failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});
