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
      </div>
    </InfoTvStage>
  );
}

const css = `
.hub-content { position:absolute; top:120px; bottom:40px; left:44px; right:44px; display:flex; }
.hub-grid { flex:1; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(2,1fr); gap:30px; }
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
