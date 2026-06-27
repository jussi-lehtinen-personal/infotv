const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Club partners / sponsors from the front page of www.kiekko-ahma.fi (Jopox +
// Next.js). The homepage embeds `topsponsors` + `centersponsors` in
// __NEXT_DATA__ — each { sponsorName, sponsorImage, sponsorWww }. Image is a
// filename in the Jopox imagebank. See reference_jopox_kiekkoahma.

const TTL = 6 * 60 * 60_000; // 6 h
let cache = null;

const BASE = 'https://www.kiekko-ahma.fi';
const IMAGEBANK = 'https://static.jopox.fi/kiekko-ahma/imagebank';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const clean = (s) => (s == null ? '' : String(s).trim());

app.http('getPartners', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        try {
            if (cache && (Date.now() - cache.timestamp) < TTL) {
                return { jsonBody: cache.data };
            }

            const res = await fetch(`${BASE}/`, {
                headers: { 'User-Agent': UA, Accept: 'text/html' },
            });
            if (!res.ok) throw new Error(`kiekko-ahma.fi -> HTTP ${res.status}`);
            const html = await res.text();

            const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (!m) throw new Error('__NEXT_DATA__ not found');
            const pp = JSON.parse(m[1]).props?.pageProps || {};

            const raw = [...(pp.topsponsors || []), ...(pp.centersponsors || [])];
            const seen = new Set();
            const partners = [];
            for (const s of raw) {
                const name = clean(s.sponsorName);
                if (!name || seen.has(name.toLowerCase())) continue;
                seen.add(name.toLowerCase());
                const img = clean(s.sponsorImage);
                partners.push({
                    name,
                    image: img ? `${IMAGEBANK}/${img}` : null,
                    url: clean(s.sponsorWww) || null,
                });
            }

            const data = { partners };
            cache = { data, timestamp: Date.now() };
            return { jsonBody: data };
        } catch (err) {
            context.log('getPartners failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    },
});
