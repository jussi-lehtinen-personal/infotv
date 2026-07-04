const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Thin passthrough to the Cloudflare Worker's /getSeasonGames — the WHOLE
// season's Kiekko-Ahma games in one response (replaces the per-week getGames
// district scan). Schedule changes rarely, so we cache per season for 6 h and
// let live scores come from getLive; single-flight coalesces concurrent misses.

// SHORT here on purpose: the long 24 h cache lives ONLY in the worker (the layer
// that protects tulospalvelu). Stacking 24 h at every layer would COMPOUND into
// days of staleness; a short TTL here refetches cheaply from the already-cached
// worker, so worst-case staleness ≈ 24 h (worker) + minutes, not 24 h × layers.
const TTL = 5 * 60_000; // 5 min
const seasonCache = new Map();
const inFlight = new Map();

const PROXY_URL = process.env.TP_PROXY_URL || 'https://gamezone.zapmies.workers.dev';
const PROXY_KEY = process.env.TP_PROXY_KEY;

function cacheControl() {
    // Short browser/CDN freshness + a long stale-while-revalidate window: serve
    // fast, revalidate in the background through to the 24 h-cached worker.
    return { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' };
}

app.http('getSeasonGames', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            if (!PROXY_URL) {
                return { status: 500, jsonBody: { error: 'TP_PROXY_URL not configured' } };
            }
            const season = request.query?.get('season') || '';
            const cacheKey = season || 'current';

            const cached = seasonCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < TTL) {
                return { jsonBody: cached.data, headers: cacheControl() };
            }

            let promise = inFlight.get(cacheKey);
            if (!promise) {
                const path = '/getSeasonGames' + (season ? `?season=${encodeURIComponent(season)}` : '');
                promise = (async () => {
                    const res = await fetch(`${PROXY_URL}${path}`, {
                        headers: PROXY_KEY ? { 'x-proxy-key': PROXY_KEY } : {},
                    });
                    if (!res.ok) throw new Error(`worker ${path} -> HTTP ${res.status}`);
                    const games = await res.json();
                    seasonCache.set(cacheKey, { data: games, timestamp: Date.now() });
                    return games;
                })();
                inFlight.set(cacheKey, promise);
                promise.finally(() => {
                    if (inFlight.get(cacheKey) === promise) inFlight.delete(cacheKey);
                });
            }

            const games = await promise;
            return { jsonBody: games, headers: cacheControl() };
        } catch (err) {
            context.log('getSeasonGames failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
