const { app } = require('@azure/functions');
const { fetchSupporterNames } = require('../lib/jopoxAdmin');

// Supporter members ("kannattajajäsenet") for the /kannattajajasenet page.
//
// Source = the club's public Jopox sign-up form "Kannattajajäsen" (id 9377), read through
// the hallinta3 admin session (the replies are not public — the public forms API exposes
// only an answer count). Jopox's own "move reply to the member register" flow was the
// alternative, but a moved reply does NOT show up in the team's public roster, so reading
// the form is the path that actually produces a list. See memory reference_jopox_kiekkoahma.
//
// ⚠️ PRIVACY: the form collects birth date, phone, email and address too. `fetchSupporterNames`
// resolves ONLY the Etunimi/Sukunimi fields and returns nothing else — this endpoint must
// never grow into a general form-reply proxy. Only fee-PAID (invoiceStatus 5), non-removed
// replies are listed.
//
// Cached LONG on purpose: the list changes a few times a season, every miss costs a Jopox
// login + admin round-trip, and the page is public. `?refresh=1` bypasses the cache but
// keeps a floor so it can't be used to hammer Jopox.
const TTL = 12 * 60 * 60_000; // 12 h
const REFRESH_MIN = 5 * 60_000; // ?refresh=1 still honours 5 min between real fetches

let cache = null; // { data, timestamp }
let inflight = null;

const cacheControl = () => ({ 'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400' });

app.http('getSupporters', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const wantRefresh = request.query?.get('refresh') === '1';
            const age = cache ? Date.now() - cache.timestamp : Infinity;
            const fresh = cache && age < (wantRefresh ? REFRESH_MIN : TTL);
            if (fresh) {
                return { jsonBody: { ...cache.data, cached: true }, headers: cacheControl() };
            }

            // Single-flight: concurrent misses share one Jopox round-trip.
            if (!inflight) {
                inflight = (async () => {
                    const supporters = await fetchSupporterNames();
                    const data = { supporters, count: supporters.length, updatedAt: new Date().toISOString() };
                    cache = { data, timestamp: Date.now() };
                    return data;
                })();
                inflight.finally(() => { inflight = null; });
            }
            const data = await inflight;
            return { jsonBody: { ...data, cached: false }, headers: cacheControl() };
        } catch (err) {
            context.log('getSupporters failed: ' + (err && err.stack || err));
            // Serve the last good list rather than breaking the page on a Jopox hiccup.
            if (cache) return { jsonBody: { ...cache.data, cached: true, stale: true }, headers: cacheControl() };
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    },
});
