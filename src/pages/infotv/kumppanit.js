import React, { useEffect, useState } from "react";
import InfoTvStage, { Masthead, FONT_DISPLAY, FONT_BODY, STEEL } from "./InfoTvFrame";

// Yhteistyökumppanit signage — partner logos from /api/getPartners (Jopox front
// page). White tiles that auto-fit and fill the stage; `light` logos (flagged
// server-side) sit on a subtle dark tile instead of solid white.

// Same shape as the GameZone partners page (src/pages/partners.js): a dark
// outlined card holding a white logo box + the partner name below. `light` logos
// (flagged server-side) sit on a transparent box instead of solid white.
function Tile({ p }) {
  const [failed, setFailed] = useState(false);
  const showImg = p.image && !failed;
  return (
    <div className="kp-card">
      <div className="kp-logobox" style={{ background: p.light ? "transparent" : "#fff" }}>
        {showImg
          ? <img src={p.image} alt={p.name} onError={() => setFailed(true)} className="kp-img" />
          : <div className="kp-fallback" style={{ color: p.light ? "#fff" : "#333" }}>{p.name}</div>}
      </div>
      {showImg && <div className="kp-name">{p.name}</div>}
    </div>
  );
}

export default function InfoTvKumppanit() {
  const [partners, setPartners] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/getPartners")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) setPartners(Array.isArray(d.partners) ? d.partners : []); })
      .catch(() => { if (!cancelled) { setError(true); setPartners([]); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <InfoTvStage focus="50% 18%">
      <style>{css}</style>
      <Masthead title="YHTEISTYÖKUMPPANIT" />

      <div className="kp-content">
        {partners === null && <div className="kp-msg">Ladataan…</div>}
        {partners !== null && error && <div className="kp-msg">Kumppaneita ei saatu haettua.</div>}
        {partners && !error && (
          partners.length === 0
            ? <div className="kp-msg">Ei kumppaneita.</div>
            : <div className="kp-grid">{partners.map((p, i) => <Tile key={i} p={p} />)}</div>
        )}
      </div>
    </InfoTvStage>
  );
}

const css = `
.kp-content { position:absolute; top:120px; bottom:40px; left:44px; right:44px; display:flex; }
.kp-msg { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:52px; letter-spacing:0.06em; color:${STEEL}; }

.kp-grid { flex:1; display:grid; grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); grid-auto-rows:1fr; gap:26px; align-content:start; overflow:hidden; }
.kp-card { display:flex; flex-direction:column; align-items:center; gap:16px; padding:22px; box-sizing:border-box; border-radius:18px; background:var(--color-surface, rgba(255,255,255,0.03)); border:1px solid var(--color-surface-border, rgba(255,255,255,0.14)); }
.kp-logobox { width:100%; flex:1; min-height:0; display:flex; align-items:center; justify-content:center; border-radius:12px; padding:22px; box-sizing:border-box; }
.kp-img { max-width:100%; max-height:100%; object-fit:contain; }
.kp-fallback { font-family:${FONT_BODY}; font-weight:700; font-size:26px; text-align:center; line-height:1.2; word-break:break-word; }
.kp-name { font-family:${FONT_BODY}; font-weight:600; font-size:24px; color:${STEEL}; text-align:center; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;
