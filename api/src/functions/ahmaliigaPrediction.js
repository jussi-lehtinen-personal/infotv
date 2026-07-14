const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getRounds, activeRoundNo, getRoundGames, getPrediction, savePrediction, predictionBonus } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/prediction — the current round's Ahma games (results hidden
// until the round is settled) + the manager's own prediction (+ earned bonus once
// settled). PUT { gameId, homeGoals, awayGoals } saves it (blocked once settled).
app.http('ahmaliigaPrediction', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/prediction',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { status: 400, jsonBody: { error: 'Kausi ei ole käynnissä.' } };
      const rounds = await getRounds(season.rowKey);
      const round = activeRoundNo(season, rounds);
      const cur = rounds.find((j) => Number(j.rowKey) === round);
      const settled = !!(cur && cur.status === 'settled');

      if (request.method === 'PUT') {
        if (settled) return { status: 400, jsonBody: { error: 'Jakso on jo ratkaistu.' } };
        const b = await request.json().catch(() => ({}));
        try {
          const saved = await savePrediction(season.rowKey, round, userId, b.gameId, b.homeGoals, b.awayGoals);
          return { jsonBody: { ok: true, prediction: saved } };
        } catch (e) {
          if (e.code === 400) return { status: 400, jsonBody: { error: e.message } };
          throw e;
        }
      }

      const games = await getRoundGames(season.rowKey, round);
      const pred = await getPrediction(season.rowKey, round, userId);
      const outGames = games.map((g) => ({
        gameId: g.gameId, home: g.home, away: g.away, ahmaHome: g.ahmaHome,
        homeLogo: g.homeLogo, awayLogo: g.awayLogo, date: g.date, level: g.level,
        ...(settled ? { homeGoals: g.homeGoals, awayGoals: g.awayGoals } : {}),
      }));
      let bonus = null;
      if (settled && pred) bonus = predictionBonus(pred, games.find((x) => x.gameId === pred.gameId));
      return { jsonBody: { round, settled, games: outGames, myPrediction: pred, bonus } };
    } catch (err) {
      context.log('ahmaliigaPrediction failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});
