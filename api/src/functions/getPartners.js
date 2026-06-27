const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Optional: decode logos to detect light/white wordmarks (they vanish on the
// white logo box → they get a dark box instead). Degrade gracefully if jimp
// is unavailable.
let Jimp = null;
try { Jimp = require('jimp'); } catch { /* analysis skipped */ }

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

// Decide if a logo is a light/transparent wordmark (e.g. white text on a
// transparent background) that would be invisible on the white logo box. Such
// logos have lots of fully transparent pixels AND their opaque pixels are
// bright. A logo with a baked-in white background (no transparency) or dark
// content stays on the default white box.
async function isLightLogo(url) {
    if (!Jimp) return false;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!res.ok) return false;
        const buf = await res.buffer();
        const img = await Jimp.read(buf);
        const { data, width, height } = img.bitmap;
        let opaque = 0, transparent = 0, lumSum = 0;
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 16) { transparent++; continue; }
            if (a > 200) {
                const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
                lumSum += lum;
                opaque++;
            }
        }
        if (!opaque) return false;
        const avgLum = lumSum / opaque;
        const transparentFrac = transparent / (width * height);
        return avgLum > 0.72 && transparentFrac > 0.35;
    } catch {
        return false;
    }
}

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

            // Flag light/transparent logos so the client can give them a dark box.
            await Promise.all(
                partners.map(async (p) => {
                    p.light = p.image ? await isLightLogo(p.image) : false;
                })
            );

            const data = { partners };
            cache = { data, timestamp: Date.now() };
            return { jsonBody: data };
        } catch (err) {
            context.log('getPartners failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    },
});
