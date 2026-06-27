import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useDrag } from "@use-gesture/react";
import { LuArrowLeft, LuCalendarDays, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";

import {
  getMonday,
  getMatchLink,
  loadFavouriteTeams,
  isGameForFavouriteTeam,
} from "../Util";
import { themeCSS } from "../theme";
import { ToggleButton } from "../components/ui/Buttons";
import { Spinner } from "../components/ui/Spinner";
import { TopProgressBar } from "../components/ui/TopProgressBar";
import { useWeekData } from "../hooks/useWeekData";
import { useLazyAvailability } from "../hooks/useWeekAvailability";
import { useGoBack } from "../hooks/useGoBack";
import { isLiveMatch } from "../hooks/useHeroMatches";

moment.locale("fi");

const HERO = "/games_hero.webp";

// Robust date parse — the feed uses "YYYY-MM-DD HH:mm" (space, not T). Safari/
// iOS rejects that via native Date, yielding "Invalid Date". ISO-ify the space
// and parse strictly so it works on every platform.
const mdate = (s) => moment(String(s || "").replace(" ", "T"), moment.ISO_8601);

const goToSite = (uri) => {
  window.location.href = uri;
};

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
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
  const goBack = useGoBack("/");

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

  const { request: requestAvailability, getCount: getWeekCount } = useLazyAvailability(includeAway);

  // A long, freely-scrollable range of weeks (~1 year back, ~2 forward). The
  // strip lazy-loads availability for visible weeks; this list itself is static.
  const allWeeks = useMemo(() => {
    const start = getMonday(new Date());
    start.setDate(start.getDate() - 52 * 7);
    const list = [];
    for (let i = 0; i < 157; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i * 7);
      list.push({ monday: d, key: moment(d).format("YYYY-MM-DD") });
    }
    return list;
  }, []);
  const selectedKey = useMemo(
    () => moment(getMonday(new Date(curDate))).format("YYYY-MM-DD"),
    [curDate]
  );

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

  // Jump straight to a specific week (VK strip chip). Direct navigation (no
  // slide) since jumps can span many weeks.
  const goToWeek = useCallback(
    (mondayStr) => {
      if (!mondayStr || mondayStr === selectedKey) return;
      const params = [];
      if (includeAway) params.push("includeAway=1");
      if (showOptions) params.push("options=1");
      const qs = params.length ? "?" + params.join("&") : "";
      navigate(`/gamezone/${mondayStr}${qs}`, { replace: true });
    },
    [navigate, includeAway, showOptions, selectedKey]
  );

  // Calendar: native date picker → jump to that date's week.
  const dateInputRef = useRef(null);
  const openPicker = useCallback(() => {
    const el = dateInputRef.current;
    if (!el) return;
    if (el.showPicker) {
      try { el.showPicker(); return; } catch {}
    }
    el.focus();
  }, []);
  const onPickDate = useCallback(
    (e) => {
      const v = e.target.value;
      if (!v) return;
      const params = [];
      if (includeAway) params.push("includeAway=1");
      if (showOptions) params.push("options=1");
      const qs = params.length ? "?" + params.join("&") : "";
      navigate(`/gamezone/${v}${qs}`, { replace: true });
    },
    [includeAway, showOptions, navigate]
  );

  // Swipe gesture (unchanged): writes transform directly to the DOM during
  // active drag so there are no React re-renders per frame.
  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx], cancel, first, xy: [x] }) => {
      if (animatingRef.current) {
        cancel();
        return;
      }

      const track = trackRef.current;
      if (!track) return;

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

  const title = useMemo(
    () => computeWeekTitle(curDate, includeAway, onlyHome),
    [curDate, includeAway, onlyHome]
  );

  const listProps = {
    showOptions,
    onlyHome,
    onlyFavourites,
    favouriteTeams,
  };

  return (
    <div className="gz-root">
      <style>{css}</style>

      {/* ===== Fixed top chrome: hero + title + filters + week strip ===== */}
      <div className="gz-top">
        <img className="gz-top-img" src={HERO} alt="" />
        <div className="gz-top-scrim" />
        <div className="gz-top-content">
          <div className="gz-top-bar">
            <button className="gz-icon-btn" onClick={goBack} aria-label="Takaisin">
              <LuArrowLeft aria-hidden="true" />
            </button>
            <div className="gz-top-title">{title}</div>
            <button className="gz-icon-btn" onClick={openPicker} aria-label="Valitse päivä">
              <LuCalendarDays aria-hidden="true" />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className="gz-date-input"
              onChange={onPickDate}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

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

          <WeekStrip
            weeks={allWeeks}
            selectedKey={selectedKey}
            onSelect={goToWeek}
            getCount={getWeekCount}
            request={requestAvailability}
          />
        </div>
      </div>

      {/* ===== Swipeable match-list carousel ===== */}
      <div className="gz-carousel-viewport">
        <div className="gz-carousel-track" ref={trackRef} {...bind()}>
          <WeekList {...listProps} weekDate={prevDate} matches={prevMatches} isCurrent={false} />
          <WeekList
            {...listProps}
            weekDate={curDate}
            matches={curMatches}
            isCurrent={true}
            loading={loading}
            bgFetching={bgFetching}
          />
          <WeekList {...listProps} weekDate={nextDate} matches={nextMatches} isCurrent={false} />
        </div>
      </div>
    </div>
  );
};

