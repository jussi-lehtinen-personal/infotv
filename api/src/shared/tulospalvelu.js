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

// The rebuilt site sits behind a CloudFront/AWS WAF that blocks requests from
// data-center IPs (e.g. Azure) unless they look like a real browser: a 403 with
// a ~900-byte block page, no PHPSESSID, no #xsrf-token. We send a complete,
// internally-consistent desktop-Chrome header set so the WAF's bot rules pass.
// Note: only advertise gzip/deflate (br/zstd would arrive undecoded by
// node-fetch and break token parsing).
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const SEC_CH_UA = '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"';
const ACCEPT_LANGUAGE = 'fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7';

// Headers for the initial document (navigation) request to the landing page.
const DOCUMENT_HEADERS = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': ACCEPT_LANGUAGE,
    'Accept-Encoding': 'gzip, deflate',
    'sec-ch-ua': SEC_CH_UA,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
};

// Headers for the XHR API calls (mirrors the site's own fetch()).
const XHR_HEADERS = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
    'Accept-Language': ACCEPT_LANGUAGE,
    'Accept-Encoding': 'gzip, deflate',
    'sec-ch-ua': SEC_CH_UA,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    Referer: `${ORIGIN}/`,
    'x-requested-with': 'XMLHttpRequest',
};

async function bootstrap(context) {
    const res = await fetch(`${ORIGIN}/?lang=fi`, { headers: DOCUMENT_HEADERS });
    const cookie = parseSessionCookie(res);
    const html = await res.text();
    const token = parseToken(html);
    if (!cookie || !token) {
        throw new Error(
            `tulospalvelu: failed to obtain session/csrf token ` +
            `(status=${res.status}, cookie=${!!cookie}, token=${!!token}, htmlLen=${html.length})`
        );
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
                ...XHR_HEADERS,
                'x-csrf-token': s.token,
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
