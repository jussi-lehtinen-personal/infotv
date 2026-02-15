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
    this.state = {
      items: [],
      supported: this.isSupportedDisplay(),
    };
    this.onResize = this.onResize.bind(this);
  }

    isSupportedDisplay() {
    if (typeof window === "undefined") return true;

    // "Physical" pixels (zoom invariant)
    const w = window.innerWidth * window.devicePixelRatio;
    const h = window.innerHeight * window.devicePixelRatio;

    const isLandscape = w >= h;

    // 720p+ landscape
    return isLandscape && w >= 1280 && h >= 720;
    }

  onResize() {
    const supported = this.isSupportedDisplay();
    if (supported !== this.state.supported) {
      this.setState({ supported });
    }
  }

  componentDidMount() {
    window.addEventListener("resize", this.onResize);

    fetch("api/schedule")
      .then((response) => response.json())
      .then((data) => {
        this.setState({ items: data });
      })
      .catch((error) => {
        console.log("Error occurred! ", error);
      });
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.onResize);
  }

  render() {
    const { items, supported } = this.state;

    if (!supported) {
      return (
        <div style={styles.unsupportedRoot}>
          <div style={styles.unsupportedCard}>
            <div style={styles.unsupportedTitle}>Jäävuorot</div>
            <div style={styles.unsupportedText}>Landscape + vähintään 1280×720.</div>
          </div>
        </div>
      );
    }

    const BRAND = {
      accent: "#f59e0b",
      // same warm off-white as this_week cards
      card: "#fff7ed",
      text: "#111827",
      muted: "#64748b",
    };

    const events = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const text = item.text ?? "";
      const isAhmaEvent = (text.includes("Kiekko") && text.includes("Ahma")) || (text.includes("KA U"));
      const isBLDEvent = text.includes("BLD");

        const isBrand = isAhmaEvent || isBLDEvent;

        const event = {
        id: item.id,
        title: text,
        start: item.start_date,
        end: item.end_date,
        classNames: [isBrand ? "ev-brand" : "ev-normal"],

        // 👇 default for non-brand
        backgroundColor: BRAND.card,
        borderColor: "rgba(17,24,39,0.14)",
        textColor: BRAND.text,
        };

        if (isBrand) {
        event.backgroundColor = BRAND.accent;
        event.borderColor = BRAND.accent;
        event.textColor = BRAND.text;
        }
      // Highlight Ahma/BLD with brand orange
      if (isAhmaEvent || isBLDEvent) {
        event.backgroundColor = BRAND.accent;
        event.borderColor = BRAND.accent;
        event.textColor = "#111827";
      }

      events.push(event);
    }

    return (
      <Fragment>
        <style>{calendarThemeCss(BRAND)}</style>

        <div className="sc-root">
          <Container fluid className="sc-container">
            <div className="sc-calendarWrap">
              <FullCalendar
                plugins={[bootstrapPlugin, timeGridPlugin]}
                initialView="timeGridWeek"
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
                  month: "numeric"
                }}
                headerToolbar={{
                  left: "",
                  center: "title",
                  right: "",
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
              />
            </div>
          </Container>
        </div>
      </Fragment>
    );
  }
}

export default Schedule;

/* ---------- Minimal unsupported view ---------- */
const styles = {
  unsupportedRoot: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f6f7f9",
    padding: 24,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  unsupportedCard: {
    background: "#ffffff",
    borderRadius: 14,
    padding: "18px 22px",
    boxShadow: "0 10px 24px rgba(0,0,0,0.10)",
    border: "1px solid rgba(15,23,42,0.10)",
    maxWidth: 560,
    width: "100%",
    textAlign: "center",
  },
  unsupportedTitle: { fontSize: 28, fontWeight: 800, color: "#111827" },
  unsupportedText: { marginTop: 6, fontSize: 16, color: "#64748b" },
};

