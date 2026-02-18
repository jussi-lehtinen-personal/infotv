const { app } = require('@azure/functions');
const fetch = require("node-fetch");

const imageCache = new Map();
const TTL = 24 * 60 * 60_000; // 24 h

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

        if (uri === "") {
            return { body: "Invalid request: " + uri };
        }

        const cached = imageCache.get(uri);
        if (cached && (Date.now() - cached.timestamp) < TTL) {
            context.log('Image cache hit: ' + uri);
            return { body: cached.buffer, headers: cached.headers };
        }

        context.log('Image cache miss: ' + uri);
        const response = await fetch(uri);
        const buffer = await response.buffer();
        const contentType = response.headers.get('content-type') || 'image/png';

        imageCache.set(uri, { buffer, headers: { 'content-type': contentType }, timestamp: Date.now() });

        return { body: buffer, headers: { 'content-type': contentType } };
    }
});
