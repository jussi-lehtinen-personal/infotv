const { app } = require("@azure/functions");
const fetch = require("node-fetch");

// Team logos live on tulospalvelu, whose WAF blocks our Azure egress (it returns
// a 919-byte HTML block page instead of the PNG). So we fetch the image through
// the Cloudflare Worker, same as getGames/getTeams. Response is cached here.
//
// ?tp=1 returns a TRANSPARENT variant: the solid (near-)white background is keyed
// out server-side (once, cached) so crests can sit on a dark surface without a
// white tile — and without the client having to canvas-process it (no white flash).

let Jimp = null;
try { Jimp = require("jimp"); } catch { /* keying disabled → serve original */ }

const imageCache = new Map();
const TTL = 24 * 60 * 60_000; // 24 h

// Public Worker URL (not a secret); env can override if it ever moves.
const PROXY_URL = process.env.TP_PROXY_URL || "https://gamezone.zapmies.workers.dev";
const PROXY_KEY = process.env.TP_PROXY_KEY; // optional shared secret

// Flood-fill the near-white background to transparent from the borders inward
// (interior white — team text, teeth — is preserved because the fill stops at the
// logo's opaque edge), then crop to the content bounding box so the logo fills its
// frame. Returns a transparent PNG buffer, or null to fall back to the original.
async function keyWhiteTransparent(buffer, threshold = 232) {
  if (!Jimp) return null;
  try {
    const img = await Jimp.read(buffer);
    const { data, width: w, height: h } = img.bitmap;
    const near = (p) => data[p * 4] >= threshold && data[p * 4 + 1] >= threshold && data[p * 4 + 2] >= threshold;
    const seen = new Uint8Array(w * h);
    const st = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const p = y * w + x;
      if (seen[p]) return;
      seen[p] = 1;
      if (near(p)) { data[p * 4 + 3] = 0; st.push(p); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st.length) {
      const p = st.pop();
      const x = p % w, y = (p / w) | 0;
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 16) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX >= minX && (maxX - minX + 1 < w || maxY - minY + 1 < h)) {
      img.crop(minX, minY, maxX - minX + 1, maxY - minY + 1);
    }
    return await img.getBufferAsync(Jimp.MIME_PNG);
  } catch {
    return null; // decode/encode failed → caller serves the original
  }
}

app.http("getImage", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "getImage/{key}",
  handler: async (request, context) => {
    const uri = request.query?.get("uri") || "";
    const key = request.params?.key || "";
    const transparent = request.query?.get("tp") === "1";

    if (!uri) return { status: 400, body: "Missing uri" };

    // Cache by FULL effective key (so different teams never collide); the
    // transparent variant is cached separately from the original.
    const cacheKey = `${key}|${uri}|${transparent ? "tp" : "raw"}`;

    const cached = imageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < TTL) {
      return { body: cached.buffer, headers: cached.headers };
    }

    // Whitelist the image hosts we serve (avoid an open SSRF proxy).
    const host = (() => { try { return new URL(uri).hostname.toLowerCase(); } catch { return ""; } })();
    const isTulospalvelu = /(^|\.)tulospalvelu\.leijonat\.fi$/.test(host);
    const isJopox = /(^|\.)jopox\.fi$/.test(host);
    if (!isTulospalvelu && !isJopox) return { status: 400, body: "Host not allowed" };

    // tulospalvelu's WAF blocks our Azure egress → fetch via the Cloudflare Worker.
    // jopox (player photos) is directly reachable, so fetch it straight.
    const response = isTulospalvelu
      ? await fetch(`${PROXY_URL}/getImage?uri=${encodeURIComponent(uri)}`, { headers: PROXY_KEY ? { "x-proxy-key": PROXY_KEY } : {} })
      : await fetch(uri);
    const contentType = response.headers.get("content-type") || "";

    // Don't cache/serve an error (e.g. a JSON error or HTML block page) as an image.
    if (!response.ok || !contentType.startsWith("image/")) {
      context.log(`getImage upstream not an image (status=${response.status}, type=${contentType})`);
      return { status: 502, body: "Image fetch failed" };
    }

    let buffer = await response.buffer();
    let outType = contentType;
    if (transparent) {
      const keyed = await keyWhiteTransparent(buffer);
      if (keyed) { buffer = keyed; outType = "image/png"; }
    }

    const headers = {
      "content-type": outType,
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    };

    imageCache.set(cacheKey, { buffer, headers, timestamp: Date.now() });
    return { body: buffer, headers };
  },
});