export default Gamezone;

/* ============================= */
/*          WEEK STRIP           */
/* ============================= */

function WeekStrip({ weeks, selectedKey, onSelect, getCount, request }) {
  const scrollRef = useRef(null);
  const selRef = useRef(null);
  const firstCenter = useRef(true);

  // Centre the selected chip. First time = instant jump (it can be ~1y in);
  // later = smooth when the selected week changes (chip tap / list swipe).
  useEffect(() => {
    const el = selRef.current;
    const cont = scrollRef.current;
    if (!el || !cont) return;
    const left = el.offsetLeft - (cont.clientWidth - el.clientWidth) / 2;
    cont.scrollTo({ left, behavior: firstCenter.current ? "auto" : "smooth" });
    firstCenter.current = false;
  }, [selectedKey]);

  // Lazy-load availability for chips as they scroll into view (debounced in
  // the hook). rootMargin pre-requests a little ahead of the viewport.
  useEffect(() => {
    const cont = scrollRef.current;
    if (!cont || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) request(e.target.dataset.key);
        });
      },
      { root: cont, rootMargin: "0px 260px", threshold: 0.01 }
    );
    cont.querySelectorAll("[data-key]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [request, weeks]);

  const scrollByChip = (dir) => {
    const cont = scrollRef.current;
    if (!cont) return;
    const chip = cont.querySelector("[data-key]");
    const step = chip ? chip.clientWidth + 8 : 100;
    cont.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <div className="gz-weekstrip">
      <button className="gz-week-arrow" onClick={() => scrollByChip(-1)} aria-label="Edellinen viikko">
        <LuChevronLeft aria-hidden="true" />
      </button>

      <div className="gz-week-scroll" ref={scrollRef}>
        {weeks.map((w) => {
          const sel = w.key === selectedKey;
          const wk = moment(w.monday).isoWeek();
          const hasGames = getCount(w.key) > 0;
          return (
            <button
              key={w.key}
              data-key={w.key}
              ref={sel ? selRef : null}
              className={`gz-week-chip${sel ? " gz-week-chip--sel" : ""}`}
              onClick={() => onSelect(w.key)}
            >
              <span className="gz-week-num">VK {wk}</span>
              <span className="gz-week-range">{computeWeekRange(w.monday)}</span>
              <span className={`gz-week-dot${hasGames ? " gz-week-dot--games" : ""}`} />
            </button>
          );
        })}
      </div>

      <button className="gz-week-arrow" onClick={() => scrollByChip(1)} aria-label="Seuraava viikko">
        <LuChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}

/* ============================= */
/*           WEEK LIST           */
/* ============================= */

function WeekList({
  weekDate,
  matches,
  showOptions,
  onlyHome,
  onlyFavourites,
  favouriteTeams,
  isCurrent,
  loading,
  bgFetching,
}) {
  // Reset scroll to top whenever the panel's week changes (after a swipe).
  const containerRef = useRef(null);
  const weekDateMs = weekDate.getTime();
  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [weekDateMs]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const m of matches) {
      const md = mdate(m.date);
      const key = md.isValid() ? md.format("YYYY-MM-DD") : String(m.date || "").slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    const days = Array.from(map.keys()).sort((a, b) => (a < b ? -1 : 1));
    for (const day of days) {
      map.get(day).sort((a, b) => mdate(a.date).valueOf() - mdate(b.date).valueOf());
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
        .map((g) => ({ ...g, items: g.items.filter((m) => isGameForFavouriteTeam(m, favouriteTeams)) }))
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
          key={m.id ?? `${g.day}-${idx}`}
          match={m}
          onClick={() => goToSite(getMatchLink(idx, m))}
        />
      ))}
    </div>
  );

  const showSpinner = isCurrent && loading;

  return (
    <div className={`gz-carousel-panel ${isCurrent ? "" : "gz-carousel-panel--inactive"}`}>
      <div className="gz-panel-inner">
        {isCurrent && <TopProgressBar visible={bgFetching && !loading} />}

        <div ref={containerRef} className="gz-container">
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

          {!showSpinner && !(onlyFavourites || onlyHome) && visibleGroups.length === 0 && (
            <div className="gz-empty"><span>Ei pelejä tällä viikolla.</span></div>
          )}

          {!showSpinner && visibleGroups.length > 0 && (
            <div className="gz-list">{visibleGroups.map(renderDayBlock)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================= */
/*           ROW UI              */
/* ============================= */

function MatchRow({ match, onClick }) {
  const md = mdate(match.date);
  const timeStr = md.isValid() ? md.format("HH:mm") : "";
  const level = simplifyLevel(match.level ?? "");

  const finishedType = Number(match.finished);
  const isLive = isLiveMatch(match);
  const isFinished = finishedType > 0;

  const homeGoals = isLive || isFinished ? match.home_goals ?? "" : "";
  const awayGoals = isLive || isFinished ? match.away_goals ?? "" : "";

  const hg = parseInt(match.home_goals, 10);
  const ag = parseInt(match.away_goals, 10);
  const hasResult = isFinished && !isNaN(hg) && !isNaN(ag);

  const resultColor = (() => {
    if (!hasResult) return null;
    const ahmaGoals = match.isHomeGame ? hg : ag;
    const oppGoals  = match.isHomeGame ? ag : hg;
    if (ahmaGoals > oppGoals) return "#22c55e";
    if (ahmaGoals < oppGoals) return "#ef4444";
    return "#e8e8e8";
  })();

  const ahmaIsHome = match.isHomeGame === true;
  const ahmaIsAway = match.isHomeGame === false;
  const homeIsWinner = hasResult && hg > ag;
  const awayIsWinner = hasResult && ag > hg;
  const homeIsLoser  = hasResult && hg < ag;
  const awayIsLoser  = hasResult && ag < hg;

  const mutedColor = "rgba(255, 255, 255, 0.4)";

  const homeScoreStyle = (() => {
    if (isLive) return { color: "#f97316" };
    if (!hasResult || hg === ag) return undefined;
    if (homeIsWinner) return { color: ahmaIsHome ? "#22c55e" : "#ef4444" };
    return { color: mutedColor };
  })();
  const awayScoreStyle = (() => {
    if (isLive) return { color: "#f97316" };
    if (!hasResult || hg === ag) return undefined;
    if (awayIsWinner) return { color: ahmaIsAway ? "#22c55e" : "#ef4444" };
    return { color: mutedColor };
  })();

  const homeNameStyle = (homeIsLoser && !isLive) ? { color: mutedColor } : undefined;
  const awayNameStyle = (awayIsLoser && !isLive) ? { color: mutedColor } : undefined;

  const venueLabel = match.isHomeGame === true ? "Koti"
                   : match.isHomeGame === false ? "Vieras"
                   : null;
  const rink = match.rink || "";

  // Left indicator line only when there's something to show: live (orange) or
  // a finished result (green win / red loss / grey draw). Plain upcoming = none.
  const lineColor = resultColor || (isLive ? "#f97316" : null);
  const rowStyle = lineColor ? { "--gz-result-color": lineColor } : undefined;

  return (
    <div
      className="gz-row"
      onClick={onClick}
      role="button"
      tabIndex={0}
      style={rowStyle}
    >
      <div className="gz-row-top">
        {isLive && (
          <div className="gz-live">
            <span className="gz-live-dot" aria-hidden="true" />
            <span>LIVE</span>
          </div>
        )}
        <div className="gz-time">
          <span className="material-symbols-rounded gz-time-icon">&#xE8B5;</span>
          <span>{timeStr}</span>
        </div>
        {level && <div className="gz-level-badge">{level}</div>}
        {(venueLabel || rink) && (
          <div className="gz-location">
            <span className="material-symbols-rounded gz-location-icon">&#xE0C8;</span>
            <span className="gz-location-text">
              {rink}
              {rink && venueLabel && " • "}
              {venueLabel}
            </span>
          </div>
        )}
      </div>

      <div className="gz-row-body">
        <div className="gz-team-row gz-team-row--home">
          <img className="gz-team-logo ui-team-logo" src={match.home_logo} alt="" />
          <span className="gz-team-name" style={homeNameStyle}>{match.home}</span>
        </div>
        <div className="gz-team-divider" />
        <div className="gz-team-row gz-team-row--away">
          <img className="gz-team-logo ui-team-logo" src={match.away_logo} alt="" />
          <span className="gz-team-name" style={awayNameStyle}>{match.away}</span>
        </div>
        <div className="gz-row-separator" />
        <div className="gz-team-score gz-team-score--home" style={homeScoreStyle}>{homeGoals}</div>
        <div className="gz-team-score gz-team-score--away" style={awayScoreStyle}>{awayGoals}</div>
      </div>
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
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  touch-action: pan-y;
  overflow: hidden;
  background: var(--color-bg);
  font-family: var(--font-family-base);
}

.material-symbols-rounded {
  font-size: 34px;
  line-height: 1;
}

/* ===== TOP CHROME (hero bg behind title + filters + week strip) ===== */
.gz-top{
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
}
.gz-top-img{
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover; object-position: center;
}
.gz-top-scrim{
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(8,10,15,0.45) 0%, rgba(8,10,15,0.25) 35%, rgba(8,10,15,0.7) 80%, var(--color-bg) 100%);
}
.gz-top-content{
  position: relative; z-index: 1;
  display: flex; flex-direction: column;
  gap: 12px;
  padding: calc(env(safe-area-inset-top) + 10px) 12px 12px;
}

.gz-top-bar{
  display: flex; align-items: center; gap: 10px;
  position: relative;
}
.gz-top-title{
  flex: 1 1 auto;
  text-align: center;
  font-size: clamp(18px, 5.2vw, 24px);
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0,0,0,0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gz-icon-btn{
  flex: 0 0 auto;
  width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgba(0,0,0,0.38);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  border: none; color: #fff; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.gz-icon-btn svg{ width: 22px; height: 22px; }
/* Hidden native date input anchored to the calendar button. */
.gz-date-input{
  position: absolute; right: 0; top: 40px;
  width: 1px; height: 1px; opacity: 0; pointer-events: none;
  border: 0; padding: 0; margin: 0;
}

.gz-filter-row{
  display: flex;
  justify-content: center;
  gap: 8px;
}

/* ===== WEEK STRIP ===== */
.gz-weekstrip{
  display: flex;
  align-items: stretch;
  gap: 6px;
}
.gz-week-arrow{
  flex: 0 0 auto;
  width: 30px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; color: rgba(255,255,255,0.7);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.gz-week-arrow svg{ width: 22px; height: 22px; }
.gz-week-scroll{
  flex: 1 1 auto;
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 2px 6px;
  /* Fade partial chips at the edges so they don't hard-clip mid-card. */
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%);
}
.gz-week-scroll::-webkit-scrollbar{ display: none; }
.gz-week-chip{
  flex: 0 0 auto;
  width: 92px;
  display: flex; flex-direction: column; align-items: center;
  gap: 4px;
  padding: 8px 6px 7px;
  border-radius: 14px;
  background: rgba(20,22,26,0.6);
  border: 1.5px solid rgba(255,255,255,0.12);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.15s, background 0.15s;
}
.gz-week-chip--sel{
  border-color: var(--color-primary);
  background: rgba(245,158,11,0.10);
}
.gz-week-num{
  font-size: 15px; font-weight: 800;
  letter-spacing: 0.02em;
  color: rgba(255,255,255,0.85);
}
.gz-week-chip--sel .gz-week-num{ color: var(--color-primary); }
.gz-week-range{
  font-size: 11px;
  color: var(--gz-text-tertiary);
  white-space: nowrap;
}
.gz-week-dot{
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(255,255,255,0.28);
  margin-top: 1px;
}
.gz-week-dot--games{ background: var(--color-primary); }

/* ===== CAROUSEL ===== */
.gz-carousel-viewport{
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}
.gz-carousel-track{
  display: flex;
  flex-direction: row;
  width: 300%;
  flex: 1 1 auto;
  min-height: 0;
  will-change: transform;
  touch-action: pan-y;
}
.gz-carousel-panel{
  flex: 0 0 33.3333%;
  box-sizing: border-box;
  padding: 0 6px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.gz-carousel-panel--inactive{
  pointer-events: none;
}
.gz-panel-inner{
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.gz-container{
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.gz-list{
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: calc(var(--ui-bottom-nav-clearance, 80px) + 28px);
}

.gz-dayblock{
  display: flex;
  flex-direction: column;
}

.gz-dayheader{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 2px 6px;
  font-size: var(--gz-fs-lg);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  color: var(--gz-text-primary);
  text-transform: uppercase;
}

.gz-dayheader-date{
  opacity: 0.95;
}

/* Flat match rows — no card. Divider between games, optional coloured left
   line for indication (live / result). */
.gz-row{
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 8px 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  user-select: none;
}
.gz-row:last-child{ border-bottom: none; }

.gz-row::before{
  content: "";
  position: absolute;
  left: 0; top: 12px; bottom: 12px;
  width: 4px;
  border-radius: 2px;
  background: linear-gradient(
    180deg,
    var(--gz-result-color, transparent) 0%,
    color-mix(in srgb, var(--gz-result-color, transparent) 55%, transparent) 100%
  );
  pointer-events: none;
}

.gz-row:hover{
  background: rgba(255, 255, 255, 0.03);
}

.gz-row-top{
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.gz-time{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--gz-fs-md);
  font-weight: var(--gz-fw-bold);
  color: var(--gz-text-primary);
  flex-shrink: 0;
  line-height: 1;
}

.gz-live{
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-right: 4px;
  font-size: var(--gz-fs-xs);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  color: #ef4444;
  flex-shrink: 0;
  line-height: 1;
}

.gz-live-dot{
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
  animation: gz-live-pulse 1.6s ease-in-out infinite;
}

@keyframes gz-live-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
  70%  { box-shadow: 0 0 0 7px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

.gz-time-icon{
  font-size: 16px;
  line-height: 1;
  color: var(--gz-text-primary);
  font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
}

.gz-level-badge{
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  font-size: var(--gz-fs-xs);
  font-weight: var(--gz-fw-medium);
  color: var(--gz-text-primary);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  flex-shrink: 0;
  line-height: 1.3;
  white-space: nowrap;
}

.gz-location{
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--gz-fs-xs);
  font-weight: var(--gz-fw-regular);
  letter-spacing: var(--gz-ls-wide);
  color: var(--gz-text-muted);
  min-width: 0;
}

.gz-location-icon{
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.gz-location-text{
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.gz-row-body{
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  grid-template-rows: auto auto auto;
  column-gap: 18px;
  row-gap: 10px;
  align-items: center;
}

.gz-team-row{
  grid-column: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.gz-team-row--home{ grid-row: 1; }
.gz-team-row--away{ grid-row: 3; }

.gz-team-divider{
  grid-row: 2;
  grid-column: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}

.gz-team-logo{
  width: 38px;
  height: 38px;
  border-radius: 8px;
  flex-shrink: 0;
  background: white;
  object-fit: contain;
  padding: 3px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
}

.gz-team-name{
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--gz-fs-md);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  color: var(--gz-text-primary);
  text-transform: uppercase;
}

.gz-row-separator{
  grid-column: 2;
  grid-row: 1 / 4;
  width: 2px;
  background: var(--gz-result-color, rgba(255, 255, 255, 0.22));
  align-self: stretch;
  border-radius: 1px;
  margin: -4px 0;
}

.gz-team-score{
  grid-column: 3;
  font-size: var(--gz-fs-score);
  font-weight: var(--gz-fw-black);
  font-variant-numeric: tabular-nums;
  color: var(--gz-text-primary);
  min-width: 32px;
  text-align: center;
  line-height: 1;
}

.gz-team-score--home{ grid-row: 1; }
.gz-team-score--away{ grid-row: 3; }

.gz-empty{
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-muted);
  text-align: center;
}

.gz-empty-link{
  color: var(--color-primary);
  text-decoration: underline;
}
.gz-empty-link:hover{ opacity: 0.8; }

/* Narrow phones */
@media (max-width: 380px){
  .gz-row{ padding: 12px 6px 12px 16px; gap: 10px; }
  .gz-time{ font-size: 14px; }
  .gz-team-logo{ width: 32px; height: 32px; }
  .gz-team-name{ font-size: 14px; }
  .gz-team-score{ font-size: 22px; min-width: 24px; }
  .gz-location{ font-size: 11px; }
  .gz-week-chip{ width: 84px; }
}

/* Tablet */
@media (min-width: 768px){
  .gz-panel-inner{ max-width: 760px; }
  .gz-container{ padding: 14px 16px; }
}
`;
