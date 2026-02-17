// pages/schedule.js
import React, { Fragment } from "react";
import FullCalendar from "@fullcalendar/react";
import Container from "react-bootstrap/Container";

import timeGridPlugin from "@fullcalendar/timegrid";
import bootstrapPlugin from "@fullcalendar/bootstrap";
import allLocales from "@fullcalendar/core/locales-all";

import "bootstrap/dist/css/bootstrap.css";
import "@fortawesome/fontawesome-free/css/all.css";
import "./fullcalendar.css";

class Schedule extends React.Component {
  constructor(props) {
    super(props);

    this.calendarRef = React.createRef();
    this.wrapRef = React.createRef();
    this.lastDayMode = null;
    this.didSwipe = false;

    this.state = {
      items: [],
      currentDate: new Date(),
      dragX: 0,
      isDragging: false,
      slideState: "idle", // idle | exiting | entering
    };

    this.activeInput = null; // "mouse" | "touch" | null

    this.swipe = {
      dragging: false,
      locked: null, // "h" | "v" | null
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
    };

    this.onResize = this.onResize.bind(this);
  }

  // ---------- Layout ----------
  getViewportPx() {
    if (typeof window === "undefined") return { w: 1920, h: 1080 };
    const w = window.innerWidth * window.devicePixelRatio;
    const h = window.innerHeight * window.devicePixelRatio;
    return { w, h };
  }

  isBigLandscape() {
    const { w, h } = this.getViewportPx();
    const isLandscape = w >= h;
    return isLandscape && w >= 1280 && h >= 720;
  }

  isDayMode() {
    // Portrait + small landscapes => day mode (no "unsupported" gap)
    return !this.isBigLandscape();
  }

  isTouchDevice() {
    if (typeof window === "undefined") return false;
    return (
      (navigator && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0) ||
      "ontouchstart" in window
    );
  }

onResize() {
  const dayMode = this.isDayMode();
  if (this.lastDayMode === null) this.lastDayMode = dayMode;

  if (dayMode !== this.lastDayMode) {
    this.lastDayMode = dayMode;

    const api = this.calendarRef.current?.getApi?.();
    if (api) {
      api.changeView(dayMode ? "timeGridDay" : "timeGridWeek");

      // pysy samassa päivässä kun näkymä vaihtuu
      api.gotoDate(this.state.currentDate);

      // jos sinulla on scrollToCurrentTime A-logiikka:
      if (dayMode) setTimeout(this.scrollToCurrentTime, 0);
    }
  }

  // pakota rerender varmuuden vuoksi (esim. slot-height css, wrapper-luokat)
  this.forceUpdate();
}


  componentDidMount() {
    this.lastDayMode = this.isDayMode();
    window.addEventListener("resize", this.onResize);

    fetch("api/schedule")
      .then((response) => response.json())
      .then((data) => this.setState({ items: data }))
      .catch((error) => console.log("Error occurred! ", error));

    const el = this.wrapRef.current;
    if (!el) return;

    const touch = this.isTouchDevice();

    // --- Touch path (iOS + Android): this is what makes swipe work on top of the calendar grid/events ---
    if (touch) {
      // Start on wrapper (capture so FC can't swallow)
      el.addEventListener("touchstart", this.onTouchStart, { passive: true, capture: true });

      // Track on window so we keep receiving moves even over inner scrollers
      window.addEventListener("touchmove", this.onTouchMove, { passive: false });
      window.addEventListener("touchend", this.onTouchEnd, { passive: true });
      window.addEventListener("touchcancel", this.onTouchCancel, { passive: true });
    }

    // --- Mouse/desktop path: pointer events only for mouse (do NOT handle touch pointers here) ---
    el.addEventListener("pointerdown", this.onPointerDown, { passive: true, capture: true });
    window.addEventListener("pointermove", this.onPointerMove, { passive: false });
    window.addEventListener("pointerup", this.onPointerUp, { passive: true });
    window.addEventListener("pointercancel", this.onPointerCancel, { passive: true });

    // Safety: if focus is lost, cancel drag
    window.addEventListener("blur", this.finishSwipe, true);

    setTimeout(this.scrollToCurrentTime, 0);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.onResize);

