import React, { useEffect, useState } from "react";
import moment from "moment";
import "moment/locale/fi";

import InfoTvStage, { BrandLockup, Eyebrow, Diamond, FONT_DISPLAY, FONT_BODY, ORANGE, YELLOW, STEEL } from "./InfoTvFrame";
import { processIncomingDataEventsDoNotStrip, buildGamesQueryUri, splitTeamName } from "../../Util";

moment.locale("fi");

// Next Edustus (men's rep) home game hero — same week-by-week search as the old
// next_home_game, rebuilt in the InfoTV ad-style visual language.

export default function InfoTvKotipeli() {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [teamsMap, setTeamsMap] = useState(new Map());
  const [teamsReady, setTeamsReady] = useState(false);

  useEffect(() => {
    fetch("/api/getTeams").then((r) => r.json()).then((teams) => {
      const map = new Map();
      for (const team of teams) for (const g of team.levelGroups ?? []) map.set(`${g.levelId}|${g.statGroupId}`, team.teamKey);
      setTeamsMap(map);
    }).catch(() => {}).finally(() => setTeamsReady(true));
  }, []);

  useEffect(() => {
    if (!teamsReady) return;
    let cancelled = false;
    const isEdustus = (g, map) => {
      const tk = map.get(`${g.levelId}|${g.statGroupId}`);
      if (tk !== undefined) return tk.toLowerCase().includes("miehet") && tk.toLowerCase().includes("edustus");
      return (g.level ?? "").toLowerCase().includes("ii-divisioona");
    };
    const search = async () => {
      setLoading(true);
      let found = null;
      for (let offset = 0; offset < 12 && !cancelled; offset++) {
        try {
          const d = new Date(); d.setDate(d.getDate() + offset * 7);
          const data = await fetch(buildGamesQueryUri(moment(d).format("YYYY-MM-DD"))).then((r) => r.json());
          const now = new Date();
          found = processIncomingDataEventsDoNotStrip(data).find((g) => isEdustus(g, teamsMap) && new Date(g.date) > now) ?? null;
          if (found) break;
        } catch {}
      }
      if (!cancelled) { setMatch(found); setLoading(false); }
    };
    search();
    return () => { cancelled = true; };
  }, [teamsReady, teamsMap]);

  const away = match ? splitTeamName(match.away ?? "") : null;
  const dayStr = match ? moment(match.date).format("dddd D.M.YYYY").toUpperCase() : "";
  const timeStr = match ? moment(match.date).format("HH:mm") : "";
  const isFree = match ? match.isFree !== false : true;

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
