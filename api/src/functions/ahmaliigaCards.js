const { app } = require('@azure/functions');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getCards, getRounds, getRoundGames, liveRoundCardPoints, lockGamesByTeam, isCardTradeLocked } = require('../lib/ahmaliiga');

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
      const [allCards, rounds] = await Promise.all([getCards(season.rowKey), getRounds(season.rowKey)]);
      const settled = rounds.some((j) => j.status === 'settled');
      // The CURRENT round = the first non-settled round — the SAME "current jakso" the
      // rest of the app shows (squad building / veikkaus target), even before its first
      // game is played. While it's the current round, the "Jakso" column shows its LIVE
      // points (0 until games are played, then accumulating) instead of the last settled
      // round's. Only falls back to the last settled round once the season is over.
      const cur = rounds.find((j) => j.status !== 'settled');
      const roundLive = !!cur;
      // Current round's live points per card, computed ON DEMAND (tick-independent,
      // memoised 30 s). Fall back to the tick-persisted liveRoundPts if it fails.
      let livePts = null;
      if (roundLive) { try { livePts = (await liveRoundCardPoints(season.rowKey, Number(cur.rowKey))).pts; } catch { livePts = null; } }
      // Per-card TRADE LOCK: a card whose team's current-round game has kicked off but isn't
      // yet priced in is frozen for buy/sell (see isCardTradeLocked). Lets the client disable
      // trading + show a lock instead of only erroring on save. Best-effort (never blocks the list).
      let lockByTeam = {};
      if (roundLive) { try { lockByTeam = lockGamesByTeam(season, await getRoundGames(season.rowKey, Number(cur.rowKey))); } catch { lockByTeam = {}; } }
      // "Are we showing the LIVE round's moves, or the last settled jakso's result?"
      // A live round shows this jakso's trend (flat = no arrow) ONLY once its rebands have
      // actually moved a price; until then (e.g. right after a settle, before the next
      // jakso's first game) show the just-settled jakso's direction — else every card looks
      // flat the moment a round settles (liveTrend is reset to '' at settlement).
      const liveMoved = roundLive && allCards.some((c) => c.livePrice != null && Number(c.livePrice) !== Number(c.price));
      let cards = allCards;
      if (filter && filter !== 'all') cards = cards.filter((c) => c.kind === filter);
      const out = cards
        .map((c) => ({
          id: c.rowKey, kind: c.kind, name: c.name, sub: c.sub || '', position: c.position || '',
          // U5: `price` on the wire = the LIVE price (moves mid-round); falls back to
          // the settled price when live hasn't moved it. `trend` = live trend.
          band: c.band, price: c.livePrice != null ? c.livePrice : c.price, ownerCount: c.ownerCount || 0,
          // `lastPts` = the "Jakso" column value: current round's LIVE points while a
          // round is live, else the last settled round's points.
          lastPts: roundLive ? (livePts ? Math.round((livePts[c.rowKey] || 0) * 10) / 10 : (Number(c.liveRoundPts) || 0)) : (c.lastPts || 0),
          seasonPts: c.seasonPts || 0, photo: c.photo || '',
          // Live-and-moving → THIS jakso's move (empty = flat, no arrow); otherwise the last
          // settled jakso's direction. So a mid-round non-mover shows no stale arrow, but a
          // freshly-settled market still shows who went up/down.
          trend: liveMoved ? (c.liveTrend || '') : (c.trend || ''),
          tradeLocked: isCardTradeLocked(c, lockByTeam), // game in progress / not-yet-priced → no buy/sell
        }))
        .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name, 'fi'));
      return { jsonBody: { season: season.rowKey, settled, roundLive, cards: out } };
    } catch (err) {
      context.log('ahmaliigaCards failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});
