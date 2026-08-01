import React, { useEffect, useState } from "react";
import InfoTvStage, { Masthead, FONT_DISPLAY, FONT_BODY, ORANGE, STEEL, YELLOW } from "./InfoTvFrame";
import { getAhmaliigaRanking, getAhmaliigaState } from "../../lib/ahmaliigaApi";

// Ahmaliiga season leaderboard signage — public read (no auth). Top 14 in two
// columns of seven; top three get a medal accent.

const MEDAL = { 1: YELLOW, 2: "#D8DBE0", 3: "#C88B4A" };

function initials(name) {
  if (!name) return "?";
  const p = String(name).trim().split(/[\s-]+/).filter(Boolean);
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

function Avatar({ url, name, ring }) {
  const [err, setErr] = useState(false);
  const common = { width: 74, height: 74, borderRadius: "50%", flexShrink: 0, border: `2px solid ${ring}`, boxSizing: "border-box" };
  if (url && !err) return <img src={url} alt="" onError={() => setErr(true)} style={{ ...common, objectFit: "cover", objectPosition: "center", background: "#222" }} />;
  return <div style={{ ...common, display: "grid", placeItems: "center", background: "rgba(240,110,30,0.18)", fontFamily: FONT_DISPLAY, fontSize: 32, color: "#fff" }}>{initials(name)}</div>;
}

function Row({ r }) {
  const medal = MEDAL[r.rank];
  const top = r.rank <= 3;
  return (
    <div className={"tl-row" + (top ? " tl-row--top" : "")} style={top ? { "--accent": medal } : undefined}>
      <div className="tl-rank" style={{ color: medal || "#fff" }}>{r.rank}</div>
      <Avatar url={r.avatar} name={r.nickname} ring={medal || "rgba(255,255,255,0.14)"} />
      <div className="tl-nick">{r.nickname}</div>
      <div className="tl-pts">{r.total}<span className="tl-p">p</span></div>
    </div>
  );
}

export default function InfoTvTilastot() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState("Kauden kärki");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaState().then((s) => {
      if (cancelled || !s || s.active === false) return;
      const parts = [];
      if (s.season) parts.push(`Kausi ${s.season}`);
      // currentRound is an object { no, startDate, ... }; `no` is 0-indexed (as
      // in ranking.js → display no + 1).
      const roundNo = s.currentRound && typeof s.currentRound.no === "number" ? s.currentRound.no + 1 : null;
      if (roundNo != null && s.roundCount) parts.push(`Jakso ${roundNo}/${s.roundCount}`);
      if (parts.length) setMeta(parts.join(" · "));
    }).catch(() => {});
    getAhmaliigaRanking("season")
      .then((d) => { if (!cancelled) setRows(Array.isArray(d.rows) ? d.rows : []); })
      .catch(() => { if (!cancelled) { setError(true); setRows([]); } });
    return () => { cancelled = true; };
  }, []);

  const top = (rows || []).slice(0, 14);
  const left = top.slice(0, 7);
  const right = top.slice(7, 14);

  return (
    <InfoTvStage>
      <style>{css}</style>
      <Masthead title="AHMALIIGA" meta={meta} />

      <div className="tl-content">
        {rows === null && <div className="tl-msg">Ladataan…</div>}
        {rows !== null && top.length === 0 && <div className="tl-msg">{error ? "Tilastoja ei saatu haettua." : "Ei tuloksia vielä."}</div>}
        {top.length > 0 && (
          <div className="tl-cols">
            <div className="tl-col">{left.map((r) => <Row key={r.userId ?? r.rank} r={r} />)}</div>
            {right.length > 0 && <div className="tl-col">{right.map((r) => <Row key={r.userId ?? r.rank} r={r} />)}</div>}
          </div>
        )}
      </div>
    </InfoTvStage>
  );
}

const css = `
.tl-content { position:absolute; top:120px; bottom:40px; left:44px; right:44px; display:flex; }
.tl-msg { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:56px; letter-spacing:0.06em; color:${STEEL}; }

.tl-cols { flex:1; display:grid; grid-template-columns:1fr 1fr; gap:44px; align-content:start; }
.tl-col { display:flex; flex-direction:column; gap:14px; }

.tl-row { position:relative; display:grid; grid-template-columns:74px 74px 1fr auto; align-items:center; gap:22px; padding:14px 28px; border-radius:18px; background:linear-gradient(100deg, rgba(255,255,255,0.06), rgba(255,255,255,0.022)); border:1px solid rgba(255,255,255,0.08); overflow:hidden; }
.tl-row--top { background:linear-gradient(100deg, rgba(240,110,30,0.14), rgba(240,110,30,0.04)); border-color:rgba(240,110,30,0.28); }
.tl-row--top::before { content:""; position:absolute; left:0; top:0; bottom:0; width:6px; background:var(--accent); }

.tl-rank { font-family:${FONT_DISPLAY}; font-size:56px; line-height:1; letter-spacing:0.02em; text-align:center; }
.tl-nick { min-width:0; font-family:${FONT_BODY}; font-weight:800; font-size:33px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tl-pts { font-family:${FONT_DISPLAY}; font-size:52px; letter-spacing:0.02em; color:${ORANGE}; text-align:right; }
.tl-p { font-size:0.5em; color:${STEEL}; margin-left:4px; }

.tl-www { font-family:${FONT_DISPLAY}; font-size:34px; letter-spacing:0.32em; color:rgba(255,255,255,0.62); }
.tl-cta { font-family:${FONT_DISPLAY}; font-size:34px; letter-spacing:0.1em; color:#fff; }
`;
