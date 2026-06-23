const fetch = require("node-fetch");

// Shared client for the leijonat tulospalvelu API.
//
// The site was rebuilt (Symfony) and its JSON helper endpoints now require:
//   - a PHPSESSID session cookie, and
//   - an `x-csrf-token` header whose value is rendered into the page as
//     <input id="xsrf-token" value="..."> (bound to that session), and
//   - `x-requested-with: XMLHttpRequest`.
// Without these the endpoints return 403. Plain GETs (no token) return 404/403.
//
// We bootstrap a session by loading the landing page once (which sets the
// cookie and embeds a token), cache the (cookie, token) pair, and reuse it for
// both /helpers/* and /serie/helpers/* calls. One token works for all paths.

const ORIGIN = 'https://tulospalvelu.leijonat.fi';

// Tokens are session-bound and reusable; refresh well before any practical
// session expiry and re-bootstrap immediately on a 403.
const SESSION_TTL = 20 * 60_000; // 20 min

let session = null; // { cookie, token, timestamp }

function parseToken(html) {
    // <input type="hidden" id="xsrf-token" value="...">. Attribute order varies,
    // so try value-after-id and id-after-value.
    let m = html.match(/id="xsrf-token"[^>]*\bvalue="([^"]+)"/i);
    if (!m) m = html.match(/\bvalue="([^"]+)"[^>]*id="xsrf-token"/i);
    return m ? m[1] : null;
}

function parseSessionCookie(res) {
    const raw = res.headers.raw()['set-cookie'] || [];
    for (const c of raw) {
        const m = c.match(/PHPSESSID=([^;]+)/);
        if (m) return `PHPSESSID=${m[1]}`;
    }
    return null;
}

async function bootstrap(context) {
    const res = await fetch(`${ORIGIN}/?lang=fi`, { headers: { Accept: 'text/html' } });
    const cookie = parseSessionCookie(res);
    const html = await res.text();
    const token = parseToken(html);
    if (!cookie || !token) {
        throw new Error('tulospalvelu: failed to obtain session cookie / csrf token');
    }
    session = { cookie, token, timestamp: Date.now() };
    context?.log('tulospalvelu: new session established');
    return session;
}

async function getSession(context) {
    if (session && (Date.now() - session.timestamp) < SESSION_TTL) return session;
    return bootstrap(context);
}

// GET a tulospalvelu helper endpoint and return parsed JSON.
// `path` is relative to the origin, e.g. "helpers/getgames" or
// "serie/helpers/search-players-and-teams". `params` is a plain object.
// Retries once with a fresh session on 403 (expired/invalid token).
async function tulospalveluGet(path, params, context) {
    const qs = params ? new URLSearchParams(params).toString() : '';
    const url = `${ORIGIN}/${path}${qs ? '?' + qs : ''}`;

    for (let attempt = 0; attempt < 2; attempt++) {
        const s = await getSession(context);
        const res = await fetch(url, {
            headers: {
                'x-csrf-token': s.token,
                'x-requested-with': 'XMLHttpRequest',
                Accept: 'application/json',
                Cookie: s.cookie,
            },
        });
        if (res.status === 403 && attempt === 0) {
            context?.log('tulospalvelu: 403, refreshing session and retrying');
            session = null;
            continue;
        }
        if (!res.ok) {
            throw new Error(`tulospalvelu GET ${path} -> HTTP ${res.status}`);
        }
        return res.json();
    }
}

// Returns the SeasonNumber currently flagged as `current` by the API
// (e.g. 2027 for the 2026-2027 season). The search endpoint needs a real
// season number; season=0 is rejected there.
async function getCurrentSeason(context) {
    const seasons = await tulospalveluGet('helpers/getseasons', null, context);
    const current = Array.isArray(seasons) ? seasons.find((s) => s.current === true) : null;
    if (current) return current.SeasonNumber;
    // Fallback: hockey season is labelled by its spring year; it rolls over in
    // the summer (new season published ~July).
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

module.exports = { tulospalveluGet, getCurrentSeason, ORIGIN };