    const el = this.wrapRef.current;
    if (el) {
      el.removeEventListener("touchstart", this.onTouchStart, true);

      el.removeEventListener("pointerdown", this.onPointerDown, true);
    }

    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("touchend", this.onTouchEnd);
    window.removeEventListener("touchcancel", this.onTouchCancel);

    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);

    window.removeEventListener("blur", this.finishSwipe, true);
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.currentDate !== this.state.currentDate) {
        const api = this.calendarRef.current?.getApi?.();
        if (api) api.gotoDate(this.state.currentDate);

        // scrollaa uuteen päivään "nyt"-kohdan kohdalle (vain day mode)
        if (this.isDayMode()) {
        setTimeout(this.scrollToCurrentTime, 0);
        }
    }
  }

  // ---------- Day navigation ----------
  goPrevDay = () => {
    this.setState((s) => {
      const d = new Date(s.currentDate);
      d.setDate(d.getDate() - 1);
      return { currentDate: d };
    });
  };

  goNextDay = () => {
    this.setState((s) => {
      const d = new Date(s.currentDate);
      d.setDate(d.getDate() + 1);
      return { currentDate: d };
    });
  };

  // ---------- Swipe logic ----------
  getSwipeThreshold() {
    const w = typeof window !== "undefined" ? window.innerWidth : 360;
    return Math.min(140, Math.max(55, w * 0.18));
  }

  clampDrag(dx) {
    const w = typeof window !== "undefined" ? window.innerWidth : 360;
    return Math.max(-w, Math.min(w, dx));
  }

  lockAxisIfNeeded(dx, dy) {
    if (this.swipe.locked !== null) return;

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx < 6 && ady < 6) return;

    // Important change: lock to horizontal easier (grid has vertical jitter)
    if (adx >= ady * 0.75) this.swipe.locked = "h";
    else if (ady >= adx * 1.4) this.swipe.locked = "v";
    // else keep null (decide at end)
  }

  decideAxisAtEnd(dx, dy) {
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx >= ady * 0.75) return "h";
    if (ady >= adx * 1.4) return "v";
    return "v";
  }

  beginSwipe(x, y, input) {
    if (!this.isDayMode()) return;

    if (this.activeInput && this.activeInput !== input) return;
    this.activeInput = input;

    this.didSwipe = false;

    this.swipe.dragging = true;
    this.swipe.locked = null;
    this.swipe.startX = x;
    this.swipe.startY = y;
    this.swipe.lastX = x;
    this.swipe.lastY = y;

    this.setState({ isDragging: true, slideState: "idle" });
  }

  moveSwipe(x, y, preventDefaultFn, input) {
    if (!this.swipe.dragging) return;
    if (this.activeInput && this.activeInput !== input) return;

    const dx = x - this.swipe.startX;
    const dy = y - this.swipe.startY;

    this.swipe.lastX = x;
    this.swipe.lastY = y;

    // mark swipe (used to suppress tap)
    if (Math.abs(dx) > 8) this.didSwipe = true;

    this.lockAxisIfNeeded(dx, dy);

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // Start treating as horizontal early, so mobile doesn't start vertical pan and cancel events
    const looksHorizontal = adx > 10 && adx >= ady * 0.75;

    if (this.swipe.locked === "h" || looksHorizontal) {
      preventDefaultFn?.();
      this.setState({ dragX: this.clampDrag(dx) });
    }
  }

  endSwipe(x, y, input) {
    if (!this.swipe.dragging) return;
    if (this.activeInput && this.activeInput !== input) return;

    const dx = x - this.swipe.startX;
    const dy = y - this.swipe.startY;
    const threshold = this.getSwipeThreshold();

    const finishToCenter = () => {
      this.setState({ isDragging: false, dragX: 0 });
      this.finishSwipe();
    };

    const axis = this.swipe.locked ?? this.decideAxisAtEnd(dx, dy);
    if (axis !== "h" || Math.abs(dx) < threshold) {
      finishToCenter();
      return;
    }

    const dir = dx < 0 ? -1 : 1; // -1 = next, +1 = prev
    const w = typeof window !== "undefined" ? window.innerWidth : 360;

    // animate offscreen
    this.setState({
      isDragging: false,
      slideState: "exiting",
      dragX: dir < 0 ? -w : w,
    });

    window.setTimeout(() => {
      if (dir < 0) this.goNextDay();
      else this.goPrevDay();

      // enter from opposite side (teleport w/out transition -> animate to center)
      this.setState(
        { isDragging: true, slideState: "entering", dragX: dir < 0 ? w : -w },
        () => {
          requestAnimationFrame(() => {
            this.setState({ isDragging: false, dragX: 0, slideState: "idle" });
          });
        }
      );

      this.finishSwipe();
    }, 180);
  }

  finishSwipe = () => {
    this.activeInput = null;
    this.swipe.dragging = false;
    this.swipe.locked = null;
    this.didSwipe = false;
  };

  // ---------- Pointer handlers (mouse only) ----------
  onPointerDown = (e) => {
    // IMPORTANT: ignore touch pointers here; touch path uses touch events
    if (e.pointerType !== "mouse") return;
    if (e.button !== 0) return;

    this.beginSwipe(e.clientX, e.clientY, "mouse");
  };

  onPointerMove = (e) => {
    if (this.activeInput !== "mouse") return;
    this.moveSwipe(e.clientX, e.clientY, () => e.preventDefault(), "mouse");
  };

  onPointerUp = (e) => {
    if (this.activeInput !== "mouse") return;

    if (this.didSwipe) {
      try {
        e.preventDefault();
      } catch {}
      try {
        e.stopPropagation();
      } catch {}
    }

    this.endSwipe(e.clientX ?? this.swipe.lastX, e.clientY ?? this.swipe.lastY, "mouse");
  };

  onPointerCancel = () => {
    if (this.activeInput !== "mouse") return;
    if (!this.swipe.dragging) return;
    this.setState({ isDragging: false, dragX: 0 });
    this.finishSwipe();
  };

  // ---------- Touch handlers (iOS + Android) ----------
  onTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];
    this.beginSwipe(t.clientX, t.clientY, "touch");
  };

  onTouchMove = (e) => {
    if (this.activeInput !== "touch") return;
    if (!e.touches || e.touches.length === 0) return;
    const t = e.touches[0];

    // Use preventDefault when horizontal intent -> stops FC scroller from killing the gesture
    this.moveSwipe(t.clientX, t.clientY, () => e.preventDefault(), "touch");
  };

  onTouchEnd = (e) => {
    if (this.activeInput !== "touch") return;

    // If it was a swipe, prevent tap/click
    if (this.didSwipe) {
      try {
        e.preventDefault();
      } catch {}
      try {
        e.stopPropagation();
      } catch {}
    }

    this.endSwipe(this.swipe.lastX, this.swipe.lastY, "touch");
  };

  onTouchCancel = () => {
    if (this.activeInput !== "touch") return;
    if (!this.swipe.dragging) return;
    this.setState({ isDragging: false, dragX: 0 });
    this.finishSwipe();
  };

