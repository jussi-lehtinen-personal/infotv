import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuClock, LuMapPin } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";

import InfoTvStage, { Masthead, FONT_DISPLAY, FONT_BODY } from "./InfoTvFrame";
import { getMonday } from "../../Util";
import { fetchSeasonGames, gamesForWeek, mondayOf, isSeasonLoaded, subscribe } from "../../lib/seasonGamesCache";
import { isLiveMatch } from "../../hooks/useHeroMatches";

moment.locale("fi");

const MAX_GAMES = 16;
// Exactly the GameZone match-row tokens (index.css / gamezone.js).
const WIN = "var(--color-win)";
const LOSS = "var(--color-loss)";
const DRAW = "var(--color-draw)";
const LIVE = "var(--color-primary)";
const MUTED = "rgba(255,255,255,0.4)";

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function simplifyLevel(level) {
  if (!level) return "";
  const s = String(level).trim();
  const m = s.match(/^u\s*(\d{1,2})\b/i);
  if (m) return `U${m[1]}`;
  return s;
}

export default function InfoTvOttelut() {
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(!isSeasonLoaded());
  const [params] = useSearchParams();

  useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    let cancelled = false;
    fetchSeasonGames().catch(() => {}).finally(() => { if (!cancelled) setLoading(!isSeasonLoaded()); });
    return () => { cancelled = true; };
  }, []);

  const baseDate = useMemo(() => {
    const p = params.get("date");
    const d = p ? new Date(p) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  }, [params]);
  const monday = useMemo(() => mondayOf(baseDate), [baseDate]);

  const games = useMemo(() => {
    const wk = gamesForWeek(monday, false);
    return [...wk].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, MAX_GAMES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday, version]);

  const weekRange = useMemo(() => {
    const mon = getMonday(new Date(baseDate));
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    return moment(mon).format("D.M.") + " – " + moment(sun).format("D.M.");
  }, [baseDate]);

  // Column count: ?cols=1|2 forces it; otherwise adaptive (few games → one wide
  // column, more → two). A day that straddles the split repeats its header.
  const numCols = useMemo(() => {
    const p = params.get("cols");
    if (p === "1") return 1;
    if (p === "2") return 2;
    return games.length <= 5 ? 1 : 2;
  }, [params, games.length]);

  const columns = useMemo(() => {
    const cols = Array.from({ length: numCols }, () => []);
    const prevDay = Array(numCols).fill(null);
    const target = Math.ceil(games.length / numCols);
    games.forEach((g, i) => {
      const c = numCols === 1 ? 0 : i < target ? 0 : 1;
      const day = moment(g.date).format("YYYY-MM-DD");
      if (day !== prevDay[c]) { cols[c].push({ type: "day", key: `h${c}-${day}`, day }); prevDay[c] = day; }
      cols[c].push({ type: "row", key: g.id ?? `c${c}-${i}`, m: g });
    });
    return cols;
  }, [games, numCols]);

  return (
    <InfoTvStage>
      <style>{css}</style>
      <Masthead title="KOTIOTTELUT" meta={weekRange} />

      <div className="ot-content">
        {loading && games.length === 0 && <div className="ot-empty">Ladataan otteluita…</div>}
        {!loading && games.length === 0 && <div className="ot-empty">Ei kotiotteluita tällä viikolla</div>}
        {games.length > 0 && (
          <div className="ot-cols" style={numCols === 1 ? { gridTemplateColumns: "minmax(0, 1180px)", justifyContent: "center" } : undefined}>
            {columns.map((c, i) => <Column key={i} items={c} />)}
          </div>
        )}
      </div>
    </InfoTvStage>
  );
}

function Column({ items }) {
  return (
    <div className="ot-col">
      {items.map((it) => it.type === "day"
        ? <div key={it.key} className="ot-day">{capitalize(moment(it.day).format("dddd"))} {moment(it.day).format("D.M.")}</div>
        : <MatchRow key={it.key} m={it.m} />)}
    </div>
  );
}

