import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
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

import "@fontsource/bebas-neue";
import "moment/locale/fi";

var moment = require("moment");
moment.locale("fi");

const BACKGROUNDS = [
  "/match_ad_bg1.webp",
  "/background.jpg",
  "/background3.jpg",
];

const CANVAS_SIZE = 1080;
const ORANGE = COLOR_PRIMARY;

// Layout geometry, all in CSS px on the 1080×1080 base (see docs: the ad is built from
// plain boxes, not from a pre-rendered artwork plate, so every piece stays editable).
const HERO_H = 810; // photo area; 1080×810 is the source photo's own 4:3, so cover ≠ crop
const INK = "#15171B";
const STEEL = "#C3C3C3";

const FONT_DISPLAY = "'Bebas Neue', sans-serif";

const GA_WIDE_BTN = { width: "auto", padding: "0 14px" };

// Module-level so the export hook's useCallback identity stays stable across renders.
// 166px is the largest size on the canvas; loading one size loads the face.
const EXPORT_FONTS = [`400 166px ${FONT_DISPLAY}`];

// The two crossing micro-textures that keep the dark surfaces from reading as flat fill.
// `a` is the white alpha — the lower card gets 0.025, the team panels a calmer 0.015.
const texture = (a) => `repeating-linear-gradient(45deg, rgba(255,255,255,${a}) 0 1px, transparent 1px 8px),
     repeating-linear-gradient(-45deg, rgba(255,255,255,${a}) 0 1px, transparent 1px 8px)`;

const HOME_VENUE = "Wareena · Valkeakoski";

// The chevron only has room for ~15 condensed characters, and the colour half of a level
// ("U14 Valkoinen") is already shown under the crest as the team's own qualifier.
const LEVEL_VARIANT = /\s+(musta|valkoinen|oranssi|sininen|punainen|keltainen|vihreä|harmaa|violetti|black|white|orange|blue|red|yellow|green)$/i;
const shortLevel = (level) => {
  const s = String(level ?? "").trim();
  // "Harjoitusottelut, U20" → "U20": on an ad the age group is the half that means something.
  const age = s.match(/(?:^|,\s*)(U\d{1,2})\b/i);
  if (/harjoitusottelu/i.test(s) && age) return age[1].toUpperCase();
  return s
    .replace(LEVEL_VARIANT, "")
    .replace(/divisioona/i, "Div")
    .replace(/suomi-sarja/i, "SS");
};

// Bottom strap: venue for away games, venue + admission for home games (the II-divisioona
// home games are the ticketed ones). Always editable — `rink` is only a town for away games.
const defaultVenue = (m) => {
  if (!m) return "";
  if (m.isHomeGame !== false && /valkeakos/i.test(m.rink ?? "")) {
    return m.isFree === false ? `${HOME_VENUE} · Liput 5 €` : HOME_VENUE;
  }
  return m.rink ?? "";
};

/* ============================= */
/*           PAGE                */
/* ============================= */

