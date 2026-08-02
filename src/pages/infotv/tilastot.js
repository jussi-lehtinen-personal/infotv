import React, { useEffect, useState } from "react";
import InfoTvStage, { HeroBackdrop, Masthead, FONT_DISPLAY, FONT_BODY, ORANGE, STEEL, YELLOW } from "./InfoTvFrame";
import { getAhmaliigaRanking, getAhmaliigaState } from "../../lib/ahmaliigaApi";

// Ahmaliiga season leaderboard signage. Public read. Top 3 as big highlighted
// podium cards (left) + ranks 4–15 as a list (right) + a "Liity mukaan" CTA bar.

const MEDAL = [YELLOW, "#D8DBE0", "#C88B4A"];

const Crown = ({ className, style }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M2.6 7.2l4.2 3.4 4-6.2a1.4 1.4 0 0 1 2.4 0l4 6.2 4.2-3.4a1 1 0 0 1 1.6 1l-2.2 9.2a1 1 0 0 1-1 .8H5.2a1 1 0 0 1-1-.8L2 8.2a1 1 0 0 1 1.6-1z" />
  </svg>
);

function initials(name) {
  if (!name) return "?";
  const p = String(name).trim().split(/[\s-]+/).filter(Boolean);
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : name.slice(0, 2)).toUpperCase();
}
function splitName(name) {
  const p = String(name || "").trim().split(/[\s-]+/).filter(Boolean);
  if (p.length <= 1) return { first: "", last: name || "" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

function Avatar({ url, name, size, ring }) {
  const [err, setErr] = useState(false);
  const common = { width: size, height: size, borderRadius: "50%", flexShrink: 0, border: `2px solid ${ring}`, boxSizing: "border-box" };
  if (url && !err) return <img src={url} alt="" onError={() => setErr(true)} style={{ ...common, objectFit: "cover", objectPosition: "center", background: "#222" }} />;
  return <div style={{ ...common, display: "grid", placeItems: "center", background: "rgba(240,110,30,0.18)", fontFamily: FONT_DISPLAY, fontSize: size * 0.42, color: "#fff" }}>{initials(name)}</div>;
}

function PodCard({ r, idx }) {
  const c = MEDAL[idx];
  const { first, last } = splitName(r.nickname);
  const top = idx === 0;
  return (
    <div className={"tl-pod" + (top ? " tl-pod--first" : "")}>
      <div className="tl-pod-rank" style={{ color: c }}>{r.rank}</div>
      <Avatar url={r.avatar} name={r.nickname} size={104} ring={c} />
      <div className="tl-pod-name">
        <span className="tl-pod-namebig">{first || last}</span>
        {first && <span className="tl-pod-namesub">{last}</span>}
      </div>
      <div className="tl-pod-pts" style={top ? { color: ORANGE } : undefined}>{r.total}</div>
      <Crown className="tl-pod-crown" style={{ color: c }} />
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
      const roundNo = s.currentRound && typeof s.currentRound.no === "number" ? s.currentRound.no + 1 : null;
      if (roundNo != null && s.roundCount) parts.push(`Jakso ${roundNo}/${s.roundCount}`);
      if (parts.length) setMeta(parts.join(" · "));
    }).catch(() => {});
    getAhmaliigaRanking("season")
      .then((d) => { if (!cancelled) setRows(Array.isArray(d.rows) ? d.rows : []); })
      .catch(() => { if (!cancelled) { setError(true); setRows([]); } });
    return () => { cancelled = true; };
  }, []);

  const all = rows || [];
  const top3 = all.slice(0, 3);
  const rest = all.slice(3, 15);
  const has = top3.length > 0;

  return (
    <InfoTvStage backdrop={false}>
      <HeroBackdrop calm />
      <style>{css}</style>
      <Masthead title="AHMALIIGA" meta={meta} />

      {rows === null && <div className="tl-msg">Ladataan…</div>}
      {rows !== null && !has && <div className="tl-msg">{error ? "Tilastoja ei saatu haettua." : "Ei tuloksia vielä."}</div>}

      {has && (
        <>
          <div className="tl">
            <div className="tl-podium">
              {top3.map((r, i) => <PodCard key={r.userId ?? i} r={r} idx={i} />)}
            </div>
            <div className="tl-list">
              {rest.map((r) => (
                <div key={r.userId ?? r.rank} className="tl-row">
                  <div className="tl-row-rank">{r.rank}</div>
                  <Avatar url={r.avatar} name={r.nickname} size={42} ring="rgba(255,255,255,0.14)" />
                  <div className="tl-row-name">{r.nickname}</div>
                  <div className="tl-row-pts">{r.total}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="tl-cta">
            <span className="tl-cta-btn">Liity mukaan!</span>
            <span className="tl-cta-txt">Pelaa, kerää pisteitä ja voita.</span>
            <span className="tl-cta-url">gamezone.kiekko-ahma.fi<b>/ahmaliiga</b></span>
            <img className="tl-cta-qr" src="/infotv/qr_ahmaliiga.png" alt="" />
          </div>
        </>
      )}
    </InfoTvStage>
  );
}

const css = `
.tl-msg { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:56px; letter-spacing:0.06em; color:${STEEL}; z-index:2; }

.tl { position:absolute; top:116px; left:44px; right:44px; bottom:126px; display:flex; gap:44px; z-index:2; }
.tl-podium { flex:0 0 42%; min-width:0; display:flex; flex-direction:column; gap:20px; }
.tl-list { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; justify-content:space-between; padding-top:2px; }

/* podium */
.tl-pod { position:relative; flex:1; display:flex; align-items:center; gap:28px; padding:0 36px; border-radius:18px; background:rgba(18,18,22,0.72); border:1.5px solid rgba(255,255,255,0.10); overflow:hidden; }
.tl-pod--first { border-color:${ORANGE}; box-shadow:0 0 0 1px rgba(240,110,30,0.4), 0 12px 40px rgba(240,110,30,0.12); }
.tl-pod-rank { font-family:${FONT_DISPLAY}; font-size:104px; line-height:1; letter-spacing:0.02em; width:84px; text-align:center; flex-shrink:0; }
.tl-pod-name { flex:1; min-width:0; line-height:1; }
.tl-pod-namebig { display:block; font-family:${FONT_DISPLAY}; font-size:66px; letter-spacing:0.03em; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tl-pod-namesub { display:block; font-family:${FONT_DISPLAY}; font-size:34px; letter-spacing:0.05em; color:${STEEL}; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tl-pod-pts { font-family:${FONT_DISPLAY}; font-size:62px; line-height:1; letter-spacing:0.02em; color:#fff; flex-shrink:0; }
.tl-pod-crown { position:absolute; top:18px; right:22px; width:40px; height:40px; }

/* list */
.tl-row { flex:1; display:flex; align-items:center; gap:22px; padding:0 8px; border-bottom:1px solid rgba(255,255,255,0.07); }
.tl-row:last-child { border-bottom:none; }
.tl-row-rank { font-family:${FONT_DISPLAY}; font-size:38px; line-height:1; color:${STEEL}; width:48px; text-align:center; flex-shrink:0; }
.tl-row-name { flex:1; min-width:0; font-family:${FONT_BODY}; font-weight:700; font-size:30px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tl-row-pts { font-family:${FONT_DISPLAY}; font-size:36px; letter-spacing:0.02em; color:${STEEL}; flex-shrink:0; }
.tl-row-pts span { font-size:0.5em; margin-left:2px; }

/* cta */
.tl-cta { position:absolute; left:44px; right:44px; bottom:30px; height:82px; display:flex; align-items:center; gap:26px; padding:0 28px; border-radius:16px; background:rgba(16,16,19,0.72); border:1px solid rgba(255,255,255,0.1); z-index:2; }
.tl-cta-btn { font-family:${FONT_DISPLAY}; font-size:34px; letter-spacing:0.06em; color:#fff; background:${ORANGE}; padding:10px 24px; border-radius:10px; }
.tl-cta-txt { font-family:${FONT_DISPLAY}; font-size:34px; letter-spacing:0.06em; color:${ORANGE}; }
.tl-cta-url { margin-left:auto; font-family:${FONT_DISPLAY}; font-size:36px; letter-spacing:0.04em; color:#fff; }
.tl-cta-url b { color:${ORANGE}; font-weight:400; }
.tl-cta-qr { width:66px; height:66px; border-radius:8px; background:#fff; padding:5px; box-sizing:border-box; }
`;
