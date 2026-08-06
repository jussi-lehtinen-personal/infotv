// pages/gamezone_schedule.js
//
// Mobile-app ice-schedule (/gamezone/schedule). A 3-panel day carousel
// ([prev | current | next]) you swipe between. Each panel is our OWN
// time-grid day view (no FullCalendar) themed like the InfoTV jäävuorot:
// dark surface, Kiekko-Ahma's own shifts in solid Ahma orange, game
// reservations blue, everything else muted grey, white text with a faint
// shadow. Vertical scroll inside each day; horizontal swipe changes the day.
import React, {
  Fragment,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDrag } from "@use-gesture/react";

import { COLOR_PRIMARY } from "../theme";

// Module-scope cache shared across mounts: weekStart → array of items.
const scheduleCache = new Map();

// 3-panel carousel: middle panel (the current day) sits at viewport centre.
const CENTER_TX = -33.333;

// Time grid geometry (fixed + identical for every panel so a preserved
// scrollTop maps to the same time of day when you swipe).
const HOUR_PX = 64;
const DAY_START = 8 * 60; // 08:00
const DAY_END = 23.5 * 60; // 23:30
const PX_MIN = HOUR_PX / 60;
const GRID_PX = (DAY_END - DAY_START) * PX_MIN;

// Shift colours (match InfoTV jäävuorot).
const GAME_COLOR = "#2F7FD6"; // game reservations (Tilapäisvaraus)
const AHMA_COLOR = COLOR_PRIMARY; // Kiekko-Ahma's own shifts (orange)
const OTHER_COLOR = "#474E5A"; // everyone else (muted grey)

const isAhma = (t) => /kiekko.?ahma/i.test(t || "") || /(^|\s)KA[\s/]/i.test(t || "");
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toMin = (s) => { const hm = String(s || "").slice(11, 16); const [h, m] = hm.split(":"); return (Number(h) || 0) * 60 + (Number(m) || 0); };
const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Built ONCE at module load, not per render (the theme string is static).
const CALENDAR_CSS = calendarThemeCss();

function getWeekStart(date) {
  const d = new Date(date);
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  // LOCAL date — toISOString() is UTC and shifts an early-morning local Monday to the
  // previous Sunday, which fetched the WRONG (empty) week and showed no shifts overnight.
  return ymd(d);
}

function fetchScheduleWeek(weekStart) {
  return fetch(`/api/schedule?date=${weekStart}`)
    .then((r) => r.json())
    .then((data) => {
      scheduleCache.set(weekStart, data);
      return data;
    });
}

// Greedy lane packing per overlap-cluster → overlapping reservations sit side
// by side; a lone reservation gets full column width.
function packLanes(list) {
  const evs = [...list].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds = [];
    for (const e of cluster) {
      let lane = laneEnds.findIndex((end) => end <= e.startMin);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.endMin); }
      else laneEnds[lane] = e.endMin;
      e.lane = lane;
    }
    for (const e of cluster) e.lanes = laneEnds.length;
    cluster = []; clusterEnd = -1;
  };
  for (const e of evs) {
    if (cluster.length && e.startMin >= clusterEnd) flush();
    cluster.push(e); clusterEnd = Math.max(clusterEnd, e.endMin);
  }
  flush();
  return evs;
}

