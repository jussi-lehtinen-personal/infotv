const { app } = require('@azure/functions');
const fetch = require("node-fetch");

// Club news — the SINGLE SOURCE OF TRUTH is kiekko-ahma.fi (no local JSON to
// maintain). The front page embeds the latest news in __NEXT_DATA__
// props.pageProps.news (same read pattern as getPartners' sponsors). We map each
// item to the shape NewsCard expects + cache 6 h. Azure reaches kiekko-ahma.fi
// directly (not behind the tulospalvelu WAF). See reference_jopox_kiekkoahma +
// project_content_management.
//
// news item fields: { id, date, title, ingress, text(HTML), imageId,
//   imageExtension, slug, ... }. ingress is usually null → derive a short excerpt
//   from text. Image = Jopox imagebank sized variant ("<id>_medium.png").

const TTL = 6 * 60 * 60_000; // 6 h
let cache = null;

const BASE = 'https://www.kiekko-ahma.fi';
const IMAGEBANK = 'https://static.jopox.fi/kiekko-ahma/imagebank';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const decodeEntities = (s) =>
    s == null
        ? ''
        : String(s)
              .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
              .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&nbsp;/g, ' ')
              .trim();

// Strip HTML → a short plain-text excerpt for the card (ingress is usually null).
function excerpt(html, max = 90) {
    const txt = decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!txt) return null;
    // Some news bodies are just an image + a PDF attachment → the only "text" is a
    // bare filename ("Mainosesite.pdf"); not a useful description.
    if (/^[\w\s.,–—&:()-]*\.(pdf|docx?|xlsx?|pptx?|zip|rtf)$/i.test(txt)) return null;
    if (txt.length <= max) return txt;
    const cut = txt.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    return (sp > 40 ? cut.slice(0, sp) : cut).trim() + '…';
}

function mapNews(n) {
    const image = n.imageId
        ? `${IMAGEBANK}/${n.imageId}_medium${n.imageExtension || '.png'}`
        : null;
    return {
        id: String(n.id),
        title: decodeEntities(n.title),
        description: (n.ingress && decodeEntities(n.ingress)) || excerpt(n.text),
        date: n.date || null,
        image,
        url: `${BASE}/uutiset/${n.id}/${n.slug || ''}`,
    };
}

app.http('getNews', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            if (cache && (Date.now() - cache.timestamp) < TTL) {
                return { jsonBody: cache.data };
            }

            const res = await fetch(`${BASE}/`, {
                headers: { 'User-Agent': UA, Accept: 'text/html' },
            });
            if (!res.ok) throw new Error(`kiekko-ahma.fi -> HTTP ${res.status}`);
            const html = await res.text();

            const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (!m) throw new Error('__NEXT_DATA__ not found');
            const pp = JSON.parse(m[1]).props?.pageProps || {};

            const news = (pp.news || [])
                .map(mapNews)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            cache = { data: news, timestamp: Date.now() };
            return { jsonBody: news };
        } catch (err) {
            context.log('getNews failed: ' + (err && err.stack || err));
            return { status: 500, jsonBody: { error: String(err && err.message || err) } };
        }
    },
});
