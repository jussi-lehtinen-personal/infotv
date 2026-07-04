const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Upcoming events (harjoitukset + games) for a Jopox team, aggregated from the
// club site's PUBLIC calendar API (no login). The `/upcoming` endpoint is
// hard-capped at 5 items, so instead we walk the month calendar like the web
// team page does: /eventdays?year&month lists the days that have events, and
// /day?year&month&day returns that day's events. We scan the current month
// forward, collect everything from today onward, dedupe + sort.
// (kiekko-ahma.fi is NOT behind the tulospalvelu WAF, so Azure reaches it
// directly — same as getTeamRoster.) See memory: reference_jopox_kiekkoahma,
// project_gamezone_feed_plan.

const TTL = 15 * 60_000;     // 15 min – event lists change a few times a day
const MAX_MONTHS = 4;        // horizon: current month + 3 ahead
const MAX_EVENTS = 80;       // safety cap on the returned list
const cache = new Map();     // subsiteId -> { data, timestamp }

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

// Today's date in Finnish local time as "YYYY-MM-DD" (event dates are naive
// local ISO, so we compare on the date part). Azure runs in UTC otherwise.
const helsinkiToday = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' });

async function apiGet(path) {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (res.status === 204) return [];
    if (!res.ok) throw new Error(`kiekko-ahma.fi ${path} -> HTTP ${res.status}`);
    return res.json();
}

function transformEvent(e) {
    const isGame = e.eventType === 2;
    return {
        eventId: e.eventId ?? null,
        type: isGame ? 'game' : 'event',
        title: isGame
            ? decodeEntities(`${e.gameHometeam || ''} – ${e.gameGuestteam || ''}`).replace(/^ – | – $/g, '')
            : decodeEntities(e.title),
        subtitle: decodeEntities(e.subtitle) || null,
        league: decodeEntities(e.leagueName) || null,
        gameHometeam: decodeEntities(e.gameHometeam) || null,
        gameGuestteam: decodeEntities(e.gameGuestteam) || null,
        awayGame: !!e.awayGame,
        date: e.date || null,
        uiDate: decodeEntities(e.uiDate) || null,
        uiTime: decodeEntities(e.uiTime) || null,
        place: decodeEntities(e.place) || null,
    };
}

// Walk the month calendar and collect every event from `todayStr` onward.
async function collectEvents(subsiteId) {
    const todayStr = helsinkiToday();
    const [startY, startM] = todayStr.split('-').map(Number); // month is 1-12

    const collected = [];
    let consecutiveEmptyMonths = 0;

    for (let i = 0; i < MAX_MONTHS; i++) {
        const total = (startM - 1) + i;
        const year = startY + Math.floor(total / 12);
        const month = (total % 12) + 1; // 1-12

        const days = await apiGet(
            `/api/calendar/subsite/${subsiteId}/eventdays?year=${year}&month=${month}`
        );
        const eventDays = (Array.isArray(days) ? days : [])
            .map((d) => (d.date || '').slice(0, 10))
            .filter((ds) => ds && ds >= todayStr);

        if (eventDays.length === 0) {
            // Stop scanning once the future runs dry (but always scan month 0).
            if (i > 0 && ++consecutiveEmptyMonths >= 2) break;
            continue;
        }
        consecutiveEmptyMonths = 0;

        const perDay = await Promise.all(
            eventDays.map((ds) => {
                const day = Number(ds.slice(8, 10));
                return apiGet(
                    `/api/calendar/subsite/${subsiteId}/day?year=${year}&month=${month}&day=${day}`
                ).catch(() => []);
            })
        );
        for (const list of perDay) {
            for (const e of Array.isArray(list) ? list : []) collected.push(e);
        }
    }

    // Dedupe by eventId, keep only today onward, sort ascending by date.
    const seen = new Set();
    const events = collected
        .filter((e) => {
            const id = e.eventId ?? `${e.date}|${e.title}`;
            if (seen.has(id)) return false;
            seen.add(id);
            return (e.date || '').slice(0, 10) >= todayStr;
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(0, MAX_EVENTS)
        .map(transformEvent);

    return events;
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

            const events = await collectEvents(subsiteId);
            const data = { subsiteId: Number(subsiteId), events };
            cache.set(subsiteId, { data, timestamp: Date.now() });
            return { jsonBody: data };
        } catch (err) {
            context.log('getTeamEvents failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
