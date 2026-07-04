const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Thin passthrough to the Cloudflare Worker's /getGameReport — the box score for
// ONE game. The worker resolves the real getgames id (KV-cached, ≈ once per game)
// then fetches the report by that id, so this endpoint is light even when polled
// for a live game. We keep only a very short in-memory cache here (live scores
// must stay fresh) + single-flight to coalesce concurrent misses, and FORWARD the
// worker's status-dependent Cache-Control (finished 24 h / live 30 s) to the CDN.
const TTL = 20_000; // 20 s in-memory (the worker decides real freshness)
const cache = new Map();
const inFlight = new Map();

const PROXY_URL = process.env.TP_PROXY_URL || 'https://gamezone.zapmies.workers.dev';
const PROXY_KEY = process.env.TP_PROXY_KEY;

const FALLBACK_CC = { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' };

app.http('getGameReport', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            if (!PROXY_URL) {
                return { status: 500, jsonBody: { error: 'TP_PROXY_URL not configured' } };
            }
            const q = request.query;
            const date = q?.get('date');
            const home = q?.get('home');
            const away = q?.get('away');
            const extId = q?.get('extId');
            if (!date || !home || !away) {
                return { status: 400, jsonBody: { error: 'date, home, away required' } };
            }

            const params = new URLSearchParams({ date, home, away });
            if (extId) params.set('extId', extId);
            const cacheKey = params.toString();

            const cached = cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < TTL) {
                return { jsonBody: cached.data, headers: cached.cc };
            }

            let promise = inFlight.get(cacheKey);
            if (!promise) {
                promise = (async () => {
                    const res = await fetch(`${PROXY_URL}/getGameReport?${cacheKey}`, {
                        headers: PROXY_KEY ? { 'x-proxy-key': PROXY_KEY } : {},
                    });
                    if (!res.ok) throw new Error(`worker /getGameReport -> HTTP ${res.status}`);
                    const data = await res.json();
                    const workerCC = res.headers.get('cache-control');
                    const cc = workerCC ? { 'Cache-Control': workerCC } : FALLBACK_CC;
                    cache.set(cacheKey, { data, cc, timestamp: Date.now() });
                    return { data, cc };
                })();
                inFlight.set(cacheKey, promise);
                promise.finally(() => {
                    if (inFlight.get(cacheKey) === promise) inFlight.delete(cacheKey);
                });
            }

            const { data, cc } = await promise;
            return { jsonBody: data, headers: cc };
        } catch (err) {
            context.log('getGameReport failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
