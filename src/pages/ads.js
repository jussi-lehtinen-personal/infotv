import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useExportPng } from "../hooks/useExportPng";
import {
  getMockGameData,
  processIncomingDataEvents,
  buildGamesQueryUri,
  getMonday,
  splitTeamName,
} from "../Util";
import { Box, IconButton, Typography } from "@mui/material";
import { LuArrowLeft, LuChevronLeft, LuChevronRight, LuCalendar } from "react-icons/lu";
import { themeCSS, COLOR_PRIMARY } from "../theme";
import { useGoBack } from "../hooks/useGoBack";
import { Surface } from "../components/ui/Surface";
import { SelectorButton, PrimaryButton } from "../components/ui/Buttons";

import "@fontsource/bebas-neue";
import "moment/locale/fi";

var moment = require("moment");
moment.locale("fi");


/* ============================= */
/*         SWIPE HOOK            */
/* (same logic as this_week.js)  */
/* ============================= */

function useSwipe(onSwipeLeft, onSwipeRight) {
  const ref = useRef(null);
  const [offsetX, setOffsetX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef(null);
  const suppressClick = useRef(false);
  const maxAbsDx = useRef(0);
  const lastDx = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const CLICK_SUPPRESS_PX = 14;
  const LOCK_DISTANCE = 14;
  const LOCK_RATIO = 1.2;

  const getThreshold = useCallback(() => {
    const w = ref.current?.clientWidth ?? window.innerWidth ?? 1000;
    return Math.min(160, Math.max(60, w * 0.18));
  }, []);

  const onDown = useCallback((e) => {
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging.current = true;
    locked.current = null;
    startX.current = e.clientX;
    startY.current = e.clientY;
    suppressClick.current = false;
    maxAbsDx.current = 0;
    setOffsetX(0);
    lastDx.current = 0;
    setDragActive(true);
  }, []);

  const onMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (
      locked.current === null &&
      (Math.abs(dx) > LOCK_DISTANCE || Math.abs(dy) > LOCK_DISTANCE)
    ) {
      locked.current = Math.abs(dx) > Math.abs(dy) * LOCK_RATIO ? "h" : "v";
    }
    if (locked.current === "h") {
      const dx2 = e.clientX - startX.current;
      lastDx.current = dx2;
      maxAbsDx.current = Math.max(maxAbsDx.current, Math.abs(dx2));
      if (maxAbsDx.current >= CLICK_SUPPRESS_PX) suppressClick.current = true;
      e.preventDefault();
      setOffsetX(dx2);
    }
  }, []);

  const finish = useCallback(() => {
    dragging.current = false;
    locked.current = null;
    setOffsetX(0);
    setDragActive(false);
    setTimeout(() => (suppressClick.current = false), 0);
  }, []);

  const onUp = useCallback(
    (e) => {
      if (!dragging.current) return;
      const dx = lastDx.current;
      const threshold = getThreshold();
      if (locked.current === "h" && Math.abs(dx) >= threshold) {
        if (dx < 0) onSwipeLeft();
        else onSwipeRight();
      }
      finish();
    },
    [onSwipeLeft, onSwipeRight, getThreshold, finish]
  );

  const onCancel = useCallback(() => finish(), [finish]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("pointermove", onMove, { passive: false });
    return () => el.removeEventListener("pointermove", onMove);
  }, [onMove]);

  useEffect(() => {
    if (!dragActive) return;
    const end = (e) => {
      if (!dragging.current) return;
      const el = ref.current;
      if (el && e?.target && el.contains(e.target)) return;
      finish();
    };
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("blur", end, true);
    return () => {
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("blur", end, true);
    };
  }, [dragActive, finish]);

  const onClickCapture = useCallback((e) => {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  }, []);

  return {
    ref,
    offsetX,
    handlers: { onPointerDown: onDown, onPointerUp: onUp, onPointerCancel: onCancel, onClickCapture },
  };
}

/* ============================= */
/*           PAGE                */
/* ============================= */

const AD_SIZE = 1080;

// Shared sx for the top-bar icon buttons (back / week nav / calendar).
const navBtnSx = { color: "text.secondary", "&:hover": { color: "primary.main" } };

const BACKGROUNDS = [
  null, // flat dark (concept look)
  "/background.jpg",
  "/background3.jpg",
  "/background6.jpg",
];

