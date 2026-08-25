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

// Flood-fill the near-white background inward from the borders. Returns a mask
// (0 = background-connected near-white, 1 = foreground). Interior white — logo
// text/rings, teeth, white jersey, even a near-white logo body behind a darker
// outline — stays foreground because the fill stops at the first non-white pixel.
function floodBackground(data, w, h, hard) {
  const N = w * h;
  const p = new Float64Array(N).fill(1);
  const seen = new Uint8Array(N);
  const st = [];
  const minc = (i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
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
  return p;
}

function cropToContent(img) {
  const { data, width: w, height: h } = img.bitmap;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 16) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX >= minX && (maxX - minX + 1 < w || maxY - minY + 1 < h)) img.crop(minX, minY, maxX - minX + 1, maxY - minY + 1);
}

// LOGO mode (tp=1): flat graphics. Flood-fill the white background, keep EVERYTHING
// else opaque (crisp edges; interior + near-white logo bodies preserved), crop. No
// guided filter / whiteness gate — those would erase a logo's white parts.
async function keyLogo(buffer, { hard = 236 } = {}) {
  if (!Jimp) return null;
  try {
    const img = await Jimp.read(buffer);
    const { data, width: w, height: h } = img.bitmap;
    const p = floodBackground(data, w, h, hard);
    for (let i = 0; i < w * h; i++) if (p[i] < 0.5) data[i * 4 + 3] = 0;
    cropToContent(img);
    return await img.getBufferAsync(Jimp.MIME_PNG);
  } catch { return null; }
}

// Grid distance from the background (multi-source BFS from every bg pixel). O(N).
function distFromBackground(p, w, h) {
  const N = w * h;
  const dist = new Int32Array(N).fill(0x7fffffff);
  const q = [];
  for (let i = 0; i < N; i++) if (p[i] < 0.5) { dist[i] = 0; q.push(i); }
  let head = 0;
  while (head < q.length) {
    const i = q[head++]; const x = i % w, y = (i / w) | 0; const d1 = dist[i] + 1;
    if (x > 0 && dist[i - 1] > d1) { dist[i - 1] = d1; q.push(i - 1); }
    if (x < w - 1 && dist[i + 1] > d1) { dist[i + 1] = d1; q.push(i + 1); }
    if (y > 0 && dist[i - w] > d1) { dist[i - w] = d1; q.push(i - w); }
    if (y < h - 1 && dist[i + w] > d1) { dist[i + w] = d1; q.push(i + w); }
  }
  return dist;
}

// Interior near-white blobs that stay SHALLOW (never reach farther than D from the
// background) are background seen through thin hair → remove them (set p=0). Blobs
// that reach DEEP (white jersey ads/logos, surrounded by a wide subject) are kept.
function removeShallowWhite(data, w, h, p, whiteLvl, D) {
  const N = w * h;
  const minc = (i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const dist = distFromBackground(p, w, h);
  const lab = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (lab[s] || p[s] < 0.5 || minc(s) < whiteLvl) continue;
    const comp = [s]; lab[s] = 1; let maxD = dist[s]; let head = 0;
    while (head < comp.length) {
      const i = comp[head++]; const x = i % w, y = (i / w) | 0;
      const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (lab[j] || p[j] < 0.5 || minc(j) < whiteLvl) continue;
        lab[j] = 1; comp.push(j); if (dist[j] > maxD) maxD = dist[j];
      }
    }
    if (maxD < D) for (const i of comp) p[i] = 0;
  }
}

// PHOTO mode (tp=2): people on a white studio bg. Classical known-background matting
// (no ML): flood-fill → remove shallow interior white (bg through hair; keeps deep
// jersey ads) → guided filter (soft, hair-following alpha) → whiteness-gate ONLY the
// background-connected pixels (so interior white/jersey stays) → foreground unmix
// (removes the light fringe) → crop.
async function keyPhoto(buffer, { hard = 236, r = 2, eps = 2e-4, distClean = 35 } = {}) {
  if (!Jimp) return null;
  try {
    const img = await Jimp.read(buffer);
    const { data, width: w, height: h } = img.bitmap;
    const N = w * h;
    const minc = (i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    const p = floodBackground(data, w, h, hard);
    if (distClean > 0) removeShallowWhite(data, w, h, p, 232, distClean);
    const I = new Float64Array(N);
    for (let i = 0; i < N; i++) I[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
    const q = guidedFilter(I, p, w, h, r, eps);
    for (let i = 0; i < N; i++) {
      const nw = Math.max(0, Math.min(1, (255 - minc(i)) / (255 - 230)));
      let a = q[i] * (p[i] >= 0.5 ? 1 : nw); a = a < 0 ? 0 : a > 1 ? 1 : a;
      if (a > 0.02) for (let c = 0; c < 3; c++) { const F = (data[i * 4 + c] - (1 - a) * 255) / a; data[i * 4 + c] = F < 0 ? 0 : F > 255 ? 255 : F; }
      data[i * 4 + 3] = Math.round(a * 255);
    }
    cropToContent(img);
    return await img.getBufferAsync(Jimp.MIME_PNG);
  } catch { return null; }
}

app.http("getImage", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "getImage/{key}",
  handler: async (request, context) => {
    const uri = request.query?.get("uri") || "";
    const key = request.params?.key || "";
    const tp = request.query?.get("tp"); // "1" = logo mode, "2" = photo mode

    if (!uri) return { status: 400, body: "Missing uri" };

    // Cache by FULL effective key (so different teams never collide); each
    // transparent mode is cached separately from the original + from each other.
    const cacheKey = `${key}|${uri}|${tp === "2" ? "photo" : tp === "1" ? "logo" : "raw"}`;

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
    if (tp === "1" || tp === "2") {
      const keyed = tp === "2" ? await keyPhoto(buffer) : await keyLogo(buffer);
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
