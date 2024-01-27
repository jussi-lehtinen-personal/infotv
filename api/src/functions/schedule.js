const { app } = require('@azure/functions');
const fetch = require("node-fetch");

app.http('schedule', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        const server = 'https://valkeakoski.tilamisu.fi'
        const requestUri = '/fi/locations/836/reservations.json?timeshift=-120&from=2024-01-15&to=2024-01-22'

        const response = fetch(server + requestUri)

        //const name = request.query.get('name') || await request.text() || 'world';

        return { body: (await response).body };
    }
});
