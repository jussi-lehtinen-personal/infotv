const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment');

app.http('schedule', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const now = new Date()

        var startOfWeek = new Date()
        startOfWeek.setDate(now.getDate() - (now.getDay() + 6) % 7);

        const endOfWeek = new Date(now.getFullYear(), now.getMonth(), startOfWeek.getDate() + 7)

        var formattedStart = moment(startOfWeek).format('YYYY-MM-DD')
        var formattedEnd = moment(endOfWeek).format('YYYY-MM-DD')

        const server = 'https://valkeakoski.tilamisu.fi'
        const requestUri = '/fi/locations/836/reservations.json?timeshift=-120&from=' + formattedStart + '&to=' + formattedEnd

        console.log(server + requestUri)
        const response = fetch(server + requestUri)

        return { body: (await response).body };
    }
});
