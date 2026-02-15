const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment');

// Week-level cache (final response): { key: { data, timestamp } }
const weekCache = new Map();

// URI-level cache (raw API JSON): { uri: { json, timestamp } }
const uriCache = new Map();

const CACHE_TTL = 30_000; // 30 seconds

const HOME_DISTRICT_ID = 2;
const DISTRICTS_ALL = [1, 2, 3, 4, 5, 6, 7, 8];

const requestUri = 'https://tulospalvelu.leijonat.fi/helpers/getGames.php?season=0';
const imageUri = 'https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/';

const getMonday = (d) => {
    if (d.getDay() === 1) {
        return d;
    }

    while (d.getDay() !== 1) {
        d.setDate(d.getDate() - 1);
    }

    return d;
};

const isTruthy = (v) => {
    if (v === null || v === undefined) return false;
    const s = String(v).trim().toLowerCase();
    return (s === '1' || s === 'true' || s === 'yes' || s === 'on');
};

async function fetchJsonCached(uri, context) {
    const cached = uriCache.get(uri);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        context.log('URI cache hit: ' + uri);
        return cached.json;
    }

    context.log('Perform fetch: ' + uri);
    const response = await fetch(uri);
    const json = await response.json();

    uriCache.set(uri, { json, timestamp: Date.now() });
    return json;
}

// Fetch games for a single day + district and extract Kiekko-Ahma games.
// NOTE: This does NOT decide home-only vs include-away; it returns all Ahma games found.
// Caller can filter by `isHomeGame`.
async function fetchDay(formattedDate, districtId, context) {
    const uri = requestUri + '&districtid=' + districtId + '&dog=' + formattedDate;
    const json = await fetchJsonCached(uri, context);

    const dayMatches = [];
    for (let levelIndex = 0; levelIndex < json.length; levelIndex++) {
        var level = json[levelIndex];
        var games = level.Games;

        if (!games) continue;

        for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
            var game = games[gameIndex];

            const isAhmaGame =
                (game.HomeTeamAbbrv && game.HomeTeamAbbrv.includes('Kiekko-Ahma')) ||
                (game.AwayTeamAbbrv && game.AwayTeamAbbrv.includes('Kiekko-Ahma'));

            if (!isAhmaGame) continue;

            const isHomeGame =
                (districtId === HOME_DISTRICT_ID) &&
                (game.RinkName && game.RinkName.includes('Valkeakoski'));

            dayMatches.push({
                id: game.GameID,
                date: game.GameDateDB + ' ' + game.GameTime,
                league: game.StatGroupName,
                periods: game.PeriodSummary,
                home: game.HomeTeamAbbrv,
                home_logo: imageUri + game.HomeImg,
                home_goals: game.HomeGoals,
                away: game.AwayTeamAbbrv,
                away_logo: imageUri + game.AwayImg,
                away_goals: game.AwayGoals,
                period: game.GameStatus,
                finished: game.FinishedType,
                rink: game.RinkName,
                level: level.LevelName,
                districtId: districtId,
                isHomeGame: isHomeGame
            });
        }
    }

    return dayMatches;
}

app.http('getGames', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        var now = new Date();

        if (request.query && request.query.has('date')) {
            var date = request.query.get('date');
            now = new Date(date);
        }

        const includeAway = request.query ? isTruthy(request.query.get('includeAway')) : false;

        const startOfWeek = getMonday(now);
        const cacheKey = moment(startOfWeek).format('YYYY-MM-DD') + '|' + (includeAway ? 'all' : 'home');

        // Check week-level cache (final response)
        const cachedWeek = weekCache.get(cacheKey);
        if (cachedWeek && (Date.now() - cachedWeek.timestamp) < CACHE_TTL) {
            context.log('Week cache hit for: ' + cacheKey);
            return { body: cachedWeek.data };
        }
        context.log('Week cache miss for: ' + cacheKey);

        // Build array of dates for the week
        const dayDates = [];
        const d = new Date(startOfWeek);
        for (let i = 0; i < 7; i++) {
            dayDates.push(moment(d).format('YYYY-MM-DD'));
            d.setDate(d.getDate() + 1);
        }

        // Decide which districts to fetch:
        // - home-only: only district 2 (current behavior)
        // - includeAway: districts 1..8
        const districtsToFetch = includeAway ? DISTRICTS_ALL : [HOME_DISTRICT_ID];

        // Fetch all day+districts in parallel.
        // URI-level cache ensures that if you first request home-only and then includeAway,
        // district 2 fetches are re-used (no extra network).
        const fetchPromises = [];
        for (const day of dayDates) {
            for (const districtId of districtsToFetch) {
                fetchPromises.push(fetchDay(day, districtId, context));
            }
        }

        const results = await Promise.all(fetchPromises);
        const all = results.flat();

        // Filter home-only mode (keep old behavior)
        const filtered = includeAway ? all : all.filter(x => x.isHomeGame);

        // De-dup by GameID (safety)
        const uniq = new Map();
        for (const m of filtered) {
            if (!uniq.has(m.id)) uniq.set(m.id, m);
        }

        const matches = Array.from(uniq.values());
        matches.sort(function (a, b) {
            return new Date(a.date) - new Date(b.date);
        });

        const body = JSON.stringify(matches);

        // Store in week-level cache
        weekCache.set(cacheKey, { data: body, timestamp: Date.now() });

        return { body };
    }
});
