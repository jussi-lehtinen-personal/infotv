import React, { useEffect, useMemo, useState } from "react";
import { LuCalendarDays, LuClock, LuMapPin } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";

import InfoTvStage, { HeroBackdrop, Lockup, FONT_DISPLAY, FONT_BODY, ORANGE, STEEL } from "./InfoTvFrame";
import { splitTeamName } from "../../Util";
import { KeyedLogo } from "../../components/ui/KeyedLogo";
import { fetchSeasonGames, peekSeasonGames, isSeasonLoaded, subscribe } from "../../lib/seasonGamesCache";

moment.locale("fi");

const gtime = (d) => new Date(String(d).replace(" ", "T")).getTime();

// Next Edustus (men's rep) home game hero — one cached call (season cache), not a
// scan. Edustus = a home game whose processed level is "II-Div".
export default function InfoTvKotipeli() {
  const [snapshot, setSnapshot] = useState(peekSeasonGames);
  const [loaded, setLoaded] = useState(isSeasonLoaded());

  useEffect(() => {
    const upd = () => { setSnapshot(peekSeasonGames()); setLoaded(isSeasonLoaded()); };
    const unsub = subscribe(upd);
    fetchSeasonGames().catch(() => {}).finally(upd);
    return unsub;
  }, []);

  const match = useMemo(() => {
    const now = Date.now();
    return snapshot
      .filter((g) => g.isHomeGame && /^ii-div/i.test(g.level || "") && gtime(g.date) > now)
      .sort((a, b) => gtime(a.date) - gtime(b.date))[0] || null;
  }, [snapshot]);

  const away = match ? splitTeamName(match.away ?? "") : null;
  const dateStr = match ? moment(match.date).format("D.M.YYYY") : "";
  const timeStr = match ? moment(match.date).format("HH:mm") : "";

  return (
    <InfoTvStage backdrop={false}>
      <style>{css}</style>
      <HeroBackdrop />
      <Lockup height={92} style={{ position: "absolute", top: 44, left: 56, zIndex: 2 }} />

      {match ? (
        <div className="kp">
          <div className="kp-eyebrow">Seuraava edustuksen</div>
          <div className="kp-title">KOTIPELI</div>
          <div className="kp-level"><span className="kp-dash" />II-Divisioona<span className="kp-dash" /></div>

          <div className="kp-teams">
            <div className="kp-team">
              <KeyedLogo className="kp-logo" src="/infotv/ahma_head.png" />
              <div className="kp-name">Kiekko-Ahma</div>
            </div>
            <div className="kp-vs">VS</div>
            <div className="kp-team">
              {/* away_logo is already /api/getImage-proxied by seasonGamesCache */}
              <KeyedLogo className="kp-logo" src={match.away_logo} />
              <div className="kp-name">{away.main}</div>
            </div>
          </div>

          <div className="kp-info">
            <div className="kp-info-cell"><LuCalendarDays className="kp-info-ic" /><b className="kp-info-val">{dateStr}</b></div>
            <div className="kp-info-sep" />
            <div className="kp-info-cell"><LuClock className="kp-info-ic" /><b className="kp-info-val">{timeStr}</b></div>
            <div className="kp-info-sep" />
            <div className="kp-info-cell"><LuMapPin className="kp-info-ic" /><b className="kp-info-val">Wareena</b></div>
          </div>

          <div className="kp-entry">Liput 5 € &nbsp;·&nbsp; Alle 15 v. ilmaiseksi</div>
        </div>
      ) : (
        <div className="kp-none">{loaded ? "Ei tulevia kotipelejä" : "Haetaan…"}</div>
      )}
    </InfoTvStage>
  );
}

const css = `
.kp { position:absolute; top:130px; left:60px; right:60px; bottom:40px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:26px; z-index:2; text-align:center; }

.kp-eyebrow { font-family:${FONT_BODY}; font-weight:800; font-size:36px; letter-spacing:0.32em; text-transform:uppercase; color:${ORANGE}; }
.kp-title { font-family:${FONT_DISPLAY}; font-size:158px; line-height:0.82; letter-spacing:0.05em; color:${ORANGE}; text-shadow:0 6px 40px rgba(0,0,0,0.7), 0 0 90px rgba(240,110,30,0.28); }
.kp-level { display:flex; align-items:center; gap:22px; font-family:${FONT_BODY}; font-weight:800; font-size:30px; letter-spacing:0.16em; text-transform:uppercase; color:#fff; }
.kp-dash { width:44px; height:3px; background:${ORANGE}; }

.kp-teams { display:flex; align-items:flex-start; justify-content:center; gap:172px; margin:6px 0; }
.kp-team { display:flex; flex-direction:column; align-items:center; gap:22px; }
.kp-logo { width:236px; height:236px; object-fit:contain; filter:drop-shadow(0 10px 30px rgba(0,0,0,0.55)); }
.kp-name { font-family:${FONT_DISPLAY}; font-size:60px; line-height:1; letter-spacing:0.045em; color:#fff; }
.kp-vs { font-family:${FONT_DISPLAY}; font-size:112px; line-height:1; letter-spacing:0.05em; color:${ORANGE}; margin-top:58px; }

.kp-info { display:flex; align-items:stretch; gap:0; border:1.5px solid rgba(255,255,255,0.18); border-radius:18px; background:rgba(16,16,19,0.6); padding:6px 0; }
.kp-info-cell { display:flex; align-items:center; gap:22px; padding:18px 52px; }
.kp-info-ic { width:46px; height:46px; flex-shrink:0; color:${ORANGE}; }
.kp-info-val { font-family:${FONT_DISPLAY}; font-size:50px; letter-spacing:0.06em; color:#fff; }
.kp-info-sep { width:1.5px; background:rgba(255,255,255,0.14); margin:14px 0; }

.kp-entry { font-family:${FONT_BODY}; font-weight:700; font-size:30px; letter-spacing:0.12em; text-transform:uppercase; color:${STEEL}; margin-top:4px; }

.kp-none { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:76px; letter-spacing:0.08em; color:rgba(255,255,255,0.4); z-index:2; }
`;
