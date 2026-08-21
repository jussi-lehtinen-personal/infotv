const { app } = require('@azure/functions');
const fetch = require("node-fetch");
const { fetchMemberEventInfo } = require('../lib/jopox');

// Single-event detail (free-text description) from the club site's PUBLIC API.
// Two sources, matching the web team page:
//   - training/event -> /api/trainings/subsite/{subsiteId}/{eventId}  (publicinfo)
//   - game           -> /api/events/{eventId}                         (description)
// The list endpoints (upcoming/day) don't carry this text. The Minä feed fetches
// this LAZILY, only for expanded cards. A 10-min server cache per event shields
// Jopox from floods regardless of how many users/expands hit it.
// See memory: reference_jopox_kiekkoahma, project_gamezone_feed_plan.

const TTL = 15 * 60_000;
const cache = new Map(); // cacheKey -> { data, ts }

const BASE = 'https://www.kiekko-ahma.fi';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const decodeEntities = (s) =>
    String(s == null ? '' : s)
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/g, '&');

// Club HTML description -> plain text, line breaks preserved.
const htmlToText = (html) => {
    if (!html) return null;
    const text = decodeEntities(
        String(html)
            .replace(/<\s*br\s*\/?>/gi, '\n')
            .replace(/<\/\s*(p|div|li)\s*>/gi, '\n')
            .replace(/<[^>]+>/g, '')
    )
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return text || null;
};

app.http('getEventDetail', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const eventId = request.query?.get('eventId');
            const subsiteId = request.query?.get('subsiteId');
            const isGame = request.query?.get('type') === 'game';
            if (!eventId || !/^\d+$/.test(eventId)) {
                return { status: 400, jsonBody: { error: 'eventId (numeric) required' } };
            }
            // Trainings need the subsite scope; games don't.
            if (!isGame && (!subsiteId || !/^\d+$/.test(subsiteId))) {
                return { status: 400, jsonBody: { error: 'subsiteId (numeric) required for trainings' } };
            }

            const cacheKey = `${isGame ? 'g' : 't'}|${subsiteId || ''}|${eventId}`;
            const cached = cache.get(cacheKey);
            if (cached && (Date.now() - cached.ts) < TTL) {
                return { jsonBody: cached.data };
            }

            let description = null;
            if (isGame) {
                // The PUBLIC game-detail API (/api/events/{id}) returns an EMPTY description,
                // so a game's coach info (kokoontumisaika etc.) comes from the members-area
                // PublicInfo — the SAME text trainings expose publicly — matched by eventId.
                if (subsiteId && /^\d+$/.test(subsiteId)) {
                    try { const info = await fetchMemberEventInfo(subsiteId); description = info[eventId] || null; } catch { /* optional */ }
                }
                if (!description) {
                    // Fallback: public game endpoint (usually empty, but cheap + no auth).
                    try {
                        const r = await fetch(`${BASE}/api/events/${eventId}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
                        if (r.ok) { const j = await r.json().catch(() => ({})); description = htmlToText(j.description); }
                    } catch { /* ignore */ }
                }
            } else {
                const r = await fetch(`${BASE}/api/trainings/subsite/${subsiteId}/${eventId}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
                if (r.status !== 204) {
                    if (!r.ok) throw new Error(`kiekko-ahma.fi -> HTTP ${r.status}`);
                    const j = await r.json().catch(() => ({}));
                    description = htmlToText(j.publicinfo || j.description);
                }
            }
            const data = { eventId: Number(eventId), description };

            cache.set(cacheKey, { data, ts: Date.now() });
            return { jsonBody: data };
        } catch (err) {
            context.log('getEventDetail failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
