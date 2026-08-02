import React, { useEffect, useMemo, useState } from "react";
import moment from "moment";
import "moment/locale/fi";

import InfoTvStage, { BrandLockup, Eyebrow, Diamond, FONT_DISPLAY, FONT_BODY, ORANGE, YELLOW, STEEL } from "./InfoTvFrame";
import { splitTeamName } from "../../Util";
import { fetchSeasonGames, peekSeasonGames, isSeasonLoaded, subscribe } from "../../lib/seasonGamesCache";

moment.locale("fi");

// Next Edustus (men's rep) home game hero. Data = the ONE season-schedule cache
// (getSeasonGames — a single cached call), NOT a week-by-week scan. Edustus = a
// home game at the II-divisioona level.

const gtime = (d) => new Date(String(d).replace(" ", "T")).getTime();

export default function InfoTvKotipeli() {
  const [snapshot, setSnapshot] = useState(peekSeasonGames);
  const [loaded, setLoaded] = useState(isSeasonLoaded());

  useEffect(() => {
    const upd = () => { setSnapshot(peekSeasonGames()); setLoaded(isSeasonLoaded()); };
    const unsub = subscribe(upd);
    fetchSeasonGames().catch(() => {}).finally(upd);
    return unsub;
  }, []);

  // Men's Edustus = a home game whose (already processed) level is "II-Div".
  // NOTE: seasonGamesCache runs processIncomingDataEvents, which simplifies levels
  // — "II-divisioona" → "II-Div" (replaceAll is case-insensitive) and any junior
  // "U18 II-divisioona" → "U18". So anchoring on "II-Div" matches ONLY the men's
  // team. Earliest future one.
  const match = useMemo(() => {
    const now = Date.now();
    const list = snapshot
      .filter((g) => g.isHomeGame && /^ii-div/i.test(g.level || "") && gtime(g.date) > now)
      .sort((a, b) => gtime(a.date) - gtime(b.date));
    return list[0] || null;
  }, [snapshot]);
  const loading = !loaded;

  const away = match ? splitTeamName(match.away ?? "") : null;
  const dayStr = match ? moment(match.date).format("dddd D.M.YYYY").toUpperCase() : "";
  const timeStr = match ? moment(match.date).format("HH:mm") : "";
  // Always the Edustus (II-div) game → paid entry. (The cache's `isFree` is
  // unreliable: processIncomingDataEvents rewrites the level to "II-Div" before
  // computing isFree, so it's always true there.)
  const isFree = false;

  return (
    <InfoTvStage focus="50% 30%">
      <style>{css}</style>
      <BrandLockup style={{ position: "absolute", top: 56, left: 72 }} />

      <div className="kp-hero">
        <div className="kp-eyebrow"><Eyebrow size={30}>Seuraava edustuksen</Eyebrow></div>
        <div className="kp-title">KOTIPELI</div>

        {match ? (
          <>
            {match.level && <div className="kp-level">{match.level.toUpperCase()}</div>}

            <div className="kp-teams">
              <div className="kp-team">
                <div className="kp-logowrap"><img className="kp-logo" src={match.home_logo} alt="" /></div>
                <div className="kp-teamname">KIEKKO-AHMA</div>
                <div className="kp-teamsub">EDUSTUS</div>
              </div>

              <div className="kp-vs">VS</div>

              <div className="kp-team">
                <div className="kp-logowrap"><img className="kp-logo" src={match.away_logo} alt="" /></div>
                <div className="kp-teamname">{away.main}</div>
                {away.sub && <div className="kp-teamsub">{away.sub}</div>}
              </div>
            </div>

            <div className="kp-when"><Diamond size={18} style={{ marginRight: 20 }} />{dayStr} · KLO {timeStr}<Diamond size={18} style={{ marginLeft: 20 }} /></div>
            <div className="kp-entry">{isFree ? "VAPAA SISÄÄNPÄÄSY" : "LIPUT 5 € · ALLE 15 V. ILMAISEKSI"}</div>
          </>
        ) : (
          <div className="kp-none">{loading ? "HAETAAN…" : "EI TULEVIA KOTIPELEJÄ"}</div>
        )}
      </div>
    </InfoTvStage>
  );
}

const css = `
.kp-hero { position:absolute; top:150px; left:0; right:0; bottom:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; padding:20px 120px; }
.kp-eyebrow { }
.kp-title { font-family:${FONT_DISPLAY}; font-size:150px; line-height:0.84; letter-spacing:0.05em; color:${ORANGE}; text-shadow:0 6px 44px rgba(0,0,0,0.9), 0 0 90px rgba(240,110,30,0.4); }
.kp-level { font-family:${FONT_DISPLAY}; font-size:46px; letter-spacing:0.12em; color:${YELLOW}; }

.kp-teams { display:flex; align-items:flex-start; justify-content:center; gap:80px; width:100%; margin:6px 0; }
.kp-team { flex:1; display:flex; flex-direction:column; align-items:center; gap:16px; }
.kp-logowrap { width:220px; height:220px; display:flex; align-items:center; justify-content:center; background:#fff; border-radius:24px; padding:22px; box-sizing:border-box; box-shadow:0 12px 40px rgba(0,0,0,0.55); }
.kp-logo { max-width:100%; max-height:100%; object-fit:contain; }
.kp-teamname { font-family:${FONT_DISPLAY}; font-size:62px; line-height:1; letter-spacing:0.03em; color:#fff; }
.kp-teamsub { font-family:${FONT_DISPLAY}; font-size:44px; line-height:1; letter-spacing:0.05em; color:${ORANGE}; }
.kp-vs { flex-shrink:0; font-family:${FONT_DISPLAY}; font-size:96px; letter-spacing:0.06em; color:rgba(255,255,255,0.5); margin-top:70px; }

.kp-when { display:flex; align-items:center; font-family:${FONT_DISPLAY}; font-size:68px; letter-spacing:0.04em; color:#fff; }
.kp-entry { font-family:${FONT_BODY}; font-weight:700; font-size:32px; letter-spacing:0.12em; color:${STEEL}; }
.kp-none { font-family:${FONT_DISPLAY}; font-size:76px; letter-spacing:0.08em; color:rgba(255,255,255,0.35); }
`;
