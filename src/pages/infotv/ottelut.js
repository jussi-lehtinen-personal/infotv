import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuGlobe } from "react-icons/lu";
import { SiInstagram, SiFacebook, SiYoutube } from "react-icons/si";
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
      return { type: "game", key: m.id ?? `g${i}`, size: 1, m, done, live };
    });

    // Rule: games live ONLY in the two LEFT columns (balanced split); the LAST
    // column is reserved for extras. Games beyond 10 overflow into the last
    // column's top (rare for home games).
    const cols = [[], [], []];
    const leftGames = gameItems.slice(0, (COLS - 1) * ROWS);
    const half = Math.ceil(leftGames.length / 2);
    cols[0] = leftGames.slice(0, half);
    cols[1] = leftGames.slice(half);
    cols[2] = gameItems.slice((COLS - 1) * ROWS);

    // Data-driven "detail" cards derived from this week's games (no extra API).
    const marg = (g) => (parseInt(g.m.home_goals, 10) || 0) - (parseInt(g.m.away_goals, 10) || 0);
    const finished = gameItems.filter((g) => { const hg = parseInt(g.m.home_goals, 10), ag = parseInt(g.m.away_goals, 10); return g.done && !isNaN(hg) && !isNaN(ag); });
    const winsArr = finished.filter((g) => marg(g) > 0);
    const biggestWin = winsArr.length ? winsArr.reduce((a, b) => (marg(b) > marg(a) ? b : a)) : null;

    // Detail modules for the LAST column. Every module appears AT MOST ONCE
    // (never a duplicate) — makeFiller returns null once the unique pool is
    // exhausted. Partners are handled separately (one card at the very bottom).
    const s = summary;
    let fk = 0;
    const used = new Set();
    const makeFiller = (rem) => {
      const c = [];
      const add = (variant, size, w, extra) => { if (!used.has(variant) && size >= 1 && size <= rem) c.push({ variant, size, w, extra }); };
      if (s.n > 0) add("count", 1, 2);
      if (s.played > 0) { add("record", 1, 2.5); add("goals", 1, 2); add("wins", 1, 2); add("avg", 1, 1.5); }
      if (biggestWin) add("biggestWin", 2, 2, { g: biggestWin });
      add("follow", 1, 1);
      add("hashtag", 1, 1);
      add("ahmaliiga", rem >= 3 && Math.random() < 0.4 ? 3 : 2, 1.5);
      add("app", 1, 1);
      add("social", 1, 1.5);
      if (!c.length) return null;
      const total = c.reduce((a, b) => a + b.w, 0);
      let r = Math.random() * total, chosen = c[c.length - 1];
      for (const x of c) { r -= x.w; if (r <= 0) { chosen = x; break; } }
      used.add(chosen.variant);
      return { type: "detail", variant: chosen.variant, size: chosen.size, key: `f${fk++}`, ...(chosen.extra || {}) };
    };

    // Last column = detail cards on top, ONE partner card (a few logos) at the
    // very bottom. If the unique detail pool runs dry, cards flex to fill (no
    // duplicates, ever).
    const partnerPicks = sample(partners, partners.length); // shuffled once per load
    const ex = cols[COLS - 1];
    const available = ROWS - ex.reduce((a, x) => a + x.size, 0);
    if (available > 0) {
      const partnerSize = partnerPicks.length ? Math.min(3, Math.max(1, available - 2)) : 0;
      let rem = available - partnerSize;
      while (rem > 0) { const f = makeFiller(rem); if (!f) break; ex.push(f); rem -= f.size; }
      if (partnerSize > 0) ex.push({ type: "detail", variant: "partner", size: partnerSize, key: "partner", ps: partnerPicks.slice(0, partnerSize) });
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
          {columns.map((col, ci) => {
            const extras = ci === COLS - 1;
            return (
              <div className="ok-cells" key={ci}>
                {col.map((it) => (
                  <div className="ok-cellwrap" key={it.key}
                    style={{ flex: extras ? it.size : `0 0 calc((100% - ${(ROWS - 1) * 16}px) / ${ROWS} * ${it.size})` }}>
                    <Cell it={it} summary={summary} />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </InfoTvStage>
  );
}

function Cell({ it, summary }) {
  if (it.type === "game") return <MatchCell m={it.m} />;
  return <DetailCell it={it} s={summary} />;
}

function MatchCell({ m }) {
  const md = moment(String(m.date || "").replace(" ", "T"), moment.ISO_8601);
  const wd = md.isValid() ? md.format("dd").toUpperCase() : "";
  const time = md.isValid() ? md.format("HH:mm") : "";
  const level = simplifyLevel(m.level ?? "");
  const live = isLiveMatch(m);
  const finished = Number(m.finished) > 0;
  const show = live || finished;
  const home = splitTeamName(m.home ?? "");
  const away = splitTeamName(m.away ?? "");
  const hg = parseInt(m.home_goals, 10), ag = parseInt(m.away_goals, 10);
  const hasResult = finished && !isNaN(hg) && !isNaN(ag);
  const line = live ? LIVE : !hasResult ? "rgba(255,255,255,0.12)" : hg > ag ? WIN : hg < ag ? LOSS : DRAW;
  // Winner vs loser differ only by WEIGHT/SIZE, not colour (both white); the
  // green/red win/loss cue lives on the left accent bar.
  const homeWin = hasResult && !live && hg > ag, homeLose = hasResult && !live && hg < ag;
  const awayWin = hasResult && !live && ag > hg, awayLose = hasResult && !live && ag < hg;
  const scoreCls = (win, lose) => "ok-score" + (win ? " ok-score--win" : lose ? " ok-score--lose" : "");

  return (
    <div className="ok-card">
      <div className="ok-line" style={{ background: line }} />
      <div className="ok-when">
        <span className="ok-when-day">{wd}</span>
        <span className="ok-when-time">{time}</span>
        {live ? <span className="ok-when-live">LIVE</span> : level && <span className="ok-when-level">{level}</span>}
      </div>
      <div className="ok-when-div" />
      <div className="ok-teams">
        <div className="ok-team">
          <div className="ok-logowrap"><img className="ok-logo" src={m.home_logo} alt="" /></div>
          <span className={"ok-name" + (homeLose ? " ok-name--lose" : "")}>{home.main}{home.sub && <span className="ok-sub"> {home.sub}</span>}</span>
          <span className={scoreCls(homeWin, homeLose)} style={live ? { color: LIVE } : undefined}>{show ? m.home_goals : ""}</span>
        </div>
        <div className="ok-team">
          <div className="ok-logowrap"><img className="ok-logo" src={m.away_logo} alt="" /></div>
          <span className={"ok-name" + (awayLose ? " ok-name--lose" : "")}>{away.main}{away.sub && <span className="ok-sub"> {away.sub}</span>}</span>
          <span className={scoreCls(awayWin, awayLose)} style={live ? { color: LIVE } : undefined}>{show ? m.away_goals : ""}</span>
        </div>
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
    case "count":
      return <BigStat title="Kotiottelut" val={s.n} sub="Tällä viikolla" />;
    case "record":
      return (
        <div className="ok-filler">
          <div className="ok-filler-title">Viikon tulokset</div>
          <div className="ok-stats">
            <Stat label="Voitot" val={<span style={{ color: WIN }}>{s.w}</span>} />
            <span className="ok-statdiv" />
            <Stat label="Tasapelit" val={s.d} />
            <span className="ok-statdiv" />
            <Stat label="Häviöt" val={<span style={{ color: LOSS }}>{s.l}</span>} />
          </div>
        </div>
      );
    case "goals":
      return (
        <div className="ok-filler">
          <div className="ok-filler-title">Maalit</div>
          <div className="ok-goals">
            <span className="ok-goals-n" style={{ color: ORANGE }}>{s.gf}</span>
            <span className="ok-goals-dash">–</span>
            <span className="ok-goals-n">{s.ga}</span>
            <span className="ok-goals-l">Tehdyt</span>
            <span />
            <span className="ok-goals-l">Päästetyt</span>
          </div>
        </div>
      );
    case "wins":
      return <BigStat title="Voitot" val={<><span style={{ color: WIN }}>{s.w}</span>/{s.played}</>} sub="Ottelua voitettu" />;
    case "avg":
      return <BigStat title="Maalia / ottelu" val={s.played ? (s.gf / s.played).toFixed(1).replace(".", ",") : "0"} sub="Tehdyt keskimäärin" />;
    case "biggestWin":
      return <MiniMatch g={it.g} title="Suurin voitto" />;
    case "hashtag":
      return <div className="ok-filler ok-center"><div className="ok-big">#KIEKKOAHMA</div><div className="ok-sub2">Jaa somessa</div></div>;
    case "app":
      return (
        <div className="ok-filler ok-center">
          <div className="ok-big" style={{ color: ORANGE }}>gamezone.kiekko-ahma.fi</div>
          <div className="ok-sub2">Lataa seuran sovellus</div>
        </div>
      );
    case "social":
      return (
        <div className="ok-filler ok-center">
          <div className="ok-big">SEURAA MEITÄ</div>
          <div className="ok-social"><SiInstagram /><SiFacebook /><SiYoutube /><LuGlobe /></div>
          <div className="ok-sub2">@kiekkoahmaofficial</div>
        </div>
      );
    case "ahmaliiga":
      return (
        <div className="ok-filler">
          <div className="ok-filler-title">Ahmaliiga</div>
          <div className="ok-al-tall">
            <div className="ok-al-h">Pelaa fantasialiigaa!</div>
            <div className="ok-al-url ok-al-url--c">gamezone.kiekko-ahma.fi<b>/ahmaliiga</b></div>
            <div className="ok-al-qrwrap">
              <img className="ok-al-wordmark" src="/infotv/ahmaliiga_wordmark.png" alt="Ahmaliiga" />
              <img className="ok-al-qr-big" src="/infotv/qr_ahmaliiga.png" alt="" />
            </div>
          </div>
        </div>
      );
    case "partner":
      return <PartnerCell ps={it.ps} />;
    default:
      return <div className="ok-filler ok-center"><div className="ok-big" style={{ color: ORANGE }}>GAMEZONE.KIEKKO-AHMA.FI</div><div className="ok-sub2">Seuraa joukkueita ja pelejä</div></div>;
  }
}

// Multi-stat cell: LABEL on top (small), big number below — the GameZone
// "otsikko + luku + divider" pattern used whenever several stats sit together.
function Stat({ val, label }) {
  return <div className="ok-stat"><div className="ok-stat-lbl">{label}</div><div className="ok-stat-val">{val}</div></div>;
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

// Big score centred + the two teams on one line below (winner bold, loser
// lighter). "Suurin voitto" — a Kiekko-Ahma home win, so home is the winner.
function MiniMatch({ g, title }) {
  const m = g.m;
  const home = splitTeamName(m.home ?? ""), away = splitTeamName(m.away ?? "");
  const level = simplifyLevel(m.level ?? "");
  return (
    <div className="ok-filler">
      <div className="ok-filler-head">
        <span className="ok-filler-title">{title}</span>
        {level && <span className="ok-vs-level">{level}</span>}
      </div>
      <div className="ok-bw">
        <div className="ok-bw-score"><span style={{ color: ORANGE }}>{m.home_goals}</span> – {m.away_goals}</div>
        <div className="ok-bw-teams">
          <span className="ok-bw-name">{home.main}{home.sub && <span className="ok-sub"> {home.sub}</span>}</span>
          <span className="ok-bw-vs">·</span>
          <span className="ok-bw-name ok-bw-name--lose">{away.main}{away.sub && <span className="ok-sub"> {away.sub}</span>}</span>
        </div>
      </div>
    </div>
  );
}

// A partner card holds one or more logos stacked (size = number of partners).
function PartnerCell({ ps }) {
  return (
    <div className="ok-filler ok-partner">
      <div className="ok-filler-title">Yhteistyössä</div>
      <div className="ok-partner-list">
        {ps.map((p, i) => <PartnerLogo key={i} p={p} />)}
      </div>
    </div>
  );
}

function PartnerLogo({ p }) {
  const [err, setErr] = useState(false);
  return (
    <div className="ok-partner-box" style={{ background: p.light ? "transparent" : "#fff" }}>
      {p.image && !err
        ? <img src={p.image} alt={p.name} onError={() => setErr(true)} className="ok-partner-img" />
        : <span className="ok-partner-name" style={{ color: p.light ? "#fff" : "#333" }}>{p.name}</span>}
    </div>
  );
}

const css = `
.ok-grid { position:absolute; top:110px; bottom:32px; left:30px; right:30px; display:flex; gap:16px; z-index:2; }
.ok-empty { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:60px; color:rgba(255,255,255,0.32); }

.ok-cells { flex:1; min-width:0; display:flex; flex-direction:column; gap:16px; }
.ok-cellwrap { flex:1; min-height:0; display:flex; }
.ok-cellwrap > * { flex:1; min-width:0; }

/* match card: day+time (left) | divider | teams */
.ok-card { position:relative; overflow:hidden; display:flex; align-items:center; gap:16px; padding:11px 22px 11px 26px; border-radius:16px; background:rgba(20,20,24,0.66); border:1px solid rgba(255,255,255,0.09); }
.ok-line { position:absolute; left:0; top:10px; bottom:10px; width:6px; border-radius:0 3px 3px 0; }
.ok-when { flex:0 0 auto; min-width:84px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; }
.ok-when-day { font-family:${FONT_DISPLAY}; font-size:31px; line-height:1; letter-spacing:0.04em; color:${ORANGE}; }
.ok-when-time { font-family:${FONT_DISPLAY}; font-size:38px; line-height:1; letter-spacing:0.02em; color:#fff; }
.ok-when-level { font-family:${FONT_BODY}; font-weight:700; font-size:22px; letter-spacing:0.03em; text-transform:uppercase; color:#fff; border:1px solid rgba(255,255,255,0.24); border-radius:7px; padding:2px 11px; margin-top:5px; }
.ok-when-live { font-family:${FONT_BODY}; font-weight:800; font-size:20px; letter-spacing:0.06em; color:${LOSS}; margin-top:5px; }
.ok-when-div { flex:0 0 auto; width:1.5px; align-self:stretch; margin:9px 0; background:rgba(255,255,255,0.12); }

.ok-teams { flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; gap:9px; }
.ok-team { display:grid; grid-template-columns:38px 1fr auto; align-items:center; gap:13px; }
.ok-logowrap { width:38px; height:38px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; padding:4px; box-sizing:border-box; }
.ok-logo { max-width:100%; max-height:100%; object-fit:contain; }
.ok-name { min-width:0; font-family:${FONT_BODY}; font-weight:800; font-size:26px; line-height:1.05; letter-spacing:0.01em; text-transform:uppercase; color:var(--gz-text-primary, #fff); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ok-name--lose { font-weight:500; }
.ok-sub { font-weight:700; opacity:0.82; }
.ok-score { font-family:${FONT_DISPLAY}; font-size:38px; line-height:1; letter-spacing:0.02em; color:#fff; min-width:32px; text-align:right; }
.ok-score--win { font-size:44px; }
.ok-score--lose { font-size:32px; color:rgba(255,255,255,0.85); }

/* detail / filler modules */
.ok-filler { display:flex; flex-direction:column; padding:13px 22px; border-radius:16px; overflow:hidden; background:rgba(20,20,24,0.66); border:1px solid rgba(255,255,255,0.09); }
.ok-filler-title { flex:0 0 auto; font-family:${FONT_BODY}; font-weight:800; font-size:18px; letter-spacing:0.14em; text-transform:uppercase; color:${ORANGE}; }
.ok-center { align-items:center; justify-content:center; text-align:center; }
.ok-big { font-family:${FONT_DISPLAY}; font-size:42px; line-height:1; letter-spacing:0.03em; color:#fff; white-space:nowrap; }
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
.ok-bigstat-sub { font-family:${FONT_BODY}; font-weight:700; font-size:20px; letter-spacing:0.06em; text-transform:uppercase; color:${STEEL}; margin-top:11px; }

/* Maalit: 54 – 48 with labels aligned under each number */
.ok-goals { flex:1; min-height:0; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; justify-items:center; row-gap:10px; }
.ok-goals-n { font-family:${FONT_DISPLAY}; font-size:86px; line-height:1; letter-spacing:0.02em; color:#fff; }
.ok-goals-dash { font-family:${FONT_DISPLAY}; font-size:66px; line-height:1; color:#fff; padding:0 16px; }
.ok-goals-l { font-family:${FONT_BODY}; font-weight:700; font-size:19px; letter-spacing:0.06em; text-transform:uppercase; color:${STEEL}; }

/* biggest win: big score centred + the two teams on one line below */
.ok-filler-head { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; gap:12px; }
.ok-vs-level { font-family:${FONT_BODY}; font-weight:700; font-size:19px; letter-spacing:0.04em; text-transform:uppercase; color:#fff; border:1px solid rgba(255,255,255,0.24); border-radius:7px; padding:2px 11px; flex-shrink:0; }
.ok-bw { flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; }
.ok-bw-score { font-family:${FONT_DISPLAY}; font-size:90px; line-height:1; letter-spacing:0.03em; color:#fff; white-space:nowrap; }
.ok-bw-teams { max-width:100%; display:flex; align-items:baseline; gap:14px; }
.ok-bw-name { min-width:0; font-family:${FONT_BODY}; font-weight:800; font-size:26px; line-height:1.05; text-transform:uppercase; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ok-bw-name--lose { font-weight:500; color:rgba(255,255,255,0.72); }
.ok-bw-vs { flex-shrink:0; font-family:${FONT_BODY}; font-weight:700; font-size:24px; color:${STEEL}; }

/* social follow */
.ok-social { display:flex; gap:26px; margin:16px 0 10px; color:#fff; }
.ok-social svg { width:46px; height:46px; }
.ok-mini-meta { font-family:${FONT_DISPLAY}; font-size:32px; line-height:1; letter-spacing:0.04em; color:${ORANGE}; margin-top:4px; }

/* ahmaliiga promo */
.ok-al-body { flex:1; min-height:0; display:flex; align-items:center; gap:16px; }
.ok-al-txt { flex:1; min-width:0; }
.ok-al-h { font-family:${FONT_DISPLAY}; font-size:40px; line-height:1; letter-spacing:0.03em; color:#fff; }
.ok-al-url { font-family:${FONT_BODY}; font-weight:700; font-size:19px; color:#fff; margin-top:8px; word-break:break-word; }
.ok-al-url b { color:${ORANGE}; font-weight:800; }
.ok-al-url--c { text-align:center; }
/* tall (3-slot): text on top, big QR below */
.ok-al-tall { flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; text-align:center; padding-top:8px; }
.ok-al-qrwrap { flex:1; min-height:0; align-self:stretch; display:flex; align-items:center; justify-content:center; gap:42px; margin-top:14px; }
.ok-al-wordmark { max-height:78%; max-width:44%; object-fit:contain; }
.ok-al-qr-big { height:100%; aspect-ratio:1; max-width:100%; object-fit:contain; background:#fff; border-radius:12px; padding:10px; box-sizing:border-box; }

/* partner logo(s) — one card stacks 1–3 logos */
.ok-partner { align-items:stretch; }
.ok-partner-list { flex:1; min-height:0; margin-top:10px; display:flex; flex-direction:column; gap:10px; }
.ok-partner-box { flex:1; min-height:0; border-radius:12px; display:flex; align-items:center; justify-content:center; padding:10px 16px; box-sizing:border-box; }
.ok-partner-img { width:100%; height:100%; object-fit:contain; }
.ok-partner-name { font-family:${FONT_DISPLAY}; font-size:30px; text-align:center; }
`;