const GamezoneSchedule = () => {
  // --- Initial date from URL or now ---
  const initialDate = useMemo(() => {
    if (typeof window === "undefined") return new Date();
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");
    return dateParam && !isNaN(new Date(dateParam)) ? new Date(dateParam) : new Date();
  }, []);

  const [currentDate, setCurrentDate] = useState(initialDate);
  const [items, setItems] = useState(() => scheduleCache.get(getWeekStart(initialDate)) ?? []);

  const trackRef = useRef(null);
  const animatingRef = useRef(false);

  // --- Persist date in URL ---
  useEffect(() => {
    const dateStr = ymd(currentDate);
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set("date", dateStr);
    window.history.replaceState(null, "", `?${urlParams.toString()}`);
  }, [currentDate]);

  // --- Fetch schedule when the week changes (stale-while-revalidate) ---
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);

  useEffect(() => {
    const cached = scheduleCache.get(weekStart);
    if (cached) setItems(cached);

    let cancelled = false;
    fetchScheduleWeek(weekStart)
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((err) => console.log("Error fetching schedule", err));

    return () => { cancelled = true; };
  }, [weekStart]);

  // --- Prefetch ±1 week silently ---
  useEffect(() => {
    const timer = setTimeout(() => {
      [-7, 7].forEach((offset) => {
        const target = new Date(currentDate);
        target.setDate(target.getDate() + offset);
        const adjacentWeek = getWeekStart(target);
        if (scheduleCache.has(adjacentWeek)) return;
        fetchScheduleWeek(adjacentWeek).catch(() => {});
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [currentDate]);

  // --- Day navigation ---
  const stepDays = useCallback((delta) => {
    // Low-priority so the tap doesn't block re-tapping — the arrows have no slide, so the
    // day can update a beat later while the button stays instantly responsive.
    startTransition(() => {
      setCurrentDate((d) => { const next = new Date(d); next.setDate(next.getDate() + delta); return next; });
    });
  }, []);
  const goPrevDay = useCallback(() => stepDays(-1), [stepDays]);
  const goNextDay = useCallback(() => stepDays(1), [stepDays]);

  // --- Carousel: prev/next dates around current ---
  const prevDate = useMemo(() => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); return d; }, [currentDate]);
  const nextDate = useMemo(() => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); return d; }, [currentDate]);

  // --- Initialise the track transform on mount ---
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, []);

  // --- Reset track transform after external date jumps (back/forward, deep links) ---
  useLayoutEffect(() => {
    if (animatingRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, [currentDate]);

  // --- Commit slide animation, then navigate ---
  const commitToDay = useCallback((direction) => {
    if (animatingRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    animatingRef.current = true;

    const targetTx = direction === -1 ? 0 : CENTER_TX * 2;
    track.style.transition = "transform 170ms ease-out";
    track.style.transform = `translate3d(${targetTx}%, 0, 0)`;

    const onEnd = () => {
      track.removeEventListener("transitionend", onEnd);
      animatingRef.current = false; // release BEFORE the state change so a new swipe can start at once
      // No flushSync: the slide already shows the target day centred, and the reset-after-
      // date-change useLayoutEffect snaps the transform back to centre BEFORE paint with the
      // SAME day now current → no flicker, and no blocking synchronous re-render (which added
      // ~0.3 s of "stuck" feel after every swipe).
      setCurrentDate((d) => { const next = new Date(d); next.setDate(next.getDate() + direction); return next; });
    };
    track.addEventListener("transitionend", onEnd);
  }, []);

  const snapBack = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "transform 180ms ease-out";
    track.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, []);

  // --- Swipe gesture ---
  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], cancel, first, xy: [x] }) => {
      if (animatingRef.current) { cancel(); return; }
      // iOS Safari edge-swipe is the native back gesture — skip drags from the edges.
      if (first && (x < 20 || x > window.innerWidth - 20)) { cancel(); return; }

      const track = trackRef.current;
      if (!track) return;

      // On swipe start, sync the off-screen panels' vertical scroll to the
      // current panel's so the day sliding into view shows the same time.
      if (first) {
        const currentScroller = track.children[1]?.querySelector(".gz-cal-scroll");
        if (currentScroller) {
          const top = currentScroller.scrollTop;
          [0, 2].forEach((i) => {
            const s = track.children[i]?.querySelector(".gz-cal-scroll");
            if (s && Math.abs(s.scrollTop - top) > 1) s.scrollTop = top;
          });
        }
      }

      if (active) {
        track.style.transition = "none";
        track.style.transform = `translate3d(calc(${CENTER_TX}% + ${mx}px), 0, 0)`;
      } else {
        const w = track.parentElement?.clientWidth ?? window.innerWidth;
        const threshold = w * 0.25;
        const fastEnough = Math.abs(vx) > 0.5;
        if (mx <= -threshold || (mx < -10 && fastEnough)) commitToDay(1);
        else if (mx >= threshold || (mx > 10 && fastEnough)) commitToDay(-1);
        else snapBack();
      }
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } }
  );

  return (
    <Fragment>
      <style>{CALENDAR_CSS}</style>

      <div className="sc-root">
        <div className="sc-container">
          <div className="sc-carousel-viewport">
            {/* key by DAY (not position): on commit the day we slid to persists — React
                REORDERS its already-rendered DOM node (with its events) to centre instead of
                rebuilding it; only the one genuinely-new day mounts, off-screen. Keeps the
                next swipe's finger-follow instant (no blocking rebuild of the visible panel). */}
            <div ref={trackRef} className="sc-carousel-track" {...bind()}>
              <DayPanel key={ymd(prevDate)} date={prevDate} items={items} onPrev={goPrevDay} onNext={goNextDay} />
              <DayPanel key={ymd(currentDate)} date={currentDate} items={items} isCurrent onPrev={goPrevDay} onNext={goNextDay} />
              <DayPanel key={ymd(nextDate)} date={nextDate} items={items} onPrev={goPrevDay} onNext={goNextDay} />
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
};

