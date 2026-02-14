import React, { useEffect, useMemo, useState } from "react";
import { Container } from "react-bootstrap";
import { useParams, useNavigate } from "react-router-dom";
import moment from "moment";
import "moment/locale/fi";

import {
  getMockGameData,
  getMonday,
  processIncomingDataEvents,
  buildGamesQueryUri,
  getAdsUri
} from "../Util";

moment.locale("fi");

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const ThisWeek = () => {
  const navigate = useNavigate();
  const { timestamp } = useParams();

  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const uri = buildGamesQueryUri(timestamp);

    fetch(uri)
      .then((r) => r.json())
      .then((d) => setMatches(processIncomingDataEvents(d)))
      .catch(() => setMatches(processIncomingDataEvents(getMockGameData())));
  }, [timestamp]);

  // Title / date range (kevyesti, ei vie tilaa)
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

  // Optional: group by day like Flashscore sections (compact)
  const groups = useMemo(() => {
    const map = new Map();
    for (const m of matches) {
      const key = moment(m.date).format("YYYY-MM-DD");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    // sort days
    const days = Array.from(map.keys()).sort((a, b) => (a < b ? -1 : 1));
    // sort matches inside day by time
    for (const day of days) {
      map.get(day).sort((a, b) => new Date(a.date) - new Date(b.date));
    }
    return days.map((day) => ({ day, items: map.get(day) }));
  }, [matches]);

  return (
    <div className="tw-root">
      <style>{css}</style>

      <Container className="tw-container">
        <div className="tw-topbar">
          <div className="tw-title">{header.title}</div>
        </div>

        <div className="tw-list">
          {groups.map((g) => (
            <div key={g.day} className="tw-dayblock">
              <div className="tw-dayheader">
                <span className="tw-dayheader-date">
                    <strong>{capitalize(moment(g.day).format("dddd"))}</strong>{" "}
                    <span>
                        {moment(g.day).format("D.M")}
                    </span>
                </span>
              </div>

              {g.items.map((m, idx) => (
                <MatchRow
                  key={`${g.day}-${idx}`}
                  match={m}
                  onClick={() => navigate(getAdsUri(idx, m))}
                />
              ))}
            </div>
          ))}
        </div>
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

  // Score display
    const scoreStr = match.finished
    ? `${match.home_goals ?? ""}-${match.away_goals ?? ""}`
    : "";

  // Status badge: you can tweak logic if you have "live" field later
    const shortLevel =
    window.innerWidth < 420 && match.level?.length > 12
        ? match.level.slice(0, 12) + "…"
        : match.level;

    const status = shortLevel;
    const statusClass = "tw-status";

  return (
    <div className="tw-row" onClick={onClick} role="button" tabIndex={0}>
      <div className="tw-time">{timeStr}</div>

      <div className="tw-teams">
        <div className="tw-teamline">
          <img className="tw-logo" src={match.home_logo} alt="" />
          <span className="tw-teamname">{match.home}</span>
        </div>
        <div className="tw-teamline">
          <img className="tw-logo" src={match.away_logo} alt="" />
          <span className="tw-teamname">{match.away}</span>
        </div>
      </div>

      <div className="tw-score">{scoreStr}</div>

      <div className={statusClass}>{status}</div>
    </div>
  );
}

/* ============================= */
/*             CSS               */
/* ============================= */

const css = `
.tw-root{
  background:#f6f7f9;
  min-height:100vh;
  color:#0f172a;
}

.tw-container{
  padding: 14px 12px;
}

/* Top bar (compact, TV-safe) */
.tw-topbar{
  position: sticky;
  top: 0;
  z-index: 5;
  background: linear-gradient(#f6f7f9 70%, rgba(246,247,249,0));
  padding-top: 6px;
  margin-bottom: 8px;
}
.tw-title{
  font-weight: 900;
  letter-spacing: 0.2px;
  font-size: clamp(16px, 1.6vw, 24px);
  line-height: 1.15;
  padding: 8px 10px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 2px 10px rgba(0,0,0,0.04);
}

/* List blocks */
.tw-list{
  display:flex;
  flex-direction:column;
  gap: 10px;
}

/* Day header like Flashscore section */
.tw-dayheader{
  display:flex;
  align-items:center;
  gap:8px;
  padding: 8px 10px;
  font-weight: 650;
  font-size: clamp(13px, 1.2vw, 18px);
  color:#334155;
}
.tw-dayheader-date{
  opacity:0.9;
}

/* The row: single universal grid, responsive via clamp + overflow rules */
.tw-row{
  display:grid;
  grid-template-columns:
    clamp(50px, 6vw, 80px)
    1fr
    clamp(60px, 2vw, 100px)
    minmax(100px, 0.9vw);
  gap: 10px;
  align-items:center;

  padding: 10px 10px;
  background:#fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  margin-bottom: clamp(4px, 0.6vw, 10px);

  cursor:pointer;
  user-select:none;
  box-shadow: 0 2px 10px rgba(0,0,0,0.03);
}

.tw-row:hover{
  box-shadow: 0 6px 18px rgba(0,0,0,0.06);
}

.tw-time{
  font-weight: 900;
  font-size: clamp(12px, 1.3vw, 18px);
  color:#334155;
  text-align:left;
}

.tw-score{
  font-weight: 1000;
  font-variant-numeric: tabular-nums;
  font-size: clamp(12px, 1.6vw, 20px);
  text-align:center;
  color:#0f172a;
}

/* Teams block (2 lines + tiny level line if space) */
.tw-teams{
  min-width: 0; /* enables ellipsis */
  display:flex;
  flex-direction:column;
  gap: 4px;
}

.tw-teamline{
  min-width:0;
  display:flex;
  align-items:center;
  gap: 8px;
}

.tw-logo{
  flex: 0 0 auto;
  height: clamp(14px, 2.2vw, 20px);
  width: clamp(14px, 2.2vw, 20px);
  object-fit: contain;
}

.tw-teamname{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;

  font-weight: 650;
  font-size: clamp(12px, 1.35vw, 18px);
  color:#0f172a;

  text-transform: uppercase;
  letter-spacing: 0.4px;
}

/* Kotijoukkue = ensimmäinen teamline */
.tw-teamline:first-child .tw-teamname{
  color: #f59e0b;  /* Ahma-oranssi */
}


/* Level: show only when there is room (desktop/TV).
   On mobile it stays hidden -> less clutter. */

/* Status */
.tw-status{
  justify-self:end;
  font-weight: 900;
  font-size: clamp(10px, 1.1vw, 14px);
  color:#94a3b8;
  text-align:right;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

/* If really narrow screen, drop status column visually by shrinking it */
@media (max-width: 380px){
  .tw-row{
    grid-template-columns:
      44px
      1fr
      52px
      0px;
  }
  .tw-status{
    display:none;
  }
}

/* Make rows slightly larger on very big screens (InfoTV) */
@media (min-width: 1600px){
  .tw-row{
    padding: 14px 14px;
    border-radius: 14px;
  }
  .tw-logo{
    height: 22px;
    width: 22px;
  }
}

`;
