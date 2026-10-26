import React, { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useExportPng } from "../hooks/useExportPng";
import { FEATURES } from "./infotv/ahmaliiga";
import "@fontsource/bebas-neue";

/**
 * Printable Ahmaliiga poster (A4 portrait) — the paper sibling of the 1920x1080
 * signage ad at /infotv/ahmaliiga. Same artwork and copy, re-cut for a wall next
 * to the kiosk, and built around a QR big enough to scan from a few metres.
 *
 * The sheet is authored in a fixed 794x1123 px box. CSS px are 1/96 in by spec,
 * so that box prints as exact A4 under `@page { size: A4; margin: 0 }` with no
 * scaling anywhere in the print path — the on-screen preview is the only thing
 * that is transformed, and `@media print` drops that transform.
 *
 * Two outputs:
 *   - Tulosta  → straight to the printer / "Save as PDF"
 *   - Lataa PNG → the same sheet rasterised at 300 dpi (2481x3509), i.e. a file a
 *     print shop can blow up to A3/A2 without it going soft.
 *
 * The QR is drawn as SVG (qrcode.react), not the 296x296 png the TV ad uses, so
 * it stays crisp at any physical size.
 */

const SHEET_W = 794; // A4 portrait at 96 dpi
const SHEET_H = 1123;
const EXPORT_DPI = 300;
const EXPORT_RATIO = EXPORT_DPI / 96; // 3.125 → 2481x3509 px

const TARGET_URL = "https://gamezone.kiekko-ahma.fi/ahmaliiga";
const URL_HOST = "gamezone.kiekko-ahma.fi";
const URL_PATH = "/ahmaliiga";

const ORANGE = "#F06E1E";
const BEBAS = "var(--font-family-display)";
const BARLOW = "var(--font-family-base)";
const EXPORT_FONTS = ["400 62px 'Bebas Neue'", "700 19px 'Barlow'", "500 19px 'Barlow'"];

const QR_SIZE = 236; // ≈62 mm printed — reads from several metres

// Ink is the brand look; Paper is the toner-friendly cut for an office printer,
// which also sidesteps the white edge a borderless-incapable printer leaves.
const THEMES = {
  ink: {
    label: "Tumma",
    bg: "#0B0B0C",
    ember: true,
    text: "#FFFFFF",
    body: "#B5B5B5",
    kicker: "#9A9A9A",
    divider: "#3C3C40",
    qrCard: "#F4F4F4",
    qrBorder: "transparent",
    bar: "#141414",
    barText: "#C3C3C3",
    clawOpacity: 0.05,
  },
  paper: {
    label: "Vaalea",
    bg: "#FFFFFF",
    ember: false,
    text: "#0E0E0F",
    body: "#53535A",
    kicker: "#7A7A82",
    divider: "#D7D7DC",
    qrCard: "#FFFFFF",
    qrBorder: "#D7D7DC",
    bar: "#F4F4F5",
    barText: "#53535A",
    clawOpacity: 0.06,
  },
};