scrollToCurrentTime = () => {
  const api = this.calendarRef.current?.getApi?.();
  if (!api) return;

  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  // Näytä vähän kontekstia yläpuolelle (esim. 30min ennen)
  const target = Math.max(0, minutesNow - 30);
  const hh = String(Math.floor(target / 60)).padStart(2, "0");
  const mm = String(target % 60).padStart(2, "0");

  api.scrollToTime(`${hh}:${mm}:00`);
};

  render() {
    const { items } = this.state;

    const BRAND = {
      accent: "#f59e0b",
      card: "#fff7ed",
      text: "#111827",
      muted: "#64748b",
    };

    const events = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const text = item.text ?? "";
      const isAhmaEvent =
        (text.includes("Kiekko") && text.includes("Ahma")) || text.includes("KA U");
      const isBLDEvent = text.includes("BLD");
      const isBrand = isAhmaEvent || isBLDEvent;

      const event = {
        id: item.id,
        title: text,
        start: item.start_date,
        end: item.end_date,
        classNames: [isBrand ? "ev-brand" : "ev-normal"],
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

      events.push(event);
    }

    const dayMode = this.isDayMode();

    return (
      <Fragment>
        <style>{calendarThemeCss(BRAND)}</style>

        <div className={`sc-root ${dayMode ? "sc-dayMode" : ""}`}>
          <Container fluid className="sc-container">
            <div
              ref={this.wrapRef}
              className={`sc-calendarWrap ${dayMode ? "sc-daySwipe" : ""}`}
            >
              <div
                className={`sc-dayPane ${this.state.isDragging ? "sc-dragging" : ""} ${
                  this.state.slideState
                }`}
                style={{ transform: `translateX(${this.state.dragX}px)` }}
              >
                <FullCalendar
                  ref={this.calendarRef}
                  plugins={[bootstrapPlugin, timeGridPlugin]}
                  initialView={dayMode ? "timeGridDay" : "timeGridWeek"}
                  locales={allLocales}
                  locale="fi"
                  weekends={true}
                  allDaySlot={false}
                  eventMinHeight={24}
                  slotDuration="00:30:00"
                  slotMinTime="08:00:00"
                  slotMaxTime="23:30:00"
                  dayHeaderContent={(arg) => {
                    const text = arg.text;
                    return text.charAt(0).toUpperCase() + text.slice(1);
                  }}
                  dayHeaderFormat={{
                    weekday: "short",
                    day: "numeric",
                    month: "numeric",
                  }}
                  slotLabelFormat={{
                    hour: "2-digit",
                    minute: "2-digit",
                    omitZeroMinute: false,
                    hour12: false,
                  }}
                  firstDay={1}
                  nowIndicator={true}
                  now={null}
                  events={events}
                  themeSystem="bootstrap"
                  height="100%"
                    headerToolbar={{
                    left: dayMode ? "prevDay" : "",
                    center: "title",
                    right: dayMode ? "nextDay" : "",
                    }}
                  customButtons={{
                    prevDay: { text: "‹", click: () => this.goPrevDay() },
                    nextDay: { text: "›", click: () => this.goNextDay() },
                  }}
                  expandRows={true}
                  titleFormat={() => ""}
                />
              </div>
            </div>
          </Container>
        </div>
      </Fragment>
    );
  }
}

