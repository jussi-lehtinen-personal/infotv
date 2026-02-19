import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container } from "react-bootstrap";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import moment from "moment";
import "moment/locale/fi";

import {
  getMockGameData,
  getMonday,
  processIncomingDataEvents,
  buildGamesQueryUri,
  getMatchLink
} from "../Util";

moment.locale("fi");

const goToSite = (uri) => {
  window.location.href = uri;
};

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function useViewport() {
  const get = () => ({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  const [v, setV] = React.useState(get);

  React.useEffect(() => {
    const onChange = () => setV(get());
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return v;
}

// ---- Swipe hook (pointer events = touch + mouse) ----
function useSwipe(onSwipeLeft, onSwipeRight) {
  const ref = useRef(null);
  const [offsetX, setOffsetX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef(null); // "h" | "v" | null
  const suppressClick = useRef(false);
  const maxAbsDx = useRef(0);
  const lastDx = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const CLICK_SUPPRESS_PX = 14; // 8–14px hyvä haarukka


  // Lock earlier, but keep it robust (ratio-based)
  const LOCK_DISTANCE = 14;
  const LOCK_RATIO = 1.2;

  const getThreshold = useCallback(() => {
    const w = ref.current?.clientWidth ?? window.innerWidth ?? 1000;
    // ~% of container width, clamped
    return Math.min(160, Math.max(60, w * 0.18));
  }, []);

  const onDown = useCallback((e) => {
    // Only primary pointer (avoid multi-touch) and left button for mouse
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    dragging.current = true;
    locked.current = null;
    startX.current = e.clientX;
    startY.current = e.clientY;

    suppressClick.current = false;
    maxAbsDx.current = 0;

    setOffsetX(0);
    lastDx.current = 0;
    setDragActive(true);
  }, []);

  const onMove = useCallback((e) => {
    if (!dragging.current) return;

    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    // Decide direction lock after small movement
    if (
      locked.current === null &&
      (Math.abs(dx) > LOCK_DISTANCE || Math.abs(dy) > LOCK_DISTANCE)
    ) {
      locked.current = Math.abs(dx) > Math.abs(dy) * LOCK_RATIO ? "h" : "v";
    }

    // Only track horizontal swipes
    if (locked.current === "h") {
        const dx = e.clientX - startX.current;
        lastDx.current = dx;
        // seuraa suurinta dx:ää koko gesturelle
        maxAbsDx.current = Math.max(maxAbsDx.current, Math.abs(dx));

        // vasta kun oikeasti “dragattiin”, blokataan click
        if (maxAbsDx.current >= CLICK_SUPPRESS_PX) {
            suppressClick.current = true;
        }

        e.preventDefault();
        setOffsetX(dx);
    }
  }, []);

  const finish = useCallback(() => {
    dragging.current = false;
    locked.current = null;
    setOffsetX(0);
    setDragActive(false);
    setTimeout(() => (suppressClick.current = false), 0);
  }, []);

  const onUp = useCallback(
    (e) => {
      if (!dragging.current) return;

      const dx = lastDx.current;
      const threshold = getThreshold();

      if (locked.current === "h" && Math.abs(dx) >= threshold) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      }

      finish();
    },
    [onSwipeLeft, onSwipeRight, getThreshold, finish]
  );

  const onCancel = useCallback(
    (e) => {
      finish();
    },
    [finish]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Use non-passive for pointermove so we can preventDefault on horizontal swipe
    el.addEventListener("pointermove", onMove, { passive: false });

    return () => {
      el.removeEventListener("pointermove", onMove);
    };
  }, [onMove]);

  useEffect(() => {
    if (!dragActive) return;

    const end = (e) => {
        if (!dragging.current) return;

        // jos up tapahtui komponentin sisällä, ÄLÄ lopeta täällä
        // (Reactin onPointerUp hoitaa swipen)
        const el = ref.current;
        if (el && e?.target && el.contains(e.target)) return;

        finish(); // vain “ulkopuoliset” upit / focus loss
    };


    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("mouseup", end, true);
    window.addEventListener("blur", end, true);

    return () => {
        window.removeEventListener("pointerup", end, true);
        window.removeEventListener("pointercancel", end, true);
        window.removeEventListener("mouseup", end, true);
        window.removeEventListener("blur", end, true);
    };
    }, [dragActive, finish]);

  // Suppress click on child elements (buttons, links) after a drag
  const onClickCapture = useCallback((e) => {
    if (suppressClick.current) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick.current = false; // ettei seuraavat klikit kuole
    }
  }, []);

  const handlers = {
    onPointerDown: onDown,
    onPointerUp: onUp,
    onPointerCancel: onCancel,
    onClickCapture,
  };

  return { ref, offsetX, handlers };
}


const FAV_STORAGE_KEY = 'ahma_favourite_teams';

function loadFavouriteTeams() {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    // Guard against old storage format (array of strings) or malformed data
    return arr.filter(t => t && typeof t === 'object' && t.teamKey && Array.isArray(t.levelIds));
  } catch {
    return [];
  }
}

function isGameForFavourite(game, favouriteTeams) {
  for (const team of favouriteTeams) {
    const levelMatch = team.levelIds.includes(game.levelId);
    const shortNameLower = team.shortName.toLowerCase();
    const nameMatch =
      (game.home && game.home.toLowerCase().includes(shortNameLower)) ||
      (game.away && game.away.toLowerCase().includes(shortNameLower));
    if (levelMatch && nameMatch) return true;
  }
  return false;
}

const parseTruthy = (v) => {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
};

const ThisWeek = () => {
  const { timestamp } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { includeAway, showOptions } = useMemo(() => {
    const sp = new URLSearchParams(location.search ?? "");
    return {
      includeAway: parseTruthy(sp.get("includeAway")),
      showOptions: parseTruthy(sp.get("options")),
    };
  }, [location.search]);

  // Week navigation helpers
  const getWeekUrl = useCallback((offsetWeeks) => {
    const base = timestamp ? new Date(timestamp) : new Date();
    const target = new Date(base);
    target.setDate(target.getDate() + offsetWeeks * 7);
    const dateStr = moment(target).format("YYYY-MM-DD");
    const params = [];
    if (includeAway) params.push("includeAway=1");
    if (showOptions) params.push("options=1");
    const qs = params.length ? "?" + params.join("&") : "";
    return `/week/${dateStr}${qs}`;
  }, [timestamp, includeAway, showOptions]);

  // Slide animation state: idle → exit-left/exit-right → enter-right/enter-left → idle
  const [slideState, setSlideState] = useState("idle");
  const pendingNav = useRef(null);

  const triggerSlide = useCallback((weekOffset, direction) => {
    if (slideState !== "idle") return;
    pendingNav.current = {
      url: getWeekUrl(weekOffset),
      enterFrom: direction === "left" ? "right" : "left",
    };
    setSlideState("exit-" + direction);
  }, [slideState, getWeekUrl]);

  const goNextWeek = useCallback(() => triggerSlide(1, "left"), [triggerSlide]);
  const goPrevWeek = useCallback(() => triggerSlide(-1, "right"), [triggerSlide]);

  const { ref: swipeRef, offsetX, handlers: swipeHandlers } = useSwipe(goNextWeek, goPrevWeek);

  // Animation sequence: exit → navigate → enter → idle
  useEffect(() => {
    if (!slideState.startsWith("exit-")) return;
    const timer = setTimeout(() => {
      const nav = pendingNav.current;
      if (!nav) return;
      navigate(nav.url, { replace: true });
      pendingNav.current = null;
      // Position off-screen on entry side (no transition)
      setSlideState("enter-" + nav.enterFrom);
      // Next two frames: ensure off-screen is painted, then animate to center
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlideState("idle");
        });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [slideState, navigate]);

  const [onlyFavourites, setOnlyFavourites] = useState(() => {
    try { return localStorage.getItem('ahma_only_favourites') === '1'; } catch { return false; }
  });
  const [favouriteTeams, setFavouriteTeams] = useState(loadFavouriteTeams);

  // Persist favourite-filter toggle across sessions
  useEffect(() => {
    try { localStorage.setItem('ahma_only_favourites', onlyFavourites ? '1' : '0'); } catch {}
  }, [onlyFavourites]);

  // Reload favourites when the page is focused (user may have changed them on /teams)
  useEffect(() => {
    const onFocus = () => setFavouriteTeams(loadFavouriteTeams());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetchSeq = useRef(0);
  const abortRef = useRef(null);

    useEffect(() => {
    const mySeq = ++fetchSeq.current;

    // abort previous in-flight request
    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);

    const uri = buildGamesQueryUri(timestamp, { includeAway });

    fetch(uri, { signal: ac.signal })
        .then((r) => r.json())
        .then((d) => {
        // ignore stale responses
        if (mySeq !== fetchSeq.current) return;
        setMatches(processIncomingDataEvents(d));
        })
        .catch((err) => {
        // abort is not an error we want to show / fallback for
        if (err?.name === "AbortError") return;
        if (mySeq !== fetchSeq.current) return;
        setMatches(processIncomingDataEvents(getMockGameData()));
        })
        .finally(() => {
        if (mySeq !== fetchSeq.current) return;
        setLoading(false);
        });

    // cleanup: abort if this effect is replaced/unmounted
    return () => {
        ac.abort();
    };
    }, [timestamp, includeAway]);


  const header = useMemo(() => {
    const now = timestamp ? new Date(timestamp) : new Date();

    const selectedWeekStart = getMonday(now);
    const currentWeekStart = getMonday(new Date());

    const selected = moment(selectedWeekStart);
    const current = moment(currentWeekStart);

    const suffix = includeAway ? "OTTELUT" : "KOTIOTTELUT";

    let title;
    if (selected.isSame(current, "day")) {
      title = `TÄMÄN VIIKON ${suffix}`;
    } else if (selected.isAfter(current)) {
      title = `TULEVAT ${suffix}`;
    } else {
      title = `PELATUT ${suffix}`;
    }

    return { title };
  }, [timestamp, includeAway]);

  const { w, h } = useViewport();
  const isLandscape = w >= h;

  const groups = useMemo(() => {
    const map = new Map();
    for (const m of matches) {
      const key = moment(m.date).format("YYYY-MM-DD");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }

    const days = Array.from(map.keys()).sort((a, b) => (a < b ? -1 : 1));
    for (const day of days) {
      map.get(day).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    return days.map((day) => ({ day, items: map.get(day) }));
  }, [matches]);

  const visibleGroups = useMemo(() => {
    if (!showOptions || !onlyFavourites || favouriteTeams.length === 0) return groups;
    return groups
      .map(g => ({ ...g, items: g.items.filter(m => isGameForFavourite(m, favouriteTeams)) }))
      .filter(g => g.items.length > 0);
  }, [groups, showOptions, onlyFavourites, favouriteTeams]);

  const totalGames = useMemo(
    () => visibleGroups.reduce((sum, g) => sum + (g.items?.length ?? 0), 0),
    [visibleGroups]
  );

  const twoCol = isLandscape && w >= 1000 && totalGames > 7;

  const { leftGroups, rightGroups } = useMemo(() => {
    if (!twoCol) return { leftGroups: visibleGroups, rightGroups: [] };

    const target = Math.ceil(totalGames / 2);

    const left = [];
    const right = [];

    let count = 0;
    for (const g of visibleGroups) {
      const nextCount = count + (g.items?.length ?? 0);

      if (left.length === 0 || nextCount <= target) {
        left.push(g);
        count = nextCount;
      } else {
        right.push(g);
      }
    }

    if (right.length === 0 && left.length > 1) {
      const mid = Math.ceil(left.length / 2);
      return { leftGroups: left.slice(0, mid), rightGroups: left.slice(mid) };
    }

    return { leftGroups: left, rightGroups: right };
  }, [twoCol, visibleGroups, totalGames]);

  const renderDayBlock = (g) => (
    <div key={g.day} className="tw-dayblock">
      <div className="tw-dayheader">
        <span className="tw-dayheader-date">
          <strong>{capitalize(moment(g.day).format("dddd"))}</strong>{" "}
          <span>{moment(g.day).format("D.M")}</span>
        </span>
      </div>

      {g.items.map((m, idx) => (
        <MatchRow
          key={`${g.day}-${idx}`}
          match={m}
          onClick={() => goToSite(getMatchLink(idx, m))}
        />
      ))}
    </div>
  );

  // Week range for display
  const weekRange = useMemo(() => {
    const base = timestamp ? new Date(timestamp) : new Date();
    const mon = getMonday(new Date(base));
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return moment(mon).format("D.M") + " – " + moment(sun).format("D.M");
  }, [timestamp]);

  // Slide / swipe transform
  const swipeStyle = (() => {
    switch (slideState) {
      case "exit-left":
        return { transform: "translateX(-110%)", transition: "transform 0.3s ease-in" };
      case "exit-right":
        return { transform: "translateX(110%)", transition: "transform 0.3s ease-in" };
      case "enter-left":
        return { transform: "translateX(-110%)", transition: "none" };
      case "enter-right":
        return { transform: "translateX(110%)", transition: "none" };
      default:
        if (offsetX !== 0) {
          return { transform: `translateX(${offsetX * 0.8}px)`, transition: "none" };
        }
        return { transform: "translateX(0)", transition: "transform 0.3s ease-out" };
    }
  })();

  return (
    <div className="tw-root" ref={swipeRef} {...swipeHandlers} style={{ touchAction: "pan-y" }}>
      <style>{css}</style>

      <div className="tw-swipePane" style={swipeStyle}>
        <div className="tw-header">
            <div className="tw-week-nav">
                <button
                    type="button"
                    className="tw-week-btn"
                    onClick={goPrevWeek}
                    aria-label="Edellinen viikko"
                    >
                    <span className="material-symbols-rounded">chevron_left</span>
                </button>

                <div className="tw-title">
                    <div className="tw-title-main">{header.title}</div>
                    <div className="tw-title-sub">{weekRange}</div>
                </div>

                <button
                    type="button"
                    className="tw-week-btn"
                    onClick={goNextWeek}
                    aria-label="Seuraava viikko"
                    >
                    <span className="material-symbols-rounded">chevron_right</span>
                </button>
            </div>

            {showOptions && (
              <div className="tw-filter-row">
                <button
                  type="button"
                  className={`tw-fav-toggle${onlyFavourites ? ' tw-fav-toggle--active' : ''}`}
                  onClick={() => setOnlyFavourites(v => !v)}
                  aria-pressed={onlyFavourites}
                >
                  <span className="material-symbols-rounded">star</span>
                  Suosikit
                </button>
              </div>
            )}
        </div>

        <Container fluid className="tw-container">
          {loading && (
            <div className="tw-loading">
              <div className="tw-spinner" />
              <div className="tw-loading-text">Ladataan otteluita...</div>
            </div>
          )}

          {!loading && onlyFavourites && visibleGroups.length === 0 && (
            <div className="tw-empty">
              {favouriteTeams.length === 0
                ? <><span>Ei suosikkijoukkueita. </span><Link to="/teams" className="tw-empty-link">Lisää niitä Joukkueet-sivulta.</Link></>
                : <span>Ei suosikkijoukkueiden pelejä tällä viikolla.</span>
              }
            </div>
          )}

          {!loading && !twoCol && <div className="tw-list">{visibleGroups.map(renderDayBlock)}</div>}

          {!loading && twoCol && (
            <div className="tw-list tw-twoCol">
              <div className="tw-col">{leftGroups.map(renderDayBlock)}</div>
              <div className="tw-col">{rightGroups.map(renderDayBlock)}</div>
            </div>
          )}

        </Container>
      </div>
    </div>
  );
};

export default ThisWeek;

/* ============================= */
/*           ROW UI              */
/* ============================= */

function MatchRow({ match, onClick }) {
  const timeStr = moment(match.date).format("HH:mm");

  const status = simplifyLevel(match.level ?? "");
  const statusClass = "tw-status";

  const homeGoals = match.finished ? (match.home_goals ?? "") : "";
  const awayGoals = match.finished ? (match.away_goals ?? "") : "";

  // Ahma kotona -> korosta home, vieraissa -> korosta away
  const highlightHome = match.isHomeGame === true;
  const highlightAway = match.isHomeGame === false;

  // Voitto/tappio-indikaattori + maalien fonttipaino
  const hg = parseInt(match.home_goals, 10);
  const ag = parseInt(match.away_goals, 10);
  const hasResult = match.finished && !isNaN(hg) && !isNaN(ag);
  const homeWon = hasResult && hg > ag;
  const awayWon = hasResult && ag > hg;

  const resultBorderColor = (() => {
    if (!hasResult) return null;
    const ahmaGoals = match.isHomeGame ? hg : ag;
    const oppGoals  = match.isHomeGame ? ag : hg;
    if (ahmaGoals > oppGoals) return "#22c55e";
    if (ahmaGoals < oppGoals) return "#ef4444";
    if (ahmaGoals === oppGoals) return "#e8e8e8"; // tasapeli
    return null;
  })();

  const loserGoalStyle = { fontWeight: 400, opacity: 0.85 };

  return (
    <div
      className="tw-row"
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={resultBorderColor ? { borderLeft: `4px solid ${resultBorderColor}` } : undefined}
    >
      <div className="tw-time">{timeStr}</div>

      <div className="tw-mid">
        {/* HOME */}
        <div className="tw-teamline">
          <img className="tw-logo" src={match.home_logo} alt="" />
          <span
            className="tw-teamname"
            style={highlightHome ? { color: "#f59e0b" } : undefined}
          >
            {match.home}
          </span>
        </div>
        <div className="tw-goal" style={awayWon ? loserGoalStyle : undefined}>{homeGoals}</div>

        {/* AWAY */}
        <div className="tw-teamline">
          <img className="tw-logo" src={match.away_logo} alt="" />
          <span
            className="tw-teamname"
            style={highlightAway ? { color: "#f59e0b" } : undefined}
          >
            {match.away}
          </span>
        </div>
        <div className="tw-goal" style={homeWon ? loserGoalStyle : undefined}>{awayGoals}</div>
      </div>

      <div className={statusClass}>{status}</div>
    </div>
  );
}

function simplifyLevel(level) {
  if (!level) return "";
  const s = String(level).trim();
  const m = s.match(/^u\s*(\d{1,2})\b/i);
  if (m) return `U${m[1]}`;
  return s;
}

/* ============================= */
/*             CSS               */
/* ============================= */

const css = `

html, body, #root{
  margin: 0;
  min-height: 100%;
  background: #111111;
}
  
/* Match index.js theme */
.tw-root{
  min-height: 100vh;
  min-height: 100dvh;
  
  display: flex;
  flex-direction: column;

  touch-action: pan-y;
  overflow-x: hidden;
 
  padding: 10px 7px 10px 7px;

  background:
    radial-gradient(circle at 50% 0%, rgba(243, 223, 191, 0.22), transparent 55%),
    linear-gradient(180deg, #0f1112 0%, #101213 55%, #090b0b 100%);

  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

/* Full width header (non-sticky, no overlap) */
.tw-header{
  width: 100%;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 18px;

  box-shadow: 0 14px 34px rgba(0,0,0,0.35);

  margin: 0 auto 10px auto;
  max-width: none !important;

  /* match container padding feel */
  padding: 10px 12px;
}

/* Week navigation row */
.tw-week-nav{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  flex-wrap: nowrap;        /* tärkein */
  width: 100%;
}


.material-symbols-rounded {
  font-size: 34px;
  line-height: 1;
}

.tw-week-btn{
  flex: 0 0 44px;
  height: 44px;
  width: 44px;

  display: flex;
  align-items: center;
  justify-content: center;

  background: none;
  border: none;
  box-shadow: none;

  color: rgba(255,255,255,0.75);
  cursor: pointer;
  padding: 0;

  transition: color 0.2s ease, transform 0.15s ease;
}

.tw-week-btn:hover {
  transform: scale(1.2);
  opacity: 0.85;
}

.tw-title{
  flex: 1 1 auto;
  min-width: 0;             /* kriittinen flex-trikki */
  text-align: center;

  display: flex;
  flex-direction: column;
  align-items: center;
}


.tw-title-main{
  font-weight: 900;
  letter-spacing: 2.5px;
  text-transform: uppercase;

  font-size: clamp(14px, 1.8vw, 30px);
  color: #f59e0b;
  text-shadow: 0 6px 18px rgba(0,0,0,0.6);

  white-space: nowrap;
  overflow: hidden;
}

.tw-title-sub{
  font-size: clamp(12px, 1.2vw, 16px);
  font-weight: 700;
  color: rgba(255,255,255,0.65);
  letter-spacing: 0.4px;
}

.tw-swipePane{
  flex: 1 1 auto;          /* 👈 tärkein: venyy täyttämään loppuruudun */
  min-height: 0;           /* 👈 tärkeä flex-scroll/overflow-yhdistelmissä */
  display: flex;
  flex-direction: column;
}

/* Container as a lighter "surface" (like ahma-card) */
.tw-container{
flex: 1 1 auto;          /* 👈 surface venyy */
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-width: 980px !important;
  padding: 12px;

  border-radius: 18px;

  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 14px 34px rgba(0,0,0,0.35);
}

/* List blocks */
.tw-list{
  display:flex;
  flex-direction:column;
  gap: 12px;
}

/* Two columns */
.tw-twoCol{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  align-items:start;
}

.tw-col{
  display:flex;
  flex-direction:column;
  gap: 10px;
}

/* Day header */
.tw-dayheader{
  display:flex;
  align-items:center;
  gap:8px;
  padding: 6px 6px 2px 6px;
  font-size: clamp(16px, 1.4vw, 22px);
  color: rgba(255,255,255,0.85);
  font-weight: 600;
}

.tw-dayblock{
  display: flex;
  flex-direction: column;
  gap: 8px;   /* 👈 tämä tekee välin ottelukorttien väliin */
}

.tw-dayheader-date{
  opacity:0.95;
}

/* Mid grid: team names + goals */
.tw-mid{
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr 38px;
  grid-template-rows: auto auto;
  column-gap: 10px;
  row-gap: 6px;
  align-items: center;
}

/* Row card (match index.js ahma-item look) */
.tw-row{
  display:grid;
  grid-template-columns:
    clamp(50px, 6vw, 80px)
    0.75fr
    0.25fr
    auto;
  gap: 8px;
  align-items:center;

  padding: 4px 14px;

  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.10);

  background: rgba(255,255,255,0.05);
  box-shadow: 0 6px 14px rgba(0,0,0,0.40);

  cursor:pointer;
  user-select:none;
}

.tw-row:hover{
  background: rgba(255,255,255,0.20);
  transform: translateY(-1px);
}

.tw-time{
  font-weight: 900;
  font-size: clamp(16px, 1.5vw, 22px);
  color: rgba(255,255,255,0.90);
  text-align:left;
}

/* Team line */
.tw-teamline{
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.tw-logo{
  height: clamp(24px, 3vw, 36px);
  width:  clamp(24px, 3vw, 36px);
  object-fit: contain;

  background: white;
  border-radius: 8px;
  padding: 4px;

  box-shadow: 0 4px 10px rgba(0,0,0,0.35);
}

.tw-teamname{
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  font-weight: 750;
  font-size: clamp(16px, 1.5vw, 22px);
  color: rgba(255,255,255,0.92);

  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.tw-goal{
  text-align: right;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-size: clamp(16px, 1.5vw, 22px);
  color: rgba(255,255,255,0.92);
  line-height: 1.2;
}

/* Status / level */
.tw-status{
  justify-self:end;
  font-weight: 800;
  font-size: clamp(12px, 1.2vw, 16px);
  color: rgba(255,255,255,0.55);
  text-align:center;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  line-height: 1.1;
}

.tw-filter-row{
  display: flex;
  justify-content: center;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid rgba(255,255,255,0.07);
}


.tw-fav-toggle{
  display: inline-flex;
  align-items: center;
  gap: 6px;

  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 20px;
  padding: 5px 14px 5px 10px;

  color: rgba(255,255,255,0.55);
  font-size: clamp(12px, 1.2vw, 14px);
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.tw-fav-toggle .material-symbols-rounded{
  font-size: 18px;
  line-height: 1;
  font-variation-settings: 'FILL' 0;
  transition: font-variation-settings 0.15s, color 0.15s;
}

.tw-fav-toggle--active{
  background: rgba(245,158,11,0.15);
  border-color: rgba(245,158,11,0.5);
  color: #f59e0b;
}

.tw-fav-toggle--active .material-symbols-rounded{
  font-variation-settings: 'FILL' 1;
}

/* Empty state */
.tw-empty{
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: rgba(255,255,255,0.45);
  font-size: clamp(13px, 1.3vw, 16px);
  text-align: center;
}

.tw-empty-link{
  color: #f59e0b;
  text-decoration: underline;
}
.tw-empty-link:hover{ opacity: 0.8; }

/* Loading state */
.tw-loading{
  flex: 1 1 auto;
  padding: 0;              /* optional: pois iso padding */
  min-height: 0;

  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap: 16px;
}

.tw-spinner{
  width: 36px;
  height: 36px;
  border: 4px solid rgba(255,255,255,0.18);
  border-top-color: #f59e0b;
  border-radius: 50%;
  animation: tw-spin 0.8s linear infinite;
}

@keyframes tw-spin{
  to{ transform: rotate(360deg); }
}

.tw-loading-text{
  color: rgba(255,255,255,0.78);
  font-size: clamp(14px, 1.4vw, 20px);
  font-weight: 700;
}

/* Small screens */
@media (max-width: 380px){
  .tw-row{
    grid-template-columns: 40px 1fr auto;
    gap: 8px;
  }

  .tw-status{
    font-size: 10px;
  }

  .tw-logo{
    height: 16px;
    width: 16px;
  }

  .tw-teamname{
    font-size: 12px;
    letter-spacing: 0.2px;
  }

  .tw-goal{
    width: 28px;
    font-size: 12px;
  }
}

/* Tablet / larger */
@media (min-width: 768px){
  .tw-root{
    padding: 8px 26px 28px 26px;
  }
  .tw-header{
    padding: 10px 16px;
  }
  .tw-container{
    max-width: none !important;
    width: 100%;
    margin: 0;
    padding: 4px 26px 16px 26px;
  }

   .tw-twoCol{
    width: 100%;
  }
}
`;
