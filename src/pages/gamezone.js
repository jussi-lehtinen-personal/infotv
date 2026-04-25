import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useDrag } from "@use-gesture/react";
import moment from "moment";
import "moment/locale/fi";

import { getMonday, getMatchLink } from "../Util";
import { themeCSS, COLOR_PRIMARY } from "../theme";
import { Surface } from "../components/ui/Surface";
import { PageHeader } from "../components/ui/PageHeader";
import { NavButton, ToggleButton } from "../components/ui/Buttons";
import { Spinner } from "../components/ui/Spinner";
import { TopProgressBar } from "../components/ui/TopProgressBar";
import { useWeekData } from "../hooks/useWeekData";

moment.locale("fi");

const goToSite = (uri) => {
  window.location.href = uri;
};

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const FAV_STORAGE_KEY = "ahma_favourite_teams";

function loadFavouriteTeams() {
  try {
    const raw = localStorage.getItem(FAV_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return arr.filter(
      (t) => t && typeof t === "object" && t.teamKey && Array.isArray(t.levelGroups)
    );
  } catch {
    return [];
  }
}

function isGameForFavourite(game, favouriteTeams) {
  for (const team of favouriteTeams) {
    const shortNameLower = team.shortName.toLowerCase();
    const nameMatch =
      (game.home && game.home.toLowerCase().includes(shortNameLower)) ||
      (game.away && game.away.toLowerCase().includes(shortNameLower));
    if (!nameMatch) continue;

    const groupMatch = team.levelGroups.some(
      (g) => g.levelId === game.levelId && g.statGroupId === game.statGroupId
    );
    if (groupMatch) return true;
  }
  return false;
}

const parseTruthy = (v) => {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
};

const computeWeekTitle = (weekDate, includeAway, onlyHome) => {
  const selectedWeekStart = getMonday(new Date(weekDate));
  const currentWeekStart = getMonday(new Date());
  const selected = moment(selectedWeekStart);
  const current = moment(currentWeekStart);
  const suffix = !includeAway || onlyHome ? "KOTIOTTELUT" : "OTTELUT";
  if (selected.isSame(current, "day")) return `TÄMÄN VIIKON ${suffix}`;
  if (selected.isAfter(current)) return `TULEVAT ${suffix}`;
  return `PELATUT ${suffix}`;
};

const computeWeekRange = (weekDate) => {
  const mon = getMonday(new Date(weekDate));
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  return moment(mon).format("D.M") + " – " + moment(sun).format("D.M");
};

// Centering transform for the 3-panel carousel: middle panel sits at viewport centre.
const CENTER_TX = -33.333;

const Gamezone = () => {
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

  const [onlyHome, setOnlyHome] = useState(() => {
    try { return localStorage.getItem("ahma_only_home") === "1"; } catch { return false; }
  });
  const [onlyFavourites, setOnlyFavourites] = useState(() => {
    try { return localStorage.getItem("ahma_only_favourites") === "1"; } catch { return false; }
  });
  const [favouriteTeams, setFavouriteTeams] = useState(loadFavouriteTeams);

  useEffect(() => {
    try { localStorage.setItem("ahma_only_home", onlyHome ? "1" : "0"); } catch {}
  }, [onlyHome]);

  useEffect(() => {
    try { localStorage.setItem("ahma_only_favourites", onlyFavourites ? "1" : "0"); } catch {}
  }, [onlyFavourites]);

  // Reload favourites when the page is focused (user may have changed them on /teams)
  useEffect(() => {
    const onFocus = () => setFavouriteTeams(loadFavouriteTeams());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const {
    curDate, prevDate, nextDate,
    curMatches, prevMatches, nextMatches,
    loading, bgFetching,
  } = useWeekData(timestamp, includeAway);

  // Carousel refs
  const trackRef = useRef(null);
  const animatingRef = useRef(false);

  // Initialise the track transform on mount.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, []);

  // After URL navigation, reset transform without animation so the new "current"
  // panel sits in the middle. Skipped during commit animation (the transitionend
  // handler resets transform itself before navigating).
  useLayoutEffect(() => {
    if (animatingRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, [timestamp, includeAway]);

  const buildWeekUrl = useCallback(
    (offsetWeeks) => {
      const base = new Date(curDate);
      base.setDate(base.getDate() + offsetWeeks * 7);
      const dateStr = moment(base).format("YYYY-MM-DD");
      const params = [];
      if (includeAway) params.push("includeAway=1");
      if (showOptions) params.push("options=1");
      const qs = params.length ? "?" + params.join("&") : "";
      return `/gamezone/${dateStr}${qs}`;
    },
    [curDate, includeAway, showOptions]
  );

  // Animate to the prev/next panel, then navigate. The track stays at the
  // animation end position until the URL change triggers React's re-render
  // (which fills panel 1 with the new "current" week's data); only then does
  // useLayoutEffect reset the transform back to centre. flushSync forces this
  // re-render + transform reset to land in the same paint as the gesture's
  // end, preventing a flash of the previous "current" week's data.
  const commitTo = useCallback(
    (direction) => {
      if (animatingRef.current) return;
      const track = trackRef.current;
      if (!track) return;
      animatingRef.current = true;

      // direction -1 (prev) → animate track right (panel 0 visible) → tx 0%
      // direction +1 (next) → animate track left (panel 2 visible) → tx -66.666%
      const targetTx = direction === -1 ? 0 : CENTER_TX * 2;
      track.style.transition = "transform 220ms ease-out";
      track.style.transform = `translate3d(${targetTx}%, 0, 0)`;

      const onEnd = () => {
        track.removeEventListener("transitionend", onEnd);
        animatingRef.current = false;
        flushSync(() => {
          navigate(buildWeekUrl(direction), { replace: true });
        });
      };
      track.addEventListener("transitionend", onEnd);
    },
    [navigate, buildWeekUrl]
  );

  const snapBack = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "transform 180ms ease-out";
    track.style.transform = `translate3d(${CENTER_TX}%, 0, 0)`;
  }, []);

  const goPrevWeek = useCallback(() => commitTo(-1), [commitTo]);
  const goNextWeek = useCallback(() => commitTo(1), [commitTo]);

  // Swipe gesture. Writes transform directly to the DOM during active drag so
  // there are no React re-renders per frame (smooth 60fps on iOS).
  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], cancel, first, xy: [x] }) => {
      if (animatingRef.current) {
        cancel();
        return;
      }

      const track = trackRef.current;
      if (!track) return;

      // iOS Safari edge-swipe is the native back gesture. Skip drags that start
      // within 20px of either edge so the browser handles them.
      if (first && (x < 20 || x > window.innerWidth - 20)) {
        cancel();
        return;
      }

      if (active) {
        track.style.transition = "none";
        track.style.transform = `translate3d(calc(${CENTER_TX}% + ${mx}px), 0, 0)`;
      } else {
        const width = track.parentElement?.clientWidth ?? window.innerWidth;
        const threshold = width * 0.25;
        const fastEnough = Math.abs(vx) > 0.5;

        if (mx <= -threshold || (mx < -10 && fastEnough)) {
          commitTo(1);
        } else if (mx >= threshold || (mx > 10 && fastEnough)) {
          commitTo(-1);
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

  const onToggleHome = useCallback(() => setOnlyHome((v) => !v), []);
  const onToggleFavourites = useCallback(() => setOnlyFavourites((v) => !v), []);

  const sharedPanelProps = {
    includeAway,
    showOptions,
    onlyHome,
    onlyFavourites,
    favouriteTeams,
    onPrev: goPrevWeek,
    onNext: goNextWeek,
    onToggleHome,
    onToggleFavourites,
  };

  return (
    <div className="gz-root">
      <style>{css}</style>

      <div className="gz-carousel-viewport">
        <div className="gz-carousel-track" ref={trackRef} {...bind()}>
          <WeekPanel
            {...sharedPanelProps}
            weekDate={prevDate}
            matches={prevMatches}
            isCurrent={false}
          />
          <WeekPanel
            {...sharedPanelProps}
            weekDate={curDate}
            matches={curMatches}
            isCurrent={true}
            loading={loading}
            bgFetching={bgFetching}
          />
          <WeekPanel
            {...sharedPanelProps}
            weekDate={nextDate}
            matches={nextMatches}
            isCurrent={false}
          />
        </div>
      </div>
    </div>
  );
};

export default Gamezone;

/* ============================= */
/*           WEEK PANEL          */
/* ============================= */

function WeekPanel({
  weekDate,
  matches,
  includeAway,
  showOptions,
  onlyHome,
  onlyFavourites,
  favouriteTeams,
  isCurrent,
  loading,
  bgFetching,
  onPrev,
  onNext,
  onToggleHome,
  onToggleFavourites,
}) {
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
    let result = groups;
    if (showOptions && onlyHome) {
      result = result
        .map((g) => ({ ...g, items: g.items.filter((m) => m.isHomeGame === true) }))
        .filter((g) => g.items.length > 0);
    }
    if (showOptions && onlyFavourites && favouriteTeams.length > 0) {
      result = result
        .map((g) => ({ ...g, items: g.items.filter((m) => isGameForFavourite(m, favouriteTeams)) }))
        .filter((g) => g.items.length > 0);
    }
    return result;
  }, [groups, showOptions, onlyHome, onlyFavourites, favouriteTeams]);

  const renderDayBlock = (g) => (
    <div key={g.day} className="gz-dayblock">
      <div className="gz-dayheader">
        <span className="gz-dayheader-date">
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

  const title = useMemo(
    () => computeWeekTitle(weekDate, includeAway, onlyHome),
    [weekDate, includeAway, onlyHome]
  );
  const weekRange = useMemo(() => computeWeekRange(weekDate), [weekDate]);

  const showSpinner = isCurrent && loading;

  return (
    <div className={`gz-carousel-panel ${isCurrent ? "" : "gz-carousel-panel--inactive"}`}>
      <div className="gz-panel-inner">
        <Surface className="gz-header">
          <PageHeader
            title={title}
            subtitle={weekRange}
            left={<NavButton onClick={onPrev} icon="&#xE5CB;" ariaLabel="Edellinen viikko" />}
            right={<NavButton onClick={onNext} icon="&#xE5CC;" ariaLabel="Seuraava viikko" />}
          />
          {showOptions && (
            <div className="gz-filter-row">
              <ToggleButton onClick={onToggleHome} active={onlyHome} icon="&#xE88A;">
                Kotipelit
              </ToggleButton>
              <ToggleButton onClick={onToggleFavourites} active={onlyFavourites} icon="&#xE838;">
                Suosikit
              </ToggleButton>
            </div>
          )}
          {isCurrent && <TopProgressBar visible={bgFetching && !loading} />}
        </Surface>

        <Surface className="gz-container">
          {showSpinner && <Spinner text="Ladataan otteluita..." />}

          {!showSpinner && (onlyFavourites || onlyHome) && visibleGroups.length === 0 && (
            <div className="gz-empty">
              {onlyFavourites && favouriteTeams.length === 0 ? (
                <>
                  <span>Ei suosikkijoukkueita. </span>
                  <Link to="/teams" className="gz-empty-link">
                    Lisää niitä Joukkueet-sivulta.
                  </Link>
                </>
              ) : (
                <span>Ei pelejä tällä viikolla.</span>
              )}
            </div>
          )}

          {!showSpinner && visibleGroups.length > 0 && (
            <div className="gz-list">{visibleGroups.map(renderDayBlock)}</div>
          )}
        </Surface>
      </div>
    </div>
  );
}

/* ============================= */
/*           ROW UI              */
/* ============================= */

function MatchRow({ match, onClick }) {
  const timeStr = moment(match.date).format("HH:mm");
  const status = simplifyLevel(match.level ?? "");

  const finishedType = Number(match.finished);
  const isLive = finishedType === 0 && match.home_goals != null && match.away_goals != null;
  const isFinished = finishedType > 0;

  const homeGoals = isLive || isFinished ? match.home_goals ?? "" : "";
  const awayGoals = isLive || isFinished ? match.away_goals ?? "" : "";

  const highlightHome = match.isHomeGame === true;
  const highlightAway = match.isHomeGame === false;

  const hg = parseInt(match.home_goals, 10);
  const ag = parseInt(match.away_goals, 10);
  const hasResult = isFinished && !isNaN(hg) && !isNaN(ag);
  const homeWon = hasResult && hg > ag;
  const awayWon = hasResult && ag > hg;

  const resultBorderColor = (() => {
    if (!hasResult) return null;
    const ahmaGoals = match.isHomeGame ? hg : ag;
    const oppGoals = match.isHomeGame ? ag : hg;
    if (ahmaGoals > oppGoals) return "#22c55e";
    if (ahmaGoals < oppGoals) return "#ef4444";
    if (ahmaGoals === oppGoals) return "#e8e8e8";
    return null;
  })();

  const loserGoalStyle = { fontWeight: 400, opacity: 0.85 };
  const liveGoalStyle = { color: "#ef4444" };

  return (
    <div
      className="gz-row"
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={resultBorderColor ? { borderLeft: `4px solid ${resultBorderColor}` } : undefined}
    >
      <div className="gz-time">{timeStr}</div>

      <div className="gz-mid">
        <div className="gz-teamline">
          <img className="gz-logo ui-team-logo" src={match.home_logo} alt="" />
          <span
            className="gz-teamname"
            style={highlightHome ? { color: COLOR_PRIMARY } : undefined}
          >
            {match.home}
          </span>
        </div>
        <div
          className="gz-goal"
          style={isLive ? liveGoalStyle : awayWon ? loserGoalStyle : undefined}
        >
          {homeGoals}
        </div>

        <div className="gz-teamline">
          <img className="gz-logo ui-team-logo" src={match.away_logo} alt="" />
          <span
            className="gz-teamname"
            style={highlightAway ? { color: COLOR_PRIMARY } : undefined}
          >
            {match.away}
          </span>
        </div>
        <div
          className="gz-goal"
          style={isLive ? liveGoalStyle : homeWon ? loserGoalStyle : undefined}
        >
          {awayGoals}
        </div>
      </div>

      <div className="gz-status">{status}</div>
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

const css = `${themeCSS}

html, body, #root{
  margin: 0;
  min-height: 100%;
  background: var(--color-bg);
}

.gz-root{
  min-height: 100vh;
  min-height: 100dvh;

  display: flex;
  flex-direction: column;

  touch-action: pan-y;
  overflow-x: hidden;

  padding: 10px 7px 10px 7px;

  background: var(--bg-gradient);

  font-family: var(--font-family-base);
}

.material-symbols-rounded {
  font-size: 34px;
  line-height: 1;
}

/* Carousel viewport — clips the 300%-wide track */
.gz-carousel-viewport{
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

/* Carousel track — 3 panels side-by-side; transform driven imperatively from JS */
.gz-carousel-track{
  display: flex;
  flex-direction: row;
  width: 300%;
  flex: 1 1 auto;
  min-height: 0;
  will-change: transform;
  touch-action: pan-y;
}

/* One week panel — fills viewport width, flex column for header + matches.
   Horizontal padding creates the visible gap between adjacent panels during
   swipe; box-sizing: border-box keeps the 33.333% width math intact. */
.gz-carousel-panel{
  flex: 0 0 33.3333%;
  box-sizing: border-box;
  padding: 0 6px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* Off-screen panels don't receive taps */
.gz-carousel-panel--inactive{
  pointer-events: none;
}

/* Centred content wrapper inside each panel — keeps rows readable on tablet/fold
   without losing full-width swipe area. */
.gz-panel-inner{
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

/* Header */
.gz-header{
  position: relative;
  overflow: hidden;
  width: 100%;
  margin: 0 auto 10px auto;
  max-width: none !important;
  padding: 10px 12px;
  flex: 0 0 auto;
}

/* Container */
.gz-container{
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
}

.gz-list{
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gz-dayblock{
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gz-dayheader{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 2px 6px;
  font-size: var(--size-heading-md);
  color: rgba(255, 255, 255, 0.85);
  font-weight: 600;
}

.gz-dayheader-date{
  opacity: 0.95;
}

/* Mid grid: team names + goals */
.gz-mid{
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr 38px;
  grid-template-rows: auto auto;
  column-gap: 10px;
  row-gap: 6px;
  align-items: center;
}

.gz-row{
  display: grid;
  grid-template-columns:
    clamp(50px, 6vw, 80px)
    0.75fr
    0.25fr
    auto;
  gap: 8px;
  align-items: center;

  padding: 4px 14px;

  border-radius: var(--radius-item);
  border: 1px solid rgba(255, 255, 255, 0.10);

  background: rgba(255, 255, 255, 0.05);
  box-shadow: var(--shadow-item);

  cursor: pointer;
  user-select: none;
}

.gz-row:hover{
  background: rgba(255, 255, 255, 0.20);
  transform: translateY(-1px);
}

.gz-time{
  font-weight: 900;
  font-size: clamp(16px, 1.5vw, 22px);
  color: var(--color-secondary);
  text-align: left;
}

.gz-teamline{
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.gz-logo{
  height: clamp(24px, 3vw, 36px);
  width:  clamp(24px, 3vw, 36px);
  border-radius: var(--radius-small);
  padding: 4px;
}

.gz-teamname{
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  font-weight: 750;
  font-size: clamp(16px, 1.5vw, 22px);
  color: rgba(255, 255, 255, 0.92);

  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.gz-goal{
  text-align: right;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  font-size: clamp(16px, 1.5vw, 22px);
  color: rgba(255, 255, 255, 0.92);
  line-height: 1.2;
}

.gz-status{
  justify-self: end;
  font-weight: 800;
  font-size: var(--size-heading-sm);
  color: var(--color-muted);
  text-align: right;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  line-height: 1.1;
}

.gz-filter-row{
  display: flex;
  justify-content: center;
  gap: 8px;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid var(--color-surface-divider);
}

.gz-empty{
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--color-muted);
  font-size: clamp(13px, 1.3vw, 16px);
  text-align: center;
}

.gz-empty-link{
  color: var(--color-primary);
  text-decoration: underline;
}
.gz-empty-link:hover{ opacity: 0.8; }

/* Narrow phones / folded foldables (~280–380px) */
@media (max-width: 380px){
  .gz-row{
    grid-template-columns: 40px 1fr auto;
    gap: 8px;
  }

  .gz-status{
    font-size: 10px;
  }

  .gz-logo{
    height: 16px;
    width: 16px;
  }

  .gz-teamname{
    font-size: 12px;
    letter-spacing: 0.2px;
  }

  .gz-goal{
    width: 28px;
    font-size: 12px;
  }
}

/* Tablet / unfolded foldable (≥768px) — more padding, slightly wider content */
@media (min-width: 768px){
  .gz-root{
    padding: 14px 14px 22px 14px;
  }

  .gz-panel-inner{
    max-width: 760px;
  }

  .gz-header{
    padding: 10px 16px;
  }

  .gz-container{
    padding: 14px 16px;
  }
}
`;
