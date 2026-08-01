import React from "react";
import { Link } from "react-router-dom";
import { LuSwords, LuCalendarDays, LuTrophy, LuMegaphone, LuMedal, LuHeartHandshake } from "react-icons/lu";
import InfoTvStage, { Masthead, FONT_DISPLAY, FONT_BODY, ORANGE, STEEL } from "./InfoTvFrame";

// InfoTV hub: a branded launcher listing every signage page. Not shown on the
// lobby TV itself — it's the index for whoever points a screen at a view. Uses
// the same lucide line-icons as the GameZone app.

const PAGES = [
  { to: "/infotv/ottelut", Icon: LuSwords, title: "Ottelut", desc: "Tämän viikon kotiottelut" },
  { to: "/infotv/jaavuorot", Icon: LuCalendarDays, title: "Jäävuorot", desc: "Jäähallin varauskalenteri" },
  { to: "/infotv/kotipeli", Icon: LuTrophy, title: "Seuraava kotipeli", desc: "Edustuksen seuraava kotipeli" },
  { to: "/infotv/ahmaliiga", Icon: LuMegaphone, title: "Ahmaliiga", desc: "Fantasialiigan mainos" },
  { to: "/infotv/tilastot", Icon: LuMedal, title: "Ahmaliiga-tilastot", desc: "Kauden kärki" },
  { to: "/infotv/kumppanit", Icon: LuHeartHandshake, title: "Kumppanit", desc: "Yhteistyökumppanit" },
];

// Preview links to eyeball the data pages in different scenarios (?date= pins the
// week; ?cols= forces ottelut's column count). Testing aid, not signage.
const TESTS = [
  { to: "/infotv/ottelut?cols=1&date=2026-08-11", label: "Ottelut · 1 palsta" },
  { to: "/infotv/ottelut?cols=2&date=2026-01-19", label: "Ottelut · 2 palstaa" },
  { to: "/infotv/ottelut?date=2026-01-19", label: "Ottelut · aamu + ilta" },
  { to: "/infotv/jaavuorot?date=2026-08-11", label: "Jäävuorot · vilkas viikko" },
  { to: "/infotv/jaavuorot", label: "Jäävuorot · tämä viikko" },
];

export default function InfoTvHub() {
  return (
    <InfoTvStage>
      <style>{css}</style>
      <Masthead title="INFO-TV" />

      <div className="hub-content">
        <div className="hub-grid">
          {PAGES.map((p) => (
            <Link key={p.to} to={p.to} className="hub-card">
              <p.Icon className="hub-icon" />
              <div className="hub-title">{p.title}</div>
              <div className="hub-desc">{p.desc}</div>
            </Link>
          ))}
        </div>
        <div className="hub-tests">
          <span className="hub-tests-label">Esikatselu</span>
          {TESTS.map((t) => (
            <Link key={t.to} to={t.to} className="hub-test">{t.label}</Link>
          ))}
        </div>
      </div>
    </InfoTvStage>
  );
}

const css = `
.hub-content { position:absolute; top:120px; bottom:40px; left:44px; right:44px; display:flex; flex-direction:column; gap:26px; }
.hub-grid { flex:1; min-height:0; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(2,1fr); gap:30px; }
.hub-tests { flex:0 0 auto; display:flex; flex-wrap:wrap; align-items:center; gap:16px; }
.hub-tests-label { font-family:${FONT_BODY}; font-weight:800; font-size:22px; letter-spacing:0.14em; text-transform:uppercase; color:${STEEL}; margin-right:6px; }
.hub-test { font-family:${FONT_BODY}; font-weight:700; font-size:24px; letter-spacing:0.02em; color:#fff; text-decoration:none; padding:10px 22px; border-radius:999px; background:var(--color-surface, rgba(255,255,255,0.05)); border:1px solid var(--color-surface-border, rgba(255,255,255,0.16)); }
.hub-card {
  position:relative; display:flex; flex-direction:column; justify-content:center; gap:16px;
  padding:44px 52px; border-radius:18px; text-decoration:none; overflow:hidden;
  background:var(--color-surface, rgba(255,255,255,0.03));
  border:1px solid var(--color-surface-border, rgba(255,255,255,0.14));
}
.hub-icon { width:76px; height:76px; color:${ORANGE}; }
.hub-title { font-family:${FONT_DISPLAY}; font-size:56px; line-height:1; letter-spacing:0.04em; color:#fff; }
.hub-desc { font-family:${FONT_BODY}; font-weight:600; font-size:26px; letter-spacing:0.03em; color:${STEEL}; }
`;
