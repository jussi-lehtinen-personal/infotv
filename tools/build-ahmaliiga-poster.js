/**
 * Builds the standalone Ahmaliiga poster: one self-contained HTML file that needs
 * nothing from the Gamezone app — no React, no dev server, no network. Fonts,
 * images and the QR are all inlined, so it prints the same from a USB stick on a
 * machine that has never heard of this repo.
 *
 *   node tools/build-ahmaliiga-poster.js
 *   → public/print/ahmaliiga-poster.html
 *
 * Re-run it after changing the address, the crest or the copy. The output is
 * committed, so nobody needs Node to use the poster — this script only exists so
 * the file can be regenerated instead of hand-edited.
 *
 * To check a layout change without printing anything, let Chrome render it:
 *
 *   chrome --headless=new --disable-gpu --window-size=794,1123  *     --screenshot=poster.png file:///<abs path>/ahmaliiga-poster.html
 *
 * and --print-to-pdf for what the printer actually gets (one A4 page, no blank
 * second sheet).
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { QRCodeSVG } = require("qrcode.react");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public", "print", "ahmaliiga-poster.html");

const TARGET_URL = "https://gamezone.kiekko-ahma.fi/ahmaliiga";
const URL_HOST = "gamezone.kiekko-ahma.fi";
const URL_PATH = "/ahmaliiga";
// Broken by hand rather than left to the browser: at any size that fills the sheet
// the natural wrap strands "pisteitä" alone on the second line.
const HEADLINE_LEAD = "Kokoa unelmajoukkueesi ja";
const HEADLINE_ACCENT = "kerää pisteitä";

// A4 portrait at 96 dpi. CSS px are 1/96 in by spec, so this sheet prints as exact
// A4 under `@page { size: A4; margin: 0 }` with no scaling in the print path.
const SHEET_W = 794;
const SHEET_H = 1123;

// The crest and the QR are the poster, and they are sized to LOOK equal, which is
// not the same as being equal: ahmaliiga_wordmark.png is a 1024x1024 square whose
// artwork fills only 850x938 of it, so its box needs to be ~1.2x the QR for the two
// to read the same width. That transparent margin also eats vertical space, which
// is why everything else on the sheet is kept tight.
const QR_SIZE = 372; // ≈98 mm printed
const CREST_W = 446; // ≈370 px of visible crest, i.e. the QR's width

const ORANGE = "#F06E1E";

function dataUri(buffer, mime) {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file));
}

/** Lossless PNG re-encode. The source crest is a 988 kB export; this is 231 kB of
 *  the exact same pixels, and base64 inflates whatever it is given by a third. */
function squeeze(file) {
  return sharp(read(file)).png({ compressionLevel: 9, effort: 10 }).toBuffer();
}

