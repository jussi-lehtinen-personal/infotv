const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Upcoming events (harjoitukset + games) for a Jopox team, from the club site's
// PUBLIC calendar API (no login): www.kiekko-ahma.fi/api/calendar/subsite/{id}/upcoming.
// Thin passthrough that trims + normalises the payload for the Minä feed.
// (kiekko-ahma.fi is NOT behind the tulospalvelu WAF, so Azure reaches it
// directly — same as getTeamRoster.) See memory: reference_jopox_kiekkoahma,
// project_gamezone_feed_plan.

const TTL = 5 * 60_000; // 5 min – event lists change a few times a day
const cache = new Map(); // subsiteId -> { data, timestamp }

const BASE = 'https://www.kiekko-ahma.fi';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// The API occasionally emits numeric HTML entities (e.g. "J&#228;&#228;harjoitus",
// "Lemp&#228;&#228;l&#228;"). Decode them so the feed shows clean Finnish text.
const decodeEntities = (s) =>
    s == null
        ? ''
        : String(s)
              .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
              .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
              .replace(/&amp;/g, '&')
              .trim();

function transform(items) {
    return (Array.isArray(items) ? items : []).map((e) => {
        const isGame = e.eventType === 2;
        return {
            eventId: e.eventId ?? null,
            type: isGame ? 'game' : 'event',
            // For games the title lives in the team fields; for trainings it's `title`.
            title: isGame
                ? decodeEntities(`${e.gameHometeam || ''} – ${e.gameGuestteam || ''}`).replace(/^ – | – $/g, '')
                : decodeEntities(e.title),
            subtitle: decodeEntities(e.subtitle) || null,
            league: decodeEntities(e.leagueName) || null,
            awayGame: !!e.awayGame,
            date: e.date || null,
            uiDate: decodeEntities(e.uiDate) || null,
            uiTime: decodeEntities(e.uiTime) || null,
            place: decodeEntities(e.place) || null,
        };
    });
}

app.http('getTeamEvents', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        try {
            const subsiteId = request.query?.get('subsiteId');
            if (!subsiteId || !/^\d+$/.test(subsiteId)) {
                return { status: 400, jsonBody: { error: 'subsiteId (numeric) required' } };
            }

            const cached = cache.get(subsiteId);
            if (cached && (Date.now() - cached.timestamp) < TTL) {
                context.log('Events cache hit for subsite: ' + subsiteId);
                return { jsonBody: cached.data };
            }

            const res = await fetch(`${BASE}/api/calendar/subsite/${subsiteId}/upcoming`, {
                headers: { 'User-Agent': UA, Accept: 'application/json' },
            });
            if (res.status === 204) {
                const empty = { subsiteId: Number(subsiteId), events: [] };
                cache.set(subsiteId, { data: empty, timestamp: Date.now() });
                return { jsonBody: empty };
            }
            if (!res.ok) throw new Error(`kiekko-ahma.fi -> HTTP ${res.status}`);

            const raw = await res.json();
            const data = { subsiteId: Number(subsiteId), events: transform(raw) };
            cache.set(subsiteId, { data, timestamp: Date.now() });
            return { jsonBody: data };
        } catch (err) {
            context.log('getTeamEvents failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
