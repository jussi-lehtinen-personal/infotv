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
import { themeCSS, COLOR_PRIMARY, COLOR_PRIMARY_DIM } from "../theme";
import { Surface } from "../components/ui/Surface";
import { PageHeader } from "../components/ui/PageHeader";
import { NavButton, SelectorButton, PrimaryButton } from "../components/ui/Buttons";
import { TeamLogo } from "../components/ui/TeamLogo";

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

const AD_SIZE = 1024;

const BACKGROUNDS = [
  "/ahma_logo.png",
  "/background.jpg",
  "/background3.jpg",
  "/background6.jpg",
];

const Ads = () => {
  const exportRef = useRef(null);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();
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

  // Week navigation
  const getWeekUrl = useCallback(
    (offsetWeeks) => {
      const base = timestamp ? new Date(timestamp) : new Date();
      const target = new Date(base);
      target.setDate(target.getDate() + offsetWeeks * 7);
      return "/ads/" + moment(target).format("YYYY-MM-DD");
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

  // Week range label
  const weekRange = useMemo(() => {
    const base = timestamp ? new Date(timestamp) : new Date();
    const mon = getMonday(new Date(base));
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    return moment(mon).format("D.M") + " – " + moment(sun).format("D.M");
  }, [timestamp]);

  const isCurrentWeek = useMemo(() => {
    const selectedMon = getMonday(timestamp ? new Date(timestamp) : new Date());
    const currentMon  = getMonday(new Date());
    return moment(selectedMon).isSame(moment(currentMon), "day");
  }, [timestamp]);

  // Download as PNG
  // exportRef points to the full-resolution element (no transform on it).
  const { downloading, downloadPng } = useExportPng(exportRef);


  return (
    <div ref={swipeRef} {...swipeHandlers} style={{ touchAction: "pan-y" }}>
      <style>{css}</style>

      <div className="ads-root">
        {/* Header */}
        <Surface className="ads-page-header">
          <PageHeader
            title="KOTIOTTELUT"
            subtitle={weekRange}
            left={<NavButton onClick={goPrev} icon="&#xE5CB;" ariaLabel="Edellinen viikko" />}
            right={<NavButton onClick={goNext} icon="&#xE5CC;" ariaLabel="Seuraava viikko" />}
          />
          {matches.length > 0 && (
            <div className="ads-game-btns">
              {matches.map((_, i) => (
                <SelectorButton key={i} onClick={() => onGameClick(i)}>
                  {i + 1}
                </SelectorButton>
              ))}
            </div>
          )}
        </Surface>

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
                <AdContent matches={matches} weekRange={weekRange} isCurrentWeek={isCurrentWeek} teamsMap={teamsMap} onGameClick={onGameClick} background={activeBackground} />
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <Surface className="ads-controls">
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

const ORANGE = COLOR_PRIMARY;
const ORANGE_DIM = COLOR_PRIMARY_DIM;

function AdContent({ matches, weekRange, isCurrentWeek, teamsMap, onGameClick, background }) {
  const titleLine1 = isCurrentWeek ? "TÄLLÄ VIIKOLLA" : weekRange;


  return (
    <div
      style={{
        width: `${AD_SIZE}px`,
        // No fixed height — grows to fit all games
        fontFamily: "'Bebas Neue', sans-serif",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: "#0d0d0d",
      }}
    >
      {/* Stadium background image */}
      <img
        data-export-bg="1"
        decoding="sync"
        src={background}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 40%",
          opacity: 0.15,
        }}
      />
      {/* Darkening vignette over photo */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(60,20,0,0.5) 0%, transparent 65%)," +
            "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.80) 100%)",
        }}
      />

      {/* ── HEADER ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          padding: "24px 36px 20px 28px",
          gap: "20px",
          flexShrink: 0,
        }}
      >
        {/* Club mascot logo */}
        <img
          src="/ahma_logo.png"
          alt=""
          style={{ height: "190px", width: "190px", objectFit: "contain", flexShrink: 0 }}
        />

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div
            style={{
              fontSize: "88px",
              color: ORANGE,
              letterSpacing: "4px",
              lineHeight: 0.95,
              textShadow: `0 4px 20px rgba(0,0,0,0.7), 0 0 40px ${ORANGE_DIM}`,
            }}
          >
            KOTIOTTELUT
          </div>
          <div
            style={{
              fontSize: "46px",
              color: "rgba(255,255,255,0.90)",
              letterSpacing: "4px",
              lineHeight: 1,
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}
          >
            {titleLine1}
          </div>
        </div>
      </div>

      {/* Orange header separator */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "4px",
          background: `linear-gradient(to right, ${ORANGE}, #cc4400)`,
          flexShrink: 0,
        }}
      />

      {/* ── GAME ROWS ── */}
      <div style={{ position: "relative", zIndex: 1, padding: "4px 0" }}>
        {matches.map((m, i) => (
          <AdGameRow
            key={i}
            match={m}
            showDivider={i < matches.length - 1}
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
          height: "64px",
          borderTop: `2px solid ${ORANGE_DIM}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: "30px",
          color: "rgba(255,255,255,0.80)",
          letterSpacing: "5px",
          textShadow: "0 2px 6px rgba(0,0,0,0.8)",
        }}
      >
        WWW.KIEKKO-AHMA.FI
      </div>
    </div>
  );
}

function AdGameRow({ match, showDivider, teamsMap, onClick }) {
  const timeStr = moment(match.date).format("HH:mm");
  const dayStr = moment(match.date).format("dd D.M.").toUpperCase();
  const lookupKey = `${match.levelId}|${match.statGroupId}`;
  const ahmaName = teamsMap?.get(lookupKey) ?? match.home;
  const { main: awayMain, sub: awaySub } = splitTeamName(match.away);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        onClick={onClick}
        style={{
          display: "grid",
          // date+time | sep | home name | home logo | VS | away logo | away name
          gridTemplateColumns: "148px 4px 1fr 90px auto 90px 1fr",
          alignItems: "center",
          minHeight: "88px",
          padding: "12px 28px 12px 20px",
          gap: "0",
          cursor: onClick ? "pointer" : undefined,
        }}
      >
        {/* Date + time */}
        <div style={{ textAlign: "center", paddingRight: "16px" }}>
          <div
            style={{
              fontSize: "33px",
              color: "#ffffff",
              letterSpacing: "1px",
              lineHeight: 1.1,
              textShadow: "0 2px 6px rgba(0,0,0,0.7)",
            }}
          >
            {dayStr}
          </div>
          <div
            style={{
              fontSize: "48px",
              color: ORANGE,
              letterSpacing: "1px",
              lineHeight: 1,
              textShadow: "0 2px 8px rgba(0,0,0,0.7)",
            }}
          >
            {timeStr}
          </div>
        </div>

        {/* Orange vertical separator */}
        <div
          style={{
            width: "4px",
            height: "70%",
            background: ORANGE,
            borderRadius: "2px",
          }}
        />

        {/* Home team name — right-aligned, flush against home logo */}
        <div
          style={{
            paddingLeft: "20px",
            paddingRight: "20px",
            textAlign: "right",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              color: "#ffffff",
              letterSpacing: "2px",
              lineHeight: 1.05,
              textShadow: "0 2px 10px rgba(0,0,0,0.8)",
            }}
          >
            KIEKKO-AHMA
          </div>
          {ahmaName !== match.home && (
            <div
              style={{
                fontSize: "33px",
                color: ORANGE,
                letterSpacing: "2px",
                lineHeight: 1.1,
                textShadow: "0 2px 6px rgba(0,0,0,0.7)",
              }}
            >
              {ahmaName}
            </div>
          )}
        </div>

        {/* Home logo */}
        <TeamLogo
          src={match.home_logo}
          size={90}
          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.6)", flexShrink: 0 }}
        />

        {/* VS */}
        <div
          style={{
            fontSize: "38px",
            color: "rgba(255,255,255,0.80)",
            letterSpacing: "4px",
            padding: "0 18px",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            flexShrink: 0,
          }}
        >
          VS
        </div>

        {/* Away logo */}
        <TeamLogo
          src={match.away_logo}
          size={90}
          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.6)", flexShrink: 0 }}
        />

        {/* Away team name — left-aligned, flush against away logo */}
        <div
          style={{
            paddingLeft: "20px",
            paddingRight: "20px",
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: "48px",
              color: "#ffffff",
              letterSpacing: "2px",
              lineHeight: 1.05,
              textShadow: "0 2px 10px rgba(0,0,0,0.8)",
            }}
          >
            {awayMain}
          </div>
          {awaySub && (
            <div
              style={{
                fontSize: "33px",
                color: ORANGE,
                letterSpacing: "2px",
                lineHeight: 1.1,
                textShadow: "0 2px 6px rgba(0,0,0,0.7)",
              }}
            >
              {awaySub}
            </div>
          )}
        </div>
      </div>

      {/* Row divider */}
      {showDivider && (
        <div
          style={{
            height: "2px",
            margin: "0 32px",
            background: ORANGE_DIM,
            flexShrink: 0,
          }}
        />
      )}
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
  padding: 16px 16px 28px;

  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

/* ads-page-header — ui-surface antaa bg/border/radius/shadow */
.ads-page-header {
  width: 100%;
  max-width: 600px;
  padding: 14px 20px;
  text-align: center;
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
