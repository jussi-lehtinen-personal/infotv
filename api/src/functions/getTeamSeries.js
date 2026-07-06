const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Thin passthrough to the Cloudflare Worker's /getTeamSeries — the series a Jopox
// age group plays this season (?age=U15&season=), derived from the 24 h game list
// + one KV-permanent resolve per series. The client then fetches each table lazily
// via /getSeriesTable. Short local cache + single-flight; worker is edge-cached.
const TTL = 5 * 60_000;
const cache = new Map();
const inFlight = new Map();

const PROXY_URL = process.env.TP_PROXY_URL || 'https://gamezone.zapmies.workers.dev';
const PROXY_KEY = process.env.TP_PROXY_KEY;
const cacheControl = () => ({ 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' });

app.http('getTeamSeries', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const age = request.query?.get('age') || '';
            const season = request.query?.get('season') || '';
            if (!age) return { status: 400, jsonBody: { error: 'age required' } };
            const cacheKey = `${age}|${season || 'current'}`;

            const cached = cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < TTL) {
                return { jsonBody: cached.data, headers: cacheControl() };
            }

            let promise = inFlight.get(cacheKey);
            if (!promise) {
                const qs = new URLSearchParams({ age });
                if (season) qs.set('season', season);
                const path = `/getTeamSeries?${qs.toString()}`;
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
            context.log('getTeamSeries failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
