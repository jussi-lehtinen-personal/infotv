const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment');

// Data source for the ice-time report. Same tilamisu endpoint as schedule.js,
// but the upstream supports an arbitrary from/to in a single request, so we
// fetch the whole range in one call and cache it by range.

// Range-level cache: "from|to" -> { data: [normalized reservations], timestamp }
const rangeCache = new Map();
const TTL = 10 * 60_000; // 10 min – admin report, mostly historical data

// Cap the requested span: a huge range means a huge upstream response. ~1 year
// covers the whole-year preset.
const MAX_RANGE_DAYS = 366;

const SERVER = 'https://valkeakoski.tilamisu.fi';
const LOCATION_ID = 836;

// "YYYY-MM-DD HH:mm" start/end -> reservation length in minutes
function durationMinutes(start, end) {
    const s = moment(start, 'YYYY-MM-DD HH:mm');
    const e = moment(end, 'YYYY-MM-DD HH:mm');
    const diff = e.diff(s, 'minutes');
    return diff > 0 ? diff : 0;
}

app.http('getReservations', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const fromParam = request.query?.get('from');
        const toParam = request.query?.get('to');

        if (!fromParam || !toParam) {
            return { status: 400, jsonBody: { error: 'from and to are required (YYYY-MM-DD)' } };
        }

        const fromDate = new Date(fromParam);
        const toDate = new Date(toParam);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate > toDate) {
            return { status: 400, jsonBody: { error: 'invalid date range' } };
        }

        const spanDays = Math.round((toDate - fromDate) / 86_400_000);
        if (spanDays > MAX_RANGE_DAYS) {
            return { status: 400, jsonBody: { error: `range too long (max ${MAX_RANGE_DAYS} days)` } };
        }

        const fromStr = moment(fromDate).format('YYYY-MM-DD');
        const toStr = moment(toDate).format('YYYY-MM-DD');

        const cacheKey = `${fromStr}|${toStr}`;
        const cached = rangeCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < TTL) {
            context.log('Reservations cache hit for range: ' + cacheKey);
            return { jsonBody: cached.data };
        }

        // tilamisu's `to` is exclusive, so fetch one day past `to` to include the
        // requested end date; the day-clip below keeps results within [from, to].
        const fetchTo = moment(toDate).add(1, 'day').format('YYYY-MM-DD');
        const uri = `${SERVER}/fi/locations/${LOCATION_ID}/reservations.json?timeshift=-120&from=${fromStr}&to=${fetchTo}`;
        context.log('Fetching: ' + uri);

        const response = await fetch(uri);
        const json = await response.json();

        const seen = new Set();
        const filtered = [];
        for (const r of (Array.isArray(json) ? json : [])) {
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            const day = (r.start_date || '').slice(0, 10);
            if (day < fromStr || day > toStr) continue;
            // Same game detection as schedule.js (where it renders as blue "ev-game").
            const isGame = r.user_group?.name === 'Tilapäisvaraus';
            filtered.push({
                id: r.id,
                text: (r.text || '').trim(),
                start: r.start_date,
                end: r.end_date,
                durationMinutes: durationMinutes(r.start_date, r.end_date),
                userGroup: r.user_group?.name || null,
                isGame,
                recurring: !!r.recurring,
            });
        }

        filtered.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

        rangeCache.set(cacheKey, { data: filtered, timestamp: Date.now() });
        return { jsonBody: filtered };
    }
});
