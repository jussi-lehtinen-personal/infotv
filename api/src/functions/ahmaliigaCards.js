const { app } = require('@azure/functions');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getCards, getJaksot } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/cards?filter=team|player|goalie — the active season's card
// pool (Korttimarkkina). Public. filter omitted/all = every card.
app.http('ahmaliigaCards', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/cards',
  handler: async (request, context) => {
    try {
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { season: null, cards: [] } };
      const filter = request.query?.get('filter');
      const [allCards, jaksot] = await Promise.all([getCards(season.rowKey), getJaksot(season.rowKey)]);
      const settled = jaksot.some((j) => j.status === 'settled');
      let cards = allCards;
      if (filter && filter !== 'all') cards = cards.filter((c) => c.kind === filter);
      const out = cards
        .map((c) => ({
          id: c.rowKey, kind: c.kind, name: c.name, sub: c.sub || '',
          band: c.band, price: c.price, ownerCount: c.ownerCount || 0,
          lastPts: c.lastPts || 0, seasonPts: c.seasonPts || 0, photo: c.photo || '', trend: c.trend || '',
        }))
        .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name, 'fi'));
      return { jsonBody: { season: season.rowKey, settled, cards: out } };
    } catch (err) {
      context.log('ahmaliigaCards failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});
