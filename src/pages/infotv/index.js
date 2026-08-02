import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuSwords, LuCalendarDays, LuTrophy, LuMegaphone, LuMedal, LuHeartHandshake } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import InfoTvStage, { FONT_DISPLAY, FONT_BODY, ORANGE, STEEL } from "./InfoTvFrame";

moment.locale("fi");

// InfoTV hub / launcher — the "welcome" landing screen. Rich hero (big ahma head
// + claw on the right, dimmed radial), two-line club lockup, styled icon cards,
// and the preview quick-links at the bottom.

const PAGES = [
  { to: "/infotv/ottelut", Icon: LuSwords, title: "Kotiottelut", desc: "Seuraavat ottelut", accent: true },
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
        {/* ── background ── */}
        <div className="hub-bg-base" />
        <img className="hub-bg-bear" src="/infotv/wolverine.png" alt="" />
        <img className="hub-bg-claw" src="/infotv/claw.png" alt="" />
        <div className="hub-bg-radial" />
        <div className="hub-bg-dim" />

        {/* ── top bar ── */}
        <div className="hub-lockup">
          <img className="hub-lockup-mark" src="/infotv/wolverine.png" alt="Kiekko-Ahma" />
          <div className="hub-lockup-text">
            <span className="hub-lockup-top">Valkeakosken</span>
            <span className="hub-lockup-bot">Kiekko-Ahma</span>
          </div>
        </div>
        <div className="hub-clock">
          <div className="hub-clock-date">{moment(now).format("dddd D.M.YYYY").toUpperCase()}</div>
          <div className="hub-clock-time">{moment(now).format("HH:mm")}</div>
        </div>

        {/* ── hero ── */}
        <div className="hub-hero">
          <div className="hub-eyebrow">Tervetuloa</div>
          <div className="hub-headline">GAMEZONE <span>INFOTV</span></div>
        </div>

        {/* ── cards ── */}
        <div className="hub-grid">
          {PAGES.map((p) => (
            <Link key={p.to} to={p.to} className={"hub-card" + (p.accent ? " hub-card--accent" : "")}>
              <p.Icon className="hub-card-icon" />
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
.hub { position:absolute; inset:0; overflow:hidden; background:#0c0c0e; font-family:${FONT_BODY}; }

/* ── background layers ── */
.hub-bg-base { position:absolute; inset:0; background:radial-gradient(90% 80% at 30% 20%, #17181c 0%, #0c0c0e 60%); }
.hub-bg-bear { position:absolute; right:-120px; top:50%; transform:translateY(-50%); height:1240px; width:auto; object-fit:contain; opacity:0.5; filter:grayscale(0.4) brightness(0.55) contrast(1.05); pointer-events:none; }
.hub-bg-claw { position:absolute; right:-40px; top:-80px; height:1240px; width:auto; opacity:0.12; transform:rotate(6deg); pointer-events:none; }
.hub-bg-radial { position:absolute; left:8%; top:-8%; width:1200px; height:900px; background:radial-gradient(circle, rgba(240,110,30,0.14) 0%, rgba(240,110,30,0) 60%); pointer-events:none; }
.hub-bg-dim { position:absolute; inset:0; background:linear-gradient(100deg, rgba(10,10,12,0.94) 0%, rgba(10,10,12,0.78) 38%, rgba(10,10,12,0.35) 66%, rgba(10,10,12,0.6) 100%); pointer-events:none; }

/* ── top bar ── */
.hub-lockup { position:absolute; top:44px; left:56px; display:flex; align-items:center; gap:20px; z-index:2; }
.hub-lockup-mark { width:92px; height:92px; object-fit:contain; }
.hub-lockup-text { display:flex; flex-direction:column; line-height:0.98; }
.hub-lockup-top { font-family:${FONT_BODY}; font-weight:800; font-size:26px; letter-spacing:0.18em; text-transform:uppercase; color:${ORANGE}; }
.hub-lockup-bot { font-family:${FONT_DISPLAY}; font-size:52px; letter-spacing:0.03em; color:#fff; }

.hub-clock { position:absolute; top:46px; right:56px; text-align:right; z-index:2; line-height:1; }
.hub-clock-date { font-family:${FONT_BODY}; font-weight:700; font-size:22px; letter-spacing:0.14em; color:${STEEL}; }
.hub-clock-time { font-family:${FONT_DISPLAY}; font-size:56px; letter-spacing:0.04em; color:#fff; margin-top:6px; }

/* ── hero ── */
.hub-hero { position:absolute; top:150px; left:56px; right:56px; text-align:center; z-index:2; }
.hub-eyebrow { font-family:${FONT_BODY}; font-weight:800; font-size:34px; letter-spacing:0.4em; text-transform:uppercase; color:${ORANGE}; }
.hub-headline { font-family:${FONT_DISPLAY}; font-size:172px; line-height:0.9; letter-spacing:0.02em; color:#fff; text-shadow:0 8px 40px rgba(0,0,0,0.6); margin-top:8px; }
.hub-headline span { color:${ORANGE}; }

/* ── cards ── */
.hub-grid { position:absolute; top:430px; left:56px; right:56px; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(2,1fr); gap:26px; height:390px; z-index:2; }
.hub-card { display:flex; align-items:center; gap:30px; padding:0 44px; border-radius:20px; text-decoration:none; background:rgba(22,22,26,0.72); border:1.5px solid rgba(255,255,255,0.10); backdrop-filter:blur(4px); }
.hub-card--accent { border-color:${ORANGE}; box-shadow:0 0 0 1px rgba(240,110,30,0.35), 0 14px 40px rgba(240,110,30,0.10); }
.hub-card-icon { width:76px; height:76px; flex-shrink:0; color:${ORANGE}; }
.hub-card-text { min-width:0; }
.hub-card-title { font-family:${FONT_DISPLAY}; font-size:46px; line-height:1; letter-spacing:0.03em; color:#fff; }
.hub-card-desc { font-family:${FONT_BODY}; font-weight:600; font-size:24px; letter-spacing:0.02em; color:${STEEL}; margin-top:8px; }

/* ── quick links ── */
.hub-tests { position:absolute; left:56px; right:56px; bottom:34px; display:flex; align-items:center; gap:14px; z-index:2; background:rgba(20,20,24,0.7); border:1px solid rgba(255,255,255,0.09); border-radius:16px; padding:14px 22px; }
.hub-tests-label { display:flex; align-items:center; gap:12px; font-family:${FONT_BODY}; font-weight:800; font-size:22px; letter-spacing:0.14em; text-transform:uppercase; color:${ORANGE}; margin-right:8px; }
.hub-test { font-family:${FONT_BODY}; font-weight:700; font-size:23px; color:#fff; text-decoration:none; padding:8px 20px; border-radius:999px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.14); }
`;
