const { app } = require('@azure/functions');
const fetch = require("node-fetch");

const TTL = 60 * 60_000; // 1 h – sarjapaikkarakenne ei muutu kesken kauden

// Cache per season: { season, data, timestamp }
const seasonCache = new Map();

const BASE_URI = 'https://tulospalvelu.leijonat.fi/serie/helpers/searchStatGroups.php';
const TEAM_NAME = 'Valkeakosken+Kiekko-Ahma+Ry';

// "Kiekko-Ahma Oranssi (Valkeakosken Kiekko-Ahma Ry U12 Oranssi)"
//  → { shortName: "Kiekko-Ahma Oranssi", teamKey: "U12 Oranssi" }
function parseSearched(str) {
    const m = str.match(/^(.+?)\s*\(Valkeakosken Kiekko-Ahma Ry (.+)\)$/);
    if (!m) return null;
    return { shortName: m[1].trim(), teamKey: m[2].trim() };
}

function sortTeamKey(key) {
    const age = parseInt(key.match(/\d+/)?.[0] ?? '9999');
    return age * 1000 + key.charCodeAt(key.indexOf(' ') + 1 || 0);
}

function processGroups(groups) {
    const relevant = groups.filter(
        g => !g.StatGroupName.toLowerCase().includes('harjoitusottelut')
    );

    // teamKey → { shortName, levelIds: Set<string> }
    const teamMap = new Map();

    for (const group of relevant) {
        for (const searched of group.Searched) {
            const parsed = parseSearched(searched);
            if (!parsed) continue;

            const { teamKey, shortName } = parsed;
            if (!teamMap.has(teamKey)) {
                teamMap.set(teamKey, { shortName, levelIds: new Set() });
            }
            teamMap.get(teamKey).levelIds.add(group.LevelID);
        }
    }

    const teams = Array.from(teamMap.entries()).map(([teamKey, { shortName, levelIds }]) => ({
        teamKey,
        shortName,
        levelIds: Array.from(levelIds)
    }));

    // Nuorimmat ensin (U9, U10 … U20), sitten Miehet/Naiset Edustus (ei numeroa)
    teams.sort((a, b) => sortTeamKey(a.teamKey) - sortTeamKey(b.teamKey));

    return teams;
}

app.http('getTeams', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const season = request.query?.get('season') || new Date().getFullYear().toString();

        const cached = seasonCache.get(season);
        if (cached && (Date.now() - cached.timestamp) < TTL) {
            context.log('Cache hit for season: ' + season);
            return { body: cached.data };
        }

        const uri = `${BASE_URI}?season=${season}&playername=&teamname=${TEAM_NAME}`;
        context.log('Fetching: ' + uri);

        const response = await fetch(uri);
        const groups = await response.json();

        const teams = processGroups(groups);
        const body = JSON.stringify(teams);

        seasonCache.set(season, { data: body, timestamp: Date.now() });

        return { body };
    }
});
