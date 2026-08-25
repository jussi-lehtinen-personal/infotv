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

// Remove a solid (near-)white background and return a transparent, content-cropped
// PNG. Works for flat logos AND people photos (studio white bg). Pipeline:
//   1) flood-fill the near-white background inward from the borders (interior white —
//      team text, teeth — is preserved because the fill stops at the opaque edge),
//   2) soft fringe: light edge pixels touching the cleared bg fade by how white they are,
//   3) erode 1px: drop the outermost ring so no light halo survives (esp. around hair),
//   4) feather: 1px alpha blur for a smooth, anti-aliased edge,
//   5) crop to the content bounding box.
// Returns a PNG buffer, or null to fall back to the original.
async function keyWhiteTransparent(buffer, { hard = 236, soft = 208 } = {}) {
  if (!Jimp) return null;
  try {
    const img = await Jimp.read(buffer);
    const { data, width: w, height: h } = img.bitmap;
    const A = (p) => p * 4 + 3;
    const minc = (p) => Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    const alphaSnapshot = () => { const a = new Uint8Array(w * h); for (let p = 0; p < w * h; p++) a[p] = data[A(p)]; return a; };
    const clear = (a, x, y) => x >= 0 && y >= 0 && x < w && y < h && a[y * w + x] === 0;

    // 1) flood-fill definite background (min channel >= hard) from the borders
    const seen = new Uint8Array(w * h);
    const st = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const p = y * w + x;
      if (seen[p]) return;
      seen[p] = 1;
      if (minc(p) >= hard) { data[A(p)] = 0; st.push(p); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st.length) {
      const p = st.pop();
      const x = p % w, y = (p / w) | 0;
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }

    // 2) soft fringe on light edge pixels adjacent to the cleared background
    {
      const a = alphaSnapshot();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x; if (a[p] === 0) continue;
        if (clear(a, x - 1, y) || clear(a, x + 1, y) || clear(a, x, y - 1) || clear(a, x, y + 1)) {
          const m = minc(p); if (m > soft) data[A(p)] = Math.round(255 * (255 - m) / (255 - soft));
        }
      }
    }

    // 3) erode 1px — kill the remaining ~1px light halo ring
    {
      const a = alphaSnapshot();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x; if (a[p] === 0) continue;
        if (clear(a, x - 1, y) || clear(a, x + 1, y) || clear(a, x, y - 1) || clear(a, x, y + 1)) data[A(p)] = 0;
      }
    }

    // 4) feather — 1px separable box blur of the alpha channel
    {
      const a = alphaSnapshot();
      const t = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let d = -1; d <= 1; d++) { const xx = x + d; if (xx < 0 || xx >= w) continue; s += a[y * w + xx]; n++; } t[y * w + x] = s / n; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let d = -1; d <= 1; d++) { const yy = y + d; if (yy < 0 || yy >= h) continue; s += t[yy * w + x]; n++; } data[A(y * w + x)] = Math.round(s / n); }
    }

    // 5) crop to the content bounding box
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[A(y * w + x)] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    if (maxX >= minX && (maxX - minX + 1 < w || maxY - minY + 1 < h)) img.crop(minX, minY, maxX - minX + 1, maxY - minY + 1);
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