const GameAds = () => {
  const exportRef = useRef(null);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { timestamp, gameId } = useParams();

  // Away games are opt-in (?away=1) because includeAway costs two Worker round-trips
  // instead of one — see api/src/functions/getGames.js. It lives in the URL so the
  // selected game index always refers to the same list.
  const includeAway = searchParams.get("away") === "1";
  const currentIdx = gameId ? parseInt(gameId, 10) : 0;

  const [match, setMatch] = useState(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const [bgIndex, setBgIndex] = useState(0);
  const [customBg, setCustomBg] = useState(null); // Object URL for user-uploaded image
  const customBgUrlRef = useRef(null); // tracks current URL for cleanup
  const customBgInputRef = useRef(null);
  // Photo framing. Defaults are the spec's own `cover` at 50 % 50 %: with the 4:3 source in
  // the 4:3 hero box that shows the whole photo uncropped. They matter for the NEXT photo.
  const [zoom, setZoom] = useState(1); // CSS scale on the photo
  const [offsetY, setOffsetY] = useState(0); // added to object-position's 50 %
  const [scale, setScale] = useState(1);
  const [editHome, setEditHome] = useState({ main: "", sub: "" });
  const [editAway, setEditAway] = useState({ main: "", sub: "" });
  const [editLevel, setEditLevel] = useState("");
  const [editVenue, setEditVenue] = useState("");
  const [teamsMap, setTeamsMap] = useState(new Map()); // "levelId|statGroupId" → teamKey
  // pixelRatio 1 pins the export at exactly 1080×1080 — the default follows the screen's
  // devicePixelRatio, so the same button produced a different-sized PNG on every machine.
  const { downloading, downloadPng } = useExportPng(exportRef, "kiekko-ahma-pelimainos.png", {
    pixelRatio: 1,
    fonts: EXPORT_FONTS,
  });

  // If user edits the fields manually, stop auto-overriding them.
  const homeDirtyRef = useRef(false);
  const awayDirtyRef = useRef(false);
  const levelDirtyRef = useRef(false);
  const venueDirtyRef = useRef(false);

  // Label for one side of the matchup. The Ahma side is rendered as KIEKKO-AHMA + the team
  // key ("U14"), which is why this is side-aware: in an away game Ahma is `match.away`.
  const computeSideEdit = useCallback((m, map, which) => {
    if (!m) return { main: "", sub: "" };
    const raw = (which === "home" ? m.home : m.away) ?? "";
    const parts = splitTeamName(raw);

    if (/kiekko-?ahma/i.test(raw)) {
      // getTeams only knows the sub-series our own team pages track, so friendlies and
      // odd groups miss. Fall back to the age group in the level plus the colour in the
      // team name ("U13 Oranssi") — the crest already says which club it is.
      const teamKey = map?.get(`${m.levelId}|${m.statGroupId}`);
      const age = (String(m.level ?? "").match(/U\d{1,2}/i) || [""])[0].toUpperCase();
      return { main: "KIEKKO-AHMA", sub: teamKey || [age, parts.sub].filter(Boolean).join(" ") };
    }

    // Fallback: whatever comes from the feed
    return { main: parts.main, sub: parts.sub ?? "" };
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
    const uri = buildGamesQueryUri(timestamp, { includeAway });
    const idx = gameId ? parseInt(gameId, 10) : 0;

    const applyMatch = (items) => {
      setTotalMatches(items.length);
      if (idx < items.length) {
        const m = items[idx];
        setMatch(m);
        homeDirtyRef.current = false;
        awayDirtyRef.current = false;
        levelDirtyRef.current = false;
        venueDirtyRef.current = false;

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
  }, [timestamp, gameId, includeAway]);

  // If teamsMap arrives later (or changes), refresh the auto labels — but only
  // if the user hasn't edited the fields manually.
  // Sync all editable fields when match or teamsMap changes, respecting dirty flags.
  useEffect(() => {
    if (!match) return;

    if (!homeDirtyRef.current) {
      const next = computeSideEdit(match, teamsMap, "home");
      setEditHome((prev) => (prev.main === next.main && prev.sub === next.sub ? prev : next));
    }
    if (!awayDirtyRef.current) {
      const next = computeSideEdit(match, teamsMap, "away");
      setEditAway((prev) => (prev.main === next.main && prev.sub === next.sub ? prev : next));
    }
    if (!levelDirtyRef.current) {
      setEditLevel(shortLevel(match.level));
    }
    if (!venueDirtyRef.current) {
      setEditVenue(defaultVenue(match));
    }
  }, [match, teamsMap, computeSideEdit]);

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

  const suffix = includeAway ? "?away=1" : "";
  const goToGame = useCallback(
    (idx) => navigate(`/ads/${timestamp}/${idx}${suffix}`, { replace: true }),
    [navigate, timestamp, suffix]
  );
  // Switching the scope changes the list, so the old index means nothing — start at 0.
  const setScope = useCallback(
    (away) => navigate(`/ads/${timestamp}/0${away ? "?away=1" : ""}`, { replace: true }),
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
    ? { ...match, homeMain: editHome.main, homeSub: editHome.sub, awayMain: editAway.main, awaySub: editAway.sub, level: editLevel, venue: editVenue }
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
                  <GameAdCanvas match={displayMatch} background={activeBackground} zoom={zoom} offsetY={offsetY} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
          <Surface className="ga-controls">
            <div className="ga-field-row">
              <label className="ga-label">Ottelut</label>
              <div className="ga-bg-btns">
                {/* SelectorButton is a 36 px square by default — these two carry words. */}
                <SelectorButton onClick={() => setScope(false)} active={!includeAway} style={GA_WIDE_BTN}>Kotiottelut</SelectorButton>
                <SelectorButton onClick={() => setScope(true)} active={includeAway} style={GA_WIDE_BTN}>Kaikki</SelectorButton>
              </div>
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
            <label className="ga-label">Paikka</label>
            <input
              className="ga-input"
              placeholder="(ei alatekstiä)"
              value={editVenue}
              onChange={(e) => {
                venueDirtyRef.current = true;
                setEditVenue(e.target.value);
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
          {/* Framing the photo is the whole job with these ads — every action shot sits
              differently in the frame, so zoom/nudge beats any fixed crop rule. */}
          <div className="ga-field-row">
            <label className="ga-label">Rajaus</label>
            <div className="ga-bg-btns">
              {/* Floor of 1: scaling below it would pull the photo off its own frame. */}
              <SelectorButton onClick={() => setZoom((z) => Math.max(1, +(z - 0.05).toFixed(2)))} title="Loitonna">−</SelectorButton>
              <SelectorButton onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.05).toFixed(2)))} title="Lähennä">+</SelectorButton>
              <SelectorButton onClick={() => setOffsetY((o) => Math.max(-50, o - 5))} title="Siirrä ylös">↑</SelectorButton>
              <SelectorButton onClick={() => setOffsetY((o) => Math.min(50, o + 5))} title="Siirrä alas">↓</SelectorButton>
              <SelectorButton onClick={() => { setZoom(1); setOffsetY(0); }} title="Palauta">⟲</SelectorButton>
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
//
// Built from plain boxes — rounded rects, circles, borders, shadows — rather than a
// pre-rendered artwork layer, so every element stays independently editable and the ad
// survives a text or logo change. Geometry is hard-coded in 1080-base px; the preview
// scales the whole canvas as one block (see .ga-display-wrap).
//
// Stacking, bottom to top: photo → shade → lower card (10) → team panels (20) → disc (30)
// → footer (40). The disc is a SIBLING of the panels, not a child of the card: it rises
// 136 px above the card's top edge and its shadow has to fall across both panels.

// Bebas has to be measured, not guessed: a name like "KIEKKO-AHMA" and one like
// "TAPPARA AKATEMIA" differ by far more than their character counts suggest. One shared
// canvas context, so fitting text costs nothing per render.
let measureCtx = null;
function textWidth(text, size, tracking) {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  measureCtx.font = `400 ${size}px ${FONT_DISPLAY}`;
  // letter-spacing isn't part of measureText, so add it back: one gap per character,
  // including the trailing one CSS also renders.
  return measureCtx.measureText(text).width + text.length * tracking * size;
}

// Largest size in [min, max] whose rendered width fits `maxWidth`.
function fitSize(text, maxWidth, max, min, tracking) {
  if (!text) return max;
  for (let s = max; s > min; s -= 1) {
    if (textWidth(text, s, tracking) <= maxWidth) return s;
  }
  return min;
}

// Bebas caps do not sit in the middle of their line box: the cap band runs from 9 % to 80 %
// of the font size, so anything centred on the BOX lands visibly below the text. This gives
// the y of the cap band's true centre, which is what a flanking rule has to line up with.
const capCentreY = (boxTop, boxHeight, size) => boxTop + boxHeight / 2 - 0.055 * size;

// A cold load can paint before the webfont arrives, and measuring "KIEKKO-AHMA" against the
// fallback (~40 % wider than Bebas) would shrink a name that actually fits — permanently,
// since nothing would re-measure. Re-render once the face is genuinely available.
function useFontReady(spec) {
  const [ready, setReady] = useState(() => document.fonts?.check(spec) ?? true);
  useEffect(() => {
    if (ready || !document.fonts) return undefined;
    let cancelled = false;
    document.fonts
      .load(spec)
      .then(() => document.fonts.ready)
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ready, spec]);
  return ready;
}

/* ---- pieces -------------------------------------------------------------- */

// The logo box, in panel-relative px (child coordinates start inside the panel's 5 px
// border). Its CENTRE is the fixed point — x 143 puts the crest at canvas x=172 / 908, clear
// of the disc overlapping the panel's inner edge; y 100 sits it between the top edge and the
// name. The box is smaller than the space it owns so the crest gets air on all four sides
// rather than crowding the border and the name.
const LOGO_BOX = { w: 214, h: 146, cx: 151, cy: 100 };
const LOGO_POS = {
  top: LOGO_BOX.cy - LOGO_BOX.h / 2,
  home: LOGO_BOX.cx - LOGO_BOX.w / 2,
  away: 354 - LOGO_BOX.cx - LOGO_BOX.w / 2, // mirrored about the panel's inner width
};

// One side of the matchup. `object-fit: contain` keeps both crests at the same height even
// though their aspect ratios differ — that is the point, not a bug to "fix".
function TeamPanel({ side, logo, name, detail }) {
  const home = side === "home";
  const nameSize = fitSize(name, 288, 52, 38, 0.04);

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 20,
        top: "704px",
        left: home ? "16px" : "700px",
        width: "364px",
        height: "294px",
        boxSizing: "border-box",
        border: `5px solid ${ORANGE}`,
        borderRadius: "26px",
        backgroundColor: "#0D0F11",
        backgroundImage: texture(0.015),
        boxShadow: "0 7px 14px rgba(0,0,0,.48), 0 0 10px rgba(240,110,30,.10), inset 0 1px 0 rgba(255,255,255,.025)",
      }}
    >
      <img
        src={logo}
        alt=""
        decoding="sync"
        style={{
          position: "absolute",
          zIndex: 2,
          top: `${LOGO_POS.top}px`,
          left: `${home ? LOGO_POS.home : LOGO_POS.away}px`,
          width: `${LOGO_BOX.w}px`,
          height: `${LOGO_BOX.h}px`,
          display: "block",
          objectFit: "contain",
          objectPosition: "center",
        }}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 2,
          // Without a qualifier (Edustus has no age group) the name would hang at the top of
          // the 191–280 band; centre it there instead of leaving a hole under it.
          top: detail ? "191px" : "207px",
          left: home ? "7px" : "59px",
          width: "288px",
          height: "58px",
          textAlign: "center",
          fontSize: `${nameSize}px`,
          lineHeight: "58px",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          textShadow: "0 2px 4px rgba(0,0,0,.75)",
        }}
      >
        {name}
      </div>
      {detail && (
        <div
          style={{
            position: "absolute",
            zIndex: 2,
            top: "244px",
            left: home ? "7px" : "59px",
            width: "288px",
            height: "36px",
            textAlign: "center",
            fontSize: `${fitSize(detail, 288, 36, 24, 0.1)}px`,
            lineHeight: "36px",
            letterSpacing: "0.1em",
            color: ORANGE,
            whiteSpace: "nowrap",
            textShadow: "0 2px 4px rgba(0,0,0,.75)",
          }}
        >
          {detail}
        </div>
      )}
    </div>
  );
}

