import React, { useEffect, useMemo, useState } from "react";
import { Container } from "react-bootstrap";
import { useParams } from "react-router-dom";
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


const ThisWeek = () => {
  const { timestamp } = useParams();

  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const uri = buildGamesQueryUri(timestamp);

    fetch(uri)
      .then((r) => r.json())
      .then((d) => setMatches(processIncomingDataEvents(d)))
      .catch(() => setMatches(processIncomingDataEvents(getMockGameData())));
  }, [timestamp]);

  // Header title based on week relation
  const header = useMemo(() => {
    const now = timestamp ? new Date(timestamp) : new Date();

    const selectedWeekStart = getMonday(now);
    const currentWeekStart = getMonday(new Date());

    const selected = moment(selectedWeekStart);
    const current = moment(currentWeekStart);

    let title;
    if (selected.isSame(current, "day")) {
      title = "TÄMÄN VIIKON KOTIOTTELUT";
    } else if (selected.isAfter(current)) {
      title = "TULEVAT KOTIOTTELUT";
    } else {
      title = "PELATUT KOTIOTTELUT";
    }

    return { title };
  }, [timestamp]);

  // Group by day like Flashscore sections (compact)
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

    // 2-col jos: landscape + riittävän leveä + pelejä > 7
    const twoCol = isLandscape && w >= 1000 && totalGames > 7;

  const { leftGroups, rightGroups } = useMemo(() => {
    if (!twoCol) return { leftGroups: groups, rightGroups: [] };

    // Split by cumulative match count (keep day blocks intact)
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

    // edge case: if right ends empty (e.g. one huge day), force split by day count
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

      <Container fluid className="tw-container">
        <div className="tw-topbar">
          <div className="tw-title">{header.title}</div>
        </div>

        {!twoCol && <div className="tw-list">{groups.map(renderDayBlock)}</div>}

        {twoCol && (
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

  return (
    <div className="tw-row" onClick={onClick} role="button" tabIndex={0}>
      <div className="tw-time">{timeStr}</div>

        <div className="tw-mid">
        <div className="tw-teamline">
            <img className="tw-logo" src={match.home_logo} alt="" />
            <span className="tw-teamname">{match.home}</span>
        </div>
        <div className="tw-goal">{homeGoals}</div>

        <div className="tw-teamline">
            <img className="tw-logo" src={match.away_logo} alt="" />
            <span className="tw-teamname">{match.away}</span>
        </div>
        <div className="tw-goal">{awayGoals}</div>
        </div>

      <div className={statusClass}>{status}</div>
    </div>
  );
}

// If level starts with Uxx -> show only Uxx (e.g. "U16 AAA SM" -> "U16")
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
.tw-root{
  min-height:100vh;
  background:
    radial-gradient(circle at 50% 0%, rgba(255,180,80,0.25), transparent 60%),
    linear-gradient(135deg, #d97706 0%, #7c2d12 100%);
}

.tw-container{
  max-width: none !important;   /* ohita bootstrapin max-width */
  padding-left: 24px;
  padding-right: 24px;
}

/* Top bar (compact, TV-safe) */
.tw-topbar{
  position: sticky;
  top: 0;
  z-index: 5;
  padding-top: 12px;
  margin-bottom: 12px;
}  
.tw-title{
  font-weight: 800;
  letter-spacing: 0.2px;
  line-height: 1.15;
  padding: 8px 10px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background:#fffaf5;
  font-size: clamp(18px, 1.8vw, 32px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
}

/* List blocks (default = one column) */
.tw-list{
  display:flex;
  flex-direction:column;
  gap: 12px;
}

/* Two column layout for InfoTV landscape (when enabled in JS) */
.tw-twoCol{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  align-items:start;
}

/* Each column is a vertical stack */
.tw-col{
  display:flex;
  flex-direction:column;
  gap: 10px;
}

.tw-mid{
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr 36px;  /* name area | goals */
  grid-template-rows: auto auto;    /* 2 rows */
  column-gap: 8px;
  row-gap: 6px;                     /* sama väli kuin ennen team-gap */
  align-items: center;
}

/* Day header like Flashscore section */
.tw-dayheader{
  display:flex;
  align-items:center;
  gap:8px;
  padding: 8px 10px;
  font-size: clamp(18px, 1.6vw, 24px);
  color: #ffffff;
  font-weight: 500;
}

.tw-dayheader-date{
  opacity:0.9;
}

/* Row grid */
.tw-row{
  display:grid;
  grid-template-columns:
    clamp(50px, 6vw, 80px)
    1fr
    0.2fr
    auto;
  gap: 6px;
  align-items:center;

  padding: 10px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  margin-bottom: clamp(4px, 0.6vw, 10px);

  cursor:pointer;
  user-select:none;
  background:#fffaf5;  /* lämmin valkoinen */
  box-shadow: 0 10px 28px rgba(0,0,0,0.25);
}

.tw-goal{
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: clamp(16px, 1.5vw, 22px);
  color:#0f172a;
  line-height: 1.2;
}

.tw-row:hover{
  box-shadow: 0 6px 18px rgba(0,0,0,0.06);
}

.tw-time{
  font-weight: 900;
  font-size: clamp(16px, 1.5vw, 22px);
  color:#334155;
  text-align:left;
}

/* Teams block */
.tw-teams{
  min-width: 0;
  display:flex;
  flex-direction:column;
  gap: 4px;
}

.tw-teamline{
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tw-logo{
  height: clamp(16px, 2.4vw, 28px);
  width:  clamp(16px, 2.4vw, 28px);
  object-fit: contain;
}

.tw-teamname{
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  font-weight: 650;
  font-size: clamp(16px, 1.5vw, 22px);
  color:#0f172a;

  text-transform: uppercase;
  letter-spacing: 0.4px;
}



/* Kotijoukkue = ensimmäinen teamline */
.tw-teamline:first-child .tw-teamname{
  color: #f59e0b;
}

/* Status / level */
.tw-status{
  justify-self:end;
  font-weight: 750;
  font-size: clamp(16px, 1.5vw, 22px);
  color: #1f29378f;
  text-align:right;
  text-transform: uppercase;
  letter-spacing: 0.4px;

  /* if it wraps, keep it centered-ish vertically */
  line-height: 1.1;
}

@media (max-width: 380px){
  .tw-row{
    grid-template-columns: 40px 1fr 0px 0px; /* level pois */
    gap: 6px;
  }
  .tw-status{ display:none; }

  .tw-logo{
    height: 16px;
    width: 16px;
  }

  .tw-teamname{
    font-size: 12px;
    letter-spacing: 0.2px;
  }

  .tw-goal{ width: 28px; font-size: 12px; }
}




/* Very big screens (InfoTV): slightly larger */
@media (min-width: 1000px){
  .tw-row{
    grid-template-columns:
      80px      /* time */
      0.6fr       /* teams */
      1fr       /* spacer */
      auto
  }

  /* TWO COLUMN MODE */
  .tw-twoCol .tw-row{
    grid-template-columns:
      70px      /* time vähän pienempi */
      1fr
      0.25fr    /* spacer pienempi */
      auto;
  }

  .tw-container{
    padding-left: 48px;
    padding-right: 48px;
  }
}
`;
