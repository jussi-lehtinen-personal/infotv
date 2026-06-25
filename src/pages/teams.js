import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { LuArrowLeft, LuChevronRight } from "react-icons/lu";
import { themeCSS } from "../theme";
import { JOPOX_TEAMS } from "../data/jopoxTeams";

// Hero image. Swap to the real teams hero shot when provided.
const HERO = "/teams_hero.webp";

// Team list driven by the Jopox subsites (works year-round, off-season too).
// Each row opens the team page (/teams/:subsiteId) with roster + staff.
// Favouriting moved to the match pages — not here (v1).
const Teams = () => {
  const navigate = useNavigate();
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
              onClick={() => navigate("/")}
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
          {JOPOX_TEAMS.map((team) => (
            <Link
              key={team.subsiteId}
              to={`/teams/${team.subsiteId}`}
              className="teams-row"
            >
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
              <LuChevronRight className="teams-arrow" aria-hidden="true" />
            </Link>
          ))}
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
    radial-gradient(120% 90% at 50% 30%, rgba(245,158,11,0.10), rgba(12,14,19,0) 60%),
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

/* TEAM ROW (link) */
.teams-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: var(--radius-item);
  padding: 11px 14px;
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.06);
  text-decoration: none;
  color: var(--gz-text-primary);
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, border-color 0.15s;
}
.teams-row:hover,
.teams-row:active {
  background: #202020;
  border-color: rgba(245,158,11,0.35);
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
.teams-arrow {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  color: rgba(255,255,255,0.35);
}

@media (min-width: 768px) {
  .teams-list { max-width: 760px; }
}
`;
