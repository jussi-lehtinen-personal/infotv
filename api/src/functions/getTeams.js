const { app } = require('@azure/functions');
const { tulospalveluGet, getCurrentSeason } = require('../shared/tulospalvelu');

const TTL = 60 * 60_000; // 1 h – sarjapaikkarakenne ei muutu kesken kauden

// Cache per season: { season, data, timestamp }
const seasonCache = new Map();

const TEAM_NAME = 'Valkeakosken Kiekko-Ahma Ry';

// "Kiekko-ahma Oranssi (Valkeakosken Kiekko-ahma Ry U12 Oranssi)"
//  → { shortName: "Kiekko-ahma Oranssi", teamKey: "U12 Oranssi" }
// Case-insensitive: the search endpoint renders the club name as "Kiekko-ahma".
function parseSearched(str) {
    const m = str.match(/^(.+?)\s*\(Valkeakosken Kiekko-Ahma Ry (.+)\)$/i);
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
        g => !g.subSerieBaseName.toLowerCase().includes('harjoitusottelut')
    );
    const practiceGroups = groups.filter(
        g => g.subSerieBaseName.toLowerCase().includes('harjoitusottelut')
    );

    // teamKey → { shortName, levelGroups: Map<string, {levelId, statGroupId}> }
    const teamMap = new Map();

    const addLevelGroup = (teamKey, group) => {
        const key = `${group.levelId}|${group.subSerieBaseId}`;
        teamMap.get(teamKey).levelGroups.set(key, {
            levelId: String(group.levelId),
            statGroupId: String(group.subSerieBaseId)
        });
    };

    // Build teams from non-practice groups only
    for (const group of relevant) {
        for (const searched of group.searched) {
            const parsed = parseSearched(searched);
            if (!parsed) continue;

            const { teamKey, shortName } = parsed;
            if (!teamMap.has(teamKey)) {
                teamMap.set(teamKey, { shortName, levelGroups: new Map() });
            }
            addLevelGroup(teamKey, group);
        }
    }

    // Add practice levelGroups for already-identified teams
    for (const group of practiceGroups) {
        for (const searched of group.searched) {
            const parsed = parseSearched(searched);
            if (!parsed) continue;

            const { teamKey } = parsed;
            if (teamMap.has(teamKey)) {
                addLevelGroup(teamKey, group);
            }
        }
    }

    const teams = Array.from(teamMap.entries()).map(([teamKey, { shortName, levelGroups }]) => ({
        teamKey,
        shortName,
        levelGroups: Array.from(levelGroups.values())
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

        // The search endpoint requires a real season number (season=0 is rejected),
        // so resolve the active season from the API instead of guessing from the
        // calendar year. Allow an explicit ?season= override.
        const season = request.query?.get('season') || String(await getCurrentSeason(context));

        const cached = seasonCache.get(season);
        if (cached && (Date.now() - cached.timestamp) < TTL) {
            context.log('Cache hit for season: ' + season);
            return { body: cached.data };
        }

        context.log('Fetching teams for season: ' + season);
        const groups = await tulospalveluGet('serie/helpers/search-players-and-teams', {
            season,
            playerName: '',
            teamName: TEAM_NAME,
        }, context);

        const teams = processGroups(Array.isArray(groups) ? groups : []);
        const body = JSON.stringify(teams);

        seasonCache.set(season, { data: body, timestamp: Date.now() });

        return { body };
    }
});