// Faithful port of the GameZone MatchRow (gamezone.js): header line (time / level
// / venue), stacked home-over-away with a horizontal rule, a result-coloured
// vertical rule + scores, left result line. Names neutral; the losing side and
// its score are muted; the winning score is green (Ahma win) or red (Ahma loss).
function MatchRow({ m }) {
  const md = moment(String(m.date || "").replace(" ", "T"), moment.ISO_8601);
  const time = md.isValid() ? md.format("HH:mm") : "";
  const level = simplifyLevel(m.level ?? "");
  const live = isLiveMatch(m);
  const finished = Number(m.finished) > 0;

  const homeGoals = live || finished ? m.home_goals ?? "" : "";
  const awayGoals = live || finished ? m.away_goals ?? "" : "";
  const hg = parseInt(m.home_goals, 10);
  const ag = parseInt(m.away_goals, 10);
  const hasResult = finished && !isNaN(hg) && !isNaN(ag);

  const ahmaIsHome = m.isHomeGame === true;
  const ahmaIsAway = m.isHomeGame === false;
  const homeWin = hasResult && hg > ag;
  const awayWin = hasResult && ag > hg;
  const homeLose = hasResult && hg < ag;
  const awayLose = hasResult && ag < hg;

  const resultColor = !hasResult ? null : hg > ag ? (ahmaIsHome ? WIN : LOSS) : hg < ag ? (ahmaIsHome ? LOSS : WIN) : DRAW;
  const lineColor = resultColor || (live ? LIVE : "transparent");
  const vdivColor = resultColor || (live ? LIVE : "rgba(255,255,255,0.22)");

  const homeScoreStyle = live ? { color: LIVE } : !hasResult || hg === ag ? undefined : homeWin ? { color: ahmaIsHome ? WIN : LOSS } : { color: MUTED };
  const awayScoreStyle = live ? { color: LIVE } : !hasResult || hg === ag ? undefined : awayWin ? { color: ahmaIsAway ? WIN : LOSS } : { color: MUTED };
  const homeNameMuted = homeLose && !live;
  const awayNameMuted = awayLose && !live;

  const venueLabel = ahmaIsHome ? "Koti" : ahmaIsAway ? "Vieras" : null;
  const rink = m.rink || "";

  return (
    <div className="ot-row" style={{ "--line": lineColor }}>
      <div className="ot-head">
        {live && <span className="ot-live"><span className="ot-livedot" />LIVE</span>}
        <span className="ot-time"><LuClock className="ot-ic" />{time}</span>
        {level && <span className="ot-level">{level}</span>}
        {(rink || venueLabel) && (
          <span className="ot-venue"><LuMapPin className="ot-ic" />{rink}{rink && venueLabel && " • "}{venueLabel}</span>
        )}
      </div>

      <div className="ot-teams">
        <div className="ot-tl" style={{ gridArea: "1 / 1" }}>
          <img className="ot-logo" src={m.home_logo} alt="" />
          <span className="ot-name" style={homeNameMuted ? { color: MUTED } : undefined}>{m.home}</span>
        </div>
        <div className="ot-hdiv" />
        <div className="ot-tl" style={{ gridArea: "3 / 1" }}>
          <img className="ot-logo" src={m.away_logo} alt="" />
          <span className="ot-name" style={awayNameMuted ? { color: MUTED } : undefined}>{m.away}</span>
        </div>
        <div className="ot-vdiv" style={{ background: vdivColor }} />
        <span className="ot-score" style={{ gridArea: "1 / 3", ...(homeScoreStyle || {}) }}>{homeGoals}</span>
        <span className="ot-score" style={{ gridArea: "3 / 3", ...(awayScoreStyle || {}) }}>{awayGoals}</span>
      </div>
    </div>
  );
}

const css = `
.ot-content { position:absolute; top:112px; bottom:40px; left:40px; right:40px; display:flex; flex-direction:column; }
.ot-empty { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:60px; letter-spacing:0.06em; color:rgba(255,255,255,0.32); }

.ot-cols { flex:1; min-height:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:minmax(0,1fr); column-gap:48px; }
.ot-col { min-height:0; overflow:hidden; display:flex; flex-direction:column; }

.ot-day { flex:0 0 auto; font-family:${FONT_BODY}; font-weight:800; font-size:24px; letter-spacing:0.02em; text-transform:uppercase; color:var(--gz-text-primary, rgba(255,255,255,0.95)); padding:8px 2px 4px; }

.ot-row {
  position:relative; box-sizing:border-box; flex:0 0 auto; height:144px; overflow:hidden;
  display:flex; flex-direction:column; justify-content:center; gap:7px;
  padding:8px 6px 8px 22px;
  border-bottom:1px solid rgba(255,255,255,0.08);
}
.ot-row::before { content:""; position:absolute; left:0; top:12px; bottom:12px; width:5px; border-radius:2px; background:var(--line, transparent); }

.ot-head { display:flex; align-items:center; gap:12px; min-width:0; }
.ot-ic { flex-shrink:0; }
.ot-time { display:flex; align-items:center; gap:8px; font-family:${FONT_BODY}; font-weight:700; font-size:22px; line-height:1; color:var(--gz-text-primary, rgba(255,255,255,0.95)); }
.ot-time .ot-ic { width:19px; height:19px; }
.ot-level { font-family:${FONT_BODY}; font-weight:600; font-size:17px; letter-spacing:0.04em; text-transform:uppercase; color:var(--gz-text-primary, #fff); border:1px solid rgba(255,255,255,0.18); border-radius:7px; padding:1px 9px; line-height:1.3; }
.ot-venue { margin-left:auto; display:flex; align-items:center; gap:6px; font-family:${FONT_BODY}; font-weight:500; font-size:17px; letter-spacing:0.02em; color:var(--gz-text-muted, rgba(255,255,255,0.4)); min-width:0; white-space:nowrap; }
.ot-venue .ot-ic { width:17px; height:17px; }
.ot-live { display:inline-flex; align-items:center; gap:7px; font-family:${FONT_BODY}; font-weight:700; font-size:17px; letter-spacing:0.06em; color:${LOSS}; }
.ot-livedot { width:9px; height:9px; border-radius:50%; background:${LOSS}; }

.ot-teams { display:grid; grid-template-columns:minmax(0,1fr) auto auto; grid-template-rows:auto auto auto; column-gap:22px; row-gap:5px; align-items:center; }
.ot-tl { display:flex; align-items:center; gap:15px; min-width:0; }
.ot-hdiv { grid-area:2 / 1; height:1px; background:rgba(255,255,255,0.08); }
.ot-vdiv { grid-area:1 / 2 / 4 / 3; width:2px; align-self:stretch; justify-self:center; border-radius:1px; }
.ot-logo { width:36px; height:36px; flex-shrink:0; border-radius:9px; background:#fff; object-fit:contain; padding:4px; box-sizing:border-box; box-shadow:0 4px 12px rgba(0,0,0,0.35); }
.ot-name { min-width:0; font-family:${FONT_BODY}; font-weight:700; font-size:23px; letter-spacing:0.02em; text-transform:uppercase; color:var(--gz-text-primary, rgba(255,255,255,0.95)); line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ot-score { grid-column:3; font-family:${FONT_DISPLAY}; font-size:34px; line-height:1; letter-spacing:0.02em; color:var(--gz-text-primary, #fff); min-width:36px; text-align:center; align-self:center; font-variant-numeric:tabular-nums; }
`;
