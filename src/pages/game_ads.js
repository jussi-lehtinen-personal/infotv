import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useExportPng } from "../hooks/useExportPng";
import {
  getMockGameData,
  processIncomingDataEventsDoNotStrip,
  buildGamesQueryUri,
  splitTeamName,
} from "../Util";
import { themeCSS, COLOR_PRIMARY } from "../theme";
import { Surface } from "../components/ui/Surface";
import { PageHeader } from "../components/ui/PageHeader";
import { NavButton, SelectorButton, PrimaryButton } from "../components/ui/Buttons";
import { TeamLogo } from "../components/ui/TeamLogo";

import "@fontsource/bebas-neue";
import "moment/locale/fi";

var moment = require("moment");
moment.locale("fi");

const BACKGROUNDS = [
  "/ahma_logo.png",
  "/background.jpg",
  "/background3.jpg",
];

const CANVAS_SIZE = 1080;
const ORANGE = COLOR_PRIMARY;

/* ============================= */
/*           PAGE                */
/* ============================= */

const GameAds = () => {
  const exportRef = useRef(null);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();
  const { timestamp, gameId } = useParams();

  const currentIdx = gameId ? parseInt(gameId, 10) : 0;

  const [match, setMatch] = useState(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const [bgIndex, setBgIndex] = useState(0);
  const [customBg, setCustomBg] = useState(null); // Object URL for user-uploaded image
  const customBgUrlRef = useRef(null); // tracks current URL for cleanup
  const customBgInputRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [editHome, setEditHome] = useState({ main: "", sub: "" });
  const [editAway, setEditAway] = useState({ main: "", sub: "" });
  const [editLevel, setEditLevel] = useState("");
  const [editTitle, setEditTitle] = useState("Kiekko-Ahma");
  const [teamsMap, setTeamsMap] = useState(new Map()); // "levelId|statGroupId" → teamKey
  const { downloading, downloadPng } = useExportPng(exportRef);

  // If user edits the fields manually, stop auto-overriding them.
  const homeDirtyRef = useRef(false);
  const awayDirtyRef = useRef(false);
  const levelDirtyRef = useRef(false);
  const titleDirtyRef = useRef(false);

  const computeHomeEdit = useCallback((m, map) => {
    if (!m) return { main: "", sub: "" };
    const lookupKey = `${m.levelId}|${m.statGroupId}`;
    const teamKey = map?.get(lookupKey);

    // If we can map this game to an Ahma team, render as:
    //   KIEKKO-AHMA
    //   <teamKey>
    if (teamKey) {
      return { main: "KIEKKO-AHMA", sub: teamKey };
    }

    // Fallback: whatever comes from the feed
    const home = splitTeamName(m.home ?? "");
    return { main: home.main, sub: home.sub ?? "" };
  }, []);

  // Scale canvas width to fit wrapper
  useEffect(() => {
    const update = () => {
      if (wrapperRef.current) {
        setScale(wrapperRef.current.offsetWidth / CANVAS_SIZE);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Fetch teams once — build levelId|statGroupId → teamKey lookup
  useEffect(() => {
    fetch("/api/getTeams")
      .then((r) => r.json())
      .then((teams) => {
        const map = new Map();
        for (const team of teams) {
          for (const g of team.levelGroups ?? []) {
            map.set(`${g.levelId}|${g.statGroupId}`, team.teamKey);
          }
        }
        setTeamsMap(map);
      })
      .catch(() => {});
  }, []);

  // Fetch game data
  useEffect(() => {
    const controller = new AbortController();
    const uri = buildGamesQueryUri(timestamp);
    const idx = gameId ? parseInt(gameId, 10) : 0;

    const applyMatch = (items) => {
      setTotalMatches(items.length);
      if (idx < items.length) {
        const m = items[idx];
        setMatch(m);
        homeDirtyRef.current = false;
        awayDirtyRef.current = false;
        levelDirtyRef.current = false;
        titleDirtyRef.current = false;

        // Field updates handled by the [match, teamsMap] effect below
      }
    };

    fetch(uri, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => applyMatch(processIncomingDataEventsDoNotStrip(d)))
      .catch((err) => {
        if (err.name === "AbortError") return;
        applyMatch(processIncomingDataEventsDoNotStrip(getMockGameData()));
      });

    return () => controller.abort();
  }, [timestamp, gameId, computeHomeEdit]);

  // If teamsMap arrives later (or changes), refresh the auto home label — but only
  // if the user hasn't edited the fields manually.
  // Sync all editable fields when match or teamsMap changes, respecting dirty flags.
  useEffect(() => {
    if (!match) return;

    if (!homeDirtyRef.current) {
      const next = computeHomeEdit(match, teamsMap);
      setEditHome((prev) => (prev.main === next.main && prev.sub === next.sub ? prev : next));
    }
    if (!awayDirtyRef.current) {
      const away = splitTeamName(match.away ?? "");
      setEditAway({ main: away.main, sub: away.sub ?? "" });
    }
    if (!levelDirtyRef.current) {
      setEditLevel(match.level ?? "");
    }
    if (!titleDirtyRef.current) {
      setEditTitle("Kiekko-Ahma");
    }
  }, [match, teamsMap, computeHomeEdit]);

  // Revoke Object URL on unmount to avoid memory leaks
  useEffect(() => () => {
    if (customBgUrlRef.current) URL.revokeObjectURL(customBgUrlRef.current);
  }, []);

  const CUSTOM_IDX = BACKGROUNDS.length; // sentinel index for user-uploaded image
  const activeBackground = bgIndex === CUSTOM_IDX && customBg ? customBg : BACKGROUNDS[bgIndex];

const handleCustomBgFile = useCallback((e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    setCustomBg(reader.result); // dataURL instead of blob:
    setBgIndex(CUSTOM_IDX);
  };
  reader.readAsDataURL(file);

  e.target.value = "";
}, [CUSTOM_IDX]);

  const goToGame = useCallback(
    (idx) => navigate(`/ads/${timestamp}/${idx}`, { replace: true }),
    [navigate, timestamp]
  );
  const goPrev = useCallback(
    () => totalMatches > 0 && goToGame((currentIdx - 1 + totalMatches) % totalMatches),
    [goToGame, currentIdx, totalMatches]
  );
  const goNext = useCallback(
    () => totalMatches > 0 && goToGame((currentIdx + 1) % totalMatches),
    [goToGame, currentIdx, totalMatches]
  );

  const displayMatch = match
    ? { ...match, title: editTitle, homeMain: editHome.main, homeSub: editHome.sub, awayMain: editAway.main, awaySub: editAway.sub, level: editLevel }
    : null;

  return (
    <div>
      <style>{css}</style>
      <div className="ga-root">

        {/* Header */}
        <Surface className="ga-page-header">
          <PageHeader
            title="OTTELUMAINOS"
            subtitle={totalMatches > 0 ? `${currentIdx + 1} / ${totalMatches}` : undefined}
            left={<NavButton onClick={goPrev} icon="&#xE5CB;" ariaLabel="Edellinen ottelu" />}
            right={<NavButton onClick={goNext} icon="&#xE5CC;" ariaLabel="Seuraava ottelu" />}
          />
          {totalMatches > 1 && (
            <div className="ga-game-btns">
              {Array.from({ length: totalMatches }, (_, i) => (
                <SelectorButton key={i} onClick={() => goToGame(i)} active={i === currentIdx}>
                  {i + 1}
                </SelectorButton>
              ))}
            </div>
          )}
        </Surface>

        {/* Canvas preview */}
        <div className="ga-display-wrap" ref={wrapperRef}>
          <div style={{ height: `${scale * CANVAS_SIZE}px`, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: `${CANVAS_SIZE}px`,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <div ref={exportRef} style={{ width: `${CANVAS_SIZE}px`, height: `${CANVAS_SIZE}px` }}>
                {displayMatch && (
                  <GameAdCanvas match={displayMatch} background={activeBackground} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
          <Surface className="ga-controls">
            <div className="ga-field-row">
              <label className="ga-label">Otsikko</label>
              <input
                className="ga-input"
                value={editTitle}
                onChange={(e) => {
                titleDirtyRef.current = true;
                setEditTitle(e.target.value);
              }}
              />
            </div>
            <div className="ga-field-row">
              <label className="ga-label">Sarja</label>
              <input
                className="ga-input"
                value={editLevel}
                onChange={(e) => {
                  levelDirtyRef.current = true;
                  setEditLevel(e.target.value);
                }}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label">Kotijoukkue</label>
            <input
              className="ga-input"
              value={editHome.main}
              onChange={(e) => {
                homeDirtyRef.current = true;
                setEditHome((p) => ({ ...p, main: e.target.value }));
              }}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label ga-label--sub">Lisäteksti</label>
            <input
              className="ga-input ga-input--sub"
              placeholder="(ei lisätekstiä)"
              value={editHome.sub}
              onChange={(e) => {
                homeDirtyRef.current = true;
                setEditHome((p) => ({ ...p, sub: e.target.value }));
              }}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label">Vierasjoukkue</label>
            <input
              className="ga-input"
              value={editAway.main}
              onChange={(e) => {
                awayDirtyRef.current = true;
                setEditAway((p) => ({ ...p, main: e.target.value }));
              }}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label ga-label--sub">Lisäteksti</label>
            <input
              className="ga-input ga-input--sub"
              placeholder="(ei lisätekstiä)"
              value={editAway.sub}
              onChange={(e) => {
                awayDirtyRef.current = true;
                setEditAway((p) => ({ ...p, sub: e.target.value }));
              }}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label">Tausta</label>
            <div className="ga-bg-btns">
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
          <div className="ga-separator" />
          <PrimaryButton onClick={downloadPng} disabled={downloading}>
            {downloading ? "Ladataan..." : "Lataa PNG"}
          </PrimaryButton>
        </Surface>

      </div>
    </div>
  );
};

export default GameAds;

/* ============================= */
/*         AD CANVAS             */
/* ============================= */

function GameAdCanvas({ match, background }) {
  const timeStr = moment(match.date).format("HH:mm");
  const dayStr = moment(match.date).format("dd D.M.").toUpperCase();
  const isFree = match.isFree !== false; // default free unless explicitly false

  const TITLE_TIME_SIZE = 78;
  const SUB_SIZE = 48;

  return (
    <div
      style={{
        width: `${CANVAS_SIZE}px`,
        height: `${CANVAS_SIZE}px`,
        fontFamily: "'Bebas Neue', sans-serif",
        position: "relative",
        background: "#0d0d0d",
        overflow: "hidden",
      }}
    >
      {/* Background photo */}
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
          objectPosition: "center 30%",
        }}
      />

      {/* Gradient overlay — darkens towards bottom */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.65) 100%)",        }}
      />

      {/* ── TOP BAR ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "58px",
          background: "rgba(8,8,8,0.80)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontSize: "34px",
            color: "rgba(255,255,255,0.70)",
            letterSpacing: "7px",
          }}
        >
          WWW.KIEKKO-AHMA.FI
        </div>
      </div>

      {/* ── BOTTOM CONTENT ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Orange top line */}
        <div
          style={{
            height: "5px",
            background: `linear-gradient(to right, ${ORANGE}, #cc4400)`,
          }}
        />

        {/* Club name + league */}
        <div
          style={{
            background: "rgba(14,14,14,0.94)",
            padding: "14px 40px 10px",
            display: "grid",
            gridTemplateColumns: "160px 48px 1fr",
            columnGap: "26px",
            alignItems: "center",
          }}
        >
          {/* Date + time (moved here) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: "2px",
            }}
          >
            <div
              style={{
                fontSize: `${SUB_SIZE}px`,
                color: "#ffffff",
                letterSpacing: "2px",
                lineHeight: 1.1,
                alignSelf: "center",
                textShadow: "0 2px 6px rgba(0,0,0,0.8)",
              }}
            >
              {dayStr}
            </div>
            <div
              style={{
                fontSize: `${TITLE_TIME_SIZE}px`,
                color: ORANGE,
                letterSpacing: "2px",
                lineHeight: 1,
                alignSelf: "center",
              }}
            >
              {timeStr}
            </div>
          </div>

          {/* Separator */}
          <div
            style={{
              width: "4px",
              height: "80%",
              alignSelf: "center",
              background: ORANGE,
              borderRadius: "2px",
            }}
          />

          {/* Team + level */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
            <div
              style={{
                fontSize: `${TITLE_TIME_SIZE}px`,
                color: "#ffffff",
                letterSpacing: "4px",
                lineHeight: 1,
                alignSelf: "center",
                textShadow: "0 4px 20px rgba(0,0,0,0.8)",
              }}
            >
              {match.title ?? "Kiekko-Ahma"}
            </div>
            <div
              style={{
                fontSize: `${SUB_SIZE}px`,
                color: ORANGE,
                letterSpacing: "4px",
                lineHeight: 1.1,
                alignSelf: "center",
                textShadow: "0 2px 10px rgba(0,0,0,0.8)",
              }}
            >
              {match.level}
            </div>
          </div>
        </div>

{/* Orange divider */}
        <div
          style={{
            height: "4px",
            background: `linear-gradient(to right, ${ORANGE}, #cc4400)`,
          }}
        />

        {/* Teams + time */}
        <div
          style={{
            background: "rgba(8,8,8,0.85)",
            padding: "22px 36px 20px",
            display: "grid",
            gridTemplateColumns: "1fr 180px 1fr",
            alignItems: "center",
            gap: "16px",
          }}
        >
          {/* Home team */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <TeamLogo src={match.home_logo} size={140} />
            <div style={{ textAlign: "center", lineHeight: 1.05 }}>
              <div
                style={{
                  fontSize: "56px",
                  color: "#ffffff",
                  letterSpacing: "2px",
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                }}
              >
                {match.homeMain}
              </div>
              {match.homeSub && (
                <div
                  style={{
                    fontSize: "38px",
                    color: ORANGE,
                    letterSpacing: "2px",
                    textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                  }}
                >
                  {match.homeSub}
                </div>
              )}
            </div>
          </div>

          {/* VS */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: `${TITLE_TIME_SIZE}px`,
                color: "rgba(255,255,255,0.65)",
                letterSpacing: "6px",
                textShadow: "0 2px 10px rgba(0,0,0,0.8)",
              }}
            >
              VS
            </div>
          </div>

          {/* Away team */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <TeamLogo src={match.away_logo} size={140} />
            <div style={{ textAlign: "center", lineHeight: 1.05 }}>
              <div
                style={{
                  fontSize: "56px",
                  color: "#ffffff",
                  letterSpacing: "2px",
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                }}
              >
                {match.awayMain}
              </div>
              {match.awaySub && (
                <div
                  style={{
                    fontSize: "38px",
                    color: ORANGE,
                    letterSpacing: "2px",
                    textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                  }}
                >
                  {match.awaySub}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            background: "#080808",
            height: "54px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px",
            color: "rgba(255,255,255,0.60)",
            letterSpacing: "3px",
          }}
        >
          {isFree
            ? "OTTELU PELATAAN WAREENASSA · VAPAA SISÄÄNPÄÄSY"
            : "OTTELU PELATAAN WAREENASSA · LIPUT 5 EUR · ALLE 15V. ILMAISEKSI"}
        </div>
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

.ga-root {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  /* Bottom padding clears the BottomNav (GamezoneLayout) + iOS home indicator. */
  padding: 16px 16px var(--ui-bottom-nav-clearance, 80px);

  background: var(--bg-gradient);
}

/* ga-page-header — ui-surface antaa bg/border/radius/shadow */
.ga-page-header {
  width: 100%;
  max-width: 600px;
  box-sizing: border-box;
  padding: 14px 20px;
  text-align: center;
}

/* ga-nav / ga-nav-btn / ga-nav-title → PageHeader + NavButton */

.ga-game-btns {
  display: flex;
  gap: 6px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 10px;
}

.ga-display-wrap {
  width: 100%;
  max-width: 600px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
}

/* ga-controls — ui-surface antaa bg/border/radius/shadow */
.ga-controls {
  width: 100%;
  max-width: 600px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
}

.ga-field-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ga-label {
  width: 120px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: rgba(255,255,255,0.50);
}

.ga-label--sub {
  color: rgba(255,255,255,0.30);
  font-size: 11px;
}

.ga-input {
  flex: 1;
  min-width: 0;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 10px;
  padding: 8px 12px;
  color: #ffffff;
  font-size: 15px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.ga-input--sub {
  background: rgba(255,255,255,0.03);
  font-size: 13px;
  color: rgba(255,255,255,0.70);
}

.ga-input:focus {
  border-color: var(--color-primary-dim);
}

.ga-bg-btns {
  display: flex;
  gap: 6px;
}

/* ga-bg-btn → SelectorButton (ui-selector-btn) */

.ga-separator {
  width: 100%;
  border-top: 1px solid rgba(255,255,255,0.10);
}

/* ga-download-btn → PrimaryButton (ui-primary-btn) */
`;
