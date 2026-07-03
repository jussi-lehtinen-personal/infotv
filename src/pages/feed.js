import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuStar, LuCalendarDays, LuTrophy, LuMapPin, LuLogIn } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { loadFavouriteTeams } from "../Util";
import { getMe, getCachedUser } from "../auth/authClient";

moment.locale("fi");

// Module-scope cache of each team's events (subsiteId -> { events, ts }), shared
// across mounts so revisiting /feed paints instantly from cache and revalidates
// in the background (stale-while-revalidate) instead of flashing a spinner.
const eventsCache = new Map();
const EVENTS_TTL = 5 * 60_000; // match the server cache

// Tag each team's events with its name and interleave into one sorted stream.
const mergeStream = (teams, listsPerTeam) => {
  const out = [];
  teams.forEach((t, i) => {
    for (const e of listsPerTeam[i] || []) {
      out.push({ ...e, teamName: t.name, subsiteId: t.subsiteId });
    }
  });
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

// The "Minä" feed: a signed-in user's favourite team(s) upcoming events
// (harjoitukset + games), sourced from the PUBLIC Jopox calendar API via the
// getTeamEvents proxy. Multiple favourites are INTERLEAVED into one
// chronological stream (day headers), each event tagged with its team. No
// Jopox login needed (that's a later tier). Profile → avatar (top-right) →
// /account. See memory: project_gamezone_feed_plan.

const initials = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// "Maanantai 13.7." from a "YYYY-MM-DD" key.
const dayLabel = (key) => {
  const m = moment(key, "YYYY-MM-DD");
  if (!m.isValid()) return key;
  const s = m.format("dddd D.M.");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const EventRow = ({ e, showTeam }) => {
  const isGame = e.type === "game";
  return (
    <div className={`fd-event${isGame ? " fd-event--game" : ""}`}>
      <div className="fd-event-icon">
        {isGame ? <LuTrophy aria-hidden="true" /> : <LuCalendarDays aria-hidden="true" />}
      </div>
      <div className="fd-event-main">
        {showTeam && <div className="fd-event-team">{e.teamName}</div>}
        <div className="fd-event-title">{e.title}</div>
        {e.place && (
          <div className="fd-event-place">
            <LuMapPin className="fd-event-place-ico" aria-hidden="true" />
            {e.place}
          </div>
        )}
      </div>
      <div className="fd-event-when">
        {e.uiTime && <div className="fd-event-time">klo {e.uiTime}</div>}
      </div>
    </div>
  );
};

const Feed = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(getCachedUser);
  const [authLoading, setAuthLoading] = useState(!getCachedUser());
  const [favourites, setFavourites] = useState(loadFavouriteTeams);
  const [events, setEvents] = useState(null); // null = loading, [] = loaded/empty
  const [eventsError, setEventsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        // getMe mirrors the account's favourites to localStorage → reload them.
        setFavourites(loadFavouriteTeams());
      })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Reload favourites when returning to the tab (they may change on /teams).
  const reloadFavs = useCallback(() => setFavourites(loadFavouriteTeams()), []);
  useEffect(() => {
    window.addEventListener("focus", reloadFavs);
    return () => window.removeEventListener("focus", reloadFavs);
  }, [reloadFavs]);

  // Only Jopox-sourced favourites (carry a subsiteId) drive the feed.
  const teams = useMemo(
    () => favourites.filter((t) => t.subsiteId != null),
    [favourites]
  );
  // Stable dependency for the fetch effect (array ref changes every render).
  const teamsKey = teams.map((t) => t.subsiteId).join(",");

  // Fetch each favourite team's events (stale-while-revalidate): seed instantly
  // from cache (no spinner / no list reset → scroll stays put), then revalidate
  // only stale/missing teams in the background and update in place.
  useEffect(() => {
    if (!user || teams.length === 0) {
      setEvents(null);
      return;
    }
    let cancelled = false;
    const now = Date.now();

    // Seed from any cached team data so the list paints immediately.
    const seed = teams.map((t) => eventsCache.get(String(t.subsiteId))?.events);
    if (seed.some(Boolean)) {
      setEvents(mergeStream(teams, seed.map((l) => l || [])));
    } else {
      setEvents(null); // nothing cached yet → show the spinner once
    }
    setEventsError(false);

    let anyError = false;
    Promise.all(
      teams.map((t) => {
        const key = String(t.subsiteId);
        const cached = eventsCache.get(key);
        if (cached && now - cached.ts < EVENTS_TTL) return Promise.resolve(cached.events);
        return fetch(`/api/getTeamEvents?subsiteId=${encodeURIComponent(t.subsiteId)}`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((d) => {
            const evs = d.events || [];
            eventsCache.set(key, { events: evs, ts: Date.now() });
            return evs;
          })
          .catch(() => { anyError = true; return (cached && cached.events) || []; });
      })
    ).then((lists) => {
      if (cancelled) return;
      const merged = mergeStream(teams, lists);
      setEvents(merged);
      setEventsError(anyError && merged.length === 0);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId, teamsKey]);

  // Group the interleaved stream into day blocks.
  const days = useMemo(() => {
    if (!events) return [];
    const map = new Map();
    for (const e of events) {
      const key = String(e.date || "").slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return Array.from(map.keys())
      .sort()
      .map((key) => ({ key, label: dayLabel(key), items: map.get(key) }));
  }, [events]);

  const showTeam = teams.length > 1;

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
          {authLoading && <div className="fd-center"><Spinner text="Ladataan…" /></div>}

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
              <Link className="fd-btn fd-btn--primary" to="/teams">Joukkueet</Link>
            </div>
          )}

          {/* Signed in with favourites → interleaved stream */}
          {!authLoading && user && teams.length > 0 && (
            <>
              {events === null && !eventsError && (
                <div className="fd-center"><Spinner text="Ladataan tapahtumia…" /></div>
              )}
              {eventsError && (
                <div className="fd-status fd-status--error">
                  Tapahtumia ei saatu haettua. Yritä myöhemmin uudelleen.
                </div>
              )}
              {events && events.length === 0 && !eventsError && (
                <div className="fd-empty">
                  <div className="fd-empty-icon"><LuCalendarDays aria-hidden="true" /></div>
                  <div className="fd-empty-title">Ei tulevia tapahtumia</div>
                  <div className="fd-empty-text">Harjoitukset ja pelit ilmestyvät tähän, kun niitä on kalenterissa.</div>
                </div>
              )}
              {days.map((d) => (
                <div className="fd-day" key={d.key}>
                  <div className="fd-day-head">{d.label}</div>
                  <div className="fd-events">
                    {d.items.map((e, i) => (
                      <EventRow key={e.eventId ?? `${d.key}-${i}`} e={e} showTeam={showTeam} />
                    ))}
                  </div>
                </div>
              ))}
            </>
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
.fd-status { text-align: center; padding: 28px 0; color: var(--gz-text-muted); font-size: var(--gz-fs-sm); }
.fd-status--error { color: var(--color-loss); }

/* EMPTY (signed in, favourite picked, but no upcoming events) */
.fd-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 8px; padding: 40px 22px 24px;
  max-width: 360px; margin: 12px auto 0;
}
.fd-empty-icon {
  width: 56px; height: 56px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.12);
  color: var(--gz-text-tertiary);
}
.fd-empty-icon svg { width: 26px; height: 26px; }
.fd-empty-title {
  font-size: var(--gz-fs-md); font-weight: 800;
  letter-spacing: var(--gz-ls-wide); text-transform: uppercase;
  color: var(--gz-text-secondary);
}
.fd-empty-text {
  font-size: var(--gz-fs-sm); color: var(--gz-text-tertiary); line-height: 1.5;
}

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

/* DAY BLOCKS */
.fd-day { margin-bottom: 18px; }
.fd-day-head {
  position: sticky; top: 66px; z-index: 2;
  padding: 6px 2px 8px;
  font-size: var(--gz-fs-sm); font-weight: 800;
  letter-spacing: var(--gz-ls-wide); text-transform: uppercase;
  color: var(--color-primary);
  background: linear-gradient(180deg, var(--color-bg) 70%, rgba(17,17,17,0));
}

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
.fd-event-team {
  font-size: var(--gz-fs-xs); font-weight: 800;
  letter-spacing: var(--gz-ls-wide); text-transform: uppercase;
  color: var(--color-primary);
  margin-bottom: 1px;
}
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
.fd-event-time { font-size: var(--gz-fs-sm); font-weight: var(--gz-fw-bold); color: var(--gz-text-secondary); }
`;
