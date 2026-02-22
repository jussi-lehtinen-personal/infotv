import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { toPng } from "html-to-image";
import {
  getMockGameData,
  processIncomingDataEventsDoNotStrip,
  buildGamesQueryUri,
  splitTeamName,
} from "../Util";

import "@fontsource/bebas-neue";
import "moment/locale/fi";

var moment = require("moment");
moment.locale("fi");

const BACKGROUNDS = [
  "/background.jpg",
  "/background2.jpg",
  "/background3.jpg",
  "/background4.jpg",
  "/background5.jpg",
  "/background6.jpg",
];

const CANVAS_SIZE = 1080;
const ORANGE = "#f97316";

/* ============================= */
/*           PAGE                */
/* ============================= */

const GameAds = () => {
  const exportRef = useRef(null);
  const wrapperRef = useRef(null);
  const { timestamp, gameId } = useParams();

  const [match, setMatch] = useState(null);
  const [bgIndex, setBgIndex] = useState(() => Math.floor(Math.random() * BACKGROUNDS.length));
  const [scale, setScale] = useState(1);
  const [editHome, setEditHome] = useState({ main: "", sub: "" });
  const [editAway, setEditAway] = useState({ main: "", sub: "" });
  const [editLevel, setEditLevel] = useState("");

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

  // Fetch game data
  useEffect(() => {
    const controller = new AbortController();
    const uri = buildGamesQueryUri(timestamp);
    const idx = gameId ? parseInt(gameId, 10) : 0;

    const applyMatch = (items) => {
      if (idx < items.length) {
        const m = items[idx];
        setMatch(m);
        const home = splitTeamName(m.home ?? "");
        const away = splitTeamName(m.away ?? "");
        setEditHome({ main: home.main, sub: home.sub ?? "" });
        setEditAway({ main: away.main, sub: away.sub ?? "" });
        setEditLevel(m.level ?? "");
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
  }, [timestamp, gameId]);

  const downloadPng = useCallback(() => {
    if (!exportRef.current) return;
    toPng(exportRef.current, { cacheBust: false })
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "kiekko-ahma-pelimainos.png";
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => console.error("PNG export error:", err));
  }, []);

  const displayMatch = match
    ? { ...match, homeMain: editHome.main, homeSub: editHome.sub, awayMain: editAway.main, awaySub: editAway.sub, level: editLevel }
    : null;

  return (
    <div>
      <style>{css}</style>
      <div className="ga-root">

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
                  <GameAdCanvas match={displayMatch} background={BACKGROUNDS[bgIndex]} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="ga-controls">
          <div className="ga-field-row">
            <label className="ga-label">Kotijoukkue</label>
            <input
              className="ga-input"
              value={editHome.main}
              onChange={(e) => setEditHome((p) => ({ ...p, main: e.target.value }))}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label ga-label--sub">Lisäteksti</label>
            <input
              className="ga-input ga-input--sub"
              placeholder="(ei lisätekstiä)"
              value={editHome.sub}
              onChange={(e) => setEditHome((p) => ({ ...p, sub: e.target.value }))}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label">Vierasjoukkue</label>
            <input
              className="ga-input"
              value={editAway.main}
              onChange={(e) => setEditAway((p) => ({ ...p, main: e.target.value }))}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label ga-label--sub">Lisäteksti</label>
            <input
              className="ga-input ga-input--sub"
              placeholder="(ei lisätekstiä)"
              value={editAway.sub}
              onChange={(e) => setEditAway((p) => ({ ...p, sub: e.target.value }))}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label">Sarja</label>
            <input
              className="ga-input"
              value={editLevel}
              onChange={(e) => setEditLevel(e.target.value)}
            />
          </div>
          <div className="ga-field-row">
            <label className="ga-label">Tausta</label>
            <div className="ga-bg-btns">
              {BACKGROUNDS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`ga-bg-btn${bgIndex === i ? " ga-bg-btn--active" : ""}`}
                  onClick={() => setBgIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
          <button className="ga-download-btn" onClick={downloadPng}>
            Lataa PNG
          </button>
        </div>

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
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url('${background}')`,
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
          opacity: 0.6,
        }}
      />

      {/* Gradient overlay — darkens towards bottom */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.25) 35%, rgba(0,0,0,0.80) 62%, rgba(0,0,0,0.97) 100%)",
        }}
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
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
          }}
        >
          <div
            style={{
              fontSize: "100px",
              color: "#ffffff",
              letterSpacing: "4px",
              lineHeight: 1,
              textShadow: "0 4px 20px rgba(0,0,0,0.8)",
            }}
          >
            KIEKKO-AHMA
          </div>
          <div
            style={{
              fontSize: "50px",
              color: ORANGE,
              letterSpacing: "4px",
              lineHeight: 1.1,
              textShadow: "0 2px 10px rgba(0,0,0,0.8)",
            }}
          >
            {match.level}
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
            background: "rgba(8,8,8,0.97)",
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
            <img
              src={match.home_logo}
              alt=""
              style={{
                width: "140px",
                height: "140px",
                objectFit: "contain",
                background: "white",
                borderRadius: "50%",
                padding: "10px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
              }}
            />
            <div style={{ textAlign: "center", lineHeight: 1.05 }}>
              <div
                style={{
                  fontSize: "56px",
                  color: ORANGE,
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
                    color: "rgba(255,255,255,0.80)",
                    letterSpacing: "2px",
                    textShadow: "0 2px 6px rgba(0,0,0,0.8)",
                  }}
                >
                  {match.homeSub}
                </div>
              )}
            </div>
          </div>

          {/* Date + time */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "2px",
            }}
          >
            <div
              style={{
                fontSize: "46px",
                color: "#ffffff",
                letterSpacing: "2px",
                lineHeight: 1.1,
                textShadow: "0 2px 6px rgba(0,0,0,0.8)",
              }}
            >
              {dayStr}
            </div>
            <div
              style={{
                fontSize: "80px",
                color: ORANGE,
                letterSpacing: "2px",
                lineHeight: 1,
                textShadow: `0 2px 16px rgba(249,115,22,0.5)`,
              }}
            >
              {timeStr}
            </div>
            <div
              style={{
                fontSize: "46px",
                color: "rgba(255,255,255,0.65)",
                letterSpacing: "5px",
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
            <img
              src={match.away_logo}
              alt=""
              style={{
                width: "140px",
                height: "140px",
                objectFit: "contain",
                background: "white",
                borderRadius: "50%",
                padding: "10px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.7)",
              }}
            />
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
                    color: "rgba(255,255,255,0.80)",
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
            ? "OTTELU WAREENASSA · VAPAA SISÄÄNPÄÄSY"
            : "OTTELU WAREENASSA · LIPUT 5 EUR · ALLE 15V. ILMAISEKSI"}
        </div>
      </div>
    </div>
  );
}

/* ============================= */
/*             CSS               */
/* ============================= */

const css = `
html, body, #root {
  margin: 0;
  min-height: 100%;
  background: #111111;
}

.ga-root {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px 16px 28px;

  background:
    radial-gradient(circle at 50% 0%, rgba(243, 223, 191, 0.22), transparent 55%),
    linear-gradient(180deg, #0f1112 0%, #101213 55%, #090b0b 100%);

  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

.ga-display-wrap {
  width: 100%;
  max-width: 600px;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
}

.ga-controls {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 18px;
  box-shadow: 0 14px 34px rgba(0,0,0,0.35);
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
  border-color: rgba(245,158,11,0.55);
}

.ga-bg-btns {
  display: flex;
  gap: 6px;
}

.ga-bg-btn {
  width: 36px;
  height: 36px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 8px;
  color: rgba(255,255,255,0.60);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.ga-bg-btn:hover {
  background: rgba(255,255,255,0.12);
}

.ga-bg-btn--active {
  background: rgba(245,158,11,0.18);
  border-color: rgba(245,158,11,0.55);
  color: #f59e0b;
}

.ga-download-btn {
  align-self: center;
  display: inline-flex;
  align-items: center;
  margin-top: 4px;

  background: rgba(245,158,11,0.12);
  border: 1px solid rgba(245,158,11,0.45);
  border-radius: 24px;
  padding: 10px 32px;

  color: #f59e0b;
  font-size: 14px;
  font-family: inherit;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;

  transition: background 0.15s, transform 0.1s;
}

.ga-download-btn:hover {
  background: rgba(245,158,11,0.22);
  transform: translateY(-1px);
}

.ga-download-btn:active {
  transform: translateY(0);
}
`;
