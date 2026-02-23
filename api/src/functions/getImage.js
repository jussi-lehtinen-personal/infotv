const { app } = require("@azure/functions");
const fetch = require("node-fetch");

const imageCache = new Map();
const TTL = 24 * 60 * 60_000; // 24 h

app.http("getImage", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "getImage/{key}",   // <-- NEW
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

    const response = await fetch(uri);
    const buffer = await response.buffer();
    const contentType = response.headers.get("content-type") || "image/png";

    const headers = {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    };

    imageCache.set(cacheKey, { buffer, headers, timestamp: Date.now() });
    return { body: buffer, headers };
  },
});