import React, { useEffect, useMemo, useState } from "react";
import { Container } from "react-bootstrap";
import { useLocation, useParams } from "react-router-dom";
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

const parseTruthy = (v) => {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
};

const ThisWeek = () => {
  const { timestamp } = useParams();
  const location = useLocation();

  const includeAway = useMemo(() => {
    const sp = new URLSearchParams(location.search ?? "");
    return parseTruthy(sp.get("includeAway"));
  }, [location.search]);

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

  return (
    <div className="tw-root">
      <style>{css}</style>

      <div className="tw-header">
        <div className="tw-header-inner">{header.title}</div>
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

  font-size: clamp(18px, 1.8vw, 32px);
  color: #f59e0b;

  text-shadow: 0 6px 18px rgba(0,0,0,0.6);
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
  gap: 8px;
  min-width: 0;
}

.tw-logo{
  height: clamp(18px, 2.6vw, 30px);
  width:  clamp(18px, 2.6vw, 30px);
  object-fit: contain;

  background: linear-gradient(180deg, #ffffff, #f3f4f6);
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
