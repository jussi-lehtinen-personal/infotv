import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuStar, LuCalendarDays, LuTrophy, LuMapPin, LuLogIn } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { loadFavouriteTeams } from "../Util";
import { getMe, getCachedUser } from "../auth/authClient";

moment.locale("fi");

// The "Minä" feed: a signed-in user's favourite team(s) upcoming events
// (harjoitukset + games), sourced from the PUBLIC Jopox calendar API via the
// getTeamEvents proxy. No Jopox login needed (that's a later tier). Profile is
// reached from the avatar (top-right) → /account.
// See memory: project_gamezone_feed_plan.

const initials = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Robust date parse — API dates are "YYYY-MM-DDTHH:mm:ss" (already ISO).
const fmtDay = (iso) => {
  const m = moment(iso);
  if (!m.isValid()) return "";
  const label = m.format("dd D.M."); // "ma 13.7."
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const EventRow = ({ e }) => {
  const isGame = e.type === "game";
  return (
    <div className={`fd-event${isGame ? " fd-event--game" : ""}`}>
      <div className="fd-event-icon">
        {isGame ? <LuTrophy aria-hidden="true" /> : <LuCalendarDays aria-hidden="true" />}
      </div>
      <div className="fd-event-main">
        <div className="fd-event-title">{e.title}</div>
        {e.place && (
          <div className="fd-event-place">
            <LuMapPin className="fd-event-place-ico" aria-hidden="true" />
            {e.place}
          </div>
        )}
      </div>
      <div className="fd-event-when">
        <div className="fd-event-day">{e.uiDate ? fmtDay(e.date) : ""}</div>
        {e.uiTime && <div className="fd-event-time">klo {e.uiTime}</div>}
      </div>
    </div>
  );
};

// One favourite team's section: name header + its events (own loading/empty).
const TeamSection = ({ team }) => {
  const [events, setEvents] = useState(null); // null = loading
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(false);
    fetch(`/api/getTeamEvents?subsiteId=${encodeURIComponent(team.subsiteId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setEvents(d.events || []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [team.subsiteId]);

  return (
    <section className="fd-section">
      <div className="fd-section-head">
        <LuStar className="fd-section-star" aria-hidden="true" />
        <h2 className="fd-section-title">{team.name}</h2>
        <Link to={`/teams/${team.subsiteId}`} className="fd-section-link">
          Joukkue
        </Link>
      </div>

      {events === null && !error && (
        <div className="fd-section-status"><Spinner /></div>
      )}
      {error && (
        <div className="fd-section-status fd-section-status--error">
          Tapahtumia ei saatu haettua.
        </div>
      )}
      {events && events.length === 0 && (
        <div className="fd-section-status">Ei tulevia tapahtumia.</div>
      )}
      {events && events.length > 0 && (
        <div className="fd-events">
          {events.map((e, i) => (
            <EventRow key={e.eventId ?? i} e={e} />
          ))}
        </div>
      )}
    </section>
  );
};

const Feed = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(getCachedUser);
  const [authLoading, setAuthLoading] = useState(!getCachedUser());
  const [favourites, setFavourites] = useState(loadFavouriteTeams);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload favourites when returning to the tab (they may change on /teams).
  const reloadFavs = useCallback(() => setFavourites(loadFavouriteTeams()), []);
  useEffect(() => {
    window.addEventListener("focus", reloadFavs);
    return () => window.removeEventListener("focus", reloadFavs);
  }, [reloadFavs]);

  // Only Jopox-sourced favourites (carry a subsiteId) drive the feed.
  const teams = favourites.filter((t) => t.subsiteId != null);

  const header = (
    <div className="fd-head">
      <h1 className="fd-head-title">Minä</h1>
      <button
        type="button"
        className="fd-avatar"
        onClick={() => navigate("/account")}
        aria-label="Oma profiili"
      >
        {user && user.avatar ? (
          <img className="fd-avatar-img" src={user.avatar} alt="" />
        ) : (
          <span className="fd-avatar-initials">{user ? initials(user.nickname) : "?"}</span>
        )}
      </button>
    </div>
  );

  return (
    <>
      <style>{css}</style>
      <div className="fd-root">
        {header}

        <div className="fd-body">
          {authLoading && (
            <div className="fd-center"><Spinner /></div>
          )}

          {/* Signed out → login gate */}
          {!authLoading && !user && (
            <div className="fd-gate">
              <div className="fd-gate-icon"><LuStar aria-hidden="true" /></div>
              <h2 className="fd-gate-title">Oman joukkueen tapahtumat</h2>
              <p className="fd-gate-text">
                Kirjaudu sisään ja valitse suosikkijoukkue, niin näet sen
                harjoitukset ja pelit tässä.
              </p>
              <button className="fd-btn fd-btn--primary" onClick={() => navigate("/account")}>
                <LuLogIn aria-hidden="true" /> Kirjaudu
              </button>
            </div>
          )}

          {/* Signed in, no favourite → pick one */}
          {!authLoading && user && teams.length === 0 && (
            <div className="fd-gate">
              <div className="fd-gate-icon"><LuStar aria-hidden="true" /></div>
              <h2 className="fd-gate-title">Valitse suosikkijoukkue</h2>
              <p className="fd-gate-text">
                Merkitse joukkue suosikiksi tähdellä, niin sen tapahtumat
                ilmestyvät tänne.
              </p>
              <Link className="fd-btn fd-btn--primary" to="/teams">
                Joukkueet
              </Link>
            </div>
          )}

          {/* Signed in with favourites → feed */}
          {!authLoading && user && teams.length > 0 && (
            <div className="fd-sections">
              {teams.map((t) => (
                <TeamSection key={t.subsiteId} team={t} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Feed;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.fd-root {
  min-height: 100dvh;
  background: var(--color-bg);
  font-family: var(--font-family-base);
  padding-bottom: var(--ui-bottom-nav-clearance, 80px);
}

/* HEADER (title + avatar → profile) */
.fd-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(env(safe-area-inset-top) + 14px) 16px 12px;
  position: sticky; top: 0; z-index: 5;
  background: var(--color-bg);
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.fd-head-title {
  margin: 0;
  font-size: 20px; font-weight: 800;
  letter-spacing: 0.10em; text-transform: uppercase;
  color: var(--color-primary);
}
.fd-avatar {
  flex: 0 0 auto;
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #16181d;
  border: 2px solid var(--color-primary);
  color: #fff; font-weight: 800; font-size: 15px;
  overflow: hidden; cursor: pointer; padding: 0;
  -webkit-tap-highlight-color: transparent;
}
.fd-avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

.fd-body {
  width: 100%; max-width: 640px; margin: 0 auto;
  padding: 14px 12px 0;
}
.fd-center { display: flex; justify-content: center; padding: 48px 0; }

/* GATE (signed-out / no favourite) */
.fd-gate {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 12px; padding: 44px 22px;
  max-width: 380px; margin: 24px auto 0;
}
.fd-gate-icon {
  width: 64px; height: 64px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(245,158,11,0.13);
  border: 1px solid rgba(245,158,11,0.35);
  color: var(--color-primary);
}
.fd-gate-icon svg { width: 30px; height: 30px; }
.fd-gate-title {
  margin: 0;
  font-size: var(--gz-fs-lg, 18px); font-weight: 800;
  letter-spacing: 0.01em; text-transform: uppercase;
  color: var(--gz-text-primary);
}
.fd-gate-text {
  margin: 0;
  font-size: var(--gz-fs-sm); color: var(--gz-text-tertiary);
  line-height: 1.5;
}
.fd-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  margin-top: 6px;
  padding: 12px 22px;
  border-radius: var(--radius-item);
  border: 1px solid transparent;
  font-size: var(--gz-fs-md); font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-decoration: none; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.fd-btn svg { width: 18px; height: 18px; }
.fd-btn--primary { background: var(--color-primary); color: #1a1206; }
.fd-btn--primary:hover { filter: brightness(1.08); }

/* SECTIONS */
.fd-sections { display: flex; flex-direction: column; gap: 22px; }
.fd-section-head {
  display: flex; align-items: center; gap: 8px;
  margin: 0 2px 10px;
}
.fd-section-star { flex: 0 0 auto; width: 18px; height: 18px; color: var(--color-primary); fill: var(--color-primary); }
.fd-section-title {
  flex: 1; min-width: 0; margin: 0;
  font-size: var(--gz-fs-md); font-weight: 800;
  letter-spacing: var(--gz-ls-wide); text-transform: uppercase;
  color: var(--gz-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fd-section-link {
  flex: 0 0 auto;
  font-size: var(--gz-fs-xs); font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide); text-transform: uppercase;
  color: var(--color-primary); text-decoration: none;
  padding: 4px 6px;
}
.fd-section-status { text-align: center; padding: 18px 0; color: var(--gz-text-muted); font-size: var(--gz-fs-sm); }
.fd-section-status--error { color: var(--color-loss); }

/* EVENTS */
.fd-events { display: flex; flex-direction: column; gap: 8px; }
.fd-event {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 14px;
  border-radius: var(--radius-item);
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.06);
}
.fd-event--game { border-color: rgba(245,158,11,0.30); background: rgba(245,158,11,0.06); }
.fd-event-icon {
  flex: 0 0 auto;
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05);
  color: var(--gz-text-tertiary);
}
.fd-event--game .fd-event-icon { background: rgba(245,158,11,0.15); color: var(--color-primary); }
.fd-event-icon svg { width: 20px; height: 20px; }
.fd-event-main { flex: 1; min-width: 0; }
.fd-event-title {
  font-size: var(--gz-fs-md); font-weight: var(--gz-fw-bold);
  color: var(--gz-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fd-event-place {
  display: flex; align-items: center; gap: 4px;
  margin-top: 2px;
  font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary);
}
.fd-event-place-ico { width: 13px; height: 13px; flex: 0 0 auto; }
.fd-event-when { flex: 0 0 auto; text-align: right; }
.fd-event-day { font-size: var(--gz-fs-sm); font-weight: var(--gz-fw-bold); color: var(--gz-text-secondary); }
.fd-event-time { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); margin-top: 1px; }
`;
