const { app } = require('@azure/functions');
const fetch = require('node-fetch');

// TEMPORARY diagnostic endpoint. Reveals this function's outbound (egress) IP
// and exactly what the tulospalvelu landing page returns from here, so we can
// confirm: which IP the SWA function egresses from, whether it is stable across
// invocations, and whether that specific IP is the thing being blocked.
// Delete once the tulospalvelu access issue is resolved.

const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function lookupIp(service, parse) {
    try {
        const r = await fetch(service, { timeout: 10000 });
        return parse(await r.text());
    } catch (e) {
        return `err(${service}): ${e.message}`;
    }
}

app.http('diag', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const out = { ts: new Date().toISOString() };

        // Egress IP from two independent services (in case one is also blocked).
        out.egressIp_ipify = await lookupIp('https://api.ipify.org', (t) => t.trim());
        out.egressIp_aws = await lookupIp('https://checkip.amazonaws.com', (t) => t.trim());

        // What does the tulospalvelu landing page return from this IP?
        try {
            const r = await fetch('https://tulospalvelu.leijonat.fi/?lang=fi', {
                headers: { 'User-Agent': UA, Accept: 'text/html' },
                timeout: 15000,
            });
            const body = await r.text();
            out.tulospalvelu = {
                status: r.status,
                bytes: body.length,
                tokenPresent: /id="xsrf-token"/.test(body),
                server: r.headers.get('server'),
                via: r.headers.get('via'),
                xCache: r.headers.get('x-cache'),
                xAmzCfId: r.headers.get('x-amz-cf-id'),
                snippet: body.slice(0, 180).replace(/\s+/g, ' '),
            };
        } catch (e) {
            out.tulospalvelu = { error: e.message };
        }

        return { jsonBody: out };
    },
});
