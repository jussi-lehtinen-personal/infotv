const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment');

app.http('getGames', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        // Prototype of REST API call to find all games of a day for a given area.
        // https://tulospalvelu.leijonat.fi/helpers/getGames.php?season=0&districtid=2&dog=2024-02-03

        const now = new Date()
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1)

        const requestUri = 'https://tulospalvelu.leijonat.fi/helpers/getGames.php?season=0'
        const imageUri = 'https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/'

        var date = startOfWeek

        var matches = []

        // Go through the whole week
        for (var dayIndex = 0; dayIndex < 7; dayIndex++) {
            var formattedDate = moment(date).format('YYYY-MM-DD')
            //context.log('Processing date: ' + formattedDate);

            // Look from all areas (0-9)
            for (var area = 0; area < 10; area++) {
                var uri = requestUri
                uri += '&districtid=' + area 
                uri += '&dog=' + formattedDate

                //context.log('Perform fetch: ' + uri);

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
                                        date: game.GameDateDB,
                                        time: game.GameTime,
                                        home: game.HomeTeamAbbrv,
                                        home_logo: imageUri + game.HomeImg,
                                        away: game.AwayTeamAbbrv,
                                        away_logo: imageUri + game.AwayImg,
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

        for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
            var match = matches[matchIndex]
            console.log( match.home + " vs. " + match.away + ' (' + match.level + ') @ ' + match.rink)
        }

        return { body: JSON.stringify(matches) };
    }
});