const { app } = require('@azure/functions');
const fetch = require("node-fetch");
const { pageProps } = require('../lib/jopoxSite');

// Organisation contacts (board etc.) from the club site www.kiekko-ahma.fi
// (Jopox). The /organisaatio page embeds the officials in its page payload (see
// lib/jopoxSite), same item shape as team officials. Unlike team pages, ALL roles show contacts here
// (these are the public organisation contacts). See reference_jopox_kiekkoahma.

const TTL = 6 * 60 * 60_000; // 6 h
let cache = null; // { data, timestamp }

const BASE = 'https://www.kiekko-ahma.fi';
const IMAGEBANK = 'https://static.jopox.fi/kiekko-ahma/imagebank';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const clean = (s) => (s == null ? '' : String(s).trim());

app.http('getOrganisation', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        try {
            if (cache && (Date.now() - cache.timestamp) < TTL) {
                context.log('Organisation cache hit');
                return { jsonBody: cache.data };
            }

            const res = await fetch(`${BASE}/organisaatio`, {
                headers: { 'User-Agent': UA, Accept: 'text/html' },
            });
            if (!res.ok) throw new Error(`kiekko-ahma.fi -> HTTP ${res.status}`);
            const html = await res.text();

            const pp = pageProps(html);
            // Unlike a team page, this one's payload is ONE bare list of officials
            // under its own cache key, so pick it by shape rather than by name.
            const list = pp.officials
                || Object.values(pp).find((v) => Array.isArray(v) && v.some((o) => o && (o.personName || o.personLastname)))
                || [];

            const officials = list.map((o) => ({
                name: clean(o.personName) || clean(`${o.personFirstname} ${o.personLastname}`),
                role: clean(o.role),
                email: clean(o.email) || null,
                phone: clean(o.phone) || null,
                photo: o.imageId ? `${IMAGEBANK}/${o.imageId}_big${o.imageExtension || '.jpg'}` : null,
            }));

            const data = { officials };
            cache = { data, timestamp: Date.now() };
            return { jsonBody: data };
        } catch (err) {
            context.log('getOrganisation failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
