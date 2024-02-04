const { app } = require('@azure/functions');
const fetch = require("node-fetch");
var moment = require('moment');

const getMonday = (date) => {
    if (date.getDay() === 1) {
        return date
    }

    while (date.getDay() !== 1) {
        date.setDate(date.getDate() - 1)
    }

    return date
}

app.http('schedule', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const now = new Date()

        const startOfWeek = getMonday(now)        
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
