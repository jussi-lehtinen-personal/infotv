const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment');


const getMonday = (d) => {
    if (d.getDay() === 1) {
        return d
    }

    while (d.getDay() !== 1) {
        d.setDate(d.getDate() - 1)
    }

    return d
}

app.http('getGames', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        // Prototype of REST API call to find all games of a day for a given area.
        // https://tulospalvelu.leijonat.fi/helpers/getGames.php?season=0&districtid=2&dog=2024-02-03

        var now = new Date()

        if (request.query) {
            if (request.query.has('date')) {
                var date = request.query.get('date')
                now = new Date(date)
            }
        }

        const startOfWeek = getMonday(now)        
        console.log("requested day:" +now)
        console.log("monday: " + startOfWeek)

        const requestUri = 'https://tulospalvelu.leijonat.fi/helpers/getGames.php?season=0'
        const imageUri = 'https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/'

        var date = startOfWeek

        var matches = []

        // Go through the whole week
        for (var dayIndex = 0; dayIndex < 7; dayIndex++) {
            var formattedDate = moment(date).format('YYYY-MM-DD')
            //context.log('Processing date: ' + formattedDate);

            // Look from all areas (0-9)
            // Home games only
            var firstArea = 2
            var lastArea = 2
            for (var area = firstArea; area <= lastArea; area++) {
                var uri = requestUri
                uri += '&districtid=' + area 
                uri += '&dog=' + formattedDate

                context.log('Perform fetch: ' + uri);

                // Perform fetch
                const response = await fetch(uri)

                // Resolve to json response
                const json = await response.json()

                for (let levelIndex = 0; levelIndex < json.length; levelIndex++) {
                    var level = json[levelIndex]
                    var games = level.Games
                    if (games) {
                        for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
                            var game = games[gameIndex]
                            if (game.RinkName.includes('Valkeakoski')) {
                                if (game.HomeTeamAbbrv.includes('Kiekko-Ahma') || game.AwayTeamAbbrv.includes('Kiekko-Ahma')) {
                                    matches.push({
                                        id: game.GameId,
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
            }

            date.setDate(date.getDate() + 1);
        }
        
        matches.sort(function(a,b){
            return new Date(a.date) - new Date(b.date);
        });

        //for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
        //    var match = matches[matchIndex]
        //    console.log( match.home + " vs. " + match.away + ' (' + match.level + ') @ ' + match.rink)
        //}

        return { body: JSON.stringify(matches) };
    }
});