const Ads = () => {
  const exportRef = useRef(null);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const { timestamp } = useParams();

  const [matches, setMatches] = useState([]);
  const [teamsMap, setTeamsMap] = useState(new Map()); // "levelId|statGroupId" → teamKey
  const [scale, setScale] = useState(1);
  const [bgIndex, setBgIndex] = useState(0);
  const [customBg, setCustomBg] = useState(null);
  const customBgUrlRef = useRef(null);
  const customBgInputRef = useRef(null);
  // Tracks the actual rendered height of the canvas (grows with content)
  const [canvasHeight, setCanvasHeight] = useState(AD_SIZE);

  // Scale canvas width to fit wrapper
  useEffect(() => {
    const update = () => {
      if (wrapperRef.current) {
        setScale(wrapperRef.current.offsetWidth / AD_SIZE);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Track canvas height via ResizeObserver so the display wrapper stays correct
  useEffect(() => {
    const el = exportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setCanvasHeight(entries[0]?.contentRect.height ?? AD_SIZE);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch teams once — build levelId|statGroupId → teamKey lookup
  useEffect(() => {
    fetch("/api/getTeams")
      .then((r) => r.json())
      .then((teams) => {
        const map = new Map();
        for (const team of teams) {
          for (const g of team.levelGroups) {
            map.set(`${g.levelId}|${g.statGroupId}`, team.teamKey);
          }
        }
        setTeamsMap(map);
      })
      .catch(() => {}); // silently ignore — teamsMap stays empty, names fall back to match.home
  }, []);

  // Fetch home games for the week (no includeAway → home only)
  useEffect(() => {
    const controller = new AbortController();
    const uri = buildGamesQueryUri(timestamp);
    fetch(uri, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setMatches(processIncomingDataEvents(d)))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setMatches(processIncomingDataEvents(getMockGameData()));
      });
    return () => controller.abort();
  }, [timestamp]);

  // Revoke Object URL on unmount
  useEffect(() => () => {
    if (customBgUrlRef.current) URL.revokeObjectURL(customBgUrlRef.current);
  }, []);

  const CUSTOM_IDX = BACKGROUNDS.length;
  const activeBackground = bgIndex === CUSTOM_IDX && customBg ? customBg : BACKGROUNDS[bgIndex];

  const handleCustomBgFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (customBgUrlRef.current) URL.revokeObjectURL(customBgUrlRef.current);
    const url = URL.createObjectURL(file);
    customBgUrlRef.current = url;
    setCustomBg(url);
    setBgIndex(CUSTOM_IDX);
    e.target.value = "";
  }, [CUSTOM_IDX]);

  // Effective timestamp for game ad links (use param if present, else current Monday)
  const effectiveTimestamp = useMemo(() => {
    if (timestamp) return timestamp;
    return moment(getMonday(new Date())).format("YYYY-MM-DD");
  }, [timestamp]);

  // Navigate to a specific game ad
  const onGameClick = useCallback(
    (idx) => navigate(`/ads/${effectiveTimestamp}/${idx}`),
    [navigate, effectiveTimestamp]
  );

  // Week navigation — always anchor to Monday so the week runs Mon–Sun
  const getWeekUrl = useCallback(
    (offsetWeeks) => {
      const monday = getMonday(timestamp ? new Date(timestamp) : new Date());
      monday.setDate(monday.getDate() + offsetWeeks * 7);
      return "/ads/" + moment(monday).format("YYYY-MM-DD");
    },
    [timestamp]
  );

  const goNext = useCallback(
    () => navigate(getWeekUrl(1), { replace: true }),
    [navigate, getWeekUrl]
  );
  const goPrev = useCallback(
    () => navigate(getWeekUrl(-1), { replace: true }),
    [navigate, getWeekUrl]
  );

  const { ref: swipeRef, handlers: swipeHandlers } = useSwipe(goNext, goPrev);

  // Calendar day-picker — jump straight to the week containing the chosen day
  const dateInputRef = useRef(null);
  const openDatePicker = useCallback(() => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.click();
  }, []);
  const onPickDate = useCallback(
    (e) => {
      const v = e.target.value;
      if (v) navigate(`/ads/${v}`);
    },
    [navigate]
  );

  // Week range label
  const weekRange = useMemo(() => {
    const base = timestamp ? new Date(timestamp) : new Date();
    const mon = getMonday(new Date(base));
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return moment(mon).format("D.M") + " – " + moment(sun).format("D.M");
  }, [timestamp]);

  // Download as PNG
  // exportRef points to the full-resolution element (no transform on it).
  const { downloading, downloadPng } = useExportPng(exportRef);


  return (
    <div ref={swipeRef} {...swipeHandlers} style={{ touchAction: "pan-y", color: "var(--color-secondary)" }}>
      <style>{css}</style>

      {/* GameZone top bar — back · title + centred week nav · calendar day-picker */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1, pt: "calc(env(safe-area-inset-top) + 10px)", pb: 1.25, color: "text.primary" }}>
        <IconButton onClick={goBack} aria-label="Takaisin" sx={navBtnSx}>
          <LuArrowLeft />
        </IconButton>

        {/* Centre: ‹  OTTELUMAINOS / week  › */}
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
          <IconButton onClick={goPrev} aria-label="Edellinen viikko" sx={navBtnSx}>
            <LuChevronLeft />
          </IconButton>
          <Box sx={{ textAlign: "center", minWidth: 150 }}>
            <Typography sx={{ fontFamily: "var(--font-family-display)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "var(--font-display-tracking)", fontSize: 20, lineHeight: 1.15 }}>
              Ottelumainos
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.1 }}>{weekRange}</Typography>
          </Box>
          <IconButton onClick={goNext} aria-label="Seuraava viikko" sx={navBtnSx}>
            <LuChevronRight />
          </IconButton>
        </Box>

        {/* Right: pick a day directly */}
        <IconButton onClick={openDatePicker} aria-label="Valitse päivä" sx={navBtnSx}>
          <LuCalendar />
        </IconButton>
        <input
          ref={dateInputRef}
          type="date"
          onChange={onPickDate}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          tabIndex={-1}
          aria-hidden="true"
        />
      </Box>

      <div className="ads-root">

        {/*
          Display wrapper: scales the 1024px-wide canvas to fit the screen.
          Height grows with content — no fixed 1024px cap.
          Transform is on an intermediate div, NOT on exportRef,
          so html-to-image always captures at full resolution.
        */}
        <div className="ads-display-wrap" ref={wrapperRef}>
          <div style={{ height: `${scale * canvasHeight}px`, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: `${AD_SIZE}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <div ref={exportRef} style={{ width: `${AD_SIZE}px` }}>
                <AdContent matches={matches} teamsMap={teamsMap} onGameClick={onGameClick} background={activeBackground} timestamp={timestamp} />
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <Surface className="ads-controls">
          {matches.length > 0 && (
            <div className="ads-field-row">
              <label className="ads-label">Yksittäin</label>
              <div className="ads-game-btns">
                {matches.map((_, i) => (
                  <SelectorButton key={i} onClick={() => onGameClick(i)}>
                    {i + 1}
                  </SelectorButton>
                ))}
              </div>
            </div>
          )}
          <div className="ads-field-row">
            <label className="ads-label">Tausta</label>
            <div className="ads-bg-btns">
              {BACKGROUNDS.map((_, i) => (
                <SelectorButton key={i} onClick={() => setBgIndex(i)} active={bgIndex === i}>
                  {i + 1}
                </SelectorButton>
              ))}
              <SelectorButton
                onClick={() => customBgInputRef.current?.click()}
                active={bgIndex === CUSTOM_IDX}
                title="Lataa oma kuva"
              >
                <span className="material-symbols-rounded" style={{ fontSize: "18px", lineHeight: 1 }}>&#xE3C9;</span>
              </SelectorButton>
              <input
                ref={customBgInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleCustomBgFile}
              />
            </div>
          </div>
          <div className="ads-separator" />
          <PrimaryButton onClick={downloadPng} disabled={downloading}>
            {downloading ? "Ladataan..." : "Lataa PNG"}
          </PrimaryButton>
        </Surface>
      </div>
    </div>
  );
};

export default Ads;

/* ============================= */
/*         AD CANVAS             */
/* ============================= */

// Design tokens for the concept (Kiekko-Ahma Brand Core).
const ORANGE = COLOR_PRIMARY; // Ahma Orange #F06E1E (the app's brand primary)
const CANVAS_BG = "#15171B"; // Ink base
const WHITE = "#FFFFFF";
const CARD_BG = "linear-gradient(180deg, #272B31 0%, #1E2126 52%, #181B1F 100%)";
const CARD_HILITE = "inset 0 2px 0 rgba(255,168,96,0.30)"; // warm top sheen
const STEEL = "#C3C3C3";
const FOOTER_TEXT = "#9AA0A8";
// Warm horizontal beam (transparent → light → transparent). Used for the footer
// underline and the first-card top streak (which brightens the mid stop).
const GLOW_LINE = "linear-gradient(90deg, rgba(240,110,30,0) 0%, #FFC08A 52%, rgba(240,110,30,0) 100%)";
const STREAK_LINE = "linear-gradient(90deg, rgba(240,110,30,0) 0%, #FFD9B4 50%, rgba(240,110,30,0) 100%)";
const CARD_H = 146; // square date tab (tab width === card height)
const AHMA_CREST = "/infotv/ahma_head.png"; // transparent official crest (bear head)
const RAAPAISU = "/ottelumainos_raapaisu.png"; // brand claw-scratch texture

// Shared orange "chip" style (KOTIOTTELUT eyebrow + per-row level tag).
const chipStyle = (fontSize, letterSpacing, radius) => ({
  background: ORANGE, color: CANVAS_BG, fontSize, letterSpacing,
  padding: "9px 17px 6px", lineHeight: 1, borderRadius: radius, whiteSpace: "nowrap",
});

// Remove a solid (near-)white background from a logo by flood-filling from the
// borders inward — so opponent crests sit on the dark card, not a white tile.
// Transparent logos are untouched; interior white (text, teeth) is preserved
// because the fill stops at the logo's opaque edge. Returns a data-URL, or null
// if the canvas is tainted (cross-origin img in dev → caller keeps the original).
function keyWhiteBg(img, threshold = 232) {
  try {
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h), px = d.data;
    const near = (p) => px[p * 4] >= threshold && px[p * 4 + 1] >= threshold && px[p * 4 + 2] >= threshold;
    const seen = new Uint8Array(w * h), st = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const p = y * w + x;
      if (seen[p]) return;
      seen[p] = 1;
      if (near(p)) { px[p * 4 + 3] = 0; st.push(p); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st.length) {
      const p = st.pop(); const x = p % w, y = (p / w) | 0;
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
    ctx.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
  } catch {
    return null; // tainted canvas (raw cross-origin URL in dev) → keep original
  }
}

// Opponent crest with its white background keyed out (prod: same-origin via the
// /api/getImage proxy → keying works; dev raw cross-origin → falls back to src).
function KeyedLogo({ src, size, style }) {
  const [out, setOut] = useState(src);
  useEffect(() => {
    setOut(src);
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { const url = keyWhiteBg(img); if (!cancelled && url) setOut(url); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return <img src={out} alt="" style={{ width: size, height: size, objectFit: "contain", ...style }} />;
}

// A team's name + orange sub-label — a grid cell (align "right"|"left"). Fixed
// column widths (see AdGameRow grid) keep every row's crests/vs/names aligned.
function TeamName({ main, sub, align }) {
  return (
    <div style={{ minWidth: 0, textAlign: align }}>
      <div style={{ fontSize: "42px", color: WHITE, letterSpacing: "0.5px", lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {main}
      </div>
      {sub && (
        <div style={{ fontSize: "28px", color: ORANGE, letterSpacing: "2px", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// Format a two-date span, Finnish-style: "30.8." | "29.–30.8." | "29.8.–2.9."
function formatDayRange(first, last) {
  const mf = moment(first), ml = moment(last);
  const sD = mf.format("D"), sM = mf.format("M");
  const eD = ml.format("D"), eM = ml.format("M");
  if (sD === eD && sM === eM) return `${eD}.${eM}.`;
  if (sM === eM) return `${sD}.–${eD}.${eM}.`;
  return `${sD}.${sM}.–${eD}.${eM}.`;
}

function AdContent({ matches, teamsMap, onGameClick, background, timestamp }) {
  // Header shows the whole week Mon–Sun (always ends Sunday), not the game span.
  const dateRange = useMemo(() => {
    const mon = getMonday(timestamp ? new Date(timestamp) : new Date());
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return formatDayRange(mon, sun);
  }, [timestamp]);

  return (
    <div
      style={{
        width: `${AD_SIZE}px`,
        // No fixed height — grows to fit all games
        fontFamily: "'Bebas Neue', sans-serif",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: CANVAS_BG,
        overflow: "hidden",
      }}
    >
      {/* Warm corner glow (top-left) */}
      <div style={{ position: "absolute", top: -120, left: -180, width: 760, height: 560, background: `linear-gradient(135deg, #2E2317 0%, ${CANVAS_BG} 78%)`, pointerEvents: "none" }} />
      {/* Default "raapaisu" — the brand claw-scratch texture (top-right corner) */}
      <img
        src={RAAPAISU}
        alt=""
        decoding="sync"
        style={{ position: "absolute", top: 70, right: -170, height: 640, opacity: 0.14, transform: "rotate(14deg)", pointerEvents: "none", zIndex: 0 }}
      />
      {/* Optional faint photo the user can pick */}
      {background && (
        <img data-export-bg="1" decoding="sync" src={background} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 40%", opacity: 0.1, pointerEvents: "none" }} />
      )}

      {/* ── HEADER ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "56px 56px 30px 56px",
          gap: "24px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* KOTIOTTELUT chip */}
          <div style={{ display: "flex" }}>
            <div style={{ ...chipStyle("30px", "8px", "5px"), padding: "9px 20px 5px" }}>
              KOTIOTTELUT
            </div>
          </div>
          {/* Big date range */}
          <div
            style={{
              fontSize: "132px",
              color: "#F4F4F4",
              letterSpacing: "2px",
              lineHeight: 0.86,
            }}
          >
            {dateRange}
          </div>
          {/* Venue */}
          <div
            style={{
              fontSize: "44px",
              color: STEEL,
              letterSpacing: "6px",
              lineHeight: 1,
            }}
          >
            WAREENA · VALKEAKOSKI
          </div>
        </div>

        {/* Official Kiekko-Ahma club crest (transparent asset), on dark */}
        <img src={AHMA_CREST} alt="" style={{ height: "150px", width: "150px", objectFit: "contain", flexShrink: 0 }} />
      </div>

      {/* ── GAME ROWS ── */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: "12px", padding: "6px 48px 4px" }}>
        {/* Warm highlight ON the FIRST card's top edge — glow centred on the streak */}
        {matches.length > 0 && (
          <>
            <div style={{ position: "absolute", top: -34, left: "60%", right: "0%", height: 80, background: "radial-gradient(ellipse at center, rgba(255,186,110,0.5) 0%, rgba(240,110,30,0.14) 40%, rgba(240,110,30,0) 72%)", pointerEvents: "none", zIndex: 3 }} />
            <div style={{ position: "absolute", top: 6, left: "62%", right: "2%", height: 2, background: STREAK_LINE, pointerEvents: "none", zIndex: 4 }} />
          </>
        )}
        {matches.map((m, i) => (
          <AdGameRow
            key={i}
            match={m}
            teamsMap={teamsMap}
            onClick={onGameClick ? () => onGameClick(i) : undefined}
          />
        ))}
      </div>

      {/* ── FOOTER ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "28px 56px 42px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: "37px", color: FOOTER_TEXT, letterSpacing: "7px" }}>
          WWW.KIEKKO-AHMA.FI
        </div>
        <div style={{ fontSize: "48px", color: ORANGE, lineHeight: 1 }}>/</div>
        <div style={{ fontSize: "44px", color: ORANGE, letterSpacing: "4px" }}>
          TULE KANNUSTAMAAN!
        </div>
        {/* Glowing underline */}
        <div style={{ position: "absolute", left: 56, right: 56, bottom: 22, height: 2, background: GLOW_LINE, pointerEvents: "none" }} />
      </div>
    </div>
  );
}

function AdGameRow({ match, teamsMap, onClick }) {
  const md = moment(match.date);
  const timeStr = md.format("HH:mm");
  const dayStr = md.format("dd D.M").toUpperCase();
  const lookupKey = `${match.levelId}|${match.statGroupId}`;
  // Ahma team designation (every team must show one). Primary source = the mapped
  // teamKey from getTeams (e.g. "U15", "U13 MUSTA", "Edustus"). Fallbacks for when
  // the map isn't loaded: the feed-name suffix ("…Oranssi"→"Oranssi"), the age from
  // the level/league ("U16"), or "Edustus" for the II-divisioona (men's) team.
  let ahmaSub = teamsMap?.get(lookupKey) || splitTeamName(match.home).sub || "";
  if (!ahmaSub) {
    const hay = `${match.level || ""} ${match.league || ""}`;
    const age = hay.match(/U\d{1,2}/i);
    if (age) ahmaSub = age[0];
    else if (/divisioona|edustus/i.test(hay)) ahmaSub = "Edustus";
  }
  ahmaSub = ahmaSub.toUpperCase();
  const { main: awayMain, sub: awaySub } = splitTeamName(match.away);
  // Level chip = just the series; drop the "Harj.," friendly prefix. Keep the raw
  // level only if stripping would leave nothing (a bare friendly).
  const rawLevel = (match.level || "").toUpperCase();
  const level = rawLevel.replace(/^\s*HARJ\.?,?\s*/i, "").replace(/^\s*HARJOITUSOTTELU[T]?,?\s*/i, "") || rawLevel;

  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "stretch",
        height: `${CARD_H}px`,
        borderRadius: "8px",
        overflow: "hidden",
        background: CARD_BG,
        boxShadow: CARD_HILITE,
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      {/* Faint orange right-edge border, fading downward */}
      <div style={{ position: "absolute", top: 0, right: 0, width: 2, height: "100%", background: "linear-gradient(180deg, rgba(255,150,72,0.42) 0%, rgba(255,150,72,0.14) 42%, rgba(255,150,72,0) 100%)", pointerEvents: "none", zIndex: 2 }} />

      {/* Square orange date tab */}
      <div
        style={{
          width: `${CARD_H}px`,
          flexShrink: 0,
          alignSelf: "stretch",
          background: ORANGE,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}
      >
        <div style={{ fontSize: "30px", color: WHITE, letterSpacing: "1px", lineHeight: 1 }}>
          {dayStr}
        </div>
        <div style={{ fontSize: "56px", color: WHITE, letterSpacing: "1px", lineHeight: 1 }}>
          {timeStr}
        </div>
      </div>

      {/* Body — FIXED-column grid so crests/vs/names line up across every row:
          home name | home crest | vs | away crest | away name (fills) | chip */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: "166px 82px 46px 82px 1fr auto",
          columnGap: "12px",
          alignItems: "center",
          padding: "0 24px",
        }}
      >
        {/* Home name — right-aligned, hugging the crest */}
        <TeamName main="AHMA" sub={ahmaSub} align="right" />

        {/* Home crest — transparent official Ahma head, on the dark card */}
        <img src={AHMA_CREST} alt="" style={{ width: "82px", height: "82px", objectFit: "contain" }} />

        {/* vs */}
        <div
          style={{
            fontFamily: "'Barlow', sans-serif",
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: "30px",
            color: "rgba(255,255,255,0.42)",
            textAlign: "center",
          }}
        >
          vs
        </div>

        {/* Opponent crest — white background keyed out, sits on the dark card */}
        <KeyedLogo src={match.away_logo} size={82} />

        {/* Opponent name — left-aligned, hugging the crest (truncates if long) */}
        <TeamName main={awayMain} sub={awaySub} align="left" />

        {/* Level chip — far right */}
        {level && (
          <div style={{ ...chipStyle("26px", "1px", "6px"), padding: "8px 14px 5px" }}>
            {level}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================= */
/*             CSS               */
/* ============================= */

const css = `${themeCSS}
html, body, #root {
  margin: 0;
  min-height: 100%;
  background: var(--color-bg);
}

.ads-root {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  /* Bottom padding clears the BottomNav (GamezoneLayout) + iOS home indicator. */
  padding: 16px 16px var(--ui-bottom-nav-clearance, 80px);

  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

.ads-display-wrap {
  width: 100%;
  max-width: 600px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
}

/* ads-controls — ui-surface antaa bg/border/radius/shadow */
.ads-controls {
  width: 100%;
  max-width: 600px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
}

.ads-field-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.ads-label {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: rgba(255,255,255,0.50);
}

.ads-bg-btns {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 10px;
}

/* ads-bg-btn / ads-game-btn → SelectorButton (ui-selector-btn) */

.ads-game-btns {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 10px;
}

.ads-separator {
  width: 100%;
  border-top: 1px solid rgba(255,255,255,0.10);
}

/* ads-download-btn → PrimaryButton (ui-primary-btn) */
`;
