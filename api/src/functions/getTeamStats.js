const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Thin passthrough to the Cloudflare Worker's /getTeamStats — official standings
// + series pistepörssi + goalie stats for a Jopox age group (?age=U15&season=).
// The worker does the tulospalvelu work (resolve subseries via district scan,
// fetch the 3 serie endpoints) and is itself edge-cached (10 min current / 24 h
// past). We keep a SHORT local cache so worst-case staleness ≈ worker TTL + a few
// minutes, not TTL × layers; single-flight coalesces concurrent misses.
const TTL = 5 * 60_000; // 5 min
const cache = new Map();
const inFlight = new Map();

const PROXY_URL = process.env.TP_PROXY_URL || 'https://gamezone.zapmies.workers.dev';
const PROXY_KEY = process.env.TP_PROXY_KEY;

function cacheControl() {
    return { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' };
}

app.http('getTeamStats', {
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
                const path = `/getTeamStats?${qs.toString()}`;
                promise = (async () => {
                    const res = await fetch(`${PROXY_URL}${path}`, {
                        headers: PROXY_KEY ? { 'x-proxy-key': PROXY_KEY } : {},
                    });
                    if (!res.ok) throw new Error(`worker ${path} -> HTTP ${res.status}`);
                    const data = await res.json();
                    cache.set(cacheKey, { data, timestamp: Date.now() });
                    return data;
                })();
                inFlight.set(cacheKey, promise);
                promise.finally(() => {
                    if (inFlight.get(cacheKey) === promise) inFlight.delete(cacheKey);
                });
            }

            const data = await promise;
            return { jsonBody: data, headers: cacheControl() };
        } catch (err) {
            context.log('getTeamStats failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
