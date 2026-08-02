import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuSwords, LuCalendarDays, LuTrophy, LuMegaphone, LuMedal, LuHeartHandshake } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import InfoTvStage, { HeroBackdrop, Lockup, FONT_DISPLAY, FONT_BODY, ORANGE, STEEL } from "./InfoTvFrame";

moment.locale("fi");

// InfoTV hub / launcher — the "welcome" landing screen.

const PAGES = [
  { to: "/infotv/ottelut", Icon: LuSwords, title: "Kotiottelut", desc: "Seuraavat ottelut" },
  { to: "/infotv/jaavuorot", Icon: LuCalendarDays, title: "Jäävuorot", desc: "Varauskalenteri" },
  { to: "/infotv/kotipeli", Icon: LuTrophy, title: "Seuraava kotipeli", desc: "Tuleva ottelutapahtuma" },
  { to: "/infotv/ahmaliiga", Icon: LuMegaphone, title: "Ahmaliiga", desc: "Fantasialiigan mainos" },
  { to: "/infotv/tilastot", Icon: LuMedal, title: "Ahmaliiga-tilastot", desc: "Kauden kärki" },
  { to: "/infotv/kumppanit", Icon: LuHeartHandshake, title: "Yhteistyökumppanit", desc: "Meidän kumppanit" },
];

const TESTS = [
  { to: "/infotv/ottelut?date=2026-08-11", label: "Ottelut · vähän" },
  { to: "/infotv/ottelut?date=2026-01-19", label: "Ottelut · 9" },
  { to: "/infotv/ottelut?date=2026-03-02", label: "Ottelut · 16" },
  { to: "/infotv/jaavuorot?date=2026-08-11", label: "Jäävuorot · vilkas" },
  { to: "/infotv/jaavuorot", label: "Jäävuorot · nyt" },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function InfoTvHub() {
  const now = useClock();
  return (
    <InfoTvStage backdrop={false}>
      <style>{css}</style>
      <div className="hub">
        <HeroBackdrop />

        {/* ── top bar ── */}
        <Lockup height={94} style={{ position: "absolute", top: 44, left: 56, zIndex: 2 }} />
        <div className="hub-clock">
          <div className="hub-clock-date">{moment(now).format("dd D.M.YYYY").toUpperCase()}</div>
          <div className="hub-clock-time">{moment(now).format("HH:mm")}</div>
        </div>

        {/* ── hero ── */}
        <div className="hub-hero">
          <div className="hub-hero-inner">
            <div className="hub-eyebrow"><span className="hub-eyebrow-line" />Tervetuloa</div>
            <div className="hub-headline"><span className="hub-gz">GAMEZONE</span> <span className="hub-itv">INFOTV</span></div>
          </div>
        </div>

        {/* ── cards ── */}
        <div className="hub-grid">
          {PAGES.map((p) => (
            <Link key={p.to} to={p.to} className="hub-card">
              <p.Icon className="hub-card-icon" />
              <span className="hub-card-div" />
              <div className="hub-card-text">
                <div className="hub-card-title">{p.title}</div>
                <div className="hub-card-desc">{p.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* ── quick links ── */}
        <div className="hub-tests">
          <span className="hub-tests-label">Esikatselu</span>
          {TESTS.map((t) => <Link key={t.to} to={t.to} className="hub-test">{t.label}</Link>)}
        </div>
      </div>
    </InfoTvStage>
  );
}

const css = `
.hub { position:absolute; inset:0; overflow:hidden; font-family:${FONT_BODY}; }

.hub-clock { position:absolute; top:46px; right:56px; text-align:right; z-index:2; line-height:1; }
.hub-clock-date { font-family:${FONT_BODY}; font-weight:700; font-size:22px; letter-spacing:0.05em; color:${STEEL}; }
.hub-clock-time { font-family:${FONT_DISPLAY}; font-size:56px; letter-spacing:0.04em; color:#fff; margin-top:6px; }

/* ── hero (block centred, text left-aligned) ── */
.hub-hero { position:absolute; top:212px; left:56px; right:56px; display:flex; justify-content:flex-start; z-index:2; }
.hub-hero-inner { display:inline-block; text-align:left; }
.hub-eyebrow { display:flex; align-items:center; gap:18px; font-family:${FONT_BODY}; font-weight:800; font-size:33px; letter-spacing:0.2em; text-transform:uppercase; color:${ORANGE}; margin-bottom:10px; }
.hub-eyebrow-line { width:64px; height:4px; background:${ORANGE}; flex-shrink:0; }
.hub-headline { font-family:${FONT_DISPLAY}; line-height:0.9; letter-spacing:0.02em; color:#fff; text-shadow:0 8px 40px rgba(0,0,0,0.6); white-space:nowrap; }
.hub-gz { font-size:188px; }
.hub-itv { font-size:138px; color:${ORANGE}; margin-left:30px; }

/* ── cards ── */
.hub-grid { position:absolute; top:470px; left:56px; right:56px; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(2,1fr); gap:26px; height:388px; z-index:2; }
.hub-card { display:flex; align-items:center; gap:30px; padding:0 42px; border-radius:20px; text-decoration:none; background:rgba(22,22,26,0.66); border:1.5px solid rgba(255,255,255,0.10); backdrop-filter:blur(4px); }
.hub-card-icon { width:74px; height:74px; flex-shrink:0; color:${ORANGE}; stroke-width:1.6px; }
.hub-card-div { width:1.5px; height:60px; flex-shrink:0; background:rgba(255,255,255,0.16); }
.hub-card-text { min-width:0; }
.hub-card-title { font-family:${FONT_DISPLAY}; font-size:46px; line-height:1; letter-spacing:0.03em; color:#fff; }
.hub-card-desc { font-family:${FONT_BODY}; font-weight:600; font-size:24px; letter-spacing:0.02em; color:${STEEL}; margin-top:8px; }

/* ── quick links ── */
.hub-tests { position:absolute; left:56px; right:56px; bottom:34px; display:flex; align-items:center; gap:14px; z-index:2; background:rgba(20,20,24,0.66); border:1px solid rgba(255,255,255,0.09); border-radius:16px; padding:14px 22px; }
.hub-tests-label { display:flex; align-items:center; gap:12px; font-family:${FONT_BODY}; font-weight:800; font-size:22px; letter-spacing:0.14em; text-transform:uppercase; color:${ORANGE}; margin-right:8px; }
.hub-test { font-family:${FONT_BODY}; font-weight:700; font-size:23px; color:#fff; text-decoration:none; padding:8px 20px; border-radius:999px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); }
`;
