import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuStar, LuCalendarDays, LuTrophy, LuMapPin, LuLogIn, LuChevronDown, LuChevronRight, LuClock, LuPlane } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { loadFavouriteTeams } from "../Util";
import { getMe, getCachedUser } from "../auth/authClient";
import { buildTeamAgenda, opponentLogo, opponentName } from "../lib/agenda";
import { peekSeasonGames, fetchSeasonGames, subscribe as subscribeSeason } from "../lib/seasonGamesCache";
import { isGameForFavourite } from "../lib/teamMatch";

moment.locale("fi");

// Module-scope cache of each team's events (subsiteId -> { events, ts }), shared
// across mounts so revisiting /feed paints instantly from cache and revalidates
// in the background (stale-while-revalidate) instead of flashing a spinner.
const eventsCache = new Map();
const EVENTS_TTL = 15 * 60_000; // match the server cache

// Per-event free-text description (eventId -> string|null), fetched lazily when
// a card is expanded. null = known to have no description (don't refetch).
const detailCache = new Map();

// Per-card expand state. DEFAULT: only this week's events start expanded (keeps
// the list tidy + limits how many detail fetches fire on load). We remember the
// user's explicit overrides (localStorage) so toggles persist across visits.
const CARDS_KEY = "ahma_feed_cards";
const loadCardState = () => {
  try {
    const o = JSON.parse(localStorage.getItem(CARDS_KEY));
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
};
const saveCardState = (obj) => {
  try {
    const keys = Object.keys(obj);
    const trimmed =
      keys.length > 300
        ? Object.fromEntries(keys.slice(-300).map((k) => [k, obj[k]]))
        : obj;
    localStorage.setItem(CARDS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
};

// Pull the "17.00 - 19.00" time range out of the subtitle ("13.07.2026 17.00 -
// 19.00, Wareena"); fall back to just the start time.
const timeRange = (e) => {
  const m = String(e.subtitle || "").match(/(\d{1,2}[.:]\d{2})\s*-\s*(\d{1,2}[.:]\d{2})/);
  if (m) return `${m[1]} – ${m[2]}`;
  return e.uiTime || null;
};

// Chronological sort key from an agenda item's date ("YYYY-MM-DD HH:mm" or ISO).
const sortKey = (e) => String(e.date || "").replace(" ", "T");

// Tag each GAME with which source(s) it came from, so out-of-sync entries stand
// out (a QA aid — this is how the U14 wrong-time bug surfaced):
//   both   tp + Jopox matched (same date+time)      → in sync
//   tp     only tulospalvelu (not in Jopox calendar)
//   jopox  only Jopox (friendly/tournament, no tp)
// A game entered at two different times shows as two same-day cards (one "tp",
// one "jopox") — the discrepancy reads directly off the tags, so we don't try to
// infer a "same game, wrong time" link (can't tell it from two genuinely
// different games on one day). Practices get no source tag. Mutates + returns.
const gameSource = (e) => (e.tp && e.eventId ? "both" : e.tp ? "tp" : "jopox");
function annotateSources(items) {
  for (const it of items) it.source = it.type === "game" ? gameSource(it) : null;
  return items;
}
const SOURCE_LABEL = {
  both: "OK",
  tp: "Tulospalvelu",
  jopox: "Jopox",
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

const EventRow = ({ e, expanded, onToggle }) => {
  const isGame = e.type === "game";
  const range = timeRange(e);
  // The tulospalvelu game (logos/score) is already on the item (buildTeamAgenda).
  const tp = e.tp;
  const oppLogo = opponentLogo(tp);
  const played = tp && Number(tp.finished) > 0;
  const score = played ? `${tp.home_goals ?? ""}–${tp.away_goals ?? ""}` : null;
  // Games: show just the opponent (the favourite is already on the team line)
  // so the long "Kiekko-Ahma – X" doesn't crowd out the time on the right. For
  // Jopox-only games with a blank home team the title comes as "– Diskos U14";
  // strip a dangling leading/trailing dash so it never renders as "– Team".
  const rawHeading = isGame && tp ? opponentName(tp) || e.title : e.title;
  const heading = isGame
    ? String(rawHeading || "").replace(/^\s*[–-]\s*/, "").replace(/\s*[–-]\s*$/, "").trim() || rawHeading
    : rawHeading;
  const detailKey = `${e.subsiteId}|${e.eventId}`;
  const [desc, setDesc] = useState(() => detailCache.get(detailKey));

  // Lazily fetch the event's free-text description, but ONLY when the card is
  // expanded (and cache it) — a 10-min server cache keeps Jopox from flooding.
  useEffect(() => {
    if (!expanded || e.eventId == null) return;
    if (detailCache.has(detailKey)) {
      setDesc(detailCache.get(detailKey));
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({
      eventId: String(e.eventId),
      subsiteId: String(e.subsiteId ?? ""),
      type: e.type,
    });
    fetch(`/api/getEventDetail?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const val = d.description || null;
        detailCache.set(detailKey, val);
        if (!cancelled) setDesc(val);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [expanded, detailKey, e.eventId, e.subsiteId, e.type]);

  return (
    <div className={`fd-event${isGame ? " fd-event--game" : ""}${expanded ? " is-open" : ""}`}>
      <button
        type="button"
        className="fd-event-head"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className={`fd-event-icon${isGame && oppLogo ? " fd-event-icon--logo" : ""}`}>
          {isGame && oppLogo ? (
            <img className="fd-event-opplogo" src={oppLogo} alt="" />
          ) : isGame ? (
            <LuTrophy aria-hidden="true" />
          ) : (
            <LuCalendarDays aria-hidden="true" />
          )}
        </div>
        <div className="fd-event-main">
          {e.teamName && (
            <div className="fd-event-team">
              {e.teamName}
              {isGame && e.home != null && (
                <span className="fd-event-ha">{e.home ? "koti" : "vieras"}</span>
              )}
              {isGame && e.source && (
                <span className={`fd-src fd-src--${e.source}`}>
                  {SOURCE_LABEL[e.source]}
                </span>
              )}
            </div>
          )}
          <div className="fd-event-title">{heading}</div>
        </div>
        <div className="fd-event-when">
          {score ? (
            <div className="fd-event-score">{score}</div>
          ) : e.uiTime ? (
            <div className="fd-event-time">klo {e.uiTime}</div>
          ) : null}
        </div>
        <LuChevronDown className="fd-event-chev" aria-hidden="true" />
      </button>

      {expanded && (
        <div className="fd-event-details">
          {range && (
            <div className="fd-detail">
              <LuClock className="fd-detail-ico" aria-hidden="true" />
              <span>{range}</span>
            </div>
          )}
          {e.place && (
            <div className="fd-detail">
              <LuMapPin className="fd-detail-ico" aria-hidden="true" />
              <span>{e.place}</span>
            </div>
          )}
          {isGame && e.league && (
            <div className="fd-detail">
              <LuTrophy className="fd-detail-ico" aria-hidden="true" />
              <span>{e.league}</span>
            </div>
          )}
          {isGame && e.home != null && (
            <div className="fd-detail">
              <LuPlane className="fd-detail-ico" aria-hidden="true" />
              <span>{e.home ? "Kotipeli" : "Vieraspeli"}</span>
            </div>
          )}
          {desc && <div className="fd-event-desc">{desc}</div>}
          {isGame && tp && (
            <Link
              className="fd-event-link"
              to={`/gamezone/game/${tp.id}`}
              state={{ game: tp }}
            >
              Näytä ottelu <LuChevronRight aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
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
  const [cardState, setCardState] = useState(loadCardState); // { id: bool } overrides

  const toggleCard = useCallback((id, current) => {
    setCardState((prev) => {
      const next = { ...prev, [id]: !current };
      saveCardState(next);
      return next;
    });
  }, []);

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

  // Build the merged agenda per favourite: Jopox events (harjoitukset + Jopox
  // games, from getTeamEvents) ⊕ the team's tulospalvelu games (from the season
  // cache, filtered by age) — deduped by date+time so tp-only games (e.g. U15
  // sarjapelit not in Jopox) also show. Interleave all favourites chronologically.
  // SWR: seed from caches, revalidate Jopox + the season schedule in the bg.
  const jopoxRef = useRef([]);
  useEffect(() => {
    if (!user || teams.length === 0) {
      setEvents(null);
      return;
    }
    let cancelled = false;
    const now = Date.now();
    // Upcoming only: the season cache also holds LAST season's games (for the
    // Ottelut history view), but the feed is a "tulevat tapahtumat" stream —
    // drop anything before today so old results don't flood the top.
    const todayStr = moment().format("YYYY-MM-DD");

    const computeMerged = () => {
      const all = [];
      teams.forEach((t, i) => {
        const jopox = jopoxRef.current[i] || [];
        const tp = peekSeasonGames().filter((g) => isGameForFavourite(g, t));
        all.push(...buildTeamAgenda(jopox, tp, t.name, t.subsiteId));
      });
      const upcoming = all
        .filter((e) => String(e.date || "").slice(0, 10) >= todayStr)
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      return annotateSources(upcoming);
    };
    const rebuild = () => { if (!cancelled) setEvents(computeMerged()); };

    // Seed from caches so the list paints immediately.
    jopoxRef.current = teams.map((t) => eventsCache.get(String(t.subsiteId))?.events || null);
    if (jopoxRef.current.some(Boolean) || peekSeasonGames().length) rebuild();
    else setEvents(null);
    setEventsError(false);

    // Load/revalidate the season schedule + re-merge when it arrives or updates.
    fetchSeasonGames().catch(() => {});
    const unsub = subscribeSeason(rebuild);

    // Fetch each team's Jopox events (SWR from eventsCache).
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
      jopoxRef.current = lists;
      const merged = computeMerged();
      setEvents(merged);
      setEventsError(anyError && merged.length === 0);
    });

    return () => { cancelled = true; unsub(); };
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

  // Default-expanded = each team's NEXT (earliest) item only. events are sorted
  // ascending, so the first item seen per team is that team's next one.
  const defaultExpanded = useMemo(() => {
    const seenTeam = new Set();
    const ids = new Set();
    for (const e of events || []) {
      const tn = String(e.teamName);
      if (!seenTeam.has(tn)) {
        seenTeam.add(tn);
        ids.add(e.key);
      }
    }
    return ids;
  }, [events]);

  // Incremental render: show day-groups in chunks, growing as the user scrolls
  // near the bottom. Off-screen days aren't mounted, so their cards don't fetch
  // details until scrolled into view.
  const DAY_CHUNK = 4;
  const [visibleDays, setVisibleDays] = useState(DAY_CHUNK);
  useEffect(() => { setVisibleDays(DAY_CHUNK); }, [events]);
  const sentinelRef = useRef(null);
  // NOTE: depend on visibleDays too. IntersectionObserver only fires on a CHANGE
  // of intersection state — after one bump the sentinel is often STILL within the
  // 400px margin (state stays "intersecting" → no new callback), so the list
  // would grow only once and stop. Re-observing on each visibleDays change
  // re-fires the initial callback, filling until the sentinel leaves the margin
  // or every day is shown (then the sentinel isn't rendered → el null → stop).
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting)
          setVisibleDays((n) => Math.min(n + DAY_CHUNK, days.length));
      },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [days.length, visibleDays]);

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
              {days.slice(0, visibleDays).map((d) => (
                <div className="fd-day" key={d.key}>
                  <div className="fd-day-head">{d.label}</div>
                  <div className="fd-events">
                    {d.items.map((e) => {
                      const id = e.key;
                      const expanded = id in cardState ? cardState[id] : defaultExpanded.has(id);
                      return (
                        <EventRow
                          key={id}
                          e={e}
                          expanded={expanded}
                          onToggle={() => toggleCard(id, expanded)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              {events && visibleDays < days.length && (
                <div ref={sentinelRef} className="fd-sentinel" aria-hidden="true" />
              )}
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
  border-radius: var(--radius-item);
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.06);
  overflow: hidden;
}
.fd-event--game { border-color: rgba(245,158,11,0.30); background: rgba(245,158,11,0.06); }

/* Clickable header row (toggles expand/collapse). */
.fd-event-head {
  display: flex; align-items: center; gap: 12px;
  width: 100%;
  padding: 11px 14px;
  background: none; border: none; text-align: left; font: inherit;
  color: inherit; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.fd-event-icon {
  flex: 0 0 auto;
  width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05);
  color: var(--gz-text-tertiary);
}
.fd-event--game .fd-event-icon { background: rgba(245,158,11,0.15); color: var(--color-primary); }
.fd-event-icon svg { width: 20px; height: 20px; }
/* Opponent logo replaces the trophy once the tulospalvelu game is matched.
   Same theme as the match cards: white rounded-rect with a little padding. */
.fd-event-icon--logo { background: transparent; }
.fd-event-opplogo {
  width: 38px; height: 38px;
  box-sizing: border-box;
  border-radius: 8px;
  background: #fff;
  object-fit: contain;
  padding: 3px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.35);
}
.fd-event-main { flex: 1; min-width: 0; }
.fd-event-team {
  display: flex; align-items: center; gap: 6px;
  font-size: var(--gz-fs-xs); font-weight: 800;
  letter-spacing: var(--gz-ls-wide); text-transform: uppercase;
  color: var(--color-primary);
  margin-bottom: 1px;
}
/* koti/vieras chip next to the team on a game row */
.fd-event-ha {
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  padding: 1px 6px; border-radius: 999px;
  color: var(--gz-text-tertiary);
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
}
/* Data-source chip: which system(s) a game came from (QA aid, spot out-of-sync) */
.fd-src {
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  padding: 1px 6px; border-radius: 999px;
  border: 1px solid transparent; white-space: nowrap;
}
.fd-src--both   { color: #4ade80; background: rgba(34,197,94,0.12);  border-color: rgba(34,197,94,0.35); }
.fd-src--tp     { color: #fbbf24; background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.35); }
.fd-src--jopox  { color: #60a5fa; background: rgba(96,165,250,0.12); border-color: rgba(96,165,250,0.38); }
.fd-event-title {
  font-size: var(--gz-fs-md); font-weight: var(--gz-fw-bold);
  color: var(--gz-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fd-event-when { flex: 0 0 auto; text-align: right; white-space: nowrap; padding-left: 4px; }
.fd-event-time { font-size: var(--gz-fs-sm); font-weight: var(--gz-fw-bold); color: var(--gz-text-secondary); }
.fd-event-score {
  font-size: var(--gz-fs-md); font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--color-primary);
  white-space: nowrap;
}
.fd-event-chev {
  flex: 0 0 auto; width: 18px; height: 18px;
  color: var(--gz-text-tertiary);
  transition: transform 0.18s ease;
}
.fd-event.is-open .fd-event-chev { transform: rotate(180deg); }

/* Expanded details */
.fd-event-details {
  display: flex; flex-direction: column; gap: 7px;
  padding: 10px 14px 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.fd-detail {
  display: flex; align-items: center; gap: 8px;
  font-size: var(--gz-fs-sm); color: var(--gz-text-secondary);
}
.fd-detail-ico { width: 15px; height: 15px; flex: 0 0 auto; color: var(--gz-text-tertiary); }
.fd-sentinel { height: 1px; }
.fd-event-desc {
  white-space: pre-line;
  margin-top: 3px;
  padding-top: 9px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: var(--gz-fs-sm); line-height: 1.5;
  color: var(--gz-text-secondary);
}
.fd-event-link {
  display: inline-flex; align-items: center; gap: 4px; margin-top: 8px;
  font-size: var(--gz-fs-sm); font-weight: 700; color: var(--color-primary);
  text-decoration: none; -webkit-tap-highlight-color: transparent;
}
.fd-event-link svg { width: 16px; height: 16px; }
`;
