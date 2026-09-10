import React, { useEffect, useState } from "react";
import InfoTvStage, { HeroBackdrop, Masthead, FONT_DISPLAY, FONT_BODY, STEEL } from "./InfoTvFrame";

// Kannattajajäsenet signage — the hall-screen twin of the GameZone /supporters page.
// Same single source (/api/getSupporters = the Jopox sign-up form, fee-paid entries), same
// thank-you line; the join BUTTON is dropped because nobody taps a TV.
//
// Backdrop: the signage-standard HeroBackdrop, NOT the portrait arena photo the phone page
// uses — that source is 841px wide, so filling a 1920×1080 stage with it would upscale it
// into mush. HeroBackdrop is cut for this stage and keeps the set visually consistent.
//
// ⚠️ Landscape invariant (see memory feedback_landscape_layout_invariant): the stage must
// never scroll. The name grid is clipped and the type scales down in steps as the list
// grows, so a longer list re-flows instead of overflowing.

const LS_KEY = "ahma.infotv.supporters.v1";

// Type/columns shrink as the list grows so it keeps filling the stage without spilling.
function sizing(n) {
  if (n <= 8) return { size: 54, cols: 2 };
  if (n <= 18) return { size: 46, cols: 3 };
  if (n <= 32) return { size: 38, cols: 4 };
  return { size: 30, cols: 5 };
}

export default function InfoTvKannattajat() {
  // Instant paint from localStorage (the list changes a few times a season) → the screen
  // never shows an empty stage while the API round-trips. Then revalidate. SWR, same shape
  // as the partners screen.
  const [names, setNames] = useState(() => {
    try { const r = JSON.parse(localStorage.getItem(LS_KEY)); return Array.isArray(r) ? r : null; } catch { return null; }
  });
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/getSupporters")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((d) => {
        if (cancelled) return;
        const list = (Array.isArray(d.supporters) ? d.supporters : [])
          .map((p) => `${p.firstName || ""} ${p.lastName || ""}`.trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "fi"));
        setNames(list);
        try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch { /* quota/private */ }
      })
      .catch(() => {
        if (cancelled) return;
        // Only surface an error when there's no cached list to fall back on — a hiccup
        // must not blank a screen that's already showing a good list.
        if (names == null) { setError(true); setNames([]); }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { size, cols } = sizing((names && names.length) || 0);

  return (
    <InfoTvStage backdrop={false}>
      <HeroBackdrop calm />
      <style>{css}</style>
      <Masthead title="KANNATTAJAT" />

      <div className="ks-content">
        {names === null && <div className="ks-msg">Ladataan…</div>}
        {names !== null && error && <div className="ks-msg">Kannattajia ei saatu haettua.</div>}
        {names && !error && (
          names.length === 0
            ? <div className="ks-msg">Ei kannattajajäseniä vielä.</div>
            : (
              <div className="ks-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, fontSize: size }}>
                {names.map((n, i) => <div className="ks-name" key={`${n}-${i}`}>{n}</div>)}
              </div>
            )
        )}

        {/* Thanks last: the names are the content, the thank-you is the sign-off. */}
        <div className="ks-thanks">Kiitos, että tuette Kiekko-Ahmaa. 🧡</div>
      </div>
    </InfoTvStage>
  );
}

const css = `
.ks-content { position:absolute; top:130px; bottom:44px; left:44px; right:44px; display:flex; flex-direction:column; gap:28px; overflow:hidden; }
.ks-thanks { flex:0 0 auto; font-family:${FONT_BODY}; font-weight:600; font-size:34px; color:${STEEL}; text-align:center; }
.ks-msg { flex:1; display:flex; align-items:center; justify-content:center; font-family:${FONT_DISPLAY}; font-size:52px; letter-spacing:0.06em; color:${STEEL}; }

/* align-content:center keeps a short list optically centred instead of hugging the top;
   overflow:hidden is the landscape invariant's backstop. */
.ks-grid { flex:1; min-height:0; display:grid; align-content:center; column-gap:56px; row-gap:6px; overflow:hidden; }
.ks-name { font-family:${FONT_BODY}; font-weight:700; color:#fff; line-height:1.55;
           white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
`;
