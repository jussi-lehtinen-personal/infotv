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

// O(N) box filter: mean over a (2r+1)² window via a summed-area table.
function boxfilter(src, w, h, r) {
  const W = w + 1;
  const integ = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0;
    for (let x = 0; x < w; x++) { rs += src[y * w + x]; integ[(y + 1) * W + (x + 1)] = integ[y * W + (x + 1)] + rs; }
  }
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w - 1, x + r), y1 = Math.min(h - 1, y + r);
    const s = integ[(y1 + 1) * W + (x1 + 1)] - integ[y0 * W + (x1 + 1)] - integ[(y1 + 1) * W + x0] + integ[y0 * W + x0];
    out[y * w + x] = s / ((x1 - x0 + 1) * (y1 - y0 + 1));
  }
  return out;
}

// Guided filter (He, Sun, Tang 2010): edge-preserving refinement of mask `p`
// using guide `I`. Turns a hard mask into a soft matte that follows image edges.
function guidedFilter(I, p, w, h, r, eps) {
  const N = w * h;
  const mI = boxfilter(I, w, h, r), mp = boxfilter(p, w, h, r);
  const Ip = new Float64Array(N); for (let i = 0; i < N; i++) Ip[i] = I[i] * p[i];
  const mIp = boxfilter(Ip, w, h, r);
  const II = new Float64Array(N); for (let i = 0; i < N; i++) II[i] = I[i] * I[i];
  const mII = boxfilter(II, w, h, r);
  const a = new Float64Array(N), b = new Float64Array(N);
  for (let i = 0; i < N; i++) { const cov = mIp[i] - mI[i] * mp[i], varI = mII[i] - mI[i] * mI[i]; a[i] = cov / (varI + eps); b[i] = mp[i] - a[i] * mI[i]; }
  const ma = boxfilter(a, w, h, r), mb = boxfilter(b, w, h, r);
  const q = new Float64Array(N); for (let i = 0; i < N; i++) q[i] = ma[i] * I[i] + mb[i];
  return q;
}

// Remove a solid (near-)white background → transparent, content-cropped PNG.
// Classical known-background matting (no ML), works for flat logos AND people
// photos (fine hair) on a white studio bg:
//   1) flood-fill the near-white background from the borders → binary mask
//      (interior white — team text, teeth, white jersey — stays, the fill stops
//      at the first non-white pixel),
//   2) GUIDED FILTER (r=2) the mask with luminance as guide → soft edge that
//      follows the image (recovers wispy hair) while keeping logo edges crisp,
//   3) whiteness gate: scale alpha by how non-white the pixel is, so pure-white
//      background gets alpha 0 (white-bg matting has no halo-free alpha otherwise),
//   4) foreground unmix (F = (C − (1−α)·white)/α) so soft edges show the real
//      colour, not a light fringe,
//   5) crop to the content bounding box.
// Returns a PNG buffer, or null to fall back to the original.
async function keyWhiteTransparent(buffer, { hard = 236, r = 2, eps = 2e-4 } = {}) {
  if (!Jimp) return null;
  try {
    const img = await Jimp.read(buffer);
    const { data, width: w, height: h } = img.bitmap;
    const N = w * h;
    const minc = (i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);

    // 1) flood-fill near-white background from the borders → mask p (0 bg, 1 fg)
    const p = new Float64Array(N).fill(1);
    const seen = new Uint8Array(N);
    const st = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const q = y * w + x;
      if (seen[q]) return;
      seen[q] = 1;
      if (minc(q) >= hard) { p[q] = 0; st.push(q); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st.length) { const q = st.pop(); const x = q % w, y = (q / w) | 0; push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1); }

    // 2) guided-filter the mask with luminance as guide
    const I = new Float64Array(N);
    for (let i = 0; i < N; i++) I[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
    const q = guidedFilter(I, p, w, h, r, eps);

    // 3) whiteness gate + 4) foreground unmix (bg is known white = 255)
    for (let i = 0; i < N; i++) {
      const nw = Math.max(0, Math.min(1, (255 - minc(i)) / (255 - 230)));
      let a = q[i] * nw; a = a < 0 ? 0 : a > 1 ? 1 : a;
      if (a > 0.02) for (let c = 0; c < 3; c++) { const F = (data[i * 4 + c] - (1 - a) * 255) / a; data[i * 4 + c] = F < 0 ? 0 : F > 255 ? 255 : F; }
      data[i * 4 + 3] = Math.round(a * 255);
    }

    // 5) crop to the content bounding box
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
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
