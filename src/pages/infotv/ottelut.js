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

// Random sample of n items (Fisher–Yates) — used to rotate which partner logos
// show up as fillers, so each page load gets a fresh couple.
function sample(arr, n) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
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
    const now = moment();
    const gameItems = games.slice(0, SLOTS).map((m, i) => {
      const md = moment(String(m.date || "").replace(" ", "T"), moment.ISO_8601);
      const hg = parseInt(m.home_goals, 10), ag = parseInt(m.away_goals, 10);
      const hasResult = Number(m.finished) > 0 && !isNaN(hg) && !isNaN(ag);
      const live = isLiveMatch(m);
      // A game counts as "played" for the progress rail once it has a result OR
      // its start time is in the past — many junior games (U9/U10) never record
      // a score, so a result alone would leave already-played games looking
      // upcoming.
      const done = !live && (hasResult || (md.isValid() && md.isBefore(now)));
      return { type: "game", key: m.id ?? `g${i}`, size: 1, m, wd: md.isValid() ? md.format("dd").toUpperCase() : "", done, live };
    });
    const firstUpcoming = gameItems.findIndex((g) => !g.done && !g.live);
    gameItems.forEach((g, i) => { g.isNext = i === firstUpcoming; });

    // Games fill column-major (col0 top→bottom, then col1…), one slot each.
    const cols = [[], [], []];
    gameItems.forEach((g, i) => { const c = Math.floor(i / ROWS); if (c < COLS) cols[c].push(g); });

    // Day label per column: the column's first game + any weekday change within.
    for (const col of cols) {
      let prevWd = null;
      for (const it of col) { if (prevWd === null || it.wd !== prevWd) it.dayLabel = it.wd; prevWd = it.wd; }
    }

    // Data-driven "detail" cards derived from this week's games (no extra API).
    const totG = (g) => (parseInt(g.m.home_goals, 10) || 0) + (parseInt(g.m.away_goals, 10) || 0);
    const marg = (g) => (parseInt(g.m.home_goals, 10) || 0) - (parseInt(g.m.away_goals, 10) || 0);
    const finished = gameItems.filter((g) => { const hg = parseInt(g.m.home_goals, 10), ag = parseInt(g.m.away_goals, 10); return g.done && !isNaN(hg) && !isNaN(ag); });
    const topGame = finished.length ? finished.reduce((a, b) => (totG(b) > totG(a) ? b : a)) : null;
    const winsArr = finished.filter((g) => marg(g) > 0);
    const biggestWin = winsArr.length ? winsArr.reduce((a, b) => (marg(b) > marg(a) ? b : a)) : null;
    const nextGame = gameItems.find((g) => !g.done && !g.live) || null;

    // Pack the leftover slots of each column with random detail/partner modules
    // (1, 2 or 3 slots tall). Data cards appear once; promos + partners repeat.
    // Partners are a random few, refreshed every load. Each column fills exactly.
    const s = summary;
    const partnerPicks = sample(partners, 3);
    // Every module is once-per-screen except partners, which repeat to fill.
    const SINGLE = ["summary", "goals", "wins", "avg", "topGame", "biggestWin", "nextGame", "follow", "hashtag", "ahmaliiga", "app"];
    let pIdx = 0, fk = 0;
    const used = new Set();
    const makeFiller = (rem) => {
      const c = [];
      const add = (variant, size, w, extra) => { if (size >= 1 && size <= rem) c.push({ variant, size, w, extra }); };
      if (!used.has("summary") && s.n > 0) add("summary", rem >= 3 && Math.random() < 0.5 ? 3 : 2, 3);
      if (!used.has("goals") && s.played > 0) add("goals", 1, 2);
      if (!used.has("wins") && s.played > 0) add("wins", 1, 2);
      if (!used.has("avg") && s.played > 0) add("avg", 1, 1.5);
      if (!used.has("topGame") && topGame) add("topGame", 2, 2, { g: topGame });
      if (!used.has("biggestWin") && biggestWin) add("biggestWin", 2, 2, { g: biggestWin });
      if (!used.has("nextGame") && nextGame) add("nextGame", 2, 2.5, { g: nextGame });
      if (!used.has("follow")) add("follow", 1, 1);
      if (!used.has("hashtag")) add("hashtag", 1, 1);
      if (!used.has("ahmaliiga")) add("ahmaliiga", rem >= 3 && Math.random() < 0.4 ? 3 : 2, 1.5);
      if (!used.has("app")) add("app", 1, 1);
      if (partnerPicks.length) {
        const size = rem >= 3 && Math.random() < 0.25 ? 3 : rem >= 2 && Math.random() < 0.5 ? 2 : 1;
        add("partner", size, 3.5, { p: partnerPicks[pIdx++ % partnerPicks.length] });
      }
      if (!c.length) add("follow", 1, 1);
      const total = c.reduce((a, b) => a + b.w, 0);
      let r = Math.random() * total, chosen = c[c.length - 1];
      for (const x of c) { r -= x.w; if (r <= 0) { chosen = x; break; } }
      if (SINGLE.includes(chosen.variant)) used.add(chosen.variant);
      return { type: "detail", variant: chosen.variant, size: chosen.size, key: `f${fk++}`, ...(chosen.extra || {}) };
    };
    for (const col of cols) {
      let rem = ROWS - col.reduce((acc, c) => acc + c.size, 0);
      while (rem > 0) { const f = makeFiller(rem); col.push(f); rem -= f.size; }
    }
    return cols;
  }, [games, partners, summary]);

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
              <Rail col={col} />
              <div className="ok-cells">
                {col.map((it) => (
                  <div className="ok-cellwrap" key={it.key} style={{ flex: it.size }}><Cell it={it} summary={summary} /></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </InfoTvStage>
  );
}

// GameZone jakso-style progress rail down the LEFT edge of a column: one node
// per game (played = solid orange, next = orange ring, upcoming = dim), joined
// by segments coloured by progress. The first game of each day gets a bigger
// labelled ball (weekday) instead of a plain dot — the day marker sits right at
// that match.
function Rail({ col }) {
  const games = col.filter((c) => c.type === "game");
  return (
    <div className="ok-rail">
      {Array.from({ length: ROWS }).map((_, li) => {
        const it = games[li];
        if (!it) return <div className="ok-railslot" key={li} />;
        const prev = games[li - 1], next = games[li + 1];
        const upDone = prev && (prev.done || prev.live);
        const downDone = it.done || it.live;
        const state = it.live ? "live" : it.done ? "done" : it.isNext ? "next" : "todo";
        return (
          <div className="ok-railslot" key={li}>
            {prev && <span className={"ok-seg ok-seg--up " + (upDone ? "ok-seg--done" : "ok-seg--todo")} />}
            {next && <span className={"ok-seg ok-seg--down " + (downDone ? "ok-seg--done" : "ok-seg--todo")} />}
            {it.dayLabel
              ? <span className={"ok-dayball ok-dayball--" + state}>{it.dayLabel}</span>
              : <span className={"ok-node ok-node--" + state} />}
          </div>
        );
      })}
    </div>
  );
}

function Cell({ it, summary }) {
  if (it.type === "game") return <MatchCell m={it.m} />;
  return <DetailCell it={it} s={summary} />;
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
  const homeSc = live ? { color: LIVE } : !hasResult || hg === ag ? undefined : hg > ag ? { color: WIN } : { color: MUTED };
  const awaySc = live ? { color: LIVE } : !hasResult || hg === ag ? undefined : ag > hg ? { color: LOSS } : { color: MUTED };
  const homeMuted = hasResult && hg < ag && !live;
  const awayMuted = hasResult && ag < hg && !live;

  return (
    <div className="ok-card">
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

// ── Detail / filler modules ──────────────────────────────────────────────
// One switchboard component; every variant renders inside an .ok-filler so it
// shares the dark card look. Sizes (1/2/3 slots) come from the packer; the flex
// height adapts automatically, so most variants need no size-specific styling.
function DetailCell({ it, s }) {
  switch (it.variant) {
    case "summary":
      return (
        <div className="ok-filler">
          <div className="ok-filler-title">Viikon yhteenveto</div>
          <div className="ok-stats">
            <Stat val={s.n} label="Kotiottelua" />
            {s.played > 0 && <><span className="ok-statdiv" /><Stat label={"V · T" + (s.d ? " · TP" : "")}
              val={<><span style={{ color: WIN }}>{s.w}</span>·<span style={{ color: LOSS }}>{s.l}</span>{s.d ? <>·{s.d}</> : null}</>} /></>}
            {s.played > 0 && <><span className="ok-statdiv" /><Stat label="Maalit"
              val={<><span style={{ color: ORANGE }}>{s.gf}</span>–{s.ga}</>} /></>}
          </div>
        </div>
      );
    case "goals":
      return <BigStat title="Maalit" val={<><span style={{ color: ORANGE }}>{s.gf}</span>–{s.ga}</>} sub="Tehdyt – päästetyt" />;
    case "wins":
      return <BigStat title="Voitot" val={s.w} valColor={WIN} sub={`${s.played} pelatusta`} />;
    case "avg":
      return <BigStat title="Maalia / ottelu" val={s.played ? (s.gf / s.played).toFixed(1).replace(".", ",") : "0"} sub="Omat maalit" />;
    case "topGame":
      return <MiniMatch g={it.g} title="Viikon maalisade" />;
    case "biggestWin":
      return <MiniMatch g={it.g} title="Suurin voitto" />;
    case "nextGame":
      return <MiniMatch g={it.g} title="Seuraava kotipeli" upcoming />;
    case "hashtag":
      return <div className="ok-filler ok-center"><div className="ok-big">#KIEKKOAHMA</div><div className="ok-sub2">Jaa somessa</div></div>;
    case "app":
      return <div className="ok-filler ok-center"><div className="ok-big" style={{ color: ORANGE }}>GAMEZONE</div><div className="ok-sub2">Lataa seuran sovellus</div></div>;
    case "ahmaliiga":
      return (
        <div className="ok-filler">
          <div className="ok-filler-title">Ahmaliiga</div>
          <div className="ok-al-body">
            <div className="ok-al-txt">
              <div className="ok-al-h">Pelaa fantasialiigaa!</div>
              <div className="ok-al-url">gamezone.kiekko-ahma.fi<b>/ahmaliiga</b></div>
            </div>
            {it.size >= 3 && <img className="ok-al-qr" src="/infotv/qr_ahmaliiga.png" alt="" />}
          </div>
        </div>
      );
    case "partner":
      return <PartnerCell p={it.p} />;
    default:
      return <div className="ok-filler ok-center"><div className="ok-big">kiekko-ahma.fi</div><div className="ok-sub2">Seuraa joukkueita ja pelejä</div></div>;
  }
}

function Stat({ val, label }) {
  return <div className="ok-stat"><div className="ok-stat-val">{val}</div><div className="ok-stat-lbl">{label}</div></div>;
}

function BigStat({ title, val, valColor, sub }) {
  return (
    <div className="ok-filler">
      <div className="ok-filler-title">{title}</div>
      <div className="ok-bigstat">
        <div className="ok-bigstat-val" style={valColor ? { color: valColor } : undefined}>{val}</div>
        {sub && <div className="ok-bigstat-sub">{sub}</div>}
      </div>
    </div>
  );
}

function MiniMatch({ g, title, upcoming }) {
  const m = g.m;
  const home = splitTeamName(m.home ?? ""), away = splitTeamName(m.away ?? "");
  const md = moment(String(m.date || "").replace(" ", "T"), moment.ISO_8601);
  const meta = upcoming
    ? (md.isValid() ? md.format("dd D.M. [klo] HH:mm").toUpperCase() : "")
    : `${m.home_goals}–${m.away_goals}`;
  return (
    <div className="ok-filler">
      <div className="ok-filler-title">{title}</div>
      <div className="ok-mini">
        <div className="ok-mini-row">
          <img className="ok-mini-logo" src={m.home_logo} alt="" />
          <span className="ok-mini-name">{home.main}{home.sub && <span className="ok-sub"> {home.sub}</span>}</span>
        </div>
        <div className="ok-mini-row">
          <img className="ok-mini-logo" src={m.away_logo} alt="" />
          <span className="ok-mini-name">{away.main}{away.sub && <span className="ok-sub"> {away.sub}</span>}</span>
        </div>
        <div className="ok-mini-meta">{meta}</div>
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

const css = `
.ok-grid { position:absolute; top:110px; bottom:32px; left:40px; right:40px; display:flex; gap:16px; z-index:2; }
.ok-empty { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:60px; color:rgba(255,255,255,0.32); }

.ok-col { flex:1; min-width:0; display:flex; gap:12px; }
.ok-cells { flex:1; min-width:0; display:flex; flex-direction:column; gap:16px; }
.ok-cellwrap { flex:1; min-height:0; display:flex; }
.ok-cellwrap > * { flex:1; min-width:0; }

/* progress rail (left edge of each column) */
.ok-rail { flex:0 0 52px; display:flex; flex-direction:column; gap:16px; }
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
.ok-dayball { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:52px; height:52px; border-radius:50%; box-sizing:border-box; z-index:3; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:29px; line-height:1; letter-spacing:0.03em; padding-top:2px; }
.ok-dayball--done, .ok-dayball--live { background:${ORANGE}; border:2px solid ${ORANGE}; color:#fff; }
.ok-dayball--live { box-shadow:0 0 0 5px rgba(240,110,30,0.28); }
.ok-dayball--next { background:#141418; border:3px solid ${ORANGE}; color:${ORANGE}; }
.ok-dayball--todo { background:#141418; border:2px solid rgba(255,255,255,0.3); color:${STEEL}; }

.ok-card { position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:center; gap:7px; padding:11px 22px; border-radius:16px; background:rgba(20,20,24,0.66); border:1px solid rgba(255,255,255,0.09); }

.ok-head { display:flex; align-items:center; gap:11px; }
.ok-ic { width:18px; height:18px; color:${STEEL}; flex-shrink:0; }
.ok-time { display:flex; align-items:center; gap:7px; font-family:${FONT_BODY}; font-weight:700; font-size:21px; line-height:1; color:var(--gz-text-primary, #fff); }
.ok-level { font-family:${FONT_BODY}; font-weight:600; font-size:17px; letter-spacing:0.04em; text-transform:uppercase; color:#fff; border:1px solid rgba(255,255,255,0.18); border-radius:7px; padding:1px 9px; }
.ok-livebadge { margin-left:auto; font-family:${FONT_BODY}; font-weight:800; font-size:16px; letter-spacing:0.06em; color:${LOSS}; }

.ok-team { display:grid; grid-template-columns:38px 1fr auto; align-items:center; gap:13px; }
.ok-logowrap { width:38px; height:38px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; padding:4px; box-sizing:border-box; }
.ok-logo { max-width:100%; max-height:100%; object-fit:contain; }
.ok-name { min-width:0; font-family:${FONT_BODY}; font-weight:800; font-size:26px; line-height:1.05; letter-spacing:0.01em; text-transform:uppercase; color:var(--gz-text-primary, #fff); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ok-sub { font-weight:700; opacity:0.82; }
.ok-score { font-family:${FONT_DISPLAY}; font-size:38px; line-height:1; letter-spacing:0.02em; color:#fff; min-width:32px; text-align:right; }

/* detail / filler modules */
.ok-filler { display:flex; flex-direction:column; padding:13px 22px; border-radius:16px; overflow:hidden; background:rgba(20,20,24,0.66); border:1px solid rgba(255,255,255,0.09); }
.ok-filler-title { flex:0 0 auto; font-family:${FONT_BODY}; font-weight:800; font-size:18px; letter-spacing:0.14em; text-transform:uppercase; color:${ORANGE}; }
.ok-center { align-items:center; justify-content:center; text-align:center; }
.ok-big { font-family:${FONT_DISPLAY}; font-size:46px; line-height:1; letter-spacing:0.03em; color:#fff; }
.ok-sub2 { font-family:${FONT_BODY}; font-weight:600; font-size:20px; color:${STEEL}; margin-top:8px; }

/* summary stat row (GameZone jakso style: value + divider + value) */
.ok-stats { flex:1; min-height:0; display:flex; align-items:center; justify-content:space-around; margin-top:2px; }
.ok-stat { display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center; padding:0 4px; min-width:0; }
.ok-stat-val { font-family:${FONT_DISPLAY}; font-size:50px; line-height:1; letter-spacing:0.02em; color:#fff; white-space:nowrap; }
.ok-stat-lbl { font-family:${FONT_BODY}; font-weight:700; font-size:16px; letter-spacing:0.07em; text-transform:uppercase; color:${STEEL}; }
.ok-statdiv { width:1.5px; align-self:stretch; margin:12px 0; background:rgba(255,255,255,0.14); flex-shrink:0; }

/* single big-number stat */
.ok-bigstat { flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
.ok-bigstat-val { font-family:${FONT_DISPLAY}; font-size:86px; line-height:1; letter-spacing:0.02em; color:#fff; white-space:nowrap; }
.ok-bigstat-sub { font-family:${FONT_BODY}; font-weight:700; font-size:17px; letter-spacing:0.06em; text-transform:uppercase; color:${STEEL}; margin-top:10px; }

/* mini match (top game / biggest win / next game) */
.ok-mini { flex:1; min-height:0; display:flex; flex-direction:column; justify-content:center; gap:9px; margin-top:2px; }
.ok-mini-row { display:flex; align-items:center; gap:12px; }
.ok-mini-logo { width:34px; height:34px; object-fit:contain; background:#fff; border-radius:7px; padding:3px; box-sizing:border-box; flex-shrink:0; }
.ok-mini-name { min-width:0; font-family:${FONT_BODY}; font-weight:800; font-size:24px; line-height:1.05; text-transform:uppercase; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ok-mini-meta { font-family:${FONT_DISPLAY}; font-size:36px; line-height:1; letter-spacing:0.04em; color:${ORANGE}; margin-top:3px; }

/* ahmaliiga promo */
.ok-al-body { flex:1; min-height:0; display:flex; align-items:center; gap:16px; }
.ok-al-txt { flex:1; min-width:0; }
.ok-al-h { font-family:${FONT_DISPLAY}; font-size:40px; line-height:1; letter-spacing:0.03em; color:#fff; }
.ok-al-url { font-family:${FONT_BODY}; font-weight:700; font-size:19px; color:#fff; margin-top:8px; word-break:break-word; }
.ok-al-url b { color:${ORANGE}; font-weight:800; }
.ok-al-qr { width:92px; height:92px; border-radius:8px; background:#fff; padding:5px; box-sizing:border-box; flex-shrink:0; }

/* partner logo */
.ok-partner { align-items:stretch; }
.ok-partner-box { flex:1; min-height:0; margin-top:10px; border-radius:12px; display:flex; align-items:center; justify-content:center; padding:14px; box-sizing:border-box; }
.ok-partner-img { max-width:100%; max-height:100%; object-fit:contain; }
.ok-partner-name { font-family:${FONT_DISPLAY}; font-size:34px; text-align:center; }
`;
