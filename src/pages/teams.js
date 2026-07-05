import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { LuArrowLeft, LuStar } from "react-icons/lu";
import { useGoBack } from "../hooks/useGoBack";
import { themeCSS } from "../theme";
import { JOPOX_TEAMS } from "../data/jopoxTeams";
import {
  loadFavouriteTeams,
  makeJopoxFavourite,
  isFavouriteSubsite,
} from "../Util";
import { getCachedUser, getMe, saveFavourites } from "../auth/authClient";

// Hero image. Swap to the real teams hero shot when provided.
const HERO = "/teams_hero.webp";

// Team list driven by the Jopox subsites (works year-round, off-season too).
// Each row opens the team page (/teams/:subsiteId) with roster + staff. When
// signed in, a star toggles the team as a favourite (canonical picker — drives
// the Minä feed + the gamezone "Suosikit" filter); favourites are account-bound
// and hidden entirely from signed-out users.
const Teams = () => {
  const goBack = useGoBack("/");
  const [user, setUser] = useState(getCachedUser);
  const [favourites, setFavourites] = useState(loadFavouriteTeams);

  // Hydrate auth + account favourites (getMe mirrors them to localStorage).
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setFavourites(loadFavouriteTeams());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggleFavourite = useCallback((team) => {
    setFavourites((prev) => {
      const next = isFavouriteSubsite(prev, team.subsiteId)
        ? prev.filter((t) => String(t.subsiteId) !== String(team.subsiteId))
        : [...prev, makeJopoxFavourite(team)];
      // Persist to the account (mirrors to localStorage). Revert on failure.
      saveFavourites(next).catch(() => setFavourites(prev));
      return next;
    });
  }, []);

  return (
    <>
      <style>{css}</style>
      <div className="teams-root">
        {/* HERO */}
        <div className="teams-hero">
          <img className="teams-hero-img" src={HERO} alt="" />
          <div className="teams-hero-top">
            <button
              className="teams-icon-btn"
              onClick={goBack}
              aria-label="Takaisin"
            >
              <LuArrowLeft />
            </button>
          </div>
          <div className="teams-hero-scrim" />
          <div className="teams-hero-titles">
            <h1 className="teams-hero-title">JOUKKUEET</h1>
            <div className="teams-hero-sub">Valitse joukkue</div>
          </div>
        </div>

        {/* LIST */}
        <div className="teams-list">
          {JOPOX_TEAMS.map((team) => {
            const isFav = isFavouriteSubsite(favourites, team.subsiteId);
            return (
              <div className="teams-row" key={team.subsiteId}>
                <Link to={`/teams/${team.subsiteId}`} className="teams-row-link">
                  <img
                    className="teams-logo"
                    src={team.subsiteId === 10272 ? "/lkk_logo.png" : "/ahma_logo.png"}
                    alt=""
                    aria-hidden="true"
                  />
                  <div className="teams-info">
                    <div className="teams-name">{team.name}</div>
                    {team.sub && <div className="teams-short">{team.sub}</div>}
                  </div>
                </Link>
                {user && (
                  <button
                    type="button"
                    className={`teams-fav${isFav ? " teams-fav--on" : ""}`}
                    onClick={() => toggleFavourite(team)}
                    aria-pressed={isFav}
                    aria-label={
                      isFav
                        ? `Poista ${team.name} suosikeista`
                        : `Lisää ${team.name} suosikkeihin`
                    }
                  >
                    <LuStar className="teams-fav-ico" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
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
  background: #0a0b0e;
  font-family: var(--font-family-base);
  padding-bottom: var(--ui-bottom-nav-clearance, 80px);
}

/* HERO */
.teams-hero {
  position: relative;
  width: 100%;
  height: 300px;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% 30%, rgba(var(--color-primary-rgb),0.10), rgba(12,14,19,0) 60%),
    #0c0e13;
}
.teams-hero-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.teams-hero-top {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; align-items: center;
  padding: calc(env(safe-area-inset-top) + 12px) 14px 0;
  z-index: 2;
}
.teams-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(0,0,0,0.38); backdrop-filter: blur(6px);
  border: none; color: #fff; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.teams-icon-btn svg { width: 22px; height: 22px; }
.teams-hero-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(8,10,15,0.15) 0%, rgba(8,10,15,0) 35%, rgba(8,10,15,0.55) 72%, var(--color-bg) 100%);
}
.teams-hero-titles {
  position: absolute; left: 0; right: 0; bottom: 14px;
  padding: 0 18px; z-index: 1;
  text-align: center;
}
.teams-hero-title {
  margin: 0;
  font-size: clamp(26px, 7vw, 34px);
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--color-primary);
  text-shadow: 0 2px 12px rgba(0,0,0,0.6);
}
.teams-hero-sub {
  margin-top: 2px;
  font-size: var(--gz-fs-sm);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  color: rgba(255,255,255,0.78);
}

/* LIST */
.teams-list {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 16px 12px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* TEAM ROW (card = link + favourite star) */
.teams-row {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-item);
  padding: 11px 8px 11px 14px;
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.06);
  color: var(--gz-text-primary);
  transition: background 0.15s, border-color 0.15s;
}
.teams-row:hover,
.teams-row:active {
  background: #202020;
  border-color: rgba(var(--color-primary-rgb),0.35);
}
/* The navigating part of the row (logo + info). */
.teams-row-link {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}

.teams-logo {
  flex: 0 0 auto;
  width: 54px;
  height: 54px;
  object-fit: contain;
}

.teams-info { flex: 1; min-width: 0; }
.teams-name {
  font-size: var(--gz-fs-md);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-primary);
}
.teams-short {
  font-size: var(--gz-fs-sm);
  font-weight: var(--gz-fw-regular);
  color: var(--gz-text-tertiary);
  margin-top: 2px;
}
/* Favourite star button */
.teams-fav {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: none;
  border: none;
  color: rgba(255,255,255,0.30);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color 0.15s, background 0.15s, transform 0.1s;
}
.teams-fav:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.55); }
.teams-fav:active { transform: scale(0.88); }
.teams-fav-ico { width: 22px; height: 22px; }
.teams-fav--on { color: var(--color-primary); }
.teams-fav--on:hover { color: var(--color-primary); }
.teams-fav--on .teams-fav-ico { fill: var(--color-primary); }

@media (min-width: 768px) {
  .teams-list { max-width: 760px; }
}
`;
