const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment');

// Week-level cache: weekStart → { data, timestamp }
const weekCache = new Map();
const TTL_CURRENT = 15 * 60_000;  // 15 min – live week
const TTL_OTHER   = 60 * 60_000;  // 1 h   – past/future weeks

const getMonday = (date) => {
    const d = new Date(date);
    while (d.getDay() !== 1) {
        d.setDate(d.getDate() - 1);
    }
    return d;
};

app.http('schedule', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        let now = new Date();
        if (request.query?.has('date')) {
            const parsed = new Date(request.query.get('date'));
            if (!isNaN(parsed)) now = parsed;
        }

        const startOfWeek = getMonday(now);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        const weekKey = moment(startOfWeek).format('YYYY-MM-DD');
        const currentWeekKey = moment(getMonday(new Date())).format('YYYY-MM-DD');
        const ttl = weekKey === currentWeekKey ? TTL_CURRENT : TTL_OTHER;

        const cached = weekCache.get(weekKey);
        if (cached && (Date.now() - cached.timestamp) < ttl) {
            context.log('Cache hit for week: ' + weekKey);
            return { body: cached.data, headers: { 'Content-Type': 'application/json' } };
        }

        const formattedStart = moment(startOfWeek).format('YYYY-MM-DD');
        const formattedEnd = moment(endOfWeek).format('YYYY-MM-DD');

        const server = 'https://valkeakoski.tilamisu.fi';
        const requestUri = '/fi/locations/836/reservations.json?timeshift=-120&from=' + formattedStart + '&to=' + formattedEnd;

        context.log('Fetching: ' + server + requestUri);
        const response = await fetch(server + requestUri);
        const data = await response.text();

        weekCache.set(weekKey, { data, timestamp: Date.now() });

        return { body: data, headers: { 'Content-Type': 'application/json' } };
    }
});
