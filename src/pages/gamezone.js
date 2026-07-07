import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useDrag } from "@use-gesture/react";
import { LuArrowLeft, LuCalendarDays, LuChevronLeft, LuChevronRight, LuClock, LuMapPin } from "react-icons/lu";
import { Box, Typography, GlobalStyles } from "@mui/material";
import moment from "moment";
import "moment/locale/fi";

import {
  getMonday,
  loadFavouriteTeams,
} from "../Util";
import { isGameForAnyFavourite } from "../lib/teamMatch";
import { ToggleButton } from "../components/ui/Buttons";
import { Spinner } from "../components/ui/Spinner";
import { TopProgressBar } from "../components/ui/TopProgressBar";
import { useWeekData } from "../hooks/useWeekData";
import { useLazyAvailability } from "../hooks/useWeekAvailability";
import { useGoBack } from "../hooks/useGoBack";
import { isLiveMatch } from "../hooks/useHeroMatches";
import { getCachedUser, getMe } from "../auth/authClient";

moment.locale("fi");

const HERO = "/games_hero.webp";

// Result / state colours mapped to the index.css tokens (no hardcoded brand hex).
const WIN = "var(--color-win)";
const LOSS = "var(--color-loss)";
const DRAW = "var(--color-draw)";
const LIVE = "var(--color-primary)";
const MUTED = "rgba(255, 255, 255, 0.4)";

// Robust date parse — the feed uses "YYYY-MM-DD HH:mm" (space, not T). Safari/
// iOS rejects that via native Date, yielding "Invalid Date". ISO-ify the space
// and parse strictly so it works on every platform.
const mdate = (s) => moment(String(s || "").replace(" ", "T"), moment.ISO_8601);

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

// One-off style objects reused across rows/chips.
const iconBtnSx = {
  flex: "0 0 auto",
  width: 40,
  height: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  background: "rgba(0,0,0,0.38)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  border: "none",
  color: "#fff",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
  "& svg": { width: 22, height: 22 },
};

const weekArrowSx = {
  flex: "0 0 auto",
  width: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.7)",
  cursor: "pointer",
  p: 0,
  WebkitTapHighlightColor: "transparent",
  "& svg": { width: 22, height: 22 },
};

const teamLogoSx = {
  width: 38,
  height: 38,
  borderRadius: "8px",
  flexShrink: 0,
  background: "white",
  objectFit: "contain",
  padding: "3px",
  boxShadow: "0 4px 10px rgba(0,0,0,0.35)",
  "@media (max-width:380px)": { width: 32, height: 32 },
};

const teamNameSx = {
  flex: "1 1 auto",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "var(--gz-fs-md)",
  fontWeight: "var(--gz-fw-bold)",
  letterSpacing: "var(--gz-ls-wide)",
  color: "var(--gz-text-primary)",
  textTransform: "uppercase",
  "@media (max-width:380px)": { fontSize: 14 },
};

const scoreSx = {
  fontSize: "var(--gz-fs-score)",
  fontWeight: "var(--gz-fw-black)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--gz-text-primary)",
  minWidth: 32,
  textAlign: "center",
  lineHeight: 1,
  "@media (max-width:380px)": { fontSize: 22, minWidth: 24 },
};