/** Scale that fits the sheet into the viewport next to the toolbar. */
function useFitScale() {
  const [scale, setScale] = useState(0.6);
  useEffect(() => {
    const update = () => {
      const availW = window.innerWidth - 48;
      const availH = window.innerHeight - 168; // toolbar + breathing room
      setScale(Math.max(0.2, Math.min(1, availW / SHEET_W, availH / SHEET_H)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

export default function AhmaliigaPoster() {
  const [themeKey, setThemeKey] = useState("ink");
  const t = THEMES[themeKey] ?? THEMES.ink;
  const scale = useFitScale();
  const sheetRef = useRef(null);

  // pixelRatio is pinned so the PNG is 300 dpi on every machine, not the screen's
  // devicePixelRatio. The captured node is the 794x1123 sheet, so the ratio is all
  // that sets the output size.
  const { downloading, downloadPng } = useExportPng(sheetRef, "ahmaliiga-juliste-a4.png", {
    pixelRatio: EXPORT_RATIO,
    fonts: EXPORT_FONTS,
  });

  return (
    <div className="pp-page">
      <style>{css}</style>

      <div className="pp-tools">
        <div className="pp-tools-row">
          <span className="pp-tools-label">Juliste</span>
          <span className="pp-tools-meta">A4 pysty · 300 dpi</span>
        </div>
        <div className="pp-tools-row">
          <div className="pp-seg">
            {Object.entries(THEMES).map(([key, theme]) => (
              <button
                key={key}
                type="button"
                className={`pp-seg-btn${key === themeKey ? " is-on" : ""}`}
                onClick={() => setThemeKey(key)}
              >
                {theme.label}
              </button>
            ))}
          </div>
          <button type="button" className="pp-btn pp-btn--primary" onClick={() => window.print()}>
            Tulosta
          </button>
          <button type="button" className="pp-btn" onClick={downloadPng} disabled={downloading}>
            {downloading ? "Luodaan…" : "Lataa PNG"}
          </button>
        </div>
        <div className="pp-hint">
          Tulosta-painike: valitse paperikooksi A4 ja reunukset "Ei mitään". Vaalea versio
          säästää väriä tavallisessa toimistotulostimessa; tumma kannattaa teettää painossa.
          PNG on 300 dpi, joten sen voi suurentaa A3:ksi tai isommaksi.
        </div>
      </div>

      <div className="pp-viewport">
        <div className="pp-scaler" style={{ width: SHEET_W * scale, height: SHEET_H * scale }}>
          <div
            ref={sheetRef}
            className="pp-sheet"
            style={{ ...S.sheet, background: t.bg, transform: `scale(${scale})` }}
          >
            {/* Background layers — mirrors the signage ad's ember backdrop. */}
            {t.ember && (
              <>
                <div style={S.bgRadial} />
                <div style={S.bgGlow} />
              </>
            )}
            <img src="/infotv/claw.png" alt="" style={{ ...S.claw, opacity: t.clawOpacity }} />

            {/* Brand line */}
            <div style={S.brand}>
              <img src="/infotv/wolverine.png" alt="" style={{ width: 44, height: "auto" }} />
              <div style={{ ...S.brandLabel, color: t.text }}>
                <span style={S.rule} />
                Valkeakosken Kiekko-Ahma
              </div>
            </div>

            {/* Crest */}
            <img src="/infotv/ahmaliiga_wordmark.png" alt="Ahmaliiga" style={S.crest(t)} />

            {/* Copy */}
            <div style={S.eyebrow}>
              <span style={S.rule} />
              Kiekko-Ahman oma fantasialiiga
              <span style={S.rule} />
            </div>

            <div style={{ ...S.headline, color: t.text }}>
              Kokoa unelma&shy;joukkueesi ja <span style={{ color: ORANGE }}>kerää pisteitä</span>
            </div>

            <div style={{ ...S.body, color: t.body }}>
              Kokoa unelmajoukkue Kiekko-Ahman pelaajakorteista. Kun Ahman joukkueet pelaavat
              oikeita pelejä, sinä keräät niistä pisteitä. Eniten pisteitä kerännyt voittaa.
            </div>

            <div style={S.features}>
              {FEATURES.map((f, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <div style={{ ...S.featureDivider, background: t.divider }} />}
                  <div style={S.feature}>
                    <f.icon size={42} />
                    <div style={{ ...S.featureLabel, color: t.text }}>
                      {f.label[0]}
                      <br />
                      <span style={{ color: ORANGE }}>{f.label[1]}</span>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* Call to action — the reason the poster exists. */}
            <div style={S.ctaWrap}>
              <div style={{ ...S.qrCard, background: t.qrCard, borderColor: t.qrBorder }}>
                <QRCodeSVG
                  value={TARGET_URL}
                  size={QR_SIZE}
                  level="Q"
                  bgColor="#FFFFFF"
                  fgColor="#0E0E0F"
                  style={{ display: "block" }}
                />
              </div>
              <div style={S.ctaText}>
                <div style={{ ...S.ctaKicker, color: t.kicker }}>Skannaa tai kirjoita</div>
                <div style={{ ...S.ctaUrl, color: t.text }}>
                  {URL_HOST}
                  <br />
                  <span style={{ color: ORANGE }}>{URL_PATH}</span>
                </div>
                <div style={{ ...S.ctaFree, color: t.body }}>Ilmainen — selaimessa tai appina</div>
              </div>
            </div>

            {/* Bottom bar */}
            <div style={{ ...S.bar, background: t.bar }}>
              <span style={S.barDiamond} />
              <span style={{ ...S.barText, color: t.barText }}>
                Pelaa koko kausi — uusi jakso alkaa aina kahden viikon välein
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sheet styles — authored in the 794x1123 px coordinate system ── */

const S = {
  sheet: {
    position: "relative",
    width: SHEET_W,
    height: SHEET_H,
    overflow: "hidden",
    boxSizing: "border-box",
    padding: "46px 54px 0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: BARLOW,
    transformOrigin: "top left",
    // Without this a browser drops the dark background and the orange on print.
    WebkitPrintColorAdjust: "exact",
    printColorAdjust: "exact",
  },
  bgRadial: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(62% 46% at 50% 34%, #3A2415 0%, #17130F 44%, #0B0B0C 78%)",
  },
  bgGlow: {
    position: "absolute",
    left: -170,
    top: 60,
    width: 760,
    height: 640,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(240,110,30,0.28) 0%, rgba(240,110,30,0.07) 42%, rgba(240,110,30,0) 70%)",
    filter: "blur(18px)",
  },
  claw: {
    position: "absolute",
    top: -70,
    right: -90,
    width: 460,
    transform: "rotate(10deg)",
    pointerEvents: "none",
  },

  brand: { position: "relative", display: "flex", alignItems: "center", gap: 14 },
  brandLabel: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "0.26em",
    textTransform: "uppercase",
  },
  rule: { display: "block", width: 24, height: 2.5, background: ORANGE, flexShrink: 0 },

  crest: (t) => ({
    position: "relative",
    width: 300,
    height: "auto",
    marginTop: 10,
    filter: t.ember
      ? "drop-shadow(0 0 54px rgba(240,110,30,0.5)) drop-shadow(0 18px 40px rgba(0,0,0,0.65))"
      : "drop-shadow(0 10px 26px rgba(14,14,15,0.18))",
  }),

  eyebrow: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: ORANGE,
  },
  headline: {
    position: "relative",
    marginTop: 16,
    fontFamily: BEBAS,
    fontSize: 62,
    lineHeight: 0.94,
    letterSpacing: "0.03em",
    textAlign: "center",
  },
  body: {
    position: "relative",
    marginTop: 16,
    maxWidth: 600,
    fontWeight: 500,
    fontSize: 19,
    lineHeight: 1.4,
    textAlign: "center",
  },

  features: {
    position: "relative",
    display: "flex",
    alignItems: "stretch",
    alignSelf: "stretch",
    marginTop: 26,
  },
  feature: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    boxSizing: "border-box",
  },
  featureDivider: { width: 2, flexShrink: 0 },
  featureLabel: {
    textAlign: "center",
    fontFamily: BEBAS,
    fontSize: 26,
    lineHeight: 1,
    letterSpacing: "0.04em",
  },

  ctaWrap: {
    position: "relative",
    marginTop: "auto",
    marginBottom: 26,
    display: "flex",
    alignItems: "center",
    gap: 30,
  },
  qrCard: {
    padding: 16,
    borderRadius: 16,
    border: "2px solid transparent",
    boxSizing: "border-box",
    display: "flex",
    flexShrink: 0,
  },
  ctaText: { display: "flex", flexDirection: "column", gap: 8 },
  ctaKicker: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
  },
  ctaUrl: { fontFamily: BEBAS, fontSize: 44, lineHeight: 0.98, letterSpacing: "0.03em" },
  ctaFree: { fontWeight: 600, fontSize: 17, lineHeight: 1.2 },

  bar: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "100%",
    height: 62,
    borderTop: `4px solid ${ORANGE}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: "0 54px",
    boxSizing: "border-box",
  },
  barDiamond: {
    display: "block",
    width: 11,
    height: 11,
    background: ORANGE,
    transform: "rotate(45deg)",
    flexShrink: 0,
  },
  barText: { fontFamily: BEBAS, fontSize: 25, lineHeight: 1, letterSpacing: "0.04em" },
};

/* ── Screen chrome (toolbar + preview frame). Removed entirely for print. ── */

const css = `
.pp-page {
  min-height: 100vh;
  background: #141416;
  color: #F4F4F4;
  font-family: ${BARLOW};
}
.pp-tools {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 20px;
  background: #1C1C1F;
  border-bottom: 1px solid rgba(255,255,255,.12);
  box-sizing: border-box;
}
.pp-tools-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.pp-tools-label {
  font-family: ${BEBAS};
  font-size: 26px;
  letter-spacing: .04em;
}
.pp-tools-meta { font-size: 13px; color: rgba(255,255,255,.55); }
.pp-hint { font-size: 12.5px; line-height: 1.45; color: rgba(255,255,255,.55); max-width: 640px; }
.pp-seg { display: flex; border: 1px solid rgba(255,255,255,.2); border-radius: 9px; overflow: hidden; }
.pp-seg-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: rgba(255,255,255,.7);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  padding: 8px 16px;
  cursor: pointer;
}
.pp-seg-btn.is-on { background: ${ORANGE}; color: #fff; }
.pp-btn {
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
.pp-btn:disabled { opacity: .5; cursor: default; }
.pp-btn--primary { background: ${ORANGE}; border-color: ${ORANGE}; color: #fff; }
.pp-viewport { display: flex; justify-content: center; padding: 24px 24px 48px; }
.pp-scaler { position: relative; flex-shrink: 0; }
.pp-sheet { box-shadow: 0 24px 60px rgba(0,0,0,.5); }

@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; overflow: hidden; }
  .pp-page { min-height: 0; background: #fff; }
  .pp-tools { display: none !important; }
  .pp-viewport { display: block; padding: 0; }
  .pp-scaler { width: auto !important; height: auto !important; }
  /* Pinned to the physical page box, not 794x1123 px. A4 is 793.7x1122.5 px, so
     the px sheet is a hair taller than the page and Chrome would spill a blank
     second sheet out of the printer. The 0.3 px the artwork loses is clipped by
     the sheet's own overflow:hidden. */
  .pp-sheet {
    width: 210mm !important;
    height: 297mm !important;
    transform: none !important;
    box-shadow: none !important;
  }
}
`;