async function build() {
const bebas = dataUri(
  read("node_modules/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2"),
  "font/woff2"
);
const crest = dataUri(await squeeze("public/infotv/ahmaliiga_wordmark.png"), "image/png");
const claw = dataUri(await squeeze("public/infotv/claw.png"), "image/png");

// A path-based SVG, so the QR is resolution-independent — the 296x296 png the TV ad
// uses would be ~77 dpi at this size.
const qrSvg = renderToStaticMarkup(
  React.createElement(QRCodeSVG, {
    value: TARGET_URL,
    size: QR_SIZE,
    level: "Q",
    bgColor: "#FFFFFF",
    fgColor: "#0E0E0F",
  })
);

const html = `<!doctype html>
<html lang="fi" data-theme="ink">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ahmaliiga — juliste</title>
<style>
@font-face {
  font-family: 'Bebas Neue';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(${bebas}) format('woff2');
}

:root {
  --orange: ${ORANGE};
  --bg: #0B0B0C;
  --text: #FFFFFF;
  --qr-card: #F4F4F4;
  --qr-border: transparent;
  --claw-opacity: 0.05;
  --ember: 1;
}
html[data-theme="paper"] {
  --bg: #FFFFFF;
  --text: #0E0E0F;
  --qr-card: #FFFFFF;
  --qr-border: #D7D7DC;
  --claw-opacity: 0.06;
  --ember: 0;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: #141416;
  color: #F4F4F4;
  font-family: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
}

/* ── Toolbar (screen only) ── */
.tools {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 20px;
  background: #1C1C1F;
  border-bottom: 1px solid rgba(255,255,255,.12);
}
.tools-label { font-family: 'Bebas Neue', sans-serif; font-size: 26px; letter-spacing: .04em; }
.tools-meta { font-size: 13px; color: rgba(255,255,255,.55); }
.hint {
  flex-basis: 100%;
  font-size: 12.5px;
  line-height: 1.45;
  color: rgba(255,255,255,.55);
  max-width: 660px;
}
.btn {
  appearance: none;
  border: 1px solid rgba(255,255,255,.2);
  border-radius: 9px;
  background: transparent;
  color: #F4F4F4;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  padding: 9px 18px;
  cursor: pointer;
}
.btn--primary { background: var(--orange); border-color: var(--orange); color: #fff; }

/* ── Sheet ── */
.viewport { display: flex; justify-content: center; padding: 24px 24px 48px; }
.sheet {
  position: relative;
  width: ${SHEET_W}px;
  height: ${SHEET_H}px;
  flex-shrink: 0;
  overflow: hidden;
  padding: 40px 54px 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg);
  box-shadow: 0 24px 60px rgba(0,0,0,.5);
  /* Without this a browser drops the dark background and the orange on print. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* Scale the preview down on a screen too small for a full A4 sheet. The print
   rules below undo it, so paper is never affected. */
@media (max-width: 880px) {
  .viewport { padding: 16px 0 32px; }
  .sheet { transform: scale(calc((100vw - 24px) / ${SHEET_W})); transform-origin: top center; }
}

.bg-radial, .bg-glow { position: absolute; opacity: var(--ember); }
.bg-radial {
  inset: 0;
  background: radial-gradient(62% 46% at 50% 30%, #3A2415 0%, #17130F 44%, #0B0B0C 78%);
}
.bg-glow {
  left: -170px;
  top: 20px;
  width: 760px;
  height: 640px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(240,110,30,0.28) 0%, rgba(240,110,30,0.07) 42%, rgba(240,110,30,0) 70%);
  filter: blur(18px);
}
.claw {
  position: absolute;
  top: -70px;
  right: -90px;
  width: 460px;
  transform: rotate(10deg);
  opacity: var(--claw-opacity);
}

.crest {
  position: relative;
  width: ${CREST_W}px;
  height: auto;
  filter: drop-shadow(0 0 54px rgba(240,110,30,0.5)) drop-shadow(0 18px 40px rgba(0,0,0,0.65));
}
html[data-theme="paper"] .crest { filter: drop-shadow(0 10px 26px rgba(14,14,15,0.18)); }

.headline {
  position: relative;
  align-self: stretch;
  margin-top: 16px;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 54px;
  line-height: 0.96;
  letter-spacing: 0.03em;
  text-align: center;
  color: var(--text);
}
.headline .line { white-space: nowrap; }
.headline .accent { color: var(--orange); }

.qr-card {
  position: relative;
  margin-top: auto;
  padding: 14px;
  border-radius: 16px;
  border: 2px solid var(--qr-border);
  background: var(--qr-card);
  display: flex;
}
.qr-card svg { display: block; }

/* Full sheet width, so the address never has to wrap. */
.url {
  position: relative;
  align-self: stretch;
  margin-top: 18px;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 36px;
  line-height: 1;
  letter-spacing: 0.02em;
  text-align: center;
  color: var(--text);
}
.url .path { color: var(--orange); }

@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; overflow: hidden; }
  .tools { display: none !important; }
  .viewport { display: block; padding: 0; }
  /* Pinned to the physical page box, not ${SHEET_W}x${SHEET_H} px. A4 is
     793.7x1122.5 px, so the px sheet is a hair taller than the page and Chrome
     would spill a blank second sheet out of the printer. The 0.3 px the artwork
     loses is clipped by the sheet's own overflow:hidden. */
  .sheet {
    width: 210mm !important;
    height: 297mm !important;
    transform: none !important;
    box-shadow: none !important;
  }
}
</style>
</head>
<body>

<div class="tools">
  <span class="tools-label">Ahmaliiga-juliste</span>
  <span class="tools-meta">A4 pysty</span>
  <button type="button" class="btn btn--primary" onclick="window.print()">Tulosta</button>
  <button type="button" class="btn" id="theme">Vaalea versio</button>
  <div class="hint">
    Tulostusasetuksista paperikooksi A4 ja reunuksiksi "Ei mitään", muuten selain kutistaa arkin.
    Vaalea versio säästää väriä tavallisessa toimistotulostimessa; tumma kannattaa teettää painossa.
    Tämä tiedosto toimii ilman verkkoyhteyttä — kuvat, fontti ja QR-koodi ovat sen sisällä.
  </div>
</div>

<div class="viewport">
  <div class="sheet">
    <div class="bg-radial"></div>
    <div class="bg-glow"></div>
    <img class="claw" src="${claw}" alt="">

    <img class="crest" src="${crest}" alt="Ahmaliiga">

    <div class="headline">
      <div class="line">${HEADLINE_LEAD}</div>
      <div class="line accent">${HEADLINE_ACCENT}</div>
    </div>

    <div class="qr-card">${qrSvg}</div>

    <div class="url">${URL_HOST}<span class="path">${URL_PATH}</span></div>
  </div>
</div>

<script>
  var root = document.documentElement;
  var button = document.getElementById("theme");
  button.addEventListener("click", function () {
    var paper = root.getAttribute("data-theme") === "paper";
    root.setAttribute("data-theme", paper ? "ink" : "paper");
    button.textContent = paper ? "Vaalea versio" : "Tumma versio";
  });
</script>

</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, "utf8");
console.log(`${path.relative(ROOT, OUT)} — ${(html.length / 1024).toFixed(0)} kB`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
