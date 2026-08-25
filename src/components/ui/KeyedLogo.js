import { useState, useEffect } from "react";

// Remove a solid (near-)white background from a logo by flood-filling from the
// borders inward — so crests sit on a dark surface, not a white tile/circle.
// Transparent logos are untouched; interior white (text, teeth) is preserved
// because the fill stops at the logo's opaque edge. The result is also cropped to
// its content bounding box so every logo fills its box regardless of the padding
// baked into the source image. Returns a data-URL, or null if the canvas is
// tainted (cross-origin img without CORS → caller keeps the original src).
export function keyWhiteBg(img, threshold = 232) {
  try {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h), px = d.data;
    const near = (p) => px[p * 4] >= threshold && px[p * 4 + 1] >= threshold && px[p * 4 + 2] >= threshold;
    const seen = new Uint8Array(w * h), st = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const p = y * w + x;
      if (seen[p]) return;
      seen[p] = 1;
      if (near(p)) { px[p * 4 + 3] = 0; st.push(p); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st.length) {
      const p = st.pop(); const x = p % w, y = (p / w) | 0;
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
    ctx.putImageData(d, 0, 0);
    // Crop to the content bounding box (alpha > 16) so the logo fills its box.
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] > 16) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX) return c.toDataURL("image/png"); // fully transparent
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    if (cw === w && ch === h) return c.toDataURL("image/png"); // nothing to crop
    const cc = document.createElement("canvas");
    cc.width = cw; cc.height = ch;
    cc.getContext("2d").drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
    return cc.toDataURL("image/png");
  } catch {
    return null; // tainted canvas (raw cross-origin URL) → keep original
  }
}

// A crest with its white background keyed out + content-cropped. `src` must be
// same-origin for the keying to run (e.g. a /api/getImage-proxied URL); a raw
// cross-origin URL taints the canvas and we render the original untouched.
// `size` sets a square box; pass `className` (with object-fit) or `style` to fit
// other layouts.
export function KeyedLogo({ src, size, objectPosition = "center", className, style }) {
  const [out, setOut] = useState(src);
  useEffect(() => {
    setOut(src);
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { const url = keyWhiteBg(img); if (!cancelled && url) setOut(url); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  const sized = size != null ? { width: size, height: size, objectFit: "contain", objectPosition } : null;
  return <img src={out} alt="" className={className} style={{ ...sized, ...style }} />;
}
