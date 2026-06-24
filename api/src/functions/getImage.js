const { app } = require("@azure/functions");
const fetch = require("node-fetch");

// Team logos live on tulospalvelu, whose WAF blocks our Azure egress (it returns
// a 919-byte HTML block page instead of the PNG). So we fetch the image through
// the Cloudflare Worker, same as getGames/getTeams. Response is cached here.

const imageCache = new Map();
const TTL = 24 * 60 * 60_000; // 24 h

// Public Worker URL (not a secret); env can override if it ever moves.
const PROXY_URL = process.env.TP_PROXY_URL || "https://gamezone.zapmies.workers.dev";
const PROXY_KEY = process.env.TP_PROXY_KEY; // optional shared secret

app.http("getImage", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "getImage/{key}",
  handler: async (request, context) => {
    const uri = request.query?.get("uri") || "";
    const key = request.params?.key || "";

    if (!uri) return { status: 400, body: "Missing uri" };

    // Cache by FULL effective key (so different teams never collide)
    const cacheKey = `${key}|${uri}`;

    const cached = imageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < TTL) {
      return { body: cached.buffer, headers: cached.headers };
    }

    const workerUrl = `${PROXY_URL}/getImage?uri=${encodeURIComponent(uri)}`;
    const response = await fetch(workerUrl, {
      headers: PROXY_KEY ? { "x-proxy-key": PROXY_KEY } : {},
    });
    const contentType = response.headers.get("content-type") || "";

    // Don't cache/serve an error (e.g. a JSON error or HTML block page) as an image.
    if (!response.ok || !contentType.startsWith("image/")) {
      context.log(`getImage upstream not an image (status=${response.status}, type=${contentType})`);
      return { status: 502, body: "Image fetch failed" };
    }

    const buffer = await response.buffer();
    const headers = {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    };

    imageCache.set(cacheKey, { buffer, headers, timestamp: Date.now() });
    return { body: buffer, headers };
  },
});
