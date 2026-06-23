const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Thin passthrough to the Cloudflare Worker (which reaches tulospalvelu from an
// IP the WAF allows). The Worker returns the final teams array (and resolves the
// current season itself when no season is given). We keep a per-season cache.

const TTL = 60 * 60_000; // 1 h – team structure is stable within a season

const seasonCache = new Map();

// Public Worker URL (not a secret); env can override if it ever moves.
const PROXY_URL = process.env.TP_PROXY_URL || 'https://gamezone.zapmies.workers.dev';
const PROXY_KEY = process.env.TP_PROXY_KEY; // optional shared secret

app.http('getTeams', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        try {
            if (!PROXY_URL) {
                return { status: 500, jsonBody: { error: 'TP_PROXY_URL not configured' } };
            }

            const season = request.query?.get('season') || '';
            const cacheKey = season || 'current';

            const cached = seasonCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < TTL) {
                context.log('Cache hit for season: ' + cacheKey);
                return { jsonBody: cached.data };
            }

            const path = '/getTeams' + (season ? `?season=${encodeURIComponent(season)}` : '');
            const res = await fetch(`${PROXY_URL}${path}`, {
                headers: PROXY_KEY ? { 'x-proxy-key': PROXY_KEY } : {},
            });
            if (!res.ok) throw new Error(`worker ${path} -> HTTP ${res.status}`);
            const teams = await res.json();

            seasonCache.set(cacheKey, { data: teams, timestamp: Date.now() });
            return { jsonBody: teams };
        } catch (err) {
            context.log('getTeams failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
