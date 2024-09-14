const { app } = require('@azure/functions');
const fetch = require("node-fetch");

app.http('getImage', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Http function processed request for url "${request.url}"`);

        var uri = ""
        if (request.query) {
            if (request.query.has('uri')) {
                uri = request.query.get('uri')
            }
        }

        if (uri !== "") {
            const response = await fetch(uri)
            return { body: (await response).body };
        }

        return { body: "Invalid request: " + uri };
    }
});
