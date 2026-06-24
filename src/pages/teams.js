import React from "react";
import { Link } from "react-router-dom";
import { themeCSS } from "../theme";
import { Surface } from "../components/ui/Surface";
import { PageHeader } from "../components/ui/PageHeader";
import { JOPOX_TEAMS } from "../data/jopoxTeams";

// Team list driven by the Jopox subsites (works year-round, off-season too).
// Each row opens the team page (/teams/:subsiteId) with roster + staff.
// Favouriting moved to the match pages — not here (v1).
const Teams = () => {
  return (
    <>
      <style>{css}</style>
      <div className="teams-root">
        <Surface className="teams-card">
          <PageHeader
            title="JOUKKUEET"
            subtitle="Valitse joukkue"
            left={
              <Link to="/" className="teams-back" aria-label="Takaisin">
                <span className="material-symbols-rounded">&#xE5CB;</span>
              </Link>
            }
          />

          {JOPOX_TEAMS.map((team) => (
            <Link
              key={team.subsiteId}
              to={`/teams/${team.subsiteId}`}
              className="teams-row"
            >
              <div className="teams-info">
                <div className="teams-name">{team.name}</div>
                {team.sub && <div className="teams-short">{team.sub}</div>}
              </div>
              <span className="teams-arrow material-symbols-rounded" aria-hidden="true">
                &#xE5CC;
              </span>
            </Link>
          ))}
        </Surface>
      </div>
    </>
  );
};

export default Teams;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root {
  height: 100%;
  background: var(--color-bg);
}
body { margin: 0; }

.teams-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 14px;
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

.teams-card {
  width: 100%;
  max-width: 520px;
}
.teams-card .ui-page-header {
  margin-bottom: 14px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

.teams-back {
  display: flex;
  align-items: center;
  color: rgba(255,255,255,0.6);
  text-decoration: none;
  border-radius: 10px;
  padding: 2px;
  transition: color 0.15s;
}
.teams-back:hover { color: var(--color-primary); }
.teams-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

/* TEAM ROW (link) */
.teams-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: var(--radius-item);
  padding: 13px 14px;
  margin-bottom: 8px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: var(--shadow-item);
  text-decoration: none;
  color: var(--gz-text-primary);
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, border-color 0.15s;
}
.teams-row:last-child { margin-bottom: 0; }
.teams-row:hover,
.teams-row:active {
  background: rgba(255,255,255,0.08);
  border-color: rgba(245,158,11,0.35);
}

.teams-info { flex: 1; min-width: 0; }
.teams-name {
  font-size: var(--gz-fs-md);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  color: var(--gz-text-primary);
}
.teams-short {
  font-size: var(--gz-fs-sm);
  font-weight: var(--gz-fw-regular);
  color: var(--gz-text-tertiary);
  margin-top: 2px;
}
.teams-arrow {
  flex: 0 0 auto;
  font-size: 24px;
  color: rgba(255,255,255,0.35);
}

@media (min-width: 768px) {
  .teams-root {
    padding: 26px 26px 28px;
    gap: 18px;
  }
  .teams-card {
    max-width: 980px;
    padding: 16px;
    background: rgba(255,255,255,0.10);
    border-color: rgba(255,255,255,0.16);
  }
}
`;