// Global keyframes + page background. Kept global (not per-element sx) so the
// html/body background prevents a white overscroll flash behind the 100dvh
// fixed carousel, and the pulse animations are referenced by name below.
const globalStyles = (
  <GlobalStyles
    styles={{
      "html, body, #root": { margin: 0, minHeight: "100%", background: "var(--color-bg)" },
      "@keyframes gzDotPulse": {
        "0%, 100%": { opacity: 0.25, transform: "scale(0.8)" },
        "50%": { opacity: 0.95, transform: "scale(1.2)" },
      },
      "@keyframes gzLivePulse": {
        "0%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.55)" },
        "70%": { boxShadow: "0 0 0 7px rgba(239,68,68,0)" },
        "100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0)" },
      },
    }}
  />
);

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
  // Auth: favourites are account-bound + hidden from signed-out users, so the
  // "Suosikit" filter only appears when logged in. getMe mirrors the account's
  // favourites into localStorage (or clears them on logout) → reload after.
  const [user, setUser] = useState(getCachedUser);
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => { if (!cancelled) { setUser(u); setFavouriteTeams(loadFavouriteTeams()); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  const { request: requestAvailability, getCount: getWeekCount, isPending: isWeekPending } = useLazyAvailability(includeAway);

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
    // Favourites are hidden from signed-out users → filter/empty-state off.
    onlyFavourites: !!user && onlyFavourites,
    favouriteTeams,
  };

  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", touchAction: "pan-y", overflow: "hidden", bgcolor: "var(--color-bg)", fontFamily: "var(--font-family-base)" }}>
      {globalStyles}

      {/* ===== Fixed top chrome: hero + title + filters + week strip ===== */}
      <Box sx={{ position: "relative", flex: "0 0 auto", overflow: "hidden" }}>
        <Box component="img" src={HERO} alt="" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
        <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,10,15,0.45) 0%, rgba(8,10,15,0.25) 35%, rgba(8,10,15,0.7) 80%, var(--color-bg) 100%)" }} />
        <Box sx={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 1.5, padding: "calc(env(safe-area-inset-top) + 10px) 12px 12px" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, position: "relative" }}>
            <Box component="button" onClick={goBack} aria-label="Takaisin" sx={iconBtnSx}>
              <LuArrowLeft aria-hidden="true" />
            </Box>
            <Typography component="div" sx={{ flex: "1 1 auto", textAlign: "center", fontSize: "clamp(18px, 5.2vw, 24px)", fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title}
            </Typography>
            <Box component="button" onClick={openPicker} aria-label="Valitse päivä" sx={iconBtnSx}>
              <LuCalendarDays aria-hidden="true" />
            </Box>
            {/* Hidden native date input anchored to the calendar button. */}
            <Box
              component="input"
              ref={dateInputRef}
              type="date"
              onChange={onPickDate}
              aria-hidden="true"
              tabIndex={-1}
              sx={{ position: "absolute", right: 0, top: 40, width: "1px", height: "1px", opacity: 0, pointerEvents: "none", border: 0, p: 0, m: 0 }}
            />
          </Box>

          {showOptions && (
            <Box sx={{ display: "flex", justifyContent: "center", gap: 1 }}>
              <ToggleButton onClick={onToggleHome} active={onlyHome} icon="&#xE88A;">
                Kotipelit
              </ToggleButton>
              {user && (
                <ToggleButton onClick={onToggleFavourites} active={onlyFavourites} icon="&#xE838;">
                  Suosikit
                </ToggleButton>
              )}
            </Box>
          )}

          <WeekStrip
            weeks={allWeeks}
            selectedKey={selectedKey}
            onSelect={goToWeek}
            getCount={getWeekCount}
            request={requestAvailability}
            isPending={isWeekPending}
          />
        </Box>
      </Box>

      {/* ===== Swipeable match-list carousel ===== */}
      <Box sx={{ flex: "1 1 auto", minHeight: 0, width: "100%", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column" }}>
        <Box ref={trackRef} {...bind()} sx={{ display: "flex", flexDirection: "row", width: "300%", flex: "1 1 auto", minHeight: 0, willChange: "transform", touchAction: "pan-y" }}>
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
        </Box>
      </Box>
    </Box>
  );
};

export default Gamezone;

/* ============================= */
/*          WEEK STRIP           */
/* ============================= */

function WeekStrip({ weeks, selectedKey, onSelect, getCount, request, isPending }) {
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
    <Box sx={{ display: "flex", alignItems: "stretch", gap: "6px" }}>
      <Box component="button" onClick={() => scrollByChip(-1)} aria-label="Edellinen viikko" sx={weekArrowSx}>
        <LuChevronLeft aria-hidden="true" />
      </Box>

      <Box
        ref={scrollRef}
        sx={{
          flex: "1 1 auto",
          display: "flex",
          gap: 1,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          padding: "2px 6px",
          // Fade partial chips at the edges so they don't hard-clip mid-card.
          WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)",
          maskImage: "linear-gradient(to right, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {weeks.map((w) => {
          const sel = w.key === selectedKey;
          const wk = moment(w.monday).isoWeek();
          const count = getCount(w.key);
          const hasGames = count > 0;
          const loading = count === undefined && isPending(w.key);
          return (
            <Box
              key={w.key}
              component="button"
              data-key={w.key}
              ref={sel ? selRef : null}
              onClick={() => onSelect(w.key)}
              sx={{
                flex: "0 0 auto",
                width: 92,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                padding: "8px 6px 7px",
                borderRadius: "14px",
                background: sel ? "rgba(var(--color-primary-rgb),0.10)" : "rgba(16,18,22,0.88)",
                border: sel ? "1.5px solid var(--color-primary)" : "1.5px solid rgba(255,255,255,0.18)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                cursor: "pointer",
                fontFamily: "inherit",
                WebkitTapHighlightColor: "transparent",
                transition: "border-color 0.15s, background 0.15s",
                "@media (max-width:380px)": { width: 84 },
              }}
            >
              <Box component="span" sx={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.02em", color: sel ? "var(--color-primary)" : "rgba(255,255,255,0.85)" }}>
                VK {wk}
              </Box>
              <Box component="span" sx={{ fontSize: 11, color: "var(--gz-text-tertiary)", whiteSpace: "nowrap" }}>
                {computeWeekRange(w.monday)}
              </Box>
              <Box
                component="span"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: hasGames ? "var(--color-primary)" : "rgba(255,255,255,0.28)",
                  mt: "1px",
                  ...(loading ? { animation: "gzDotPulse 0.9s ease-in-out infinite" } : {}),
                }}
              />
            </Box>
          );
        })}
      </Box>

      <Box component="button" onClick={() => scrollByChip(1)} aria-label="Seuraava viikko" sx={weekArrowSx}>
        <LuChevronRight aria-hidden="true" />
      </Box>
    </Box>
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
        .map((g) => ({ ...g, items: g.items.filter((m) => isGameForAnyFavourite(m, favouriteTeams)) }))
        .filter((g) => g.items.length > 0);
    }
    return result;
  }, [groups, showOptions, onlyHome, onlyFavourites, favouriteTeams]);

  const renderDayBlock = (g) => (
    <Box key={g.day} sx={{ display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, padding: "6px 6px 2px 6px", fontSize: "var(--gz-fs-lg)", fontWeight: "var(--gz-fw-bold)", letterSpacing: "var(--gz-ls-wide)", color: "var(--gz-text-primary)", textTransform: "uppercase" }}>
        <Box component="span" sx={{ opacity: 0.95 }}>
          <strong>{capitalize(moment(g.day).format("dddd"))}</strong>{" "}
          <span>{moment(g.day).format("D.M")}</span>
        </Box>
      </Box>

      {g.items.map((m, idx) => (
        <MatchRow key={m.id ?? `${g.day}-${idx}`} match={m} />
      ))}
    </Box>
  );

  const showSpinner = isCurrent && loading;

  return (
    <Box sx={{ flex: "0 0 33.3333%", boxSizing: "border-box", padding: "0 6px", minWidth: 0, display: "flex", flexDirection: "column", ...(isCurrent ? {} : { pointerEvents: "none" }) }}>
      <Box sx={{ flex: "1 1 auto", minHeight: 0, width: "100%", maxWidth: 760, mx: "auto", display: "flex", flexDirection: "column" }}>
        {isCurrent && <TopProgressBar visible={bgFetching && !loading} />}

        <Box
          ref={containerRef}
          sx={{
            flex: "1 1 auto",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            padding: "12px",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            "@media (min-width:768px)": { padding: "14px 16px" },
          }}
        >
          {showSpinner && <Spinner text="Ladataan otteluita..." />}

          {!showSpinner && (onlyFavourites || onlyHome) && visibleGroups.length === 0 && (
            <EmptyState>
              {onlyFavourites && favouriteTeams.length === 0 ? (
                <>
                  <span>Ei suosikkijoukkueita. </span>
                  <Box component={Link} to="/teams" sx={{ color: "var(--color-primary)", textDecoration: "underline", "&:hover": { opacity: 0.8 }, "&, &:visited": { color: "var(--color-primary)" } }}>
                    Lisää niitä Joukkueet-sivulta.
                  </Box>
                </>
              ) : (
                <span>Ei pelejä tällä viikolla.</span>
              )}
            </EmptyState>
          )}

          {!showSpinner && !(onlyFavourites || onlyHome) && visibleGroups.length === 0 && (
            <EmptyState><span>Ei pelejä tällä viikolla.</span></EmptyState>
          )}

          {!showSpinner && visibleGroups.length > 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "14px", pb: "calc(var(--ui-bottom-nav-clearance, 80px) + 28px)" }}>
              {visibleGroups.map(renderDayBlock)}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

