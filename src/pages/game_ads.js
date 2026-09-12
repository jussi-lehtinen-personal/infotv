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

// Lighting vocabulary borrowed from the weekly listing ad (ads.js) so the two ads read as
// one family: a warm sheen on every top edge, and beams that fade out at both ends instead
// of stopping dead. Deliberately restrained — these sit under type that has to stay sharp.
const CARD_HILITE = "inset 0 2px 0 rgba(255,168,96,0.30)";
const GLOW_LINE = "linear-gradient(90deg, rgba(240,110,30,0) 0%, #FFC08A 52%, rgba(240,110,30,0) 100%)";
const STREAK_LINE = "linear-gradient(90deg, rgba(255,214,180,0) 0%, rgba(255,217,180,0.85) 50%, rgba(255,214,180,0) 100%)";
const CORNER_GLOW = "radial-gradient(60% 100% at 18% 0%, rgba(255,150,72,0.13) 0%, rgba(240,110,30,0.04) 45%, rgba(240,110,30,0) 100%)";

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
  // Photo framing. Defaults show the whole 4:3 source uncropped in the 4:3 hero box.
  const [zoom, setZoom] = useState(1); // CSS scale on the photo
  const [offsetY, setOffsetY] = useState(0); // vertical pan, canvas px
  const [bgAspect, setBgAspect] = useState(null); // w/h of the loaded photo
  const [layout, setLayout] = useState("v"); // see LAYOUTS near the bottom of this file
  const [scale, setScale] = useState(1);
  const [headerH, setHeaderH] = useState(null); // feeds --ga-header on wide screens
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

  // Scale the 1080 canvas down to whatever width the wrapper actually got. Observed rather
  // than listening for window resize: on wide screens the wrapper's width comes from a CSS
  // variable the layout sets after mount, and a window-only listener left the preview
  // rendering at a stale scale — wider than its own frame.
  // Deliberately NOT a ResizeObserver on the wrapper: setting the scale changes that very
  // element's height, so observing it makes it retrigger itself ("ResizeObserver loop
  // completed with undelivered notifications"). Window resize covers the user resizing, and
  // the headerH dependency covers the one other thing that moves the wrapper's width — the
  // header measurement below feeding the wide-screen CSS.
  useEffect(() => {
    const update = () => {
      if (wrapperRef.current) setScale(wrapperRef.current.offsetWidth / CANVAS_SIZE);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [headerH]);

  // Publish the page header's real height so the wide-screen CSS can size the ad against
  // it. The game picker wraps to a second row once the week has enough games, so a
  // hard-coded reserve is always wrong one way or the other: too big wastes most of a short
  // viewport, too small pushes the bottom of the ad behind the BottomNav.
  useEffect(() => {
    const el = document.querySelector(".ga-page-header");
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    // Height only: the grid's tracks are content-sized, so the header's WIDTH depends on the
    // canvas track, which depends on this very value. Reacting to the width would make the
    // measurement chase itself. The height changes only if the game picker rewraps.
    const apply = () => setHeaderH((prev) => (prev === el.offsetHeight ? prev : el.offsetHeight));
    apply();
    const ro = new ResizeObserver(apply);
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

  // How far the photo can be panned depends on how much of it the crop throws away, which
  // depends on the photo's own shape — so we have to know it.
  useEffect(() => {
    if (!activeBackground) return undefined;
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => { if (!cancelled) setBgAspect(probe.naturalWidth / probe.naturalHeight); };
    probe.src = activeBackground;
    return () => { cancelled = true; };
  }, [activeBackground]);

  // Vertical slack in canvas px, i.e. how far the photo may travel before a gap shows.
  // `cover` scales by whichever side is short, so a photo the same shape as the box has
  // none at zoom 1 — that is why the nudge buttons raise the zoom to make room.
  const panLimit = useCallback(
    (z) => {
      const shown = Math.max(HERO_H, CANVAS_SIZE / (bgAspect || CANVAS_SIZE / HERO_H));
      return Math.max(0, (shown * z - HERO_H) / 2);
    },
    [bgAspect]
  );

  const nudge = useCallback(
    (delta) => {
      // A photo cropped to exactly the frame has nothing to pan; zoom in a touch first so
      // the button does something instead of looking broken.
      const z = panLimit(zoom) > 0 ? zoom : 1.12;
      if (z !== zoom) setZoom(z);
      const lim = panLimit(z);
      setOffsetY((o) => Math.max(-lim, Math.min(lim, o + delta)));
    },
    [panLimit, zoom]
  );

  // Zooming back out shrinks the slack; drag the pan back inside it so no gap appears.
  useEffect(() => {
    const lim = panLimit(zoom);
    setOffsetY((o) => Math.max(-lim, Math.min(lim, o)));
  }, [zoom, panLimit]);

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
      <div className="ga-root" style={headerH ? { "--ga-header": `${headerH}px` } : undefined}>

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
                  <GameAdCanvas match={displayMatch} background={activeBackground} zoom={zoom} offsetY={offsetY} layout={layout} />
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
              <label className="ga-label">Tyyli</label>
              <div className="ga-bg-btns">
                {Object.entries(LAYOUTS).map(([key, l]) => (
                  <SelectorButton key={key} onClick={() => setLayout(key)} active={layout === key} style={GA_WIDE_BTN}>
                    {l.label}
                  </SelectorButton>
                ))}
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
              <SelectorButton onClick={() => nudge(-24)} title="Siirrä ylös">↑</SelectorButton>
              <SelectorButton onClick={() => nudge(24)} title="Siirrä alas">↓</SelectorButton>
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
// of the font size, so its centre is ABOVE the box centre by this much. Anything meant to
// read as level with the text — a flanking rule — has to be shifted by it, or it lands
// visibly low.
const capCentreShift = (size) => -0.055 * size;

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
        backgroundImage: `${CORNER_GLOW}, ${texture(0.015)}`,
        boxShadow: `0 7px 14px rgba(0,0,0,.48), 0 0 10px rgba(240,110,30,.10), ${CARD_HILITE}`,
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
          "0 18px 32px rgba(0,0,0,.82), 0 5px 10px rgba(0,0,0,.70), 0 0 0 5px rgba(0,0,0,.58), 0 0 34px rgba(240,110,30,.20), inset 0 3px 4px rgba(255,168,96,.16)",
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
          left: "154px",
          top: "378px",
          width: "140px", // wider than the solid rule was: a beam needs room to fade out
          height: "5px",
          borderRadius: "3px",
          background: GLOW_LINE,
        }}
      />
    </div>
  );
}

