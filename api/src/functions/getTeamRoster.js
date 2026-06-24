const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Team roster + officials for a Jopox team page. Source: the club site
// www.kiekko-ahma.fi (Jopox + Next.js) embeds the data as JSON in the
// __NEXT_DATA__ script on /joukkueet/<subsiteId>. We fetch that page, parse the
// blob, and return a trimmed payload. (kiekko-ahma.fi is NOT behind the
// tulospalvelu WAF, so Azure should reach it directly; if that ever changes,
// route this through the Cloudflare Worker like getGames/getTeams.)
// See memory: reference_jopox_kiekkoahma.

const TTL = 6 * 60 * 60_000; // 6 h – rosters change rarely
const cache = new Map(); // subsiteId -> { data, timestamp }

const BASE = 'https://www.kiekko-ahma.fi';
const IMAGEBANK = 'https://static.jopox.fi/kiekko-ahma/imagebank';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Only these roles expose contact info (head coach + team manager); everyone
// else is shown as name + role only.
const CONTACT_ROLES = new Set(['Vastuuvalmentaja', 'Joukkueenjohtaja']);

const clean = (s) => (s == null ? '' : String(s).trim());

function playerPhoto(imagename) {
    return imagename ? `${IMAGEBANK}/${imagename}` : null;
}
function officialPhoto(o) {
    return o.imageId ? `${IMAGEBANK}/${o.imageId}_big${o.imageExtension || '.jpg'}` : null;
}

function transform(pageProps, html) {
    // Team label from <title>: "Valkeakosken Kiekko-Ahma ry - U15 (2012)" -> "U15 (2012)"
    const titleM = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const teamName = titleM.includes(' - ') ? clean(titleM.split(' - ').slice(1).join(' - ')) : clean(titleM);

    const players = [];
    for (const group of pageProps.players || []) {
        for (const p of group.players || []) {
            players.push({
                firstName: clean(p.personFirstname),
                lastName: clean(p.personLastname),
                number: clean(p.playerdataShirtnr || p.nummero) || null,
                position: clean(p.playerattributeitemtext) || null,
                captain: !!p.playerdataCaptain,
                viceCaptain: !!p.playerdataViceCaptain,
                photo: playerPhoto(p.imagename),
            });
        }
    }

    const officials = (pageProps.officials || []).map((o) => {
        const showContact = CONTACT_ROLES.has(clean(o.role));
        return {
            name: clean(o.personName) || clean(`${o.personFirstname} ${o.personLastname}`),
            role: clean(o.role),
            email: showContact ? clean(o.email) || null : null,
            phone: showContact ? clean(o.phone) || null : null,
            intro: clean(o.introduction) || null,
            photo: officialPhoto(o),
        };
    });

    return {
        subsiteId: pageProps.description?.subsiteId ?? null,
        teamName,
        description: clean(pageProps.description?.subsiteDescription) || null,
        players,
        officials,
    };
}

app.http('getTeamRoster', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        try {
            const subsiteId = request.query?.get('subsiteId');
            if (!subsiteId || !/^\d+$/.test(subsiteId)) {
                return { status: 400, jsonBody: { error: 'subsiteId (numeric) required' } };
            }

            const cached = cache.get(subsiteId);
            if (cached && (Date.now() - cached.timestamp) < TTL) {
                context.log('Roster cache hit for subsite: ' + subsiteId);
                return { jsonBody: cached.data };
            }

            const res = await fetch(`${BASE}/joukkueet/${subsiteId}`, {
                headers: { 'User-Agent': UA, Accept: 'text/html' },
            });
            if (!res.ok) throw new Error(`kiekko-ahma.fi -> HTTP ${res.status}`);
            const html = await res.text();

            const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (!m) throw new Error('__NEXT_DATA__ not found');
            const pageProps = JSON.parse(m[1]).props?.pageProps || {};

            const data = transform(pageProps, html);
            cache.set(subsiteId, { data, timestamp: Date.now() });
            return { jsonBody: data };
        } catch (err) {
            context.log('getTeamRoster failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    }
});