const EmptyState = ({ children }) => (
  <Box sx={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px", fontSize: "var(--gz-fs-sm)", color: "var(--gz-text-muted)", textAlign: "center" }}>
    {children}
  </Box>
);

/* ============================= */
/*           ROW UI              */
/* ============================= */

function MatchRow({ match }) {
  const navigate = useNavigate();
  const md = mdate(match.date);
  const timeStr = md.isValid() ? md.format("HH:mm") : "";
  const level = simplifyLevel(match.level ?? "");

  // Tap a game → its box score. Pass the game object via state for an instant
  // paint; the page falls back to the season cache on a direct URL.
  const openGame = () => navigate(`/gamezone/game/${match.id}`, { state: { game: match } });

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
    if (ahmaGoals > oppGoals) return WIN;
    if (ahmaGoals < oppGoals) return LOSS;
    return DRAW;
  })();

  const ahmaIsHome = match.isHomeGame === true;
  const ahmaIsAway = match.isHomeGame === false;
  const homeIsWinner = hasResult && hg > ag;
  const awayIsWinner = hasResult && ag > hg;
  const homeIsLoser  = hasResult && hg < ag;
  const awayIsLoser  = hasResult && ag < hg;

  const homeScoreStyle = (() => {
    if (isLive) return { color: LIVE };
    if (!hasResult || hg === ag) return undefined;
    if (homeIsWinner) return { color: ahmaIsHome ? WIN : LOSS };
    return { color: MUTED };
  })();
  const awayScoreStyle = (() => {
    if (isLive) return { color: LIVE };
    if (!hasResult || hg === ag) return undefined;
    if (awayIsWinner) return { color: ahmaIsAway ? WIN : LOSS };
    return { color: MUTED };
  })();

  const homeNameStyle = (homeIsLoser && !isLive) ? { color: MUTED } : undefined;
  const awayNameStyle = (awayIsLoser && !isLive) ? { color: MUTED } : undefined;

  const venueLabel = match.isHomeGame === true ? "Koti"
                   : match.isHomeGame === false ? "Vieras"
                   : null;
  const rink = match.rink || "";

  // Left indicator line only when there's something to show: live (orange) or
  // a finished result (green win / red loss / grey draw). Plain upcoming = none.
  const lineColor = resultColor || (isLive ? LIVE : null);

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={openGame}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGame(); } }}
      sx={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        padding: "16px 8px 16px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        cursor: "pointer",
        "&:last-child": { borderBottom: "none" },
        ...(lineColor ? { "--gz-result-color": lineColor } : {}),
        "&::before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: "12px",
          bottom: "12px",
          width: "4px",
          borderRadius: "2px",
          background: "linear-gradient(180deg, var(--gz-result-color, transparent) 0%, color-mix(in srgb, var(--gz-result-color, transparent) 55%, transparent) 100%)",
          pointerEvents: "none",
        },
        "@media (max-width:380px)": { padding: "12px 6px 12px 16px", gap: "10px" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
        {isLive && (
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: "5px", pr: "4px", fontSize: "var(--gz-fs-xs)", fontWeight: "var(--gz-fw-bold)", letterSpacing: "var(--gz-ls-wide)", color: LOSS, flexShrink: 0, lineHeight: 1 }}>
            <Box component="span" aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: "50%", background: LOSS, boxShadow: "0 0 0 0 rgba(239,68,68,0.6)", animation: "gzLivePulse 1.6s ease-in-out infinite" }} />
            <span>LIVE</span>
          </Box>
        )}
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "var(--gz-fs-md)", fontWeight: "var(--gz-fw-bold)", color: "var(--gz-text-primary)", flexShrink: 0, lineHeight: 1, "@media (max-width:380px)": { fontSize: 14 } }}>
          <LuClock size={15} style={{ flexShrink: 0 }} />
          <span>{timeStr}</span>
        </Box>
        {level && (
          <Box sx={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "6px", fontSize: "var(--gz-fs-xs)", fontWeight: "var(--gz-fw-medium)", color: "var(--gz-text-primary)", letterSpacing: "var(--gz-ls-wide)", textTransform: "uppercase", flexShrink: 0, lineHeight: 1.3, whiteSpace: "nowrap" }}>
            {level}
          </Box>
        )}
        {(venueLabel || rink) && (
          <Box sx={{ ml: "auto", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--gz-fs-xs)", fontWeight: "var(--gz-fw-regular)", letterSpacing: "var(--gz-ls-wide)", color: "var(--gz-text-muted)", minWidth: 0 }}>
            <LuMapPin size={14} style={{ flexShrink: 0 }} />
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {rink}
              {rink && venueLabel && " • "}
              {venueLabel}
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gridTemplateRows: "auto auto auto", columnGap: "18px", rowGap: "10px", alignItems: "center" }}>
        <Box sx={{ gridColumn: 1, gridRow: 1, display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <Box component="img" src={match.home_logo} alt="" sx={teamLogoSx} />
          <Box component="span" sx={{ ...teamNameSx, ...(homeNameStyle || {}) }}>{match.home}</Box>
        </Box>
        <Box sx={{ gridColumn: 1, gridRow: 2, height: "1px", background: "rgba(255,255,255,0.08)" }} />
        <Box sx={{ gridColumn: 1, gridRow: 3, display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <Box component="img" src={match.away_logo} alt="" sx={teamLogoSx} />
          <Box component="span" sx={{ ...teamNameSx, ...(awayNameStyle || {}) }}>{match.away}</Box>
        </Box>
        <Box sx={{ gridColumn: 2, gridRow: "1 / 4", width: "2px", background: "var(--gz-result-color, rgba(255,255,255,0.22))", alignSelf: "stretch", borderRadius: "1px", my: "-4px" }} />
        <Box sx={{ gridColumn: 3, gridRow: 1, ...scoreSx, ...(homeScoreStyle || {}) }}>{homeGoals}</Box>
        <Box sx={{ gridColumn: 3, gridRow: 3, ...scoreSx, ...(awayScoreStyle || {}) }}>{awayGoals}</Box>
      </Box>
    </Box>
  );
}

function simplifyLevel(level) {
  if (!level) return "";
  const s = String(level).trim();
  const m = s.match(/^u\s*(\d{1,2})\b/i);
  if (m) return `U${m[1]}`;
  return s;
}