// The match disc. Four concentric edges — outer rim, dark gap, orange ring, inner hairline —
// are built as separate rings rather than one `double` border, which is the only way to
// control the gap between them exactly. The orange ring's glow lives on its own layer so it
// never blurs the type.
function MatchDisc({ dayStr, timeStr, competition }) {
  const compSize = fitSize(competition, 252, 58, 34, 0.1);

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 30,
        isolation: "isolate",
        left: "314px",
        top: "544px",
        width: "452px",
        height: "452px",
        boxSizing: "border-box",
        border: "2px solid #373B3F",
        borderRadius: "50%",
        backgroundColor: "#0B0D0F",
        backgroundImage: `${texture(0.018)},
          radial-gradient(circle at 42% 24%, #202327 0%, #101214 49%, #08090A 100%)`,
        boxShadow:
          "0 18px 32px rgba(0,0,0,.82), 0 5px 10px rgba(0,0,0,.70), 0 0 0 5px rgba(0,0,0,.58), 0 0 28px rgba(240,110,30,.14), inset 0 2px 3px rgba(255,255,255,.06)",
      }}
    >
      {/* orange ring — inset 8 px from the border's inner edge = 10 px from the outer box */}
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          inset: "8px",
          borderRadius: "50%",
          border: `6px solid ${ORANGE}`,
          boxShadow: "0 0 10px rgba(240,110,30,.42), inset 0 0 9px rgba(240,110,30,.12)",
        }}
      />
      {/* inner hairline that closes the ring off against the disc face */}
      <div style={{ position: "absolute", zIndex: 2, inset: "20px", borderRadius: "50%", border: "1px solid #33363A" }} />

      <div
        style={{
          position: "absolute",
          zIndex: 3,
          left: "54px",
          top: "66px",
          width: "340px",
          height: "66px",
          textAlign: "center",
          fontSize: "64px",
          lineHeight: "66px",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          textShadow: "0 3px 6px rgba(0,0,0,.70)",
        }}
      >
        {dayStr}
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          left: "38px",
          top: "132px",
          width: "372px",
          height: "166px",
          textAlign: "center",
          fontSize: "166px",
          lineHeight: "166px",
          letterSpacing: 0, // at 166 px the time only fits inside the ring with no tracking
          color: ORANGE,
          fontVariantNumeric: "lining-nums tabular-nums",
          whiteSpace: "nowrap",
          textShadow: "0 3px 6px rgba(0,0,0,.70)",
        }}
      >
        {timeStr}
      </div>
      {competition && (
        <div
          style={{
            position: "absolute",
            zIndex: 3,
            left: "98px",
            top: "300px",
            width: "252px",
            height: "62px",
            textAlign: "center",
            fontSize: `${compSize}px`,
            lineHeight: "62px",
            letterSpacing: "0.1em",
            color: ORANGE,
            whiteSpace: "nowrap",
            textShadow: "0 3px 6px rgba(0,0,0,.70)",
          }}
        >
          {competition}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          zIndex: 3,
          left: "174px",
          top: "378px",
          width: "100px",
          height: "5px",
          borderRadius: "3px",
          background: ORANGE,
          boxShadow: "0 0 6px rgba(240,110,30,.18)",
        }}
      />
    </div>
  );
}

