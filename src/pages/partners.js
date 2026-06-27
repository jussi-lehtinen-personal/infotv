import React, { useState, useEffect } from "react";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { useGoBack } from "../hooks/useGoBack";

// One partner card. Falls back to the name as a wordmark if the logo image is
// missing or fails to load (some Jopox imagebank files 404).
const PartnerCard = ({ p }) => {
  const [failed, setFailed] = useState(false);
  const showImg = p.image && !failed;
  const inner = (
    <>
      <div className={`pt-logo-box${p.light ? " pt-logo-box--bare" : ""}`}>
        {showImg ? (
          <img
            className="pt-logo"
            src={p.image}
            alt={p.name}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="pt-logo-fallback">{p.name}</span>
        )}
      </div>
      {showImg && <div className="pt-name">{p.name}</div>}
    </>
  );
  return p.url ? (
    <a className="pt-card" href={p.url} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <div className="pt-card">{inner}</div>
  );
};

const Partners = () => {
  const goBack = useGoBack("/");
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/getPartners")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setPartners(Array.isArray(d.partners) ? d.partners : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <style>{css}</style>
      <div className="pt-root">
        <PageHeader
          title="YHTEISTYÖKUMPPANIT"
          subtitle="Kiitos tuesta!"
          left={
            <button type="button" className="pt-back" onClick={goBack} aria-label="Takaisin">
              <span className="material-symbols-rounded">&#xE5CB;</span>
            </button>
          }
        />

        {loading && <div className="pt-status"><Spinner /></div>}
        {error && (
          <div className="pt-status pt-status--error">
            Kumppaneita ei saatu haettua. Yritä myöhemmin uudelleen.
          </div>
        )}

        {!loading && !error && (
          <div className="pt-grid">
            {partners.map((p, i) => (
              <PartnerCard key={i} p={p} />
            ))}
            {partners.length === 0 && (
              <div className="pt-status">Ei kumppaneita saatavilla.</div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default Partners;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.pt-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}
.pt-back {
  display: flex; align-items: center;
  color: rgba(255,255,255,0.6);
  background: none; border: none; cursor: pointer;
  border-radius: 10px; padding: 2px;
  transition: color 0.15s;
}
.pt-back:hover { color: var(--color-primary); }
.pt-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.pt-grid {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.pt-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: var(--radius-item);
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.07);
  text-decoration: none;
  color: var(--gz-text-secondary);
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.15s, background 0.15s;
}
.pt-card:hover, .pt-card:active {
  border-color: rgba(245,158,11,0.35);
  background: #202020;
}
.pt-card:visited, .pt-card:focus { color: var(--gz-text-secondary); text-decoration: none; }
.pt-logo-box {
  width: 100%;
  height: 88px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 10px;
  background: #fff;
  padding: 10px;
  box-sizing: border-box;
}
/* Light/white transparent logos (flagged server-side) sit straight on the
   card background so they blend seamlessly — no white box. Dark transparent
   and opaque (white-bg) logos keep the white box above. */
.pt-logo-box--bare {
  background: transparent;
}
.pt-logo {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.pt-logo-fallback {
  color: #333; font-weight: 700; font-size: 14px; text-align: center;
  line-height: 1.3; word-break: break-word;
}
.pt-name {
  font-size: var(--gz-fs-sm);
  font-weight: var(--gz-fw-medium);
  color: var(--gz-text-secondary);
  text-align: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 100%;
}

.pt-status { text-align: center; padding: 28px 0; color: var(--gz-text-muted); font-size: var(--gz-fs-sm); }
.pt-status--error { color: var(--color-loss); }

@media (min-width: 560px) {
  .pt-grid { grid-template-columns: repeat(3, 1fr); }
}
`;
