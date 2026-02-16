import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Container } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
  const didDrag = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef(null); // "h" | "v" | null

  // Lock earlier, but keep it robust (ratio-based)
  const LOCK_DISTANCE = 8;
  const LOCK_RATIO = 1.2;

  const getThreshold = useCallback(() => {
    const w = ref.current?.clientWidth ?? window.innerWidth ?? 1000;
    // ~22% of container width, clamped
    return Math.min(220, Math.max(80, w * 0.22));
  }, []);

  const onDown = useCallback((e) => {
    // Only primary pointer (avoid multi-touch) and left button for mouse
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    // Make sure we keep receiving move/up even if pointer leaves the element bounds
    e.currentTarget.setPointerCapture?.(e.pointerId);

    dragging.current = true;
    didDrag.current = false;
    locked.current = null;
    startX.current = e.clientX;
    startY.current = e.clientY;
    setOffsetX(0);
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
      didDrag.current = true;
      e.preventDefault(); // prevent scroll while swiping horizontally
      setOffsetX(dx);
    }
  }, []);

  const finish = useCallback(() => {
    dragging.current = false;
    locked.current = null;
    setOffsetX(0);
  }, []);

  const onUp = useCallback(
    (e) => {
      if (!dragging.current) return;

      // Release capture (safe even if not captured)
      e.currentTarget.releasePointerCapture?.(e.pointerId);

      const dx = e.clientX - startX.current;
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
      // Release capture if we had it
      e?.currentTarget?.releasePointerCapture?.(e.pointerId);
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

  // Suppress click on child elements (buttons, links) after a drag
  const onClickCapture = useCallback((e) => {
    if (didDrag.current) {
      e.stopPropagation();
      e.preventDefault();
      didDrag.current = false;
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


const parseTruthy = (v) => {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
};

const ThisWeek = () => {
  const { timestamp } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const includeAway = useMemo(() => {
    const sp = new URLSearchParams(location.search ?? "");
    return parseTruthy(sp.get("includeAway"));
  }, [location.search]);

  // Week navigation helpers
  const getWeekUrl = useCallback((offsetWeeks) => {
    const base = timestamp ? new Date(timestamp) : new Date();
    const target = new Date(base);
    target.setDate(target.getDate() + offsetWeeks * 7);
    const dateStr = moment(target).format("YYYY-MM-DD");
    const qs = includeAway ? "?includeAway=1" : "";
    return `/week/${dateStr}${qs}`;
  }, [timestamp, includeAway]);

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
      navigate(nav.url);
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

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    console.log("include away games: " + includeAway);
    const uri = buildGamesQueryUri(timestamp, { includeAway });

    fetch(uri)
      .then((r) => r.json())
      .then((d) => setMatches(processIncomingDataEvents(d)))
      .catch(() => setMatches(processIncomingDataEvents(getMockGameData())))
      .finally(() => setLoading(false));
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

  const totalGames = useMemo(
    () => groups.reduce((sum, g) => sum + (g.items?.length ?? 0), 0),
    [groups]
  );

  const { w, h } = useViewport();
  const isLandscape = w >= h;

  const twoCol = isLandscape && w >= 1000 && totalGames > 7;

  const { leftGroups, rightGroups } = useMemo(() => {
    if (!twoCol) return { leftGroups: groups, rightGroups: [] };

    const target = Math.ceil(totalGames / 2);

    const left = [];
    const right = [];

    let count = 0;
    for (const g of groups) {
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
  }, [twoCol, groups, totalGames]);

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

      <div style={swipeStyle}>
        <div className="tw-header">
          <div className="tw-week-nav">
            <span className="tw-week-arrow" onClick={goPrevWeek}>‹</span>
            <div className="tw-header-inner">{header.title}</div>
            <span className="tw-week-range">{weekRange}</span>
            <span className="tw-week-arrow" onClick={goNextWeek}>›</span>
          </div>
        </div>

        <Container fluid className="tw-container">
          {loading && (
            <div className="tw-loading">
              <div className="tw-spinner" />
              <div className="tw-loading-text">Ladataan otteluita...</div>
            </div>
          )}

          {!loading && !twoCol && <div className="tw-list">{groups.map(renderDayBlock)}</div>}

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

  return (
    <div className="tw-row" onClick={onClick} role="button" tabIndex={0}>
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
        <div className="tw-goal">{homeGoals}</div>

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
        <div className="tw-goal">{awayGoals}</div>
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
/* Match index.js theme */
.tw-root{
  min-height:100vh;
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

.tw-header-inner{
  font-weight: 900;
  letter-spacing: 3px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  font-size: clamp(14px, 1.8vw, 32px);
  color: #f59e0b;

  text-shadow: 0 6px 18px rgba(0,0,0,0.6);
}

/* Week navigation row */
.tw-week-nav{
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 6px;
}

.tw-week-range{
  font-size: clamp(13px, 1.2vw, 18px);
  font-weight: 600;
  color: rgba(255,255,255,0.65);
  letter-spacing: 0.5px;
}

.tw-week-arrow{
  font-size: clamp(22px, 2vw, 32px);
  font-weight: 900;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  user-select: none;
  padding: 0 8px;
  line-height: 1;
  transition: color 0.15s;
}

.tw-week-arrow:hover{
  color: #f59e0b;
}

/* Container as a lighter "surface" (like ahma-card) */
.tw-container{
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

/* Loading state */
.tw-loading{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding: 60px 0;
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
