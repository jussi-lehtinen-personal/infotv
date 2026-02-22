import { useState, useEffect } from "react";
import {
  processIncomingDataEventsDoNotStrip,
  buildGamesQueryUri,
  splitTeamName,
} from "../Util";

import "@fontsource/bebas-neue";
import "moment/locale/fi";

var moment = require("moment");
moment.locale("fi");

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const ORANGE = "#f97316";
const ORANGE_DIM = "rgba(249,115,22,0.45)";
const BACKGROUND = "/ahma_logo.png";

/* ============================= */
/*           PAGE                */
/* ============================= */

const NextHomeGame = () => {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [teamsMap, setTeamsMap] = useState(new Map());
  const [teamsReady, setTeamsReady] = useState(false);

  // Scale canvas to fill viewport (letterbox)
  useEffect(() => {
    const update = () => {
      const sx = window.innerWidth / CANVAS_W;
      const sy = window.innerHeight / CANVAS_H;
      setScale(Math.min(sx, sy));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Fetch teams
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
      .catch(() => {})
      .finally(() => setTeamsReady(true));
  }, []);

  // Search for next Edustus home game week by week (up to 12 weeks forward)
  useEffect(() => {
    if (!teamsReady) return;
    let cancelled = false;

    const isEdustus = (g, map) => {
      if (map.size > 0) {
        const key = `${g.levelId}|${g.statGroupId}`;
        const tk = map.get(key);
        if (tk !== undefined) {
          return tk.toLowerCase().includes("miehet") && tk.toLowerCase().includes("edustus");
        }
        // Key not in teamsMap (e.g. playoffs use a different statGroupId) → fall back to level name
      }
      return (g.level ?? "").toLowerCase().includes("ii-divisioona");
    };

    const search = async () => {
      setLoading(true);
      let found = null;
      for (let offset = 0; offset < 12 && !cancelled; offset++) {
        try {
          const d = new Date();
          d.setDate(d.getDate() + offset * 7);
          const uri = buildGamesQueryUri(moment(d).format("YYYY-MM-DD"));
          const data = await fetch(uri).then((r) => r.json());
          const now = new Date();
          const games = processIncomingDataEventsDoNotStrip(data);
          found = games.find((g) => isEdustus(g, teamsMap) && new Date(g.date) > now) ?? null;
          if (found) break;
        } catch {}
      }
      if (!cancelled) {
        setMatch(found);
        setLoading(false);
      }
    };

    search();
    return () => { cancelled = true; };
  }, [teamsReady, teamsMap]);

  return (
    <>
      <style>{css}</style>
      <div className="ng-fullscreen">
        <div
          style={{
            width: `${CANVAS_W}px`,
            height: `${CANVAS_H}px`,
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          <AdCanvas match={match} loading={loading} />
        </div>
      </div>
    </>
  );
};

export default NextHomeGame;

/* ============================= */
/*         AD CANVAS             */
/* ============================= */

function AdCanvas({ match, loading }) {
  const timeStr = match ? moment(match.date).format("HH:mm") : "";
  const dayStr = match ? moment(match.date).format("dddd D.M.YYYY").toUpperCase() : "";
  const away = match ? splitTeamName(match.away ?? "") : null;
  const isFree = match ? match.isFree !== false : true;

  return (
    <div
      style={{
        width: `${CANVAS_W}px`,
        height: `${CANVAS_H}px`,
        position: "relative",
        fontFamily: "'Bebas Neue', sans-serif",
        background: "#0d0d0d",
        overflow: "hidden",
      }}
    >
      {/* Background photo */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url('${BACKGROUND}')`,
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
        }}
      />

      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,1.0) 0%, rgba(0,0,0,0.75) 45%, rgba(0,0,0,1.0) 100%)",
        }}
      />

      {/* ── BOTTOM BAR ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "72px",
          background: "rgba(8,8,8,0.88)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        <div
          style={{
            fontSize: "36px",
            color: "rgba(255,255,255,0.65)",
            letterSpacing: "8px",
          }}
        >
          WWW.KIEKKO-AHMA.FI
        </div>
      </div>

      {/* Orange line above bottom bar */}
      <div
        style={{
          position: "absolute",
          bottom: "72px",
          left: 0,
          right: 0,
          height: "5px",
          background: `linear-gradient(to right, ${ORANGE}, #cc4400)`,
          zIndex: 2,
        }}
      />

      {/* ── MAIN CONTENT ── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: "77px",
          left: 0,
          right: 0,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "28px 140px 20px",
          gap: "28px",
        }}
      >
        {/* Title */}
        <div style={{ textAlign: "center", lineHeight: 1 }}>
          <div
            style={{
              fontSize: "52px",
              color: "rgba(255,255,255,0.78)",
              letterSpacing: "10px",
              textShadow: "0 2px 12px rgba(0,0,0,0.9)",
            }}
          >
            SEURAAVA EDUSTUSJOUKKUEEN
          </div>
          <div
            style={{
              fontSize: "148px",
              color: ORANGE,
              letterSpacing: "18px",
              lineHeight: 0.88,
              textShadow: `0 6px 40px rgba(0,0,0,0.9), 0 0 80px ${ORANGE_DIM}`,
            }}
          >
            KOTIPELI
          </div>
        </div>

        {match ? (
          <>
            {/* Level */}
            {match.level && (
              <div
                style={{
                  fontSize: "44px",
                  color: "rgba(255,255,255,0.70)",
                  letterSpacing: "8px",
                  textShadow: "0 2px 10px rgba(0,0,0,0.9)",
                  textAlign: "center",
                }}
              >
                {match.level.toUpperCase()}
              </div>
            )}

            {/* Teams row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "60px",
                width: "100%",
              }}
            >
              {/* Home team */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "18px",
                }}
              >
                <img
                  src={match.home_logo}
                  alt=""
                  style={{
                    width: "230px",
                    height: "230px",
                    objectFit: "contain",
                    background: "white",
                    borderRadius: "50%",
                    padding: "14px",
                    boxShadow: "0 8px 36px rgba(0,0,0,0.75)",
                  }}
                />
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: "66px",
                      color: "#ffffff",
                      letterSpacing: "4px",
                      lineHeight: 1,
                      textShadow: "0 2px 12px rgba(0,0,0,0.9)",
                    }}
                  >
                    KIEKKO-AHMA
                  </div>
                  <div
                    style={{
                      fontSize: "50px",
                      color: ORANGE,
                      letterSpacing: "5px",
                      lineHeight: 1.1,
                      textShadow: "0 2px 10px rgba(0,0,0,0.8)",
                    }}
                  >
                    EDUSTUS
                  </div>
                </div>
              </div>

              {/* VS */}
              <div
                style={{
                  flexShrink: 0,
                  fontSize: "100px",
                  color: "rgba(255,255,255,0.55)",
                  letterSpacing: "10px",
                  textShadow: "0 2px 14px rgba(0,0,0,0.8)",
                }}
              >
                VS
              </div>

              {/* Away team */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "18px",
                }}
              >
                <img
                  src={match.away_logo}
                  alt=""
                  style={{
                    width: "230px",
                    height: "230px",
                    objectFit: "contain",
                    background: "white",
                    borderRadius: "50%",
                    padding: "14px",
                    boxShadow: "0 8px 36px rgba(0,0,0,0.75)",
                  }}
                />
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: "66px",
                      color: "#ffffff",
                      letterSpacing: "4px",
                      lineHeight: 1,
                      textShadow: "0 2px 12px rgba(0,0,0,0.9)",
                    }}
                  >
                    {away.main}
                  </div>
                  {away.sub && (
                    <div
                      style={{
                        fontSize: "50px",
                        color: ORANGE,
                        letterSpacing: "5px",
                        lineHeight: 1.1,
                        textShadow: "0 2px 10px rgba(0,0,0,0.8)",
                      }}
                    >
                      {away.sub}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Date + info */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "72px",
                  color: "rgba(255,255,255,0.85)",
                  letterSpacing: "6px",
                  textShadow: "0 2px 10px rgba(0,0,0,0.9)",
                  marginBottom: "6px",
                }}
              >
                {dayStr} · KLO {timeStr}
              </div>
              <div
                style={{
                  fontSize: "34px",
                  color: "rgba(255,255,255,0.80)",
                  letterSpacing: "6px",
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                }}
              >
                {isFree ? "VAPAA SISÄÄNPÄÄSY" : "LIPUT 5 EUR · ALLE 15V. ILMAISEKSI"}
              </div>
              <div
                style={{
                  fontSize: "34px",
                  color: ORANGE,
                  letterSpacing: "7px",
                  marginTop: "4px",
                  textShadow: `0 2px 16px rgba(0,0,0,0.8), 0 0 40px ${ORANGE_DIM}`,
                }}
              >
                VALKEAKOSKEN JÄÄHALLI - WAREENA
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              fontSize: "56px",
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "8px",
              textShadow: "0 2px 10px rgba(0,0,0,0.9)",
              textAlign: "center",
            }}
          >
            {loading ? "HAETAAN..." : "EI TULEVIA KOTIPELEJÄ"}
          </div>
        )}
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
  padding: 0;
  width: 100%;
  height: 100%;
  background: #000000;
  overflow: hidden;
}

.ng-fullscreen {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000000;
}
`;
