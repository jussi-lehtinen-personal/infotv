const { app } = require('@azure/functions');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getCardDetail } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/card?id=<cardId> — Kortin tiedot: the card + ownership %,
// per-round price/points history and the card's games. Public.
app.http('ahmaliigaCard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/card',
  handler: async (request, context) => {
    try {
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { card: null } };
      const id = request.query?.get('id');
      if (!id) return { status: 400, jsonBody: { error: 'id puuttuu.' } };
      const detail = await getCardDetail(season.rowKey, id);
      return { jsonBody: detail || { card: null } };
    } catch (err) {
      context.log('ahmaliigaCard failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});