// Photo + its darkening gradient + the site strap. Shared by both layouts: 1080×810 is the
// source photo's own 4:3, so at zoom 1 `cover` shows all of it and crops nothing. zoom and
// offsetY exist because the next photo won't be 4:3.
function Hero({ background, zoom, offsetY, shade }) {
  return (
    <>
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
            // Pan via translate, NOT object-position: with a 4:3 photo in this 4:3 box
            // `cover` leaves zero overflow, so object-position has nothing to shift and the
            // nudge buttons would do nothing. translateY always moves the photo; the caller
            // clamps it to whatever the crop actually allows. Divided by zoom because the
            // translate happens inside the scale.
            transform: `scale(${zoom}) translateY(${offsetY / zoom}px)`,
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
          background: `linear-gradient(to bottom, ${shade})`,
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
    </>
  );
}

/* ---- layout A: disc ------------------------------------------------------ */

function DiscLayout({ match, background, zoom, offsetY, dayStr, timeStr }) {
  return (
    <>
      <Hero
        background={background}
        zoom={zoom}
        offsetY={offsetY}
        shade="rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 61%, rgba(21,23,27,.18) 78%, rgba(21,23,27,.85) 100%"
      />

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
          backgroundImage: `${CORNER_GLOW}, ${texture(0.025)}, linear-gradient(180deg, #15171B 0%, #090A0C 100%)`,
          boxShadow: `0 -14px 32px rgba(0,0,0,.72), ${CARD_HILITE}`,
        }}
      />
      {/* Beam along the card's top edge, brightest under the disc — the same fade-at-both-
          ends treatment as the listing ad's first-card streak. */}
      <div style={{ position: "absolute", zIndex: 11, left: "36px", right: "36px", top: "680px", height: "2px", background: STREAK_LINE, pointerEvents: "none" }} />

      <TeamPanel side="home" logo={match.home_logo} name={match.homeMain} detail={match.homeSub} />
      <TeamPanel side="away" logo={match.away_logo} name={match.awayMain} detail={match.awaySub} />

      <MatchDisc dayStr={dayStr} timeStr={timeStr} competition={match.level} />

      <Footer text={match.venue} />
    </>
  );
}

