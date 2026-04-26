import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { themeCSS } from "../theme";
import { Surface } from "../components/ui/Surface";
import { PageHeader } from "../components/ui/PageHeader";

const STORAGE_KEY = 'ahma_favourite_teams';

// Stores Map<teamKey, {teamKey, shortName, levelGroups}>
function loadFavourites() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Map();
        const arr = JSON.parse(raw);
        // Guard against old storage format or malformed data
        const valid = arr.filter(t => t && typeof t === 'object' && t.teamKey && Array.isArray(t.levelGroups));
        return new Map(valid.map(t => [t.teamKey, t]));
    } catch {
        return new Map();
    }
}

function saveFavourites(map) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(map.values())));
}

const Teams = () => {
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [favourites, setFavourites] = useState(loadFavourites);

    useEffect(() => {
        fetch('/api/getTeams')
            .then(r => r.json())
            .then(data => {
                setTeams(data);
                setLoading(false);
            })
            .catch(() => {
                setError(true);
                setLoading(false);
            });
    }, []);

    const toggleFavourite = (team) => {
        setFavourites(prev => {
            const next = new Map(prev);
            if (next.has(team.teamKey)) {
                next.delete(team.teamKey);
            } else {
                next.set(team.teamKey, team);
            }
            saveFavourites(next);
            return next;
        });
    };

    return (
        <>
            <style>{css}</style>
            <div className="teams-root">
                <Surface className="teams-card">

                    {/* HEADER */}
                    <PageHeader
                        title="JOUKKUEET"
                        left={
                            <Link to="/" className="teams-back" aria-label="Takaisin">
                                <span className="material-symbols-rounded">&#xE5CB;</span>
                            </Link>
                        }
                    />

                    {/* CONTENT */}
                    {loading && (
                        <div className="teams-status">Ladataan joukkueita…</div>
                    )}

                    {error && (
                        <div className="teams-status teams-status--error">
                            Joukkueiden lataus epäonnistui.
                        </div>
                    )}

                    {!loading && !error && teams.map(team => (
                        <div key={team.teamKey} className="teams-row">
                            <div className="teams-info">
                                <div className="teams-name">{team.teamKey}</div>
                                <div className="teams-short">{team.shortName}</div>
                            </div>
                            <button
                                className={`teams-star${favourites.has(team.teamKey) ? ' teams-star--active' : ''}`}
                                onClick={() => toggleFavourite(team)}
                                aria-label={favourites.has(team.teamKey) ? 'Poista suosikeista' : 'Lisää suosikkeihin'}
                            >
                                <span className="material-symbols-rounded">&#xE838;</span>
                            </button>
                        </div>
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
  /* Bottom padding clears the BottomNav (GamezoneLayout) + iOS home indicator + a small gap. */
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;

  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

/* teams-card — ui-surface antaa bg/border/radius/shadow/padding */
.teams-card {
  width: 100%;
  max-width: 520px;
}

.teams-card .ui-page-header {
  margin-bottom: 14px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}

/* teams-back — back-link PageHeader left-slotissa */
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

/* TEAM ROW */
.teams-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  border-radius: var(--radius-item);
  padding: 11px 14px;
  margin-bottom: 8px;

  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: var(--shadow-item);
}
.teams-row:last-child { margin-bottom: 0; }

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

/* STAR BUTTON */
.teams-star {
  flex: 0 0 auto;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  transition: transform 0.15s;
}
.teams-star:hover { transform: scale(1.2); }

.teams-star .material-symbols-rounded {
  font-size: 28px;
  line-height: 1;
  color: rgba(255,255,255,0.25);
  font-variation-settings: 'FILL' 0;
  transition: color 0.2s, font-variation-settings 0.2s;
}

.teams-star--active .material-symbols-rounded {
  color: var(--color-primary);
  font-variation-settings: 'FILL' 1;
}

/* STATUS */
.teams-status {
  text-align: center;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-muted);
  padding: 28px 0;
}
.teams-status--error { color: var(--color-loss); }

/* ============ TABLET ============ */
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

/* ============ VERY SMALL ============ */
@media (max-width: 380px) {
  .teams-row { padding: 10px 12px; }
}
`;
