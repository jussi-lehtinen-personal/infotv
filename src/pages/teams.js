import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";

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
                <div className="teams-card">

                    {/* HEADER */}
                    <div className="teams-header">
                        <Link to="/" className="teams-back" aria-label="Takaisin">
                            <span className="material-symbols-rounded">&#xE5CB;</span>
                        </Link>
                        <div className="teams-page-title">JOUKKUEET</div>
                        <div className="teams-header-spacer" />
                    </div>

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

                </div>
            </div>
        </>
    );
};

export default Teams;

/* ================== STYLES ================== */

const css = `

html, body, #root {
  height: 100%;
  background: #111111;
}
body { margin: 0; }

.teams-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 14px;
  padding: 10px 7px;

  background:
    radial-gradient(circle at 50% 0%, rgba(243, 223, 191, 0.22), transparent 55%),
    linear-gradient(180deg, #0f1112 0%, #101213 55%, #090b0b 100%);

  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

.teams-card {
  width: 100%;
  max-width: 520px;
  border-radius: 18px;
  padding: 12px;

  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 14px 34px rgba(0,0,0,0.35);
}

/* HEADER */
.teams-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  padding: 2px 2px 6px;
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
.teams-back:hover { color: #f59e0b; }
.teams-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

/* spacer mirrors back button width to keep title centred */
.teams-header-spacer { width: 34px; }

.teams-page-title {
  font-size: clamp(22px, 5vw, 34px);
  letter-spacing: 3px;
  color: #f59e0b;
  text-shadow: 0 6px 18px rgba(0,0,0,0.6);
  text-align: center;
  flex: 1;
}

/* TEAM ROW */
.teams-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;

  border-radius: 14px;
  padding: 11px 14px;
  margin-bottom: 8px;

  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 4px 10px rgba(0,0,0,0.30);
}
.teams-row:last-child { margin-bottom: 0; }

.teams-info { flex: 1; min-width: 0; }

.teams-name {
  font-size: 15px;
  font-weight: 700;
  color: rgba(255,255,255,0.95);
}

.teams-short {
  font-size: 12px;
  color: rgba(255,255,255,0.45);
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
  color: #f59e0b;
  font-variation-settings: 'FILL' 1;
}

/* STATUS */
.teams-status {
  text-align: center;
  color: rgba(255,255,255,0.45);
  padding: 28px 0;
  font-size: 14px;
}
.teams-status--error { color: #ef4444; }

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

  .teams-name { font-size: 16px; }
  .teams-short { font-size: 13px; }
}

/* ============ VERY SMALL ============ */
@media (max-width: 380px) {
  .teams-name { font-size: 14px; }
  .teams-row { padding: 10px 12px; }
}
`;
