import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuClock } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";

import InfoTvStage, { HeroBackdrop, Masthead, FONT_DISPLAY, FONT_BODY } from "./InfoTvFrame";
import { getMonday } from "../../Util";
import { fetchSeasonGames, gamesForWeek, mondayOf, isSeasonLoaded, subscribe } from "../../lib/seasonGamesCache";
import { isLiveMatch } from "../../hooks/useHeroMatches";

moment.locale("fi");

const MAX_GAMES = 16;
const FIT_PER_COL = 6; // games that fit in one column at the fixed row height
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

  // Layout: single centred column (?cols=1, testing); else always TWO columns —
  // few games → all in the left column with a club-logo panel filling the right;
  // more games → split chronologically across both (a day may repeat its header).
  const layout = useMemo(() => {
    const flat = (gs, tag) => {
      const out = [];
      let prev = null;
      gs.forEach((g, i) => {
        const day = moment(g.date).format("YYYY-MM-DD");
        if (day !== prev) { out.push({ type: "day", key: `${tag}-h-${day}`, day }); prev = day; }
        out.push({ type: "row", key: g.id ?? `${tag}-${i}`, m: g });
      });
      return out;
    };
    if (params.get("cols") === "1") return { mode: "single", cols: [flat(games, "s")] };
    if (games.length <= FIT_PER_COL) return { mode: "fill", cols: [flat(games, "l")] };
    const target = Math.ceil(games.length / 2);
    return { mode: "two", cols: [flat(games.slice(0, target), "l"), flat(games.slice(target), "r")] };
  }, [games, params]);

  return (
    <InfoTvStage backdrop={false}>
      <HeroBackdrop />
      <style>{css}</style>
      <Masthead title="KOTIOTTELUT" meta={weekRange} />

      <div className="ot-content">
        {loading && games.length === 0 && <div className="ot-empty">Ladataan otteluita…</div>}
        {!loading && games.length === 0 && <div className="ot-empty">Ei kotiotteluita tällä viikolla</div>}
        {games.length > 0 && (
          <div className={"ot-cols" + (layout.mode === "single" ? " ot-cols--single" : "")}>
            <Column items={layout.cols[0]} />
            {layout.mode === "fill" && <FillPanel />}
            {layout.mode === "two" && <Column items={layout.cols[1]} />}
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

function FillPanel() {
  return (
    <div className="ot-fill">
      <img className="ot-fill-logo" src="/infotv/wolverine.png" alt="" />
      <div className="ot-fill-text">Valkeakosken<br /><span>Kiekko-Ahma</span></div>
    </div>
  );
}

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

  const resultColor = !hasResult ? null : hg > ag ? (ahmaIsHome ? WIN : LOSS) : hg < ag ? (ahmaIsHome ? LOSS : WIN) : DRAW;
  const lineColor = resultColor || (live ? LIVE : "rgba(255,255,255,0.14)");

  const homeScoreStyle = live ? { color: LIVE } : !hasResult || hg === ag ? undefined : hg > ag ? { color: ahmaIsHome ? WIN : LOSS } : { color: MUTED };
  const awayScoreStyle = live ? { color: LIVE } : !hasResult || hg === ag ? undefined : ag > hg ? { color: ahmaIsAway ? WIN : LOSS } : { color: MUTED };
  const homeNameMuted = hasResult && hg < ag && !live;
  const awayNameMuted = hasResult && ag < hg && !live;

  return (
    <div className="ot-row">
      <div className="ot-head">
        {live && <span className="ot-live"><span className="ot-livedot" />LIVE</span>}
        <span className="ot-time"><LuClock className="ot-ic" />{time}</span>
        {level && <span className="ot-level">{level}</span>}
      </div>
      <div className="ot-body">
        <div className="ot-line" style={{ background: lineColor }} />
        <div className="ot-teams">
          <div className="ot-tl">
            <img className="ot-logo" src={m.home_logo} alt="" />
            <span className="ot-name" style={homeNameMuted ? { color: MUTED } : undefined}>{m.home}</span>
          </div>
          <div className="ot-tl">
            <img className="ot-logo" src={m.away_logo} alt="" />
            <span className="ot-name" style={awayNameMuted ? { color: MUTED } : undefined}>{m.away}</span>
          </div>
        </div>
        <div className="ot-line ot-line--mid" style={{ background: lineColor }} />
        <div className="ot-scores">
          <span className="ot-score" style={homeScoreStyle}>{homeGoals}</span>
          <span className="ot-score" style={awayScoreStyle}>{awayGoals}</span>
        </div>
      </div>
    </div>
  );
}

const css = `
.ot-content { position:absolute; top:116px; bottom:40px; left:44px; right:44px; display:flex; flex-direction:column; }
.ot-empty { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:60px; letter-spacing:0.06em; color:rgba(255,255,255,0.32); }

.ot-cols { flex:1; min-height:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:minmax(0,1fr); column-gap:52px; }
.ot-cols--single { grid-template-columns:minmax(0,1180px); justify-content:center; }
.ot-col { min-height:0; overflow:hidden; display:flex; flex-direction:column; }

.ot-day { flex:0 0 auto; font-family:${FONT_BODY}; font-weight:800; font-size:24px; letter-spacing:0.02em; text-transform:uppercase; color:var(--gz-text-primary, rgba(255,255,255,0.95)); padding:8px 2px 4px; }
.ot-day:first-child { padding-top:2px; }

.ot-row { box-sizing:border-box; flex:0 0 auto; height:144px; overflow:hidden; display:flex; flex-direction:column; justify-content:center; gap:9px; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,0.08); }

.ot-head { display:flex; align-items:center; gap:12px; min-width:0; }
.ot-ic { width:19px; height:19px; flex-shrink:0; }
.ot-time { display:flex; align-items:center; gap:8px; font-family:${FONT_BODY}; font-weight:700; font-size:22px; line-height:1; color:var(--gz-text-primary, rgba(255,255,255,0.95)); }
.ot-time .ot-ic { color:${'var(--gz-text-muted, rgba(255,255,255,0.4))'}; }
.ot-level { font-family:${FONT_BODY}; font-weight:600; font-size:17px; letter-spacing:0.04em; text-transform:uppercase; color:var(--gz-text-primary, #fff); border:1px solid rgba(255,255,255,0.18); border-radius:7px; padding:1px 10px; line-height:1.3; }
.ot-live { display:inline-flex; align-items:center; gap:7px; font-family:${FONT_BODY}; font-weight:700; font-size:17px; letter-spacing:0.06em; color:${LOSS}; }
.ot-livedot { width:8px; height:8px; border-radius:50%; background:${LOSS}; }

.ot-body { flex:0 0 auto; display:flex; align-items:stretch; }
.ot-line { flex:0 0 auto; width:5px; border-radius:2px; margin-right:20px; }
.ot-line--mid { width:2px; margin:0 24px; }
.ot-teams { flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; gap:14px; }
.ot-tl { display:flex; align-items:center; gap:15px; min-width:0; }
.ot-logo { width:36px; height:36px; flex-shrink:0; border-radius:8px; background:#fff; object-fit:contain; padding:4px; box-sizing:border-box; box-shadow:0 3px 10px rgba(0,0,0,0.35); }
.ot-name { min-width:0; font-family:${FONT_BODY}; font-weight:700; font-size:25px; letter-spacing:0.02em; text-transform:uppercase; color:var(--gz-text-primary, rgba(255,255,255,0.95)); line-height:1.05; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ot-scores { flex:0 0 auto; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:14px; min-width:44px; }
.ot-score { font-family:${FONT_DISPLAY}; font-size:38px; line-height:1; letter-spacing:0.02em; color:var(--gz-text-primary, #fff); font-variant-numeric:tabular-nums; }

.ot-fill { min-height:0; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:28px; opacity:0.5; }
.ot-fill-logo { width:300px; height:auto; }
.ot-fill-text { text-align:center; font-family:${FONT_DISPLAY}; font-size:56px; line-height:0.95; letter-spacing:0.05em; color:#fff; }
.ot-fill-text span { color:var(--color-primary, #F06E1E); }
`;
