const fetch = require("node-fetch");

// Jopox members-area access via the Gamezone SERVICE ACCOUNT — used only to read
// each event's peliryhmä (sub-group) label, which the PUBLIC calendar API does not
// expose. Headless login (reverse-engineered from the browser flow):
//   1. POST myapi/login {username,password}                    -> accessToken
//   2. POST myapi/adminlogin/{SITE}/onetimerlockerroom (Bearer)-> { url: otlogin }
//   3. GET  that otlogin url (follow 302)                       -> sets `jpxapp` cookie
//   4. POST calendar.aspx/LoadMoreEvents (cookies)              -> members events
// Everything degrades gracefully: no creds / any failure -> empty map, and the
// feed simply shows practices with no sub-group tag (as before Phase B).
// ⚠️ PRIVACY: the members response carries participants' (minors') names — we read
// ONLY Groups[].Name (a peliryhmä label) and eventId; NO person data ever leaves here.
// Creds: JOPOX_SVC_USER / JOPOX_SVC_PASS (SWA app settings; api/local.settings.json for dev).
// See memory: project_feed_subgroups, reference_jopox_kiekkoahma.

const MYAPI = "https://myapi.jopox.fi";
const APP = "https://valkeakoskenkiekkoahma-app.jopox.fi";
const SITE_ID = 197; // Kiekko-Ahma club site id (from login?to=197 / getappsiteroot/197)
const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Ahma peliryhmä colours (same vocabulary as the frontend splitTeamName VARIANT_WORDS)
// so a Jopox "Musta peliryhmä" normalises to the SAME key as a tulospalvelu
// "Kiekko-Ahma Musta" game sub-group ("musta"). Substring match, case-insensitive.
const COLOURS = [
    "musta", "valkoinen", "oranssi", "sininen", "punainen", "keltainen", "vihreä", "harmaa", "violetti",
    "black", "white", "orange", "blue", "red", "yellow", "green", "grey", "gray",
];
const groupColour = (name) => {
    const l = String(name || "").toLocaleLowerCase("fi");
    return COLOURS.find((c) => l.includes(c)) || null;
};

const SESSION_TTL = 25 * 60_000; // re-login roughly every 25 min
const GROUPS_TTL = 15 * 60_000;  // per-team event map freshness (matches getTeamEvents)

let session = null;        // { jar, ts }
let sessionInFlight = null; // coalesce concurrent logins
const groupsCache = new Map(); // subsiteId -> { map, ts }

// node-fetch v2 exposes Set-Cookie via headers.raw(); global fetch via getSetCookie().
function absorbCookies(res, jar) {
    const raw = res.headers.raw ? (res.headers.raw()["set-cookie"] || []) : (res.headers.getSetCookie?.() || []);
    for (const c of raw) {
        const nv = c.split(";")[0];
        const i = nv.indexOf("=");
        if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1);
    }
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

const helsinkiToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Helsinki" }); // YYYY-MM-DD
const fromDateParam = () => { const [y, m, d] = helsinkiToday().split("-"); return `${d}.${m}.${y} 00:00`; };

async function doLogin() {
    const USER = process.env.JOPOX_SVC_USER, PASS = process.env.JOPOX_SVC_PASS;
    if (!USER || !PASS) throw new Error("JOPOX_SVC_USER/PASS not configured");

    // 1. MyJopox login -> accessToken
    const lr = await fetch(`${MYAPI}/api/v1/myjopoxaccount/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Origin: "https://login.jopox.fi", Referer: "https://login.jopox.fi/" },
        body: JSON.stringify({ username: USER, password: PASS }),
    });
    if (!lr.ok) throw new Error(`myapi login HTTP ${lr.status}`);
    const ld = await lr.json();
    let token = null;
    JSON.stringify(ld, (k, v) => { if (/accesstoken/i.test(k) && typeof v === "string") token = v; return v; });
    if (!token) throw new Error("no accessToken in login response");

    // 2. one-time bridge token for the aspx app
    const or = await fetch(`${MYAPI}/api/v1/adminlogin/${SITE_ID}/onetimerlockerroom`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}`, Origin: "https://login.jopox.fi", Referer: "https://login.jopox.fi/" },
        body: "{}",
    });
    if (!or.ok) throw new Error(`onetimer HTTP ${or.status}`);
    const od = await or.json();
    if (!od || !od.url) throw new Error("no onetimer url");

    // 3. follow the otlogin url -> sets jpxapp + ASP.NET_SessionId
    const jar = {};
    let next = od.url, hops = 0;
    while (next && hops < 6) {
        const r = await fetch(next, { method: "GET", redirect: "manual", headers: { "User-Agent": UA, Cookie: cookieHeader(jar) } });
        absorbCookies(r, jar);
        const loc = r.headers.get("location");
        if (!loc) break;
        next = loc.startsWith("http") ? loc : APP + loc;
        hops++;
    }
    if (!jar.jpxapp) throw new Error("no jpxapp cookie after otlogin");
    return jar;
}

async function getSession(force) {
    if (!force && session && Date.now() - session.ts < SESSION_TTL) return session.jar;
    if (!sessionInFlight) {
        sessionInFlight = doLogin()
            .then((jar) => { session = { jar, ts: Date.now() }; return jar; })
            .finally(() => { sessionInFlight = null; });
    }
    return sessionInFlight;
}

async function loadEvents(subsiteId, jar) {
    const cookie = cookieHeader({ ...jar, jpx_team_select: String(subsiteId) });
    const res = await fetch(`${APP}/www/ajax/calendar.aspx/LoadMoreEvents`, {
        method: "POST",
        headers: {
            "User-Agent": UA, "Content-Type": "application/json; charset=UTF-8",
            Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest",
            Cookie: cookie, Origin: APP, Referer: `${APP}/home/club/${subsiteId}`,
        },
        body: JSON.stringify({ subsite: Number(subsiteId), fromDate: fromDateParam(), clientType: 1 }),
    });
    const txt = await res.text();
    const data = JSON.parse(txt); // throws if the session lapsed (HTML login page)
    const payload = data.d !== undefined ? (typeof data.d === "string" ? JSON.parse(data.d) : data.d) : data;
    return payload.Events || [];
}

// Public: eventId -> [colourKey…] for a team's upcoming members events. Joint /
// untagged events map to [] (= shown under every sub-group). Returns {} on any
// failure (feature is optional). NEVER includes participant/person data.
async function fetchMemberSubGroups(subsiteId) {
    const cached = groupsCache.get(String(subsiteId));
    if (cached && Date.now() - cached.ts < GROUPS_TTL) return cached.map;

    let jar = await getSession();
    let events;
    try {
        events = await loadEvents(subsiteId, jar);
    } catch (e) {
        // most likely an expired session -> re-login once and retry
        jar = await getSession(true);
        events = await loadEvents(subsiteId, jar);
    }

    const map = {};
    for (const ev of events) {
        if (ev.EventId == null) continue;
        const cols = [...new Set((Array.isArray(ev.Groups) ? ev.Groups : []).map((g) => groupColour(g && g.Name)).filter(Boolean))];
        map[ev.EventId] = cols;
    }
    groupsCache.set(String(subsiteId), { map, ts: Date.now() });
    return map;
}

module.exports = { fetchMemberSubGroups };
