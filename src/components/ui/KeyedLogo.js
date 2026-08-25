// A team crest <img>. The white background is keyed out (and the logo cropped to
// its content) SERVER-SIDE by /api/getImage?tp=1 — see logoProxy in Util.js — so
// this just renders the already-transparent crest: no client canvas, no white
// flash. `size` sets a square box; `objectPosition`/`className`/`style` tune the fit.
export function KeyedLogo({ src, size, objectPosition = "center", className, style }) {
  const sized = size != null ? { width: size, height: size, objectFit: "contain", objectPosition } : null;
  return <img src={src} alt="" className={className} style={{ ...sized, ...style }} />;
}
