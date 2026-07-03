const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment');

// Thin passthrough to the Cloudflare Worker (which reaches tulospalvelu from an
// IP the WAF allows). The Worker returns the final games array; we keep the
// week-level response cache so client load is decoupled from Worker calls.

const weekCache = new Map();
// Single-flight: coalesce concurrent cache-misses for the same week so a burst
// of users (or the current-week TTL expiring under load) triggers ONE upstream
// fetch, not one per request. cacheKey -> in-progress Promise<matches>.
const inFlight = new Map();

const TTL_CURRENT = 30_000;           // 30 s  – current week, live scores
const TTL_FUTURE  = 15 * 60_000;      // 15 min – future week
const TTL_PAST    = 6 * 3_600_000;    // 6 h   – played week

// includeAway over all 8 districts is 56 upstream requests, above the CF
// free-tier 50-subrequest cap, so we split it into two Worker calls.
const AWAY_SPLIT = ['1,2,3,4', '5,6,7,8'];

// Public Worker URL (not a secret); env can override if it ever moves.
const PROXY_URL = process.env.TP_PROXY_URL || 'https://gamezone.zapmies.workers.dev';
const PROXY_KEY = process.env.TP_PROXY_KEY; // optional shared secret

const getMonday = (d) => {
    const x = new Date(d);
    while (x.getDay() !== 1) x.setDate(x.getDate() - 1);
    return x;
};

function getWeekTtl(weekStart) {
    const weekStr = moment(weekStart).format('YYYY-MM-DD');
    const currentStr = moment(getMonday(new Date())).format('YYYY-MM-DD');
    if (weekStr === currentStr) return TTL_CURRENT;
    if (weekStr < currentStr) return TTL_PAST;
    return TTL_FUTURE;
}

// Let the browser + any shared/CDN cache serve repeat requests for the same
// week so 100 users viewing the same week collapse to ~1 origin fetch per TTL.
// s-maxage targets shared caches; stale-while-revalidate keeps it snappy.
function cacheControl(weekStart) {
    const s = Math.round(getWeekTtl(weekStart) / 1000);
    const swr = Math.max(30, Math.round(s / 2));
    return { 'Cache-Control': `public, max-age=${s}, s-maxage=${s}, stale-while-revalidate=${swr}` };
}

const isTruthy = (v) => {
    if (v === null || v === undefined) return false;
    const s = String(v).trim().toLowerCase();
    return (s === '1' || s === 'true' || s === 'yes' || s === 'on');
};

async function workerGet(path, context) {
    const res = await fetch(`${PROXY_URL}${path}`, {
        headers: PROXY_KEY ? { 'x-proxy-key': PROXY_KEY } : {},
    });
    if (!res.ok) throw new Error(`worker ${path} -> HTTP ${res.status}`);
    return res.json();
}

function dedupSort(arr) {
    const uniq = new Map();
    for (const m of arr) if (!uniq.has(m.id)) uniq.set(m.id, m);
    return Array.from(uniq.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

app.http('getGames', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        try {
            if (!PROXY_URL) {
                return { status: 500, jsonBody: { error: 'TP_PROXY_URL not configured' } };
            }

            const now = (request.query && request.query.has('date'))
                ? new Date(request.query.get('date'))
                : new Date();
            const includeAway = request.query ? isTruthy(request.query.get('includeAway')) : false;
            const dateStr = moment(now).format('YYYY-MM-DD');

            const startOfWeek = getMonday(now);
            const cacheKey = moment(startOfWeek).format('YYYY-MM-DD') + '|' + (includeAway ? 'all' : 'home');
            const weekTtl = getWeekTtl(startOfWeek);

            const cached = weekCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < weekTtl) {
                context.log('Week cache hit for: ' + cacheKey);
                return { jsonBody: cached.data, headers: cacheControl(startOfWeek) };
            }

            // Single-flight: if a fetch for this week is already running, join it
            // instead of firing a duplicate upstream request.
            let promise = inFlight.get(cacheKey);
            if (!promise) {
                promise = (async () => {
                    let matches;
                    if (includeAway) {
                        // Two Worker calls (districts 1-4 and 5-8), merged.
                        const parts = await Promise.all(
                            AWAY_SPLIT.map(d => workerGet(`/getGames?date=${dateStr}&districts=${d}`, context))
                        );
                        matches = dedupSort(parts.flat());
                    } else {
                        matches = await workerGet(`/getGames?date=${dateStr}`, context);
                    }
                    weekCache.set(cacheKey, { data: matches, timestamp: Date.now() });
                    return matches;
                })();
                inFlight.set(cacheKey, promise);
                promise.finally(() => {
                    if (inFlight.get(cacheKey) === promise) inFlight.delete(cacheKey);
                });
            } else {
                context.log('Joining in-flight fetch for: ' + cacheKey);
            }

            const matches = await promise;
            return { jsonBody: matches, headers: cacheControl(startOfWeek) };
        } catch (err) {
            context.log('getGames failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
