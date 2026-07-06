const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Thin passthrough to the Cloudflare Worker's /getSeriesTable — ONE table
// (?tab=standings|scorers|goalies&season=&subSerieId=&levelId=) = ONE tulospalvelu
// call, cached long in the worker. Short local cache + single-flight on top.
const TTL = 5 * 60_000;
const cache = new Map();
const inFlight = new Map();

const PROXY_URL = process.env.TP_PROXY_URL || 'https://gamezone.zapmies.workers.dev';
const PROXY_KEY = process.env.TP_PROXY_KEY;
const cacheControl = () => ({ 'Cache-Control': 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=86400' });

app.http('getSeriesTable', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const q = request.query;
            const season = q?.get('season') || '';
            const subSerieId = q?.get('subSerieId') || '';
            const levelId = q?.get('levelId') || '';
            const tab = q?.get('tab') || 'standings';
            if (!season || !subSerieId) return { status: 400, jsonBody: { error: 'season + subSerieId required' } };
            const cacheKey = `${season}|${subSerieId}|${levelId}|${tab}`;

            const cached = cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < TTL) {
                return { jsonBody: cached.data, headers: cacheControl() };
            }

            let promise = inFlight.get(cacheKey);
            if (!promise) {
                const qs = new URLSearchParams({ season, subSerieId, tab });
                if (levelId) qs.set('levelId', levelId);
                const path = `/getSeriesTable?${qs.toString()}`;
                promise = (async () => {
                    const res = await fetch(`${PROXY_URL}${path}`, { headers: PROXY_KEY ? { 'x-proxy-key': PROXY_KEY } : {} });
                    if (!res.ok) throw new Error(`worker ${path} -> HTTP ${res.status}`);
                    const data = await res.json();
                    cache.set(cacheKey, { data, timestamp: Date.now() });
                    return data;
                })();
                inFlight.set(cacheKey, promise);
                promise.finally(() => { if (inFlight.get(cacheKey) === promise) inFlight.delete(cacheKey); });
            }
            return { jsonBody: await promise, headers: cacheControl() };
        } catch (err) {
            context.log('getSeriesTable failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
