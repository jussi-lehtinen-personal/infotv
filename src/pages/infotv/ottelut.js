import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuClock } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";

import InfoTvStage, { HeroBackdrop, Masthead, FONT_DISPLAY, FONT_BODY, ORANGE, STEEL } from "./InfoTvFrame";
import { getMonday, splitTeamName } from "../../Util";
import { fetchSeasonGames, gamesForWeek, mondayOf, isSeasonLoaded, subscribe } from "../../lib/seasonGamesCache";
import { isLiveMatch } from "../../hooks/useHeroMatches";

moment.locale("fi");

const COLS = 3;
const ROWS = 5;
const SLOTS = COLS * ROWS; // 3 columns × 5 rows
const WIN = "var(--color-win)";
const LOSS = "var(--color-loss)";
const DRAW = "var(--color-draw)";
const LIVE = "var(--color-primary)";
const MUTED = "rgba(255,255,255,0.4)";
const PARTNERS_LS = "ahma.infotv.partners.v1";

function simplifyLevel(level) {
  if (!level) return "";
  const s = String(level).trim();
  const m = s.match(/^u\s*(\d{1,2})\b/i);
  if (m) return `U${m[1]}`;
  return s;
}

export default function InfoTvOttelut() {
  const [version, setVersion] = useState(0);
  const [params] = useSearchParams();
  const [partners, setPartners] = useState(() => {
    try { const r = JSON.parse(localStorage.getItem(PARTNERS_LS)); return Array.isArray(r) ? r : []; } catch { return []; }
  });

  useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    let cancelled = false;
    fetchSeasonGames().catch(() => {}).finally(() => { if (!cancelled) setVersion((v) => v + 1); });
    fetch("/api/getPartners").then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => {
      if (cancelled) return;
      const list = Array.isArray(d.partners) ? d.partners.filter((p) => p.image) : [];
      setPartners(list);
      try { localStorage.setItem(PARTNERS_LS, JSON.stringify(list)); } catch { /* ignore */ }
    }).catch(() => {});
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
    return [...wk].sort((a, b) => new Date(a.date) - new Date(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday, version]);

  const weekRange = useMemo(() => {
    const mon = getMonday(new Date(baseDate));
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    return moment(mon).format("D.M.") + " – " + moment(sun).format("D.M.");
  }, [baseDate]);

  // Week summary (finished home games only).
  const summary = useMemo(() => {
    let w = 0, l = 0, d = 0, gf = 0, ga = 0, played = 0;
    for (const m of games) {
      const hg = parseInt(m.home_goals, 10), ag = parseInt(m.away_goals, 10);
      if (!(Number(m.finished) > 0) || isNaN(hg) || isNaN(ag)) continue;
      played++; gf += hg; ga += ag;
      if (hg > ag) w++; else if (hg < ag) l++; else d++;
    }
    return { n: games.length, played, w, l, d, gf, ga };
  }, [games]);

  // Build 3 columns × 5 rows. Games fill column-by-column (col0 top→bottom,
  // then col1…) exactly like the CSS grid did; leftover slots get filler
  // modules. Each game item carries the progress/day metadata the rail needs.
  const columns = useMemo(() => {
    const gameItems = games.slice(0, SLOTS).map((m, i) => {
      const md = moment(String(m.date || "").replace(" ", "T"), moment.ISO_8601);
      const hg = parseInt(m.home_goals, 10), ag = parseInt(m.away_goals, 10);
      const done = Number(m.finished) > 0 && !isNaN(hg) && !isNaN(ag);
      const live = isLiveMatch(m);
      return { type: "game", key: m.id ?? `g${i}`, m, wd: md.isValid() ? md.format("dd").toUpperCase() : "", done, live };
    });
    const firstUpcoming = gameItems.findIndex((g) => !g.done && !g.live);
    gameItems.forEach((g, i) => { g.isNext = i === firstUpcoming; });

    const fillers = [];
    if (games.length > 0) fillers.push({ type: "summary" });
    for (let i = 0; i < partners.length; i++) fillers.push({ type: "partner", p: partners[i] });
    fillers.push({ type: "follow" });

    const out = [...gameItems];
    let fi = 0;
    while (out.length < SLOTS) { out.push({ ...fillers[fi % fillers.length], key: `f${out.length}` }); fi++; }

    const cols = [];
    for (let c = 0; c < COLS; c++) cols.push(out.slice(c * ROWS, c * ROWS + ROWS));

    // Day label per column: always label the column's first game, plus any game
    // where the weekday changes from the game above it in the same column.
    for (const col of cols) {
      let prevWd = null;
      for (const it of col) {
        if (it.type !== "game") continue;
        if (prevWd === null || it.wd !== prevWd) it.dayLabel = it.wd;
        prevWd = it.wd;
      }
    }
    return cols;
  }, [games, partners]);

  const loading = !isSeasonLoaded() && games.length === 0;

  return (
    <InfoTvStage backdrop={false}>
      <HeroBackdrop calm />
      <style>{css}</style>
      <Masthead title="KOTIOTTELUT" meta={weekRange} />

      {loading ? (
        <div className="ok-grid"><div className="ok-empty">Ladataan otteluita…</div></div>
      ) : (
        <div className="ok-grid">
          {columns.map((col, ci) => (
            <div className="ok-col" key={ci}>
              <div className="ok-cells">
                {col.map((it) => (
                  <div className="ok-cellwrap" key={it.key}><Cell it={it} summary={summary} /></div>
                ))}
              </div>
              <Rail col={col} />
            </div>
          ))}
        </div>
      )}
    </InfoTvStage>
  );
}

