const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment'); // require

const getMonday = () => {
    const dt = new Date();
    const day = dt.getDay()
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(dt.setDate(diff));
}

function addWeeks(date, weeks) {
    date.setDate(date.getDate() + 7 * weeks);
    return date;
}

app.http('schedule', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const now = new Date()
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1)
        const endOfWeek = new Date(now.getFullYear(), now.getMonth(), startOfWeek.getDate() + 7)
        console.log(startOfWeek)


        var formattedStart = moment(startOfWeek).format('YYYY-MM-DD')
        var formattedEnd = moment(endOfWeek).format('YYYY-MM-DD')

        const server = 'https://valkeakoski.tilamisu.fi'
        const requestUri = '/fi/locations/836/reservations.json?timeshift=-120&from=' + formattedStart + '&to=' + formattedEnd

        console.log(server + requestUri)
        const response = fetch(server + requestUri)

        //const name = request.query.get('name') || await request.text() || 'world';

        return { body: (await response).body };
    }
});