function calendarThemeCss(BRAND) {
  return `
  html, body {
    height: 100%;
    margin: 0;
    overflow: hidden; /* no browser scrollbar */
  }

    .sc-root{
    height:100vh;
    overflow:hidden;

    background:
        radial-gradient(circle at 20% 20%, rgba(255,255,255,0.10), transparent 45%),
        linear-gradient(135deg, #d97706 0%, #b45309 45%, #7c2d12 100%);

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
  padding: 3px; /* jättää oranssitaustaan kehys-efektin */
  background: transparent;
}


  /* Calendar shell */
  .fc{
    height:100% !important;
    background:#ffffff;
    border-radius: 14px;
    padding: 8px 8px 6px 8px;
    border: 1px solid rgba(15,23,42,0.10);
    box-shadow: 0 10px 26px rgba(0,0,0,0.10);
    overflow:hidden;
  }

  .fc .fc-header-toolbar{
    margin: 0 0 6px 0 !important;
  }

  /* Week title, with "JÄÄVUOROT" prefix */
  .fc .fc-toolbar-title{
    font-size: 18px;
    font-weight: 650;
    letter-spacing: 0.10px;
    color:${BRAND.text};
  }
  .fc .fc-toolbar-title::before{
    content: "JÄÄVUOROT (";
    font-weight: 750;
    letter-spacing: 0.18px;
  }

  .fc .fc-toolbar-title::after{
    content: ")";
    font-weight: 750;
    letter-spacing: 0.18px;
  }

  /* Day headers */
  .fc .fc-col-header-cell-cushion{
    font-size: 13px;
    font-weight: 650;
    letter-spacing: 0.08px;
    color:${BRAND.text};
  }

  /* Time axis labels */
  .fc .fc-timegrid-axis-cushion,
  .fc .fc-timegrid-slot-label-cushion{
    font-size: 11px;
    font-weight: 600;
    color:${BRAND.muted};
  }

  /* Reduce grid line noise */
  .fc-theme-standard td,
  .fc-theme-standard th{
    border-color: rgba(15,23,42,0.08);
  }

  /* ===== Event styling improvements ===== */

  /* Add padding so text doesn't touch edges */
  .fc .fc-timegrid-event .fc-event-main{
    padding: 2px 8px;
  }

  /* Make time stronger and "title" more body-like */
  .fc .fc-event-time{
    font-size: 11px;
    font-weight: 800;     /* stronger */
    letter-spacing: 0.02px;
    line-height: 1.05;
  }

  .fc .fc-event-title{
    font-size: 11px;
    font-weight: 550;     /* lighter body */
    letter-spacing: 0.02px;
    line-height: 1.05;
    color: rgba(17,24,39,0.85);
  }

  /* Rounded events */
  .fc .fc-timegrid-event{
    border-radius: 6px;
    border: 1px solid rgba(15,23,42,0.12);
    box-shadow: 0 1px 2px rgba(0,0,0,0.15);
  }

    /* Varmempi: osuu aina eventiin */
    .fc .fc-event.ev-normal{
    background: #fdfdfd !important;
    border-color: rgba(17, 24, 39, 0.35) !important;
    color: #111827 !important;
    }

    /* Myös sisäosat, koska teemat usein värittää nämä */
    .fc .fc-event.ev-normal .fc-event-main,
    .fc .fc-event.ev-normal .fc-event-time,
    .fc .fc-event.ev-normal .fc-event-title{
    color: #111827 !important;
    }

    /* Brand */
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

  /* If event background is orange, ensure title stays readable */
  .fc .fc-timegrid-event[style*="background-color: ${BRAND.accent}"] .fc-event-title{
    color: rgba(17,24,39,0.90);
  }

  /* Now indicator */
  .fc .fc-timegrid-now-indicator-line{
    border-color: ${BRAND.accent};
  }
  .fc .fc-timegrid-now-indicator-arrow{
    width: 0
    border-color: ${BRAND.accent};
  }
  `;
}
