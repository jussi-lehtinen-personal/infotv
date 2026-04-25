// pages/gamezone_schedule.js
//
// Mobile-app variant of the schedule page. Wired to /gamezone/schedule.
// Always renders a 3-panel day carousel ([prev | current | next] FullCalendar
// instances) — Gamezone is mobile-only, so the InfoTV's wide week view isn't
// needed. The original schedule.js stays intact at /schedule for the kiosk.
import React, {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useDrag } from "@use-gesture/react";
import FullCalendar from "@fullcalendar/react";
import Container from "react-bootstrap/Container";

import timeGridPlugin from "@fullcalendar/timegrid";
import bootstrapPlugin from "@fullcalendar/bootstrap";
import allLocales from "@fullcalendar/core/locales-all";

import "bootstrap/dist/css/bootstrap.css";
import "@fortawesome/fontawesome-free/css/all.css";
import "./fullcalendar.css";

import { COLOR_PRIMARY } from "../theme";

// Module-scope cache shared across mounts: weekStart → array of items.
const scheduleCache = new Map();

// 3-panel carousel: middle panel (the current day) sits at viewport centre.
const CENTER_TX = -33.333;

function getWeekStart(date) {
  const d = new Date(date);
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function fetchScheduleWeek(weekStart) {
  return fetch(`/api/schedule?date=${weekStart}`)
    .then((r) => r.json())
    .then((data) => {
      scheduleCache.set(weekStart, data);
      return data;
    });
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
    const dateStr = currentDate.toISOString().split("T")[0];
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
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch((err) => console.log("Error fetching schedule", err));

    return () => {
      cancelled = true;
    };
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
    setCurrentDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }, []);

  const goPrevDay = useCallback(() => stepDays(-1), [stepDays]);
  const goNextDay = useCallback(() => stepDays(1), [stepDays]);

  // --- Carousel: prev/next dates around current ---
  const prevDate = useMemo(() => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    return d;
  }, [currentDate]);
  const nextDate = useMemo(() => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    return d;
  }, [currentDate]);

  // --- Initialise the track transform on mount ---
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, []);

  // --- Reset track transform after navigation (handled inside the commit
  //     animation already — here we cover external date jumps such as
  //     browser back/forward or deep links). ---
  useLayoutEffect(() => {
    if (animatingRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, [currentDate]);

  // --- Commit slide animation, then navigate ---
  // direction +1 = next day, -1 = prev day
  const commitToDay = useCallback(
    (direction) => {
      if (animatingRef.current) return;
      const track = trackRef.current;
      if (!track) return;
      animatingRef.current = true;

      // Slide track so the destination panel ends up centred:
      //   prev (-1) → tx 0%      (panel 0 visible)
      //   next (+1) → tx -66.666% (panel 2 visible)
      const targetTx = direction === -1 ? 0 : CENTER_TX * 2;
      track.style.transition = "transform 220ms ease-out";
      track.style.transform = `translate3d(${targetTx}%, 0, 0)`;

      const onEnd = () => {
        track.removeEventListener("transitionend", onEnd);
        animatingRef.current = false;
        // flushSync forces the navigate + the layout-effect transform reset
        // to land in the same paint, so the user never sees the jump back
        // to centre — only the destination panel's content rendered there.
        flushSync(() => {
          setCurrentDate((d) => {
            const next = new Date(d);
            next.setDate(next.getDate() + direction);
            return next;
          });
        });
      };
      track.addEventListener("transitionend", onEnd);
    },
    []
  );

  const snapBack = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "transform 180ms ease-out";
    track.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, []);

  // --- Swipe gesture (replaces ~150 lines of custom touch+pointer code) ---
  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], cancel, first, xy: [x] }) => {
      if (animatingRef.current) {
        cancel();
        return;
      }
      // iOS Safari edge-swipe is the native back gesture. Skip drags that
      // start within 20px of either edge so the browser handles them.
      if (first && (x < 20 || x > window.innerWidth - 20)) {
        cancel();
        return;
      }

      const track = trackRef.current;
      if (!track) return;

      // On swipe start, sync the off-screen panels' vertical scroll to the
      // current panel's so the day sliding into view shows the same time of
      // day the user was looking at — not whatever offset that panel
      // happened to have (default top, i.e. 08:00).
      if (first) {
        const currentScroller = track.children[1]?.querySelector(
          ".fc-scroller-liquid-absolute"
        );
        if (currentScroller) {
          const top = currentScroller.scrollTop;
          [0, 2].forEach((i) => {
            const s = track.children[i]?.querySelector(
              ".fc-scroller-liquid-absolute"
            );
            if (s && Math.abs(s.scrollTop - top) > 1) {
              s.scrollTop = top;
            }
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

        if (mx <= -threshold || (mx < -10 && fastEnough)) {
          commitToDay(1); // next day
        } else if (mx >= threshold || (mx > 10 && fastEnough)) {
          commitToDay(-1); // prev day
        } else {
          snapBack();
        }
      }
    },
    {
      axis: "x",
      filterTaps: true,
      pointer: { touch: true },
    }
  );

  // --- Build FullCalendar events from raw items (one set, used by all
  //     panels — each panel filters by date inside DayPanel) ---
  const events = useMemo(() => buildEvents(items), [items]);

  return (
    <Fragment>
      <style>
        {calendarThemeCss({
          accent: COLOR_PRIMARY,
          card: "#fff7ed",
          text: "#111827",
          muted: "#64748b",
        })}
      </style>

      <div className="sc-root sc-dayMode">
        <Container fluid className="sc-container">
          <div className="sc-carousel-viewport">
            <div ref={trackRef} className="sc-carousel-track" {...bind()}>
              <DayPanel
                date={prevDate}
                events={events}
                onPrev={goPrevDay}
                onNext={goNextDay}
              />
              <DayPanel
                date={currentDate}
                events={events}
                isCurrent
                onPrev={goPrevDay}
                onNext={goNextDay}
              />
              <DayPanel
                date={nextDate}
                events={events}
                onPrev={goPrevDay}
                onNext={goNextDay}
              />
            </div>
          </div>
        </Container>
      </div>
    </Fragment>
  );
};

export default GamezoneSchedule;

/* ============================= */
/*           DAY PANEL           */
/* ============================= */

function DayPanel({ date, events, isCurrent, onPrev, onNext }) {
  const ref = useRef(null);
  const panelRef = useRef(null);
  // Per-panel scroll cache. Saved before gotoDate (which resets the
  // FullCalendar scroller back to the slotMinTime) and reapplied after the
  // re-render, so swiping to a new day keeps you at the time of day you
  // were looking at — particularly relevant for ice schedules that cluster
  // in the evening. `undefined` means "not yet captured"; once captured,
  // a literal 0 is a valid value (= scrolled to slotMinTime, i.e. 08:00).
  const savedScrollRef = useRef(undefined);

  // Filter events to this panel's day (FullCalendar can do this itself
  // when the view is timeGridDay, but explicitly filtering keeps off-screen
  // panels lighter and avoids any flash of cross-day events during swipe).
  const dayEvents = useMemo(() => {
    return events.filter((ev) => {
      const start = ev.start instanceof Date ? ev.start : new Date(ev.start);
      return sameDay(start, date);
    });
  }, [events, date]);

  // Keep the calendar locked to its panel's date, and preserve scroll
  // position across the date change.
  useEffect(() => {
    const api = ref.current?.getApi?.();
    if (!api) return;

    const scroller = panelRef.current?.querySelector(".fc-scroller-liquid-absolute");
    if (scroller) {
      savedScrollRef.current = scroller.scrollTop;
    }

    api.gotoDate(date);

    requestAnimationFrame(() => {
      const s = panelRef.current?.querySelector(".fc-scroller-liquid-absolute");
      if (s && savedScrollRef.current !== undefined) {
        s.scrollTop = savedScrollRef.current;
      }
    });
  }, [date]);

  // Scroll to roughly "now" once when the current panel first mounts so the
  // user lands at a useful slot. We deliberately don't re-scroll on
  // subsequent date changes (the date-effect above preserves scroll instead).
  useEffect(() => {
    if (!isCurrent) return;
    const t = setTimeout(() => {
      const api = ref.current?.getApi?.();
      if (!api) return;
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const target = Math.max(0, minutes - 30);
      const hh = String(Math.floor(target / 60)).padStart(2, "0");
      const mm = String(target % 60).padStart(2, "0");
      api.scrollToTime(`${hh}:${mm}:00`);
      // Seed savedScrollRef so the first swipe preserves "now" rather than
      // snapping to slotMinTime.
      const s = panelRef.current?.querySelector(".fc-scroller-liquid-absolute");
      if (s) savedScrollRef.current = s.scrollTop;
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customButtons = useMemo(
    () => ({
      prevDay: { text: "", click: () => onPrev?.() },
      nextDay: { text: "", click: () => onNext?.() },
    }),
    [onPrev, onNext]
  );

  return (
    <div
      ref={panelRef}
      className={`sc-carousel-panel ${isCurrent ? "" : "sc-carousel-panel--inactive"}`}
    >
      <div className="sc-calendarWrap">
        <FullCalendar
          ref={ref}
          plugins={[bootstrapPlugin, timeGridPlugin]}
          initialView="timeGridDay"
          locales={allLocales}
          locale="fi"
          weekends={true}
          allDaySlot={false}
          eventMinHeight={24}
          slotDuration="00:30:00"
          slotMinTime="08:00:00"
          slotMaxTime="23:30:00"
          dayHeaderContent={dayHeaderContent}
          dayHeaderFormat={dayHeaderFormat}
          slotLabelContent={slotLabelContent}
          slotLabelFormat={slotLabelFormat}
          initialDate={date}
          firstDay={1}
          nowIndicator={true}
          now={null}
          events={dayEvents}
          themeSystem="bootstrap"
          height="100%"
          headerToolbar={{ left: "prevDay", center: "title", right: "nextDay" }}
          customButtons={customButtons}
          expandRows={true}
          titleFormat={() => ""}
        />
      </div>
    </div>
  );
}

/* ============================= */
/*           HELPERS             */
/* ============================= */

const dayHeaderFormat = { weekday: "short", day: "numeric", month: "numeric" };
const slotLabelFormat = { hour: "2-digit", minute: "2-digit", omitZeroMinute: false, hour12: false };

function dayHeaderContent(arg) {
  const text = arg.text;
  return <span>{text.charAt(0).toUpperCase() + text.slice(1)}</span>;
}

function slotLabelContent(arg) {
  return <span>{arg.text}</span>;
}

function buildEvents(items) {
  const BRAND = { accent: COLOR_PRIMARY, card: "#fff7ed", text: "#111827" };
  const out = [];
  for (const item of items) {
    const text = item.text ?? "";
    const isGameEvent = item.user_group?.name === "Tilapäisvaraus";
    const isAhmaEvent =
      (text.includes("Kiekko") && text.includes("Ahma")) || text.includes("KA U");
    const isBLDEvent = text.includes("BLD");
    const isBrand = isAhmaEvent || isBLDEvent;

    const event = {
      id: item.id,
      title: text,
      start: item.start_date,
      end: item.end_date,
      classNames: [isGameEvent ? "ev-game" : isBrand ? "ev-brand" : "ev-normal"],
      backgroundColor: BRAND.card,
      borderColor: "rgba(17,24,39,0.14)",
      textColor: BRAND.text,
    };

    if (isBrand) {
      event.backgroundColor = BRAND.accent;
      event.borderColor = BRAND.accent;
      event.textColor = BRAND.text;
    }
    if (isAhmaEvent || isBLDEvent) {
      event.backgroundColor = BRAND.accent;
      event.borderColor = BRAND.accent;
      event.textColor = "#111827";
    }

    out.push(event);
  }
  return out;
}

/* ============================= */
/*             CSS               */
/* ============================= */

function calendarThemeCss(BRAND) {
  return `
    .sc-root{
      height:100vh;
      height:100dvh;
      overflow:hidden;

      background:
        radial-gradient(circle at 50% 0%, rgba(243, 223, 191, 0.22), transparent 55%),
        linear-gradient(180deg, #0f1112 0%, #101213 55%, #090b0b 100%);

      color:${BRAND.text};
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    .sc-container{
      max-width:none !important;
      height:100%;
      padding: 8px 12px;
      overflow:hidden;
      display:flex;
      flex-direction:column;
    }

    /* Carousel viewport — clips the 300%-wide track */
    .sc-carousel-viewport{
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
      touch-action: pan-y;
    }

    /* Carousel track — 3 panels side-by-side, transform driven from JS */
    .sc-carousel-track{
      display: flex;
      flex-direction: row;
      width: 300%;
      flex: 1 1 auto;
      min-height: 0;
      will-change: transform;
      touch-action: pan-y;
    }

    /* One day panel — fills viewport width */
    .sc-carousel-panel{
      flex: 0 0 33.3333%;
      box-sizing: border-box;
      padding: 0 6px;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .sc-carousel-panel--inactive{
      pointer-events: none;
    }

    .sc-calendarWrap{
      flex: 1 1 auto;
      min-height: 0;
      overflow:hidden;
      border-radius: 16px;
      padding: 3px;
      background: transparent;
    }

    /* Portrait/day-mode: make hour slots taller => "2 screens" content, scroll inside calendar */
    .sc-dayMode .fc .fc-timegrid-slot{ height: 32px; }

/* Hide ALL FullCalendar scrollbars but keep scrolling */
.fc .fc-scroller::-webkit-scrollbar,
.fc .fc-scroller-liquid::-webkit-scrollbar,
.fc .fc-scroller-liquid-absolute::-webkit-scrollbar,
.fc .fc-scroller-harness::-webkit-scrollbar,
.fc .fc-scroller-harness-liquid::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
}

.sc-dayMode .fc .fc-timegrid-body table {
  width: 100% !important;
}
.sc-dayMode .fc .fc-timegrid-body {
  width: 100% !important;
}
.sc-dayMode .fc .fc-scroller.fc-scroller-liquid-absolute {
  overflow-x: hidden !important;
}

/* Mirror the matches list: extend the calendar all the way to the viewport
   bottom and reserve clearance INSIDE the time grid scroller so events at
   the end of the day still scroll above the BottomNav. */
.sc-dayMode .fc-scroller-liquid-absolute {
  padding-bottom: var(--ui-bottom-nav-clearance, 80px);
  box-sizing: border-box;
}

    .fc{
      height:100% !important;
      background:#ffffff;
      border-radius: 14px;
      padding: 8px 8px 6px 8px;
      border: 1px solid rgba(15,23,42,0.10);
      box-shadow: 0 10px 26px rgba(0,0,0,0.10);
      overflow:hidden;
    }

    .fc .fc-header-toolbar{ margin: 0 0 6px 0 !important; }

    .fc .fc-toolbar-title{
      font-size: 18px;
      font-weight: 650;
      letter-spacing: 0.10px;
      color:${BRAND.text};
    }
    .fc .fc-toolbar-title::before{
      content: "JÄÄVUOROT";
      font-weight: 750;
      letter-spacing: 0.18px;
    }

    .sc-dayMode .fc .fc-col-header { width: 100% !important; }
    .sc-dayMode .fc .fc-col-header-cell { padding: 4px 0 !important; }
    .sc-dayMode .fc .fc-col-header-cell-cushion {
      padding: 4px 0 !important;
      font-size: 14px;
      line-height: 1.2;
    }

    .fc .fc-customTitle-button{
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      padding: 0 !important;
      cursor: default !important;
    }
    .fc .fc-customTitle-button:focus{
      outline: none !important;
      box-shadow: none !important;
    }

    .sc-dayMode .fc .fc-prevDay-button,
    .sc-dayMode .fc .fc-nextDay-button{
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      padding: 0 4px !important;
      font-family: 'Material Symbols Rounded Variable', sans-serif !important;
      font-size: 34px !important;
      font-weight: 400 !important;
      line-height: 1 !important;
      letter-spacing: normal !important;
      text-transform: none !important;
      font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24 !important;
      color: #111827 !important;
    }
    .sc-dayMode .fc .fc-prevDay-button:focus,
    .sc-dayMode .fc .fc-nextDay-button:focus{
      outline: none !important;
      box-shadow: none !important;
    }

    .fc .fc-timegrid-axis-cushion,
    .fc .fc-timegrid-slot-label-cushion{
      font-size: 11px;
      font-weight: 600;
      color:${BRAND.muted};
    }

    .fc-theme-standard td,
    .fc-theme-standard th{
      border-color: rgba(15,23,42,0.08);
    }

    .fc .fc-timegrid-event .fc-event-main{ padding: 2px 8px; }

    .fc .fc-event-time{
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.02px;
      line-height: 1.05;
      display: block !important;
    }
    .sc-dayMode .fc .fc-event-time {
      font-size: 16px;
      font-weight: 750;
    }

    .fc .fc-event-title{
      font-size: 11px;
      font-weight: 550;
      letter-spacing: 0.02px;
      line-height: 1.05;
      color: rgba(17,24,39,0.85);
      display: block !important;
    }
    .sc-dayMode .fc .fc-event-title { font-size: 15px; }

    .fc .fc-timegrid-event{
      border-radius: 6px;
      border: 1px solid rgba(15,23,42,0.12);
      box-shadow: 0 1px 2px rgba(0,0,0,0.15);
    }

    .fc .fc-event.ev-normal{
      background: #fdfdfd !important;
      border-color: rgba(17, 24, 39, 0.35) !important;
      color: #111827 !important;
    }
    .fc .fc-event.ev-normal .fc-event-main,
    .fc .fc-event.ev-normal .fc-event-time,
    .fc .fc-event.ev-normal .fc-event-title{
      color: #111827 !important;
    }

    .fc .fc-event.ev-game{
      background: #0d84f4 !important;
      border-color: #0b59a1 !important;
      color: #111827 !important;
    }

    .fc .fc-event.ev-brand{
      background: var(--color-primary) !important;
      border-color: #aa6f09 !important;
      color: #111827 !important;
    }
    .fc .fc-event.ev-brand .fc-event-main,
    .fc .fc-event.ev-brand .fc-event-time,
    .fc .fc-event.ev-brand .fc-event-title{
      color: #111827 !important;
    }

    .fc .fc-timegrid-now-indicator-line{
        border-top-width: 3px;
        border-color: ${BRAND.accent};
    }
    .fc .fc-timegrid-now-indicator-arrow {
        width: 0;
        height: 0;
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
        border-left: 8px solid ${BRAND.accent};
    }
  `;
}
