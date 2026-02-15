const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment');

// In-memory cache: { key: { data, timestamp } }
const cache = new Map();
const CACHE_TTL = 30_000; // 30 seconds

const getMonday = (d) => {
    if (d.getDay() === 1) {
        return d
    }

    while (d.getDay() !== 1) {
        d.setDate(d.getDate() - 1)
    }

    return d
}

const requestUri = 'https://tulospalvelu.leijonat.fi/helpers/getGames.php?season=0'
const imageUri = 'https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/'

// Fetch games for a single day and extract matching games
async function fetchDay(formattedDate, context) {
    const uri = requestUri + '&districtid=2&dog=' + formattedDate;
    context.log('Perform fetch: ' + uri);

    const response = await fetch(uri);
    const json = await response.json();

    const dayMatches = [];
    for (let levelIndex = 0; levelIndex < json.length; levelIndex++) {
        var level = json[levelIndex]
        var games = level.Games
        if (games) {
            for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
                var game = games[gameIndex]
                if (game.RinkName.includes('Valkeakoski')) {
                    if (game.HomeTeamAbbrv.includes('Kiekko-Ahma') || game.AwayTeamAbbrv.includes('Kiekko-Ahma')) {
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
                            level: level.LevelName
                        })
                    }
                }
            }
        }
    }
    return dayMatches;
}

app.http('getGames', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        var now = new Date()

        if (request.query) {
            if (request.query.has('date')) {
                var date = request.query.get('date')
                now = new Date(date)
            }
        }

        const startOfWeek = getMonday(now)
        const cacheKey = moment(startOfWeek).format('YYYY-MM-DD');

        // Check in-memory cache
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            context.log('Cache hit for week: ' + cacheKey);
            return { body: cached.data };
        }

        context.log('Cache miss for week: ' + cacheKey);

        // Build array of dates for the week
        const dayDates = [];
        const d = new Date(startOfWeek);
        for (let i = 0; i < 7; i++) {
            dayDates.push(moment(d).format('YYYY-MM-DD'));
            d.setDate(d.getDate() + 1);
        }

        // Fetch all 7 days in parallel
        const dayResults = await Promise.all(
            dayDates.map(date => fetchDay(date, context))
        );

        // Flatten and sort
        const matches = dayResults.flat();
        matches.sort(function(a,b){
            return new Date(a.date) - new Date(b.date);
        });

        const body = JSON.stringify(matches);

        // Store in cache
        cache.set(cacheKey, { data: body, timestamp: Date.now() });

        return { body };
    }
});
