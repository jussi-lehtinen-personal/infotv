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

// Returns sort key object for a teamKey string.
// U9 < U9 Musta < U9 Oranssi < U10 < … < Miehet Edustus < Naiset Edustus
function teamSortKey(key) {
    const ageMatch = key.match(/^U(\d+)/i);
    const age = ageMatch ? parseInt(ageMatch[1]) : 9999;
    // Base team has no suffix after the age token ("U9"), variant has one ("U9 Oranssi")
    const hasVariant = ageMatch ? key.length > ageMatch[0].length : false;
    return { age, hasVariant };
}

function processGroups(groups) {
    const relevant = groups.filter(
        g => !g.StatGroupName.toLowerCase().includes('harjoitusottelut')
    );
    const practiceGroups = groups.filter(
        g => g.StatGroupName.toLowerCase().includes('harjoitusottelut')
    );

    // teamKey → { shortName, levelIds: Set<string> }
    const teamMap = new Map();

    // Build teams from non-practice groups only
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

    // Add practice levelIds for already-identified teams
    for (const group of practiceGroups) {
        for (const searched of group.Searched) {
            const parsed = parseSearched(searched);
            if (!parsed) continue;

            const { teamKey } = parsed;
            if (teamMap.has(teamKey)) {
                teamMap.get(teamKey).levelIds.add(group.LevelID);
            }
        }
    }

    const teams = Array.from(teamMap.entries()).map(([teamKey, { shortName, levelIds }]) => ({
        teamKey,
        shortName,
        levelIds: Array.from(levelIds)
    }));

    // Sort: by age asc, base team before variants, then alphabetical within age group
    teams.sort((a, b) => {
        const ka = teamSortKey(a.teamKey);
        const kb = teamSortKey(b.teamKey);
        if (ka.age !== kb.age) return ka.age - kb.age;
        if (ka.hasVariant !== kb.hasVariant) return ka.hasVariant ? 1 : -1;
        return a.teamKey.localeCompare(b.teamKey, 'fi');
    });

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
