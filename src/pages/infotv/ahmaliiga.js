import React from "react";
import InfoTvStage from "./InfoTvFrame";

// Ahmaliiga signage ad — a faithful React port of the hand-authored 1920x1080
// design (source: "Ahmaliiga info-TV" HTML + assets, dropped by the user). The
// page draws its own full-bleed layout, so it uses InfoTvFrame's `bare` mode
// (scaled 1920x1080 stage, no shared header/footer chrome). Assets live in
// public/infotv/. Colours are the BrandBook values baked into the original design.

const ORANGE = "#F06E1E";
const FEATURES = [
  { label: ["Kokoa", "5 korttia"], icon: CardsIcon },
  { label: ["Valitse", "kapteeni"], icon: CrownIcon },
  { label: ["Veikkaa", "ottelu"], icon: TargetIcon },
];

export default function InfoTvAhmaliiga() {
  return (
    <InfoTvStage backdrop={false}>
      <div style={S.root}>
        {/* Background layers */}
        <div style={S.bgRadial} />
        <div style={S.bgGlow} />
        <div style={S.bgBottomFade} />
        <img src="/infotv/claw.png" alt="" style={S.claw} />

        {/* Top-left brand line */}
        <div style={S.brand}>
          <img src="/infotv/wolverine.png" alt="Kiekko-Ahma" style={{ width: 74, height: "auto" }} />
          <div style={S.brandLabel}>
            <span style={S.brandDash} />
            Valkeakosken Kiekko-Ahma
          </div>
        </div>

        {/* Left — Ahmaliiga badge */}
        <div style={S.logoWrap}>
          <img src="/infotv/ahmaliiga_wordmark.png" alt="Ahmaliiga" style={S.logo} />
        </div>

        {/* Right — copy + features */}
        <div style={S.right}>
          <div style={S.eyebrow}>
            <span style={S.eyebrowDash} />
            Kiekko-Ahman oma fantasialiiga
          </div>

          <div style={S.headline}>
            Kokoa unelma&shy;joukkueesi ja <span style={{ color: ORANGE }}>kerää pisteitä</span>
          </div>

          <div style={S.body}>
            Kokoa unelmajoukkue Kiekko-Ahman pelaajakorteista. Kun Ahman joukkueet
            pelaavat oikeita pelejä, sinä keräät niistä pisteitä. Eniten pisteitä
            kerännyt voittaa.
          </div>

          <div style={S.features}>
            {FEATURES.map((f, i) => (
              <React.Fragment key={i}>
                {i > 0 && <div style={S.featureDivider} />}
                <div style={S.feature}>
                  <f.icon />
                  <div style={S.featureLabel}>
                    {f.label[0]}
                    <br />
                    <span style={{ color: ORANGE }}>{f.label[1]}</span>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Bottom bar — QR + URL */}
        <div style={S.bar}>
          <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
            <div style={S.qrBox}>
              <img src="/infotv/qr_ahmaliiga.png" alt="gamezone.kiekko-ahma.fi/ahmaliiga" style={{ width: 108, height: 108, display: "block" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={S.barKicker}>Skannaa tai kirjoita</div>
              <div style={S.barUrl}>
                gamezone.kiekko-ahma.fi<span style={{ color: ORANGE }}>/ahmaliiga</span>
              </div>
            </div>
          </div>
          <div style={S.barRight}>
            <span style={S.barDiamond} />
            <span style={S.barFree}>Ilmainen — selaimessa tai appina</span>
          </div>
        </div>
      </div>
    </InfoTvStage>
  );
}

/* ── Feature icons (inline SVG, from the original design) ── */
function CardsIcon() {
  return (
    <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3" y="6" width="10" height="14" rx="1.5" transform="rotate(-10 8 13)" />
      <rect x="7" y="5" width="10" height="14" rx="1.5" />
      <rect x="11" y="4" width="10" height="14" rx="1.5" transform="rotate(10 16 11)" />
    </svg>
  );
}
function CrownIcon() {
  return (
    <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="1.6" strokeLinejoin="round">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8z" />
      <circle cx="3" cy="6.4" r="1.3" />
      <circle cx="12" cy="3.4" r="1.3" />
      <circle cx="21" cy="6.4" r="1.3" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="1.6">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
    </svg>
  );
}

const BEBAS = "var(--font-family-display)";
const BARLOW = "var(--font-family-base)";

const S = {
  root: {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    background: "#0B0B0C",
    fontFamily: BARLOW,
    color: "#F4F4F4",
  },
  bgRadial: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(58% 62% at 24% 44%, #3A2415 0%, #17130F 42%, #0B0B0C 78%)",
  },
  bgGlow: {
    position: "absolute",
    left: -160,
    top: 120,
    width: 1000,
    height: 840,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(240,110,30,0.30) 0%, rgba(240,110,30,0.08) 42%, rgba(240,110,30,0) 70%)",
    filter: "blur(20px)",
  },
  bgBottomFade: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "100%",
    height: 300,
    background: "linear-gradient(180deg, rgba(11,11,12,0) 0%, rgba(240,110,30,0.07) 45%, rgba(11,11,12,0.9) 100%)",
  },
  claw: {
    position: "absolute",
    top: -140,
    right: 120,
    width: 760,
    opacity: 0.05,
    transform: "rotate(10deg)",
    pointerEvents: "none",
  },
  brand: { position: "absolute", left: 72, top: 52, display: "flex", alignItems: "center", gap: 20 },
  brandLabel: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontFamily: BARLOW,
    fontWeight: 700,
    fontSize: 22,
    letterSpacing: "0.26em",
    textTransform: "uppercase",
    color: "#F4F4F4",
  },
  brandDash: { width: 30, height: 3, background: ORANGE },

  logoWrap: {
    position: "absolute",
    left: 80,
    top: 186,
    width: 740,
    height: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 660,
    height: "auto",
    filter: "drop-shadow(0 0 70px rgba(240,110,30,0.55)) drop-shadow(0 30px 60px rgba(0,0,0,0.7))",
  },

  right: { position: "absolute", left: 880, top: 214, width: 968, display: "flex", flexDirection: "column", gap: 26 },
  eyebrow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    fontFamily: BARLOW,
    fontWeight: 700,
    fontSize: 26,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: ORANGE,
  },
  eyebrowDash: { width: 34, height: 3, background: ORANGE },
  headline: {
    fontFamily: BEBAS,
    fontSize: 104,
    lineHeight: 0.94,
    letterSpacing: "0.03em",
    color: "#FFFFFF",
    textShadow: "0 6px 30px rgba(0,0,0,0.7)",
  },
  body: {
    fontFamily: BARLOW,
    fontWeight: 500,
    fontSize: 34,
    lineHeight: 1.35,
    color: "#B5B5B5",
    maxWidth: 900,
  },
  features: { display: "flex", alignItems: "stretch", gap: 0, marginTop: 10 },
  feature: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "0 18px" },
  featureDivider: { width: 2, background: "#3C3C40" },
  featureLabel: {
    textAlign: "center",
    fontFamily: BEBAS,
    fontSize: 36,
    lineHeight: 1,
    letterSpacing: "0.04em",
    color: "#FFFFFF",
  },

  bar: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: "100%",
    height: 168,
    background: "#141414",
    borderTop: `4px solid ${ORANGE}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 72px",
    boxSizing: "border-box",
  },
  qrBox: { background: "#F4F4F4", borderRadius: 10, padding: 10, display: "flex" },
  barKicker: {
    fontFamily: BARLOW,
    fontWeight: 700,
    fontSize: 20,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: "#9A9A9A",
  },
  barUrl: { fontFamily: BEBAS, fontSize: 60, lineHeight: 1, letterSpacing: "0.04em", color: "#FFFFFF" },
  barRight: { display: "flex", alignItems: "center", gap: 14, position: "relative", top: 15 },
  barDiamond: { display: "block", width: 16, height: 16, background: ORANGE, transform: "rotate(45deg)", position: "relative", top: -3 },
  barFree: { fontFamily: BEBAS, fontSize: 40, lineHeight: 1, letterSpacing: "0.04em", color: "#C3C3C3" },
};
