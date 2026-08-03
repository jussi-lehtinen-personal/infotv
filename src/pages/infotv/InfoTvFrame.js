import React, { useEffect, useState } from "react";

/**
 * InfoTV signage design kit (lobby TV, 1920x1080).
 *
 * Pages are authored in a fixed 1920x1080 coordinate system (plain px) and the
 * stage scales that to any viewport with letterboxing — pixel-consistent, never
 * scrolls. Everything else here is a *composable* piece of the visual language
 * lifted from the approved Ahmaliiga ad (ember backdrop, orange glow, claw
 * watermark, brand lockup, eyebrow rule, bottom bar). There is deliberately NO
 * generic chrome frame — each page paints full-bleed, edge to edge.
 *
 * BrandBook tokens: Ahma Orange #F06E1E, Ink #0B0B0C, Eye Yellow #FFC21A,
 * Steel #C3C3C3, Bebas Neue (display) / Barlow (body). See project_brand_alignment.
 */

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export const INK = "#0B0B0C";
export const ORANGE = "#F06E1E";
export const YELLOW = "#FFC21A";
export const STEEL = "#C3C3C3";
export const FONT_DISPLAY = "var(--font-family-display)"; // Bebas Neue
export const FONT_BODY = "var(--font-family-base)"; // Barlow

function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () =>
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return scale;
}

/**
 * Full-bleed 1920x1080 scaled stage. Renders the ember Backdrop by default;
 * pass backdrop={false} for a page that paints its own (e.g. the ad).
 */
export default function InfoTvStage({ children, backdrop = true }) {
  const scale = useStageScale();
  return (
    <>
      <style>{stageCss}</style>
      <div className="itv-viewport">
        <div className="itv-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
          {backdrop && <Backdrop />}
          {children}
        </div>
      </div>
    </>
  );
}

/**
 * Normal GameZone dark background — the same `--bg-gradient` / Ink tokens the
 * rest of the app uses (index.css :root, globally loaded). NOT the Ahmaliiga
 * ad's ember/claw look: that is reserved for the ad alone.
 */
export function Backdrop() {
  return <div style={{ position: "absolute", inset: 0, background: "var(--bg-gradient, #15171B)" }} />;
}

/**
 * Rich "hero" background used by the hub + kotipeli — the official colour ahma
 * head (sharp 1024px) dimmed on the right, the orange Raapaisu scratch, an orange
 * radial glow and a strong left-to-right dim so text stays readable. Assets from
 * the BrandBook logopankki (public/infotv/).
 */
export function HeroBackdrop({ calm }) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `#0b0b0d url('/infotv/${calm ? "hero_bg_calm" : "hero_bg"}.webp') center/cover no-repeat` }} />
      {/* Slight extra dim on the left so titles/cards keep contrast. */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(8,8,10,0.6) 0%, rgba(8,8,10,0.22) 42%, rgba(8,8,10,0) 66%)", pointerEvents: "none" }} />
    </>
  );
}

/** Official horizontal club lockup (BrandBook vaaka_taysi) for dark backgrounds. */
export function Lockup({ height = 92, style }) {
  return <img src="/infotv/lockup.png" alt="Valkeakosken Kiekko-Ahma" style={{ height, width: "auto", display: "block", ...style }} />;
}

// Side inset used by the masthead (and available to pages).
export const SIDE_PAD = 44;

/**
 * Slim single-row masthead: club mark + page title on the left, meta on the
 * right. One ~64px line on the backdrop — deliberately minimal so it steals as
 * little of the stage as possible (the content is what matters on signage).
 */
export function Masthead({ title, meta }) {
  return (
    <div style={{ position: "absolute", top: 18, left: SIDE_PAD, right: SIDE_PAD, height: 96, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <img src="/infotv/wolverine.png" alt="Kiekko-Ahma" style={{ width: 104, height: 104, objectFit: "contain" }} />
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 60, lineHeight: 0.9, letterSpacing: "0.04em", color: "#fff", transform: "translateY(0.07em)" }}>{title}</div>
      </div>
      {meta && <div style={{ fontFamily: FONT_DISPLAY, fontSize: 36, letterSpacing: "0.08em", color: STEEL, transform: "translateY(0.06em)" }}>{meta}</div>}
    </div>
  );
}


const stageCss = `
html, body, #root { margin:0; padding:0; width:100%; height:100%; background:#000; overflow:hidden; }
.itv-viewport { position:fixed; inset:0; background:#000; overflow:hidden; -webkit-tap-highlight-color:transparent; }
/* Signage: no keyboard/mouse focus rings anywhere on the stage. */
.itv-viewport *:focus, .itv-viewport *:focus-visible, .itv-viewport a:focus, .itv-viewport a:active { outline:none !important; box-shadow:none !important; }
.itv-viewport a, .itv-viewport a:link, .itv-viewport a:visited, .itv-viewport a:hover, .itv-viewport a:active { text-decoration:none !important; color:inherit; -webkit-tap-highlight-color:transparent; }
.itv-stage {
  position:absolute; top:50%; left:50%;
  width:${STAGE_W}px; height:${STAGE_H}px;
  transform-origin:center center;
  background:${INK};
  color:#fff;
  font-family:${FONT_BODY};
  overflow:hidden;
}
`;