// GameZone jakso-style progress rail down the right edge of a column: one node
// per game (played = solid orange, next = orange ring, upcoming = dim), joined
// by segments coloured by progress, with a weekday pill where the day changes.
function Rail({ col }) {
  return (
    <div className="ok-rail">
      {col.map((it, li) => {
        if (it.type !== "game") return <div className="ok-railslot" key={li} />;
        const prev = col[li - 1], next = col[li + 1];
        const upConnect = prev && prev.type === "game";
        const downConnect = next && next.type === "game";
        const upDone = upConnect && (prev.done || prev.live);
        const downDone = it.done || it.live;
        const node = it.live ? "ok-node--live" : it.done ? "ok-node--done" : it.isNext ? "ok-node--next" : "ok-node--todo";
        return (
          <div className="ok-railslot" key={li}>
            {upConnect && <span className={"ok-seg ok-seg--up " + (upDone ? "ok-seg--done" : "ok-seg--todo")} />}
            {downConnect && <span className={"ok-seg ok-seg--down " + (downDone ? "ok-seg--done" : "ok-seg--todo")} />}
            <span className={"ok-node " + node} />
            {it.dayLabel && <span className="ok-day">{it.dayLabel}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Cell({ it, summary }) {
  if (it.type === "game") return <MatchCell m={it.m} />;
  if (it.type === "partner") return <PartnerCell p={it.p} />;
  if (it.type === "summary") return <SummaryCell s={summary} />;
  return <FollowCell />;
}

function MatchCell({ m }) {
  const md = moment(String(m.date || "").replace(" ", "T"), moment.ISO_8601);
  const time = md.isValid() ? md.format("HH:mm") : "";
  const level = simplifyLevel(m.level ?? "");
  const live = isLiveMatch(m);
  const finished = Number(m.finished) > 0;
  const show = live || finished;
  const home = splitTeamName(m.home ?? "");
  const away = splitTeamName(m.away ?? "");
  const hg = parseInt(m.home_goals, 10), ag = parseInt(m.away_goals, 10);
  const hasResult = finished && !isNaN(hg) && !isNaN(ag);
  const line = !hasResult ? (live ? LIVE : "rgba(255,255,255,0.14)") : hg > ag ? WIN : hg < ag ? LOSS : DRAW;
  const homeSc = live ? { color: LIVE } : !hasResult || hg === ag ? undefined : hg > ag ? { color: WIN } : { color: MUTED };
  const awaySc = live ? { color: LIVE } : !hasResult || hg === ag ? undefined : ag > hg ? { color: LOSS } : { color: MUTED };
  const homeMuted = hasResult && hg < ag && !live;
  const awayMuted = hasResult && ag < hg && !live;

  return (
    <div className="ok-card">
      <div className="ok-line" style={{ background: line }} />
      <div className="ok-head">
        <span className="ok-time"><LuClock className="ok-ic" />{time}</span>
        {level && <span className="ok-level">{level}</span>}
        {live && <span className="ok-livebadge">LIVE</span>}
      </div>
      <div className="ok-team">
        <div className="ok-logowrap"><img className="ok-logo" src={m.home_logo} alt="" /></div>
        <span className="ok-name" style={homeMuted ? { color: MUTED } : undefined}>{home.main}{home.sub && <span className="ok-sub"> {home.sub}</span>}</span>
        <span className="ok-score" style={homeSc}>{show ? m.home_goals : ""}</span>
      </div>
      <div className="ok-team">
        <div className="ok-logowrap"><img className="ok-logo" src={m.away_logo} alt="" /></div>
        <span className="ok-name" style={awayMuted ? { color: MUTED } : undefined}>{away.main}{away.sub && <span className="ok-sub"> {away.sub}</span>}</span>
        <span className="ok-score" style={awaySc}>{show ? m.away_goals : ""}</span>
      </div>
    </div>
  );
}

function SummaryCell({ s }) {
  return (
    <div className="ok-filler">
      <div className="ok-filler-title">Viikon yhteenveto</div>
      <div className="ok-sum">
        <div className="ok-sum-row"><b>{s.n}</b> {s.n === 1 ? "kotiottelu" : "kotiottelua"}</div>
        {s.played > 0 && <div className="ok-sum-row"><b style={{ color: "var(--color-win)" }}>{s.w}</b> V · <b style={{ color: "var(--color-loss)" }}>{s.l}</b> T{s.d ? <> · <b>{s.d}</b> TP</> : null}</div>}
        {s.played > 0 && <div className="ok-sum-row">Maalit <b style={{ color: ORANGE }}>{s.gf}</b>–<b>{s.ga}</b></div>}
      </div>
    </div>
  );
}

function PartnerCell({ p }) {
  const [err, setErr] = useState(false);
  return (
    <div className="ok-filler ok-partner">
      <div className="ok-filler-title">Yhteistyössä</div>
      <div className="ok-partner-box" style={{ background: p.light ? "transparent" : "#fff" }}>
        {p.image && !err
          ? <img src={p.image} alt={p.name} onError={() => setErr(true)} className="ok-partner-img" />
          : <span className="ok-partner-name" style={{ color: p.light ? "#fff" : "#333" }}>{p.name}</span>}
      </div>
    </div>
  );
}

function FollowCell() {
  return (
    <div className="ok-filler ok-follow">
      <div className="ok-filler-title">Tulokset & lisää</div>
      <div className="ok-follow-url">kiekko-ahma.fi</div>
      <div className="ok-follow-sub">Seuraa joukkueita ja pelejä</div>
    </div>
  );
}

const css = `
.ok-grid { position:absolute; top:110px; bottom:32px; left:40px; right:40px; display:flex; gap:16px; z-index:2; }
.ok-empty { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:60px; color:rgba(255,255,255,0.32); }

.ok-col { flex:1; min-width:0; display:flex; gap:10px; }
.ok-cells { flex:1; min-width:0; display:flex; flex-direction:column; gap:16px; }
.ok-cellwrap { flex:1; min-height:0; display:flex; }
.ok-cellwrap > * { flex:1; min-width:0; }

/* progress rail */
.ok-rail { flex:0 0 40px; display:flex; flex-direction:column; gap:16px; }
.ok-railslot { flex:1; position:relative; }
.ok-seg { position:absolute; left:50%; transform:translateX(-50%); width:3px; border-radius:2px; }
.ok-seg--up { top:-8px; height:calc(50% + 8px); }
.ok-seg--down { top:50%; bottom:-8px; }
.ok-seg--done { background:${ORANGE}; }
.ok-seg--todo { background:rgba(255,255,255,0.14); }
.ok-node { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:15px; height:15px; border-radius:50%; box-sizing:border-box; z-index:2; }
.ok-node--done { background:${ORANGE}; border:2px solid ${ORANGE}; }
.ok-node--live { background:${ORANGE}; border:2px solid ${ORANGE}; box-shadow:0 0 0 5px rgba(240,110,30,0.28); }
.ok-node--next { background:#141418; border:3px solid ${ORANGE}; width:17px; height:17px; }
.ok-node--todo { background:#141418; border:2px solid rgba(255,255,255,0.3); }
.ok-day { position:absolute; left:50%; transform:translateX(-50%); top:6px; font-family:${FONT_DISPLAY}; font-size:20px; line-height:1; letter-spacing:0.04em; color:${ORANGE}; background:rgba(9,9,11,0.9); padding:2px 6px 1px; border-radius:6px; z-index:3; white-space:nowrap; }

.ok-card { position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:center; gap:7px; padding:11px 20px 11px 24px; border-radius:16px; background:rgba(20,20,24,0.66); border:1px solid rgba(255,255,255,0.09); }
.ok-line { position:absolute; left:0; top:11px; bottom:11px; width:5px; border-radius:0 3px 3px 0; }

.ok-head { display:flex; align-items:center; gap:11px; }
.ok-ic { width:18px; height:18px; color:${STEEL}; flex-shrink:0; }
.ok-time { display:flex; align-items:center; gap:7px; font-family:${FONT_BODY}; font-weight:700; font-size:21px; line-height:1; color:var(--gz-text-primary, #fff); }
.ok-level { font-family:${FONT_BODY}; font-weight:600; font-size:17px; letter-spacing:0.04em; text-transform:uppercase; color:#fff; border:1px solid rgba(255,255,255,0.18); border-radius:7px; padding:1px 9px; }
.ok-livebadge { margin-left:auto; font-family:${FONT_BODY}; font-weight:800; font-size:16px; letter-spacing:0.06em; color:${LOSS}; }

.ok-team { display:grid; grid-template-columns:38px 1fr auto; align-items:center; gap:13px; }
.ok-logowrap { width:38px; height:38px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; padding:4px; box-sizing:border-box; }
.ok-logo { max-width:100%; max-height:100%; object-fit:contain; }
.ok-name { min-width:0; font-family:${FONT_BODY}; font-weight:800; font-size:26px; line-height:1.05; letter-spacing:0.01em; text-transform:uppercase; color:var(--gz-text-primary, #fff); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ok-sub { font-weight:700; opacity:0.85; font-size:0.82em; }
.ok-score { font-family:${FONT_DISPLAY}; font-size:38px; line-height:1; letter-spacing:0.02em; color:#fff; min-width:32px; text-align:right; }

/* fillers */
.ok-filler { display:flex; flex-direction:column; padding:13px 22px; border-radius:16px; overflow:hidden; background:rgba(240,110,30,0.06); border:1px solid rgba(240,110,30,0.16); }
.ok-filler-title { flex:0 0 auto; font-family:${FONT_BODY}; font-weight:800; font-size:18px; letter-spacing:0.14em; text-transform:uppercase; color:${ORANGE}; }
.ok-sum { flex:1; min-height:0; display:flex; flex-direction:column; justify-content:center; gap:5px; }
.ok-sum-row { font-family:${FONT_BODY}; font-weight:600; font-size:22px; color:rgba(255,255,255,0.82); }
.ok-sum-row b { font-family:${FONT_DISPLAY}; font-size:1.35em; color:#fff; letter-spacing:0.02em; }

.ok-partner { align-items:stretch; }
.ok-partner-box { flex:1; min-height:0; margin-top:10px; border-radius:12px; display:flex; align-items:center; justify-content:center; padding:14px; box-sizing:border-box; }
.ok-partner-img { max-width:100%; max-height:100%; object-fit:contain; }
.ok-partner-name { font-family:${FONT_DISPLAY}; font-size:34px; text-align:center; }

.ok-follow { justify-content:center; }
.ok-follow-url { font-family:${FONT_DISPLAY}; font-size:52px; letter-spacing:0.03em; color:#fff; margin-top:10px; }
.ok-follow-sub { font-family:${FONT_BODY}; font-weight:600; font-size:24px; color:${STEEL}; margin-top:6px; }
`;
