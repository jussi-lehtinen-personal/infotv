import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { ContactCard } from "../components/ui/ContactCard";

const Organisation = () => {
  const [officials, setOfficials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/getOrganisation")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setOfficials(Array.isArray(d.officials) ? d.officials : []);
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
      <div className="org-root">
        <PageHeader
          title="YHTEYSTIEDOT"
          subtitle="Seuran organisaatio"
          left={
            <Link to="/" className="org-back" aria-label="Takaisin">
              <span className="material-symbols-rounded">&#xE5CB;</span>
            </Link>
          }
        />

        {loading && (
          <div className="org-status"><Spinner /></div>
        )}
        {error && (
          <div className="org-status org-status--error">
            Yhteystietoja ei saatu haettua. Yritä myöhemmin uudelleen.
          </div>
        )}
        {!loading && !error && (
          <div className="org-list">
            {officials.map((o, i) => (
              <ContactCard
                key={i}
                name={o.name}
                role={o.role}
                email={o.email}
                phone={o.phone}
                photo={o.photo}
              />
            ))}
            {officials.length === 0 && (
              <div className="org-status">Ei yhteystietoja saatavilla.</div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default Organisation;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.org-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}
.org-back {
  display: flex; align-items: center;
  color: rgba(255,255,255,0.6);
  text-decoration: none; border-radius: 10px; padding: 2px;
  transition: color 0.15s;
}
.org-back:hover { color: var(--color-primary); }
.org-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.org-list {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.org-status { text-align: center; padding: 28px 0; color: var(--gz-text-muted); font-size: var(--gz-fs-sm); }
.org-status--error { color: var(--color-loss); }

@media (min-width: 768px) {
  .org-root { padding: 26px 26px 28px; }
}
`;