/* ---- layout B: V --------------------------------------------------------- */
//
// The photo meets the dark lower surface along two slanted orange bars that fall from the
// edges to the centre, and a narrow panel tapering downwards sits on top of them. Every
// slanted edge is a clip-path polygon — a CSS border would follow the element's rectangle,
// not the polygon, so the 6 px orange edge is built as three identically sized stacked
// shapes whose polygons are offset PERPENDICULARLY by 0 / 6 / 9 px. (A scale() transform
// would give a different edge thickness on each side of a tapering shape.)

// Both layouts carry the SAME information in the same places: date/time/series in the middle
// and venue/price along the bottom. That forced two departures from the V reference, where
// the panel ran off the bottom edge and the venue lived inside it:
//   1. the whole lower composition moves up 55 px, because the team blocks used to end at
//      y=1057 — on top of the shared footer;
//   2. the panel is cut at local y=419 instead of 484, so it stops above the footer. The
//      long edges keep the reference's angle, so the silhouette is the reference's minus the
//      part that was being clipped by the canvas edge anyway (166 px wide here vs 145 there).
// The inset polygons are the outer one offset PERPENDICULARLY by 6 and 9 px, recomputed for
// the new cut — the same routine reproduces the reference spec's own numbers exactly.
const V_SHIFT = 55;
const V_PANEL = { x: 270, y: 640 - V_SHIFT, w: 540, h: 419 };
const V_OUTER = "polygon(26px 0px, 514px 0px, 540px 52px, 353.102px 419px, 186.898px 419px, 0px 52px)";
const V_INSET_6 = "polygon(29.708px 6px, 510.292px 6px, 533.279px 51.975px, 349.424px 413px, 190.576px 413px, 6.721px 51.975px)";
const V_INSET_9 = "polygon(31.562px 9px, 508.438px 9px, 529.919px 51.963px, 347.585px 410px, 192.415px 410px, 10.081px 51.963px)";

// How wide the textured face actually is at a given panel-local y. Derived from V_INSET_9's
// two long edges rather than hard-coded, so text fitting stays honest if the shape is
// retuned: the panel narrows by ~1.02 px for every px down, and a 416 px-wide centred text
// box means nothing once the shape has closed in past it.
const V_FACE_TOP_W = 529.919 - 10.081;
const V_FACE_TAPER = (2 * (225.517 - 10.081)) / (475 - 51.963);
const vFaceWidth = (localY) => V_FACE_TOP_W - V_FACE_TAPER * (localY - 51.963);
const V_TEXT_PAD = 16; // keeps glyphs off the recess rather than just barely inside it

// Fit to the width at the text's BOTTOM edge — that is where a tapering panel is narrowest
// and where descender-free Bebas caps still reach.
const fitInPanel = (text, bottomY, max, min, tracking) =>
  fitSize(text, vFaceWidth(bottomY) - V_TEXT_PAD, max, min, tracking);

