import React, { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { themeCSS } from "../theme";
import { Surface } from "../components/ui/Surface";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { findJopoxTeam } from "../data/jopoxTeams";

const isGoalie = (p) => /maalivahti|goalie|gk/i.test(p.position || "");
const byNumber = (a, b) => {
  const na = a.number == null ? 9999 : parseInt(a.number, 10);
  const nb = b.number == null ? 9999 : parseInt(b.number, 10);
  return na - nb;
};

const Avatar = ({ photo, label }) => {
  const [failed, setFailed] = useState(false);
  if (photo && !failed) {
    return <img className="tm-avatar" src={photo} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <div className="tm-avatar tm-avatar--ph" aria-hidden="true">
      <span className="material-symbols-rounded">&#xE7FD;</span>
      {label ? <span className="tm-avatar-label">{label}</span> : null}
    </div>
  );
};

const PlayerCard = ({ p }) => (
  <div className="tm-player">
    <Avatar photo={p.photo} label={p.number} />
    <div className="tm-player-info">
      <div className="tm-player-name">
        {p.firstName} {p.lastName}
        {p.captain ? <span className="tm-badge">C</span> : null}
        {p.viceCaptain ? <span className="tm-badge">A</span> : null}
      </div>
      <div className="tm-player-meta">
        {p.number != null ? `#${p.number}` : ""}
        {p.position ? `${p.number != null ? " · " : ""}${p.position}` : ""}
      </div>
    </div>
  </div>
);

const OfficialCard = ({ o }) => {
  const hasContact = o.email || o.phone;
  return (
    <div className={`tm-official${hasContact ? " tm-official--lead" : ""}`}>
      <Avatar photo={o.photo} />
      <div className="tm-official-info">
        <div className="tm-official-name">{o.name}</div>
        <div className="tm-official-role">{o.role}</div>
        {hasContact && (
          <div className="tm-official-contact">
            {o.email && <a href={`mailto:${o.email}`}>{o.email}</a>}
            {o.phone && <a href={`tel:${o.phone.replace(/\s+/g, "")}`}>{o.phone}</a>}
          </div>
        )}
      </div>
    </div>
  );
};

const Team = () => {
  const { subsiteId } = useParams();
  const known = findJopoxTeam(subsiteId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/getTeamRoster?subsiteId=${encodeURIComponent(subsiteId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setData(d);
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
  }, [subsiteId]);

  const title = data?.teamName || known?.name || "Joukkue";

  // officials: contacts first (head coach + manager), then the rest
  const officials = (data?.officials || [])
    .slice()
    .sort((a, b) => (b.email || b.phone ? 1 : 0) - (a.email || a.phone ? 1 : 0));

  const players = data?.players || [];
  const field = players.filter((p) => !isGoalie(p)).sort(byNumber);
  const goalies = players.filter(isGoalie).sort(byNumber);

  return (
    <>
      <style>{css}</style>
      <div className="tm-root">
        <Surface className="tm-card">
          <PageHeader
            title={title}
            subtitle={known?.sub || null}
            left={
              <Link to="/teams" className="tm-back" aria-label="Takaisin">
                <span className="material-symbols-rounded">&#xE5CB;</span>
              </Link>
            }
          />

          {loading && (
            <div className="tm-status">
              <Spinner />
            </div>
          )}

          {error && (
            <div className="tm-status tm-status--error">
              Joukkueen tietoja ei saatu haettua. Yritä myöhemmin uudelleen.
            </div>
          )}

          {!loading && !error && data && (
            <>
              {data.description && <p className="tm-desc">{data.description}</p>}

              {officials.length > 0 && (
                <section className="tm-section">
                  <h2 className="tm-section-title">Toimihenkilöt</h2>
                  <div className="tm-officials">
                    {officials.map((o, i) => (
                      <OfficialCard key={i} o={o} />
                    ))}
                  </div>
                </section>
              )}

              {field.length > 0 && (
                <section className="tm-section">
                  <h2 className="tm-section-title">Pelaajat</h2>
                  <div className="tm-roster">
                    {field.map((p, i) => (
                      <PlayerCard key={i} p={p} />
                    ))}
                  </div>
                </section>
              )}

              {goalies.length > 0 && (
                <section className="tm-section">
                  <h2 className="tm-section-title">Maalivahdit</h2>
                  <div className="tm-roster">
                    {goalies.map((p, i) => (
                      <PlayerCard key={i} p={p} />
                    ))}
                  </div>
                </section>
              )}

              {players.length === 0 && officials.length === 0 && (
                <div className="tm-status">Ei kokoonpanoa saatavilla.</div>
              )}
            </>
          )}
        </Surface>
      </div>
    </>
  );
};

export default Team;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.tm-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}
.tm-card { width: 100%; max-width: 640px; }

.tm-card .ui-page-header {
  margin-bottom: 14px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.tm-back {
  display: flex; align-items: center;
  color: rgba(255,255,255,0.6);
  text-decoration: none; border-radius: 10px; padding: 2px;
  transition: color 0.15s;
}
.tm-back:hover { color: var(--color-primary); }
.tm-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.tm-status { text-align: center; padding: 28px 0; color: var(--gz-text-muted); font-size: var(--gz-fs-sm); }
.tm-status--error { color: var(--color-loss); }

.tm-desc { color: var(--gz-text-secondary); font-size: var(--gz-fs-sm); margin: 0 0 16px; }

.tm-section { margin-bottom: 22px; }
.tm-section:last-child { margin-bottom: 0; }
.tm-section-title {
  font-size: var(--gz-fs-sm);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--color-primary);
  margin: 0 0 10px;
}

/* AVATAR */
.tm-avatar {
  flex: 0 0 auto;
  width: 48px; height: 48px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
}
.tm-avatar--ph {
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.30);
  position: relative;
}
.tm-avatar--ph .material-symbols-rounded { font-size: 30px; line-height: 1; }
.tm-avatar-label {
  position: absolute; bottom: -2px; right: -2px;
  background: var(--color-primary); color: #111;
  font-size: 11px; font-weight: 800;
  min-width: 18px; height: 18px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center; padding: 0 4px;
}

/* OFFICIALS */
.tm-officials { display: flex; flex-direction: column; gap: 8px; }
.tm-official {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-item);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.10);
}
.tm-official--lead { background: rgba(245,158,11,0.10); border-color: rgba(245,158,11,0.30); }
.tm-official-info { min-width: 0; }
.tm-official-name { font-weight: var(--gz-fw-bold); color: var(--gz-text-primary); }
.tm-official-role { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); text-transform: uppercase; letter-spacing: var(--gz-ls-wide); }
.tm-official-contact { margin-top: 4px; display: flex; flex-direction: column; gap: 1px; }
.tm-official-contact a { color: var(--color-primary); text-decoration: none; font-size: var(--gz-fs-xs); }
.tm-official-contact a:hover { text-decoration: underline; }

/* ROSTER */
.tm-roster {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.tm-player {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-item);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.10);
}
.tm-player-info { min-width: 0; }
.tm-player-name { font-weight: var(--gz-fw-bold); color: var(--gz-text-primary); }
.tm-player-meta { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); margin-top: 1px; }
.tm-badge {
  display: inline-block; margin-left: 6px;
  font-size: 10px; font-weight: 800; color: var(--color-primary);
  border: 1px solid var(--color-primary); border-radius: 4px;
  padding: 0 3px; vertical-align: middle;
}

@media (min-width: 768px) {
  .tm-root { padding: 26px 26px 28px; }
  .tm-card { padding: 16px; }
}
`;