export default GamezoneSchedule;

/* ============================= */
/*           DAY PANEL           */
/* ============================= */

const DayPanel = React.memo(function DayPanel({ date, items, isCurrent, onPrev, onNext }) {
  const scrollRef = useRef(null);
  const dayStr = ymd(date);

  // Filter + position this day's reservations.
  const events = useMemo(() => {
    const evs = (items || [])
      .filter((it) => String(it.start_date || "").slice(0, 10) === dayStr)
      .map((it) => {
        const startMin = toMin(it.start_date);
        const endMin = Math.max(toMin(it.end_date), startMin + 20);
        const text = it.text || "Varaus";
        const kind = it.user_group?.name === "Tilapäisvaraus" ? "game" : isAhma(text) ? "ahma" : "other";
        return { id: it.id, startMin, endMin, text, kind };
      });
    return packLanes(evs);
  }, [items, dayStr]);

  // Scroll to roughly "now" once, on the current panel's first mount.
  useEffect(() => {
    if (!isCurrent) return;
    const el = scrollRef.current;
    if (!el) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    el.scrollTop = Math.max(0, (nowMin - 30 - DAY_START) * PX_MIN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isToday = dayStr === ymd(new Date());
  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const showNow = isToday && nowMin >= DAY_START && nowMin <= DAY_END;

  const hours = [];
  for (let h = 8; h <= 23; h++) hours.push(h);
  const y = (min) => (min - DAY_START) * PX_MIN;

  return (
    <div className={`sc-carousel-panel ${isCurrent ? "" : "sc-carousel-panel--inactive"}`}>
      <div className="gz-cal">
        <div className="gz-cal-head">
          <button className="gz-cal-nav" onClick={() => onPrev?.()} aria-label="Edellinen päivä">‹</button>
          <div className="gz-cal-title">
            <span className="gz-cal-day">{date.toLocaleDateString("fi-FI", { weekday: "long" })}</span>
            <span className="gz-cal-date">{`${date.getDate()}.${date.getMonth() + 1}.`}</span>
          </div>
          <button className="gz-cal-nav" onClick={() => onNext?.()} aria-label="Seuraava päivä">›</button>
        </div>

        <div className="gz-cal-scroll" ref={scrollRef}>
          <div className="gz-cal-grid" style={{ height: GRID_PX }}>
            <div className="gz-cal-axis">
              {hours.map((h) => (
                <div key={h} className="gz-cal-hour" style={{ top: y(h * 60) }}>{String(h).padStart(2, "0")}</div>
              ))}
            </div>
            <div className="gz-cal-col">
              {hours.map((h) => <div key={h} className="gz-cal-line" style={{ top: y(h * 60) }} />)}
              {events.map((e) => {
                const color = e.kind === "game" ? GAME_COLOR : e.kind === "ahma" ? AHMA_COLOR : OTHER_COLOR;
                const w = 100 / e.lanes;
                const short = e.endMin - e.startMin < 50;
                return (
                  <div key={e.id} className={"gz-ev" + (short ? " gz-ev--short" : "")} style={{
                    top: y(e.startMin), height: Math.max((e.endMin - e.startMin) * PX_MIN - 3, 18),
                    left: `calc(${e.lane * w}% + 1px)`, width: `calc(${w}% - 4px)`, background: color,
                  }}>
                    <span className="gz-ev-time">{fmt(e.startMin)}<span>–{fmt(e.endMin)}</span></span>
                    <span className="gz-ev-name">{e.text}</span>
                  </div>
                );
              })}
              {showNow && <div className="gz-cal-now" style={{ top: y(nowMin) }}><span className="gz-cal-now-dot" /></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}, (a, b) => ymd(a.date) === ymd(b.date) && a.items === b.items && a.isCurrent === b.isCurrent);

/* ============================= */
/*             CSS               */
/* ============================= */

function calendarThemeCss() {
  return `
    .sc-root{
      height:100vh; height:100dvh; overflow:hidden;
      background: var(--bg-gradient, linear-gradient(180deg,#15171B,#0b0b0d));
      color:#fff; font-family: var(--font-family-base);
    }
    .sc-container{ height:100%; padding:8px 10px 0; overflow:hidden; display:flex; flex-direction:column; }

    /* Carousel viewport clips the 300%-wide track */
    .sc-carousel-viewport{ flex:1 1 auto; min-height:0; width:100%; overflow:hidden; position:relative; display:flex; flex-direction:column; touch-action:pan-y; }
    .sc-carousel-track{ display:flex; flex-direction:row; width:300%; flex:1 1 auto; min-height:0; will-change:transform; touch-action:pan-y; }
    .sc-carousel-panel{ flex:0 0 33.3333%; box-sizing:border-box; padding:0 5px; min-width:0; min-height:0; display:flex; flex-direction:column; }
    .sc-carousel-panel--inactive{ pointer-events:none; }

    /* One day: header + scrollable time grid inside a glass card */
    .gz-cal{ flex:1 1 auto; min-height:0; display:flex; flex-direction:column; border-radius:16px; overflow:hidden;
      background:var(--color-surface, rgba(255,255,255,0.03)); border:1px solid var(--color-surface-border, rgba(255,255,255,0.14)); }

    .gz-cal-head{ flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 8px; border-bottom:1px solid rgba(255,255,255,0.08); }
    .gz-cal-nav{ flex:0 0 auto; width:40px; height:40px; display:flex; align-items:center; justify-content:center; font-size:34px; line-height:1; color:#fff; background:transparent; border:0; padding:0; cursor:pointer; -webkit-tap-highlight-color:transparent; }
    .gz-cal-nav:active{ color:var(--color-primary); }
    .gz-cal-title{ flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; line-height:1.05; }
    .gz-cal-day{ font-family:var(--font-family-display); font-size:24px; letter-spacing:0.03em; text-transform:uppercase; color:#fff; }
    .gz-cal-date{ font-family:var(--font-family-base); font-weight:700; font-size:14px; letter-spacing:0.02em; color:var(--color-accent, rgba(255,255,255,0.65)); margin-top:1px; }

    .gz-cal-scroll{ flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch;
      padding:6px 6px calc(var(--ui-bottom-nav-clearance, 80px)) 6px; box-sizing:border-box; }
    .gz-cal-scroll::-webkit-scrollbar{ width:0; height:0; }

    .gz-cal-grid{ position:relative; display:flex; }
    .gz-cal-axis{ position:relative; width:38px; flex:0 0 auto; }
    .gz-cal-hour{ position:absolute; right:8px; transform:translateY(-50%); font-family:var(--font-family-base); font-weight:700; font-size:13px; color:var(--color-accent, rgba(255,255,255,0.6)); }
    .gz-cal-col{ position:relative; flex:1 1 auto; }
    .gz-cal-line{ position:absolute; left:0; right:0; height:1px; background:rgba(255,255,255,0.07); }

    .gz-ev{ position:absolute; box-sizing:border-box; border-radius:7px; padding:3px 8px; overflow:hidden; display:flex; flex-direction:column;
      text-shadow:0 1px 2px rgba(0,0,0,0.38); }
    .gz-ev--short{ flex-direction:row; align-items:baseline; gap:6px; }
    .gz-ev-time{ font-family:var(--font-family-base); font-weight:800; font-size:13px; line-height:1.1; color:#fff; white-space:nowrap; flex-shrink:0; }
    .gz-ev-time span{ font-weight:600; color:rgba(255,255,255,0.82); }
    .gz-ev-name{ font-family:var(--font-family-base); font-weight:700; font-size:13px; line-height:1.14; color:#fff; overflow:hidden; word-break:break-word; margin-top:1px; }
    .gz-ev--short .gz-ev-name{ min-width:0; white-space:nowrap; text-overflow:ellipsis; word-break:normal; margin-top:0; }

    .gz-cal-now{ position:absolute; left:0; right:0; height:2px; background:#ff5a2a; z-index:6; box-shadow:0 0 8px rgba(255,90,42,0.55); }
    .gz-cal-now-dot{ position:absolute; left:-5px; top:-4px; width:10px; height:10px; border-radius:50%; background:#ff5a2a; }
  `;
}
