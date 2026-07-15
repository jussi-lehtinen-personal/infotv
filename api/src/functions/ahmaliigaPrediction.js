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

      // A game locks once it has been played. In a replay the clock is the END of the
      // sim day (23:59 → any game that day counts as played); live it's the wall clock.
      const clockMs = season.simMode && season.simDate
        ? new Date(season.simDate + 'T23:59:59').getTime()
        : Date.now();
      const isLocked = (g) => {
        const k = new Date(String(g && g.date || '').replace(' ', 'T')).getTime();
        return Number.isFinite(k) && k < clockMs;
      };

      const games = await getRoundGames(season.rowKey, round);

      if (request.method === 'PUT') {
        if (settled) return { status: 400, jsonBody: { error: 'Jakso on jo ratkaistu.' } };
        const b = await request.json().catch(() => ({}));
        const target = games.find((g) => g.gameId === b.gameId);
        if (!target) return { status: 400, jsonBody: { error: 'Peliä ei löytynyt.' } };
        if (isLocked(target)) return { status: 400, jsonBody: { error: 'Peli on jo alkanut — veikkaus on lukittu.' } };
        // Don't let a manager move an already-started prediction onto another game.
        const existing = await getPrediction(season.rowKey, round, userId);
        if (existing && existing.gameId !== b.gameId) {
          const eg = games.find((g) => g.gameId === existing.gameId);
          if (eg && isLocked(eg)) return { status: 400, jsonBody: { error: 'Aiempi veikkauksesi on jo lukittu.' } };
        }
        try {
          const saved = await savePrediction(season.rowKey, round, userId, b.gameId, b.homeGoals, b.awayGoals);
          return { jsonBody: { ok: true, prediction: saved } };
        } catch (e) {
          if (e.code === 400) return { status: 400, jsonBody: { error: e.message } };
          throw e;
        }
      }

      const pred = await getPrediction(season.rowKey, round, userId);
      const outGames = games.map((g) => ({
        gameId: g.gameId, home: g.home, away: g.away, ahmaHome: g.ahmaHome,
        homeLogo: g.homeLogo, awayLogo: g.awayLogo, date: g.date, level: g.level,
        locked: isLocked(g),
        ...(settled ? { homeGoals: g.homeGoals, awayGoals: g.awayGoals } : {}),
      }));
      const predGame = pred ? games.find((x) => x.gameId === pred.gameId) : null;
      const predictionLocked = !!(predGame && isLocked(predGame));
      let bonus = null;
      if (settled && pred) bonus = predictionBonus(pred, predGame);
      return { jsonBody: { round, settled, games: outGames, myPrediction: pred, predictionLocked, bonus } };
    } catch (err) {
      context.log('ahmaliigaPrediction failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});