export default Schedule;

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

    .sc-calendarWrap{
      flex: 1 1 auto;
      min-height: 0;
      overflow:hidden;

      border-radius: 16px;
      padding: 3px;
      background: transparent;
    }

    /* allow vertical scroll gestures; we handle horizontal ourselves */
    .sc-daySwipe{ touch-action: pan-y; }

    .sc-dayPane{
      width:100%;
      height:100%;
      transform: translateX(0px);
      transition: transform 180ms ease;
      will-change: transform;
    }
    .sc-dayPane.sc-dragging{ transition: none; }

    /* Portrait/day-mode: make hour slots taller => "2 screens" content, scroll inside calendar */
    .sc-dayMode .fc .fc-timegrid-slot{ height: 32px; }

/* Hide ALL FullCalendar scrollbars (and the little up/down buttons) but keep scrolling */

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

/* Varmuuden vuoksi: ei horisontaalista scrollia */
.sc-dayMode .fc .fc-scroller.fc-scroller-liquid-absolute {
  overflow-x: hidden !important;
}
    /* Calendar shell (unchanged look) */
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

    .sc-dayMode .fc .fc-col-header {
  width: 100% !important;
}
.sc-dayMode .fc .fc-col-header-cell {
  padding: 4px 0 !important;
}

.sc-dayMode .fc .fc-col-header-cell-cushion {
  padding: 4px 0 !important;
  font-size: 14px;        /* säädä halutessa */
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
    padding: 0 12px !important;
    font-size: 26px !important;
    font-weight: 700 !important;
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

    /* Isompi eventin kellonaika */
    .sc-dayMode .fc .fc-event-time {
      font-size: 15px;
      font-weight: 700;
    }

    .fc .fc-event-title{
      font-size: 11px;
      font-weight: 550;
      letter-spacing: 0.02px;
      line-height: 1.05;
      color: rgba(17,24,39,0.85);
      display: block !important;
    }

    /* Isompi eventin otsikko */
    .sc-dayMode .fc .fc-event-title {
      font-size: 15px;
    }

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

    .fc .fc-event.ev-brand{
      background: #f59e0b !important;
      border-color: #aa6f09 !important;
      color: #111827 !important;
    }
    .fc .fc-event.ev-brand .fc-event-main,
    .fc .fc-event.ev-brand .fc-event-time,
    .fc .fc-event.ev-brand .fc-event-title{
      color: #111827 !important;
    }

    .fc .fc-timegrid-now-indicator-line{ 
        border-top-width: 3px;                 /* default ~1px */
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