function VTeam({ side, logo, name, detail }) {
  const left = side === "home" ? 20 : 758;
  return (
    <div style={{ position: "absolute", zIndex: 20, top: `${778 - V_SHIFT}px`, left: `${left}px`, width: "302px", height: "279px", textAlign: "center" }}>
      {/* Logo box sized a little inside the space it owns (was 250×168 flush to the name),
          so the crest gets air and there is a clear gap before the team name. Centre held
          at x=151 within the group. */}
      <img
        src={logo}
        alt=""
        decoding="sync"
        style={{ position: "absolute", left: "41px", top: 0, width: "220px", height: "148px", display: "block", objectFit: "contain", objectPosition: "center" }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          // No qualifier (Edustus has no age group) → centre the name in the 173–279 band
          // instead of leaving a hole under it.
          top: detail ? "173px" : "205px",
          width: "302px",
          height: "60px",
          fontSize: `${fitSize(name, 302, 52, 36, 0.04)}px`,
          lineHeight: "60px",
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
            left: 0,
            top: "237px",
            width: "302px",
            height: "42px",
            fontSize: `${fitSize(detail, 302, 42, 26, 0.06)}px`,
            lineHeight: "42px",
            letterSpacing: "0.06em",
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

function VLayout({ match, background, zoom, offsetY, dayStr, timeStr }) {
  const shape = { position: "absolute", inset: 0, pointerEvents: "none" };
  const y = (n) => n - V_SHIFT; // the V composition sits 55 px higher than the reference

  return (
    <>
      <Hero
        background={background}
        zoom={zoom}
        offsetY={offsetY}
        shade="rgba(0,0,0,.30) 0%, rgba(0,0,0,0) 16%, rgba(0,0,0,0) 80%, rgba(21,23,27,.32) 100%"
      />

      {/* Dark lower surface. The clip is on the child and the shadow on the wrapper, so the
          shadow follows the V rather than the element's rectangle. */}
      <div style={{ position: "absolute", zIndex: 10, inset: 0, pointerEvents: "none", filter: "drop-shadow(0 -8px 14px rgba(0,0,0,.58))" }}>
        <div
          style={{
            ...shape,
            clipPath: `polygon(0px ${y(630)}px, 540px ${y(842)}px, 1080px ${y(630)}px, 1080px 1080px, 0px 1080px)`,
            backgroundColor: INK,
            backgroundImage: `${texture(0.008)}, linear-gradient(180deg, #15171B 0%, #0B0D0F 100%)`,
          }}
        />
      </div>

      {/* Orange bars. Their lower edge shares the surface's upper points exactly, so no sliver
          of photo can show through the join. */}
      <div
        style={{
          ...shape,
          zIndex: 12,
          clipPath: `polygon(0px ${y(606)}px, 540px ${y(818)}px, 1080px ${y(606)}px, 1080px ${y(630)}px, 540px ${y(842)}px, 0px ${y(630)}px)`,
          background: ORANGE,
        }}
      />
      {/* Warm sheen riding the bar's top edge, brightest at the V's vertex. The bar is a
          clip-path, so a box-shadow inset would follow the element's rectangle instead —
          hence a second clipped band 3 px thick. */}
      <div
        style={{
          ...shape,
          zIndex: 12,
          clipPath: `polygon(0px ${y(606)}px, 540px ${y(818)}px, 1080px ${y(606)}px, 1080px ${y(609)}px, 540px ${y(821)}px, 0px ${y(609)}px)`,
          background: STREAK_LINE,
        }}
      />
      {/* The dark surface's own highlight, following the V. This is the disc layout's warm
          card edge (inset 0 2px 0 rgba(255,168,96,.30)) in the only place it can show here:
          the surface's true top edge is hidden under the orange bar. */}
      <div
        style={{
          ...shape,
          zIndex: 13,
          clipPath: `polygon(0px ${y(648)}px, 540px ${y(860)}px, 1080px ${y(648)}px, 1080px ${y(650)}px, 540px ${y(862)}px, 0px ${y(650)}px)`,
          background: "rgba(255,168,96,.34)",
        }}
      />

      <VTeam side="home" logo={match.home_logo} name={match.homeMain} detail={match.homeSub} />
      <VTeam side="away" logo={match.away_logo} name={match.awayMain} detail={match.awaySub} />

      {/* Centre panel. The wrapper carries only the drop-shadows — no background, no clip,
          no overflow — so the shadow traces the children's silhouette. It overhangs the
          canvas by 44 px on purpose; the ad's own overflow:hidden trims it. */}
      <div
        style={{
          position: "absolute",
          zIndex: 30,
          isolation: "isolate",
          left: `${V_PANEL.x}px`,
          top: `${V_PANEL.y}px`,
          width: `${V_PANEL.w}px`,
          height: `${V_PANEL.h}px`,
          filter:
            "drop-shadow(0 14px 18px rgba(0,0,0,.82)) drop-shadow(0 4px 5px rgba(0,0,0,.65)) drop-shadow(0 0 7px rgba(240,110,30,.20))",
        }}
      >
        <div style={{ ...shape, zIndex: 0, clipPath: V_OUTER, background: ORANGE }} />
        <div style={{ ...shape, zIndex: 1, clipPath: V_INSET_6, background: "#080A0C" }} />
        <div
          style={{
            ...shape,
            zIndex: 2,
            clipPath: V_INSET_9,
            backgroundColor: "#101214",
            backgroundImage: `${CORNER_GLOW}, ${texture(0.012)}, linear-gradient(155deg, #1B1E22 0%, #101214 48%, #090B0D 100%)`,
          }}
        />
        {/* The panel's top edge is the one horizontal run in the shape, so the bright streak
            can simply be a rectangle — laid ON the orange border, brightest at the centre. */}
        <div style={{ position: "absolute", zIndex: 2, left: "26px", top: "1px", width: "488px", height: "3px", background: STREAK_LINE, pointerEvents: "none" }} />

        <div style={{ position: "absolute", zIndex: 3, inset: 0, clipPath: V_INSET_9 }}>
          <div
            style={{
              position: "absolute",
              left: "80px",
              top: "38px", // +12 on the reference: the date was crowding the orange border
              width: "380px",
              height: "64px",
              textAlign: "center",
              fontSize: `${fitInPanel(dayStr, 102, 60, 40, 0.04)}px`,
              lineHeight: "64px",
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
              left: "62px",
              top: "100px",
              width: "416px",
              height: "160px",
              textAlign: "center",
              fontSize: `${fitInPanel(timeStr, 260, 148, 110, 0)}px`,
              lineHeight: "160px",
              letterSpacing: 0,
              color: ORANGE,
              fontVariantNumeric: "lining-nums tabular-nums",
              whiteSpace: "nowrap",
              textShadow: "0 3px 6px rgba(0,0,0,.70)",
            }}
          >
            {timeStr}
          </div>
          <div style={{ position: "absolute", left: "176px", top: "263px", width: "188px", height: "4px", borderRadius: "2px", background: GLOW_LINE }} />
          {/* Series pushed down from the reference's 287: with the venue gone to the shared
              footer the block sat high in the panel. The taper still leaves ~205 px of face
              at its baseline, so it has room down here. */}
          {match.level && (
            <div
              style={{
                position: "absolute",
                left: "122px",
                top: "309px",
                width: "296px",
                height: "52px",
                textAlign: "center",
                fontSize: `${fitInPanel(match.level, 339, 48, 26, 0.1)}px`,
                lineHeight: "52px",
                letterSpacing: "0.1em",
                textIndent: "0.1em",
                color: ORANGE,
                whiteSpace: "nowrap",
                textShadow: "0 3px 6px rgba(0,0,0,.70)",
              }}
            >
              {match.level}
            </div>
          )}
        </div>
      </div>

      {/* Overlay glow, same treatment as the listing ad's first-card streak. It sits OUTSIDE
          the panel wrapper on purpose: that wrapper's drop-shadow traces its children's
          silhouette, so a soft box in there would smear the panel's own shadow. Centred on
          the orange top border and spent before it reaches the date's cap line. */}
      <div
        style={{
          position: "absolute",
          zIndex: 31,
          // Well right of centre, like the listing ad's streak — a highlight reads as light
          // falling across the panel, and dead-centre reads as a symmetrical decal.
          left: "470px",
          top: `${V_PANEL.y - 45}px`,
          width: "360px",
          height: "90px",
          background: "radial-gradient(ellipse at center, rgba(255,186,110,0.50) 0%, rgba(240,110,30,0.14) 40%, rgba(240,110,30,0) 72%)",
          pointerEvents: "none",
        }}
      />

      <Footer text={match.venue} />
    </>
  );
}

const LAYOUTS = {
  v: { label: "V", Component: VLayout },
  disc: { label: "Kiekko", Component: DiscLayout },
};

function GameAdCanvas({ match, background, zoom, offsetY, layout }) {
  useFontReady(`400 166px ${FONT_DISPLAY}`); // re-renders once Bebas is measurable
  const timeStr = moment(match.date).format("HH:mm");
  const dayStr = moment(match.date).format("dd D.M.").toUpperCase();
  const Layout = (LAYOUTS[layout] ?? LAYOUTS.disc).Component;

  return (
    <div
      style={{
        position: "relative",
        isolation: "isolate",
        width: `${CANVAS_SIZE}px`,
        height: `${CANVAS_SIZE}px`,
        overflow: "hidden", // clips the shadows and the V panel's overhang past the square
        background: INK,
        fontFamily: FONT_DISPLAY,
        fontWeight: 400,
        color: "#ffffff",
      }}
    >
      <Layout match={match} background={background} zoom={zoom} offsetY={offsetY} dayStr={dayStr} timeStr={timeStr} />
    </div>
  );
}

// Venue line flanked by two rules. The rules are placed off the text's cap centre, not the
// line box, and the y is recomputed from the fitted size so a long venue name that shrinks
// the type does not leave the rules behind.
// Venue line flanked by two rules. Laid out as a centred flex row so the rules sit right
// next to the text whatever its length — pinned to fixed x they drifted out under the team
// blocks and read as belonging to those instead of to the venue.
function Footer({ text }) {
  if (!text) return null;
  const size = fitSize(text, 520, 28, 18, 0.18);
  const capShift = capCentreShift(size);
  // Beams rather than solid bars, fading outwards so they lead the eye in to the venue.
  const fadeOut = (dir) => `linear-gradient(${dir}, rgba(240,110,30,0) 0%, #FFB87A 55%, ${ORANGE} 100%)`;
  const rule = { position: "relative", top: `${capShift}px`, flex: "0 0 auto", width: "120px", height: "4px", borderRadius: "2px" };

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 40,
        left: 0,
        right: 0,
        top: "1020px",
        height: "36px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "26px",
      }}
    >
      <div style={{ ...rule, background: fadeOut("90deg") }} />
      <div
        style={{
          flex: "0 0 auto",
          fontSize: `${size}px`,
          lineHeight: "36px",
          letterSpacing: "0.18em",
          // Letter-spacing also lands after the last glyph; without this the box is wider
          // than what you see and the two gaps come out lopsided.
          marginRight: "-0.18em",
          color: STEEL,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
      <div style={{ ...rule, background: fadeOut("270deg") }} />
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

/* Wide screens: canvas on the left, editor beside it, so a nudge and its result are both
   in view. Grid rather than a wrapper div, so the same three blocks re-flow into either
   shape with no DOM change and the phone layout stays exactly as it was.
   The preview scales itself off .ga-display-wrap's measured width, so the canvas simply
   gets bigger here — nothing to keep in sync. */
@media (min-width: 1000px) {
  .ga-root {
    /* The ad is square, so one number sets both its width and its height, and the SAME
       value drives the grid column so the canvas fills its track exactly and lines up with
       the header above it. Take the smaller of what the row has spare and what is left of
       the viewport height once the header (measured — see --ga-header), the top padding,
       the gap and the BottomNav are out. 40px = 16 padding + 16 gap + a little slack. */
    --ga-header: 150px; /* replaced by the measured value on mount */
    --ga-canvas: min(
      calc(100vw - 540px),
      calc(100dvh - var(--ga-header) - var(--ui-bottom-nav-clearance, 80px) - 40px)
    );

    display: grid;
    grid-template-columns: minmax(0, var(--ga-canvas)) minmax(360px, 480px);
    /* Title + game picker stay on top across the full width; canvas and editor sit side
       by side underneath. */
    grid-template-areas:
      "header header"
      "canvas controls";
    grid-template-rows: auto 1fr;
    align-content: start;
    /* Tracks are content-sized, so centre them instead of stretching to the window: that
       is what puts the header's two ends on the canvas and the editor. */
    justify-content: center;
    gap: 16px;
  }
  .ga-page-header { grid-area: header; max-width: none; }
  .ga-controls {
    grid-area: controls;
    max-width: none;
    align-self: start;
    /* Square canvas, so its width is also its height — matching it makes the two panes one
       symmetrical block. min-height, not height: on a short window the canvas shrinks below
       what the fields need, and a fixed height there put the download button behind a
       scrollbar. Better to lose the symmetry in that one case than to hide the CTA. */
    min-height: var(--ga-canvas);
  }
  /* Soaks up the leftover height so the gap lands above the download button instead of
     below it, and the button sits on the canvas's bottom edge. */
  .ga-controls .ga-separator { margin-top: auto; }
  .ga-display-wrap {
    grid-area: canvas;
    align-self: start;
    max-width: none; /* the track already limits it */
  }
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