function GameAdCanvas({ match, background, zoom, offsetY }) {
  useFontReady(`400 166px ${FONT_DISPLAY}`); // re-renders once Bebas is measurable
  const timeStr = moment(match.date).format("HH:mm");
  const dayStr = moment(match.date).format("dd D.M.").toUpperCase();

  return (
    <div
      style={{
        position: "relative",
        isolation: "isolate",
        width: `${CANVAS_SIZE}px`,
        height: `${CANVAS_SIZE}px`,
        overflow: "hidden", // clips the shadows that reach past the square
        background: INK,
        fontFamily: FONT_DISPLAY,
        fontWeight: 400,
        color: "#ffffff",
      }}
    >
      {/* ── photo ──
          1080×810 is the source photo's own 4:3, so at zoom 1 `cover` shows all of it and
          crops nothing. zoom/offsetY exist because the next photo won't be 4:3. */}
      <div style={{ position: "absolute", zIndex: 0, left: 0, top: 0, width: `${CANVAS_SIZE}px`, height: `${HERO_H}px`, overflow: "hidden" }}>
        <img
          data-export-bg="1"
          decoding="sync"
          src={background}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "cover",
            objectPosition: `50% ${50 + offsetY}%`,
            transform: `scale(${zoom})`,
            transformOrigin: "center center",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          left: 0,
          top: 0,
          width: `${CANVAS_SIZE}px`,
          height: `${HERO_H}px`,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 61%, rgba(21,23,27,.18) 78%, rgba(21,23,27,.85) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          zIndex: 3,
          left: "90px",
          top: "14px",
          width: "900px",
          height: "46px",
          textAlign: "center",
          fontSize: "34px",
          lineHeight: "46px",
          letterSpacing: "0.18em",
          textIndent: "0.18em", // cancels the trailing letter-space so it stays optically centred
          whiteSpace: "nowrap",
          textShadow: "0 2px 5px rgba(0,0,0,.8)",
        }}
      >
        WWW.KIEKKO-AHMA.FI
      </div>

      {/* ── lower card ── */}
      <div
        style={{
          position: "absolute",
          zIndex: 10,
          left: 0,
          top: "680px",
          width: `${CANVAS_SIZE}px`,
          height: "400px",
          boxSizing: "border-box",
          border: "2px solid #292C31",
          borderRadius: "36px",
          backgroundColor: INK,
          backgroundImage: `${texture(0.025)}, linear-gradient(180deg, #15171B 0%, #090A0C 100%)`,
          boxShadow: "0 -14px 32px rgba(0,0,0,.72), inset 0 2px 0 rgba(255,255,255,.035)",
        }}
      />

      <TeamPanel side="home" logo={match.home_logo} name={match.homeMain} detail={match.homeSub} />
      <TeamPanel side="away" logo={match.away_logo} name={match.awayMain} detail={match.awaySub} />

      <MatchDisc dayStr={dayStr} timeStr={timeStr} competition={match.level} />

      {/* ── footer ── */}
      <Footer text={match.venue} />
    </div>
  );
}

// Venue line flanked by two rules. The rules are placed off the text's cap centre, not the
// line box, and the y is recomputed from the fitted size so a long venue name that shrinks
// the type does not leave the rules behind.
function Footer({ text }) {
  const size = fitSize(text, 560, 28, 18, 0.18);
  const ruleTop = capCentreY(1020, 36, size) - 2; // 2 = half the rule's 4 px height
  const rule = { position: "absolute", zIndex: 40, top: `${ruleTop}px`, width: "164px", height: "4px", borderRadius: "2px", background: ORANGE };

  return (
    <>
      <div style={{ ...rule, left: "88px" }} />
      <div
        style={{
          position: "absolute",
          zIndex: 40,
          left: "260px",
          top: "1020px",
          width: "560px",
          height: "36px",
          textAlign: "center",
          fontSize: `${size}px`,
          lineHeight: "36px",
          letterSpacing: "0.18em",
          textIndent: "0.18em",
          color: STEEL,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
      <div style={{ ...rule, left: "828px" }} />
    </>
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
