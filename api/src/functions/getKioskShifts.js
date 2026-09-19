const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Kiosk shift roster for the season, read from the club's Google Sheet ("2026-2027" tab).
// The sheet is the club's own working document — people sign up in it — so this is a
// read-only mirror, never a second copy of the truth. Consumed by /gamecheck's Kioski
// column: is there a shift covering this game, and does it have anyone on it.
//
// The sheet must stay link-readable ("anyone with the link can view"); the CSV export
// endpoint needs no credentials. If sharing is tightened this returns 502 and the column
// falls back to "ei tietoa" rather than claiming the kiosk is shut.

// A shift list changes when a parent signs up — often, but never urgently. 15 min keeps the
// page live without hammering Google; `stale` survives an outage (see below).
const TTL = 15 * 60_000;
let cache = null;

const SHEET_ID = process.env.KIOSK_SHEET_ID || '1dPljJchntNvb898mo6Kyx-DI0EPmxVr3';
const SHEET_GID = process.env.KIOSK_SHEET_GID || '1902175086';
const csvUrl = () =>
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

// One CSV line → fields. Quoted fields exist because hours are written with a decimal
// comma ("2,5"), which would otherwise split the row.
function splitCsvLine(line) {
    const out = [];
    let cur = '', quoted = false;
    for (const ch of line) {
        if (ch === '"') { quoted = !quoted; continue; }
        if (ch === ',' && !quoted) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    out.push(cur);
    return out;
}

// "14:30" and "14.30" both occur in the sheet — people type what they type.
const toMinutes = (s) => {
    const m = String(s || '').match(/(\d{1,2})[:.](\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = (mins) =>
    mins == null ? null : `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// The sheet writes "15.8." with no year, so the season supplies it: July–December belong to
// the season's first year, January–June to the second. Matches the app's season rule
// (src/lib/seasonGamesCache.js seasonOf), which names a season by its SPRING year.
const seasonYears = (springYear) => ({ autumn: springYear - 1, spring: springYear });

function parseShifts(csv, springYear) {
    const years = seasonYears(springYear);
    const shifts = [];
    for (const rawLine of String(csv).replace(/\r/g, '').split('\n')) {
        const c = splitCsvLine(rawLine);
        if (c.length < 6) continue;
        const pvm = (c[1] || '').trim();
        const m = pvm.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
        if (!m) continue; // header, spacer and note rows
        const dd = Number(m[1]), mm = Number(m[2]);
        if (!dd || !mm || mm > 12 || dd > 31) continue;
        const year = mm >= 7 ? years.autumn : years.spring;
        const start = toMinutes(c[2]);
        const end = toMinutes(c[3]);
        const people = [c[6], c[7], c[8], c[9]].map((x) => (x || '').trim()).filter(Boolean);
        shifts.push({
            date: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
            start: hhmm(start),
            end: hhmm(end),
            startMinutes: start,
            endMinutes: end,
            team: (c[5] || '').trim() || null,
            people,
            note: (c[10] || '').trim() || null,
        });
    }
    return shifts;
}

app.http('getKioskShifts', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const season = Number(request.query.get('season')) || (() => {
            const now = new Date();
            return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
        })();

        const fresh = request.query.get('fresh') === '1';
        if (!fresh && cache && cache.season === season && Date.now() - cache.timestamp < TTL) {
            return { jsonBody: { ...cache.data, cached: true } };
        }

        try {
            const res = await fetch(csvUrl(), { redirect: 'follow' });
            if (!res.ok) throw new Error(`sheet ${res.status}`);
            const csv = await res.text();
            // A sign-in page is HTML, not CSV — catch it rather than parsing 0 shifts and
            // reporting an empty roster as fact.
            if (/^\s*</.test(csv)) throw new Error('sheet not readable (sharing?)');

            const shifts = parseShifts(csv, season);
            const data = { season, shifts, fetchedAt: new Date().toISOString() };
            cache = { data, season, timestamp: Date.now() };
            return { jsonBody: data };
        } catch (err) {
            context.log('getKioskShifts failed: ' + ((err && err.stack) || err));
            // Serve the last good copy rather than nothing: a stale roster is far more
            // useful than an empty one, and the client can see how old it is.
            if (cache && cache.season === season) {
                return { jsonBody: { ...cache.data, stale: true } };
            }
            return { status: 502, jsonBody: { error: String((err && err.message) || err) } };
        }
    },
});
