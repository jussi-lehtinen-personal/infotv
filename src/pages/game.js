import React, { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { LuArrowLeft, LuMapPin, LuUsers, LuExternalLink } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";

import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { useGoBack } from "../hooks/useGoBack";
import { splitTeamName } from "../Util";
import { peekSeasonGames, fetchSeasonGames, isSeasonLoaded } from "../lib/seasonGamesCache";

moment.locale("fi");

// "YYYY-MM-DD HH:mm" (space, not T) → moment (Safari-safe).
const mdate = (s) => moment(String(s || "").replace(" ", "T"), moment.ISO_8601);
// season = spring year (for the tulospalvelu game-page link).
const seasonOf = (s) => {
  const d = mdate(s);
  return d.month() >= 6 ? d.year() + 1 : d.year();
};

// The box-score page. The clicked game object is passed via nav state for an
// instant paint; on a direct URL / refresh we look it up in the season cache by
// its ext id. Then /api/getGameReport (worker resolves the real getgames id +
// fetches the report) fills the periods/goals/penalties/goalies.
const BoxScore = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const goBack = useGoBack("/gamezone");

  const [game, setGame] = useState(
    () => (state && state.game) || peekSeasonGames().find((g) => String(g.id) === String(id)) || null
  );
  // undefined = loading, null = no report, object = box score
  const [report, setReport] = useState(undefined);

  // Resolve the game object from the season cache if we arrived without state.
  useEffect(() => {
    if (game) return;
    let cancelled = false;
    const find = () => peekSeasonGames().find((g) => String(g.id) === String(id)) || null;
    if (isSeasonLoaded()) setGame(find());
    else fetchSeasonGames().catch(() => {}).finally(() => { if (!cancelled) setGame(find()); });
    return () => { cancelled = true; };
  }, [id, game]);

  // Fetch the report once we know the game.
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    setReport(undefined);
    const params = new URLSearchParams({
      date: game.date,
      home: String(game.homeTeamId),
      away: String(game.awayTeamId),
      extId: String(game.id),
    });
    fetch(`/api/getGameReport?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) setReport(d && d.resolved ? d : null); })
      .catch(() => { if (!cancelled) setReport(null); });
    return () => { cancelled = true; };
  }, [game]);

  return (
    <>
      <style>{css}</style>
      <div className="bx-root">
        <div className="bx-topbar">
          <button className="bx-back" onClick={goBack} aria-label="Takaisin">
            <LuArrowLeft aria-hidden="true" />
          </button>
          <div className="bx-topbar-title">Ottelu</div>
        </div>

        {!game ? (
          <div className="bx-center"><Spinner text="Ladataan…" /></div>
        ) : (
          <div className="bx-body">
            <GameHeader game={game} report={report} />

            {report === undefined && (
              <div className="bx-center"><Spinner text="Ladataan pöytäkirjaa…" /></div>
            )}
            {report === null && (
              <div className="bx-note">Ottelupöytäkirjaa ei ole saatavilla tälle ottelulle.</div>
            )}
            {report && (
              <>
                <Periods periods={report.periods} />
                <Goals goals={report.goals} game={game} />
                <Penalties penalties={report.penalties} game={game} />
                <Goalies goalies={report.goalies} />
                <Footer report={report} game={game} />
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
};

const TeamLine = ({ logo, name, goals, showScore }) => (
  <div className="bx-team">
    <img className="bx-team-logo" src={logo} alt="" />
    <div className="bx-team-name">{splitTeamName(name || "").main}</div>
    {showScore && <div className="bx-team-score">{goals ?? "–"}</div>}
  </div>
);

const GameHeader = ({ game, report }) => {
  const started = report ? report.started : Number(game.finished) > 0;
  const finished = report ? report.finished : Number(game.finished) > 0;
  const score = report && report.score ? report.score : { home: game.home_goals, away: game.away_goals };
  const status = finished ? "Päättynyt" : started ? "Käynnissä" : mdate(game.date).format("dd D.M. [klo] HH.mm");

  return (
    <div className="bx-header">
      <div className="bx-header-meta">
        {game.level && <span className="bx-badge">{game.level.trim()}</span>}
        <span className={`bx-status${started && !finished ? " bx-status--live" : ""}`}>{status}</span>
      </div>
      <div className="bx-teams">
        <TeamLine logo={game.home_logo} name={game.home} goals={score.home} showScore={started} />
        <div className="bx-vs">{started ? "" : "vs"}</div>
        <TeamLine logo={game.away_logo} name={game.away} goals={score.away} showScore={started} />
      </div>
      {game.rink && (
        <div className="bx-header-rink">
          <LuMapPin aria-hidden="true" /> {game.rink}
        </div>
      )}
    </div>
  );
};

// Period scores. `periods` = ["3-0","1-0","3-1","7-1"] where the LAST is the total.
const Periods = ({ periods }) => {
  if (!periods || periods.length < 2) return null;
  const per = periods.slice(0, -1);
  return (
    <div className="bx-section">
      <div className="bx-section-title">Erät</div>
      <div className="bx-periods">
        {per.map((p, i) => (
          <div className="bx-period" key={i}>
            <div className="bx-period-n">{i + 1}.</div>
            <div className="bx-period-s">{p}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const STRENGTH = { YV: "YV", AV: "AV" };

const Goals = ({ goals, game }) => {
  if (!goals || goals.length === 0) return null;
  return (
    <div className="bx-section">
      <div className="bx-section-title">Maalit</div>
      <div className="bx-events">
        {goals.map((g, i) => {
          const logo = g.side === "home" ? game.home_logo : game.away_logo;
          const strength = STRENGTH[g.strength];
          return (
            <div className="bx-event" key={i}>
              <div className="bx-event-time">{g.period}. · {g.time}</div>
              <img className="bx-event-logo" src={logo} alt="" />
              <div className="bx-event-main">
                <div className="bx-event-scorer">
                  {g.scorer.jersey ? <span className="bx-jersey">#{g.scorer.jersey}</span> : null} {g.scorer.name}
                  {strength && <span className={`bx-strength bx-strength--${g.strength.toLowerCase()}`}>{strength}</span>}
                </div>
                {g.assists && g.assists.length > 0 && (
                  <div className="bx-event-assists">{g.assists.join(", ")}</div>
                )}
              </div>
              <div className="bx-event-run">{g.running}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Penalties = ({ penalties, game }) => {
  if (!penalties || penalties.length === 0) return null;
  return (
    <div className="bx-section">
      <div className="bx-section-title">Jäähyt</div>
      <div className="bx-events">
        {penalties.map((p, i) => {
          const logo = p.side === "home" ? game.home_logo : game.away_logo;
          return (
            <div className="bx-event" key={i}>
              <div className="bx-event-time">{p.period}. · {p.time}</div>
              <img className="bx-event-logo" src={logo} alt="" />
              <div className="bx-event-main">
                <div className="bx-event-scorer">
                  {p.player.jersey ? <span className="bx-jersey">#{p.player.jersey}</span> : null} {p.player.name}
                </div>
                {p.reason && <div className="bx-event-assists">{p.reason}</div>}
              </div>
              <div className="bx-event-run">{p.minutes} min</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Goalies = ({ goalies }) => {
  if (!goalies || goalies.length === 0) return null;
  const total = (k) => {
    const t = (k.saves || []).find((s) => Number(s.period) === 0);
    return t ? t.saves : (k.saves || []).reduce((a, s) => a + (Number(s.saves) || 0), 0);
  };
  return (
    <div className="bx-section">
      <div className="bx-section-title">Maalivahdit</div>
      <div className="bx-goalies">
        {goalies.map((t, i) =>
          (t.keepers || []).map((k, j) => (
            <div className="bx-goalie" key={`${i}-${j}`}>
              <div className="bx-goalie-name">
                {k.jersey ? <span className="bx-jersey">#{k.jersey}</span> : null} {k.name}
              </div>
              <div className="bx-goalie-team">{splitTeamName(t.team || "").main}</div>
              <div className="bx-goalie-saves">{total(k)} torjuntaa</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const Footer = ({ report, game }) => {
  const refs = report.referees || [];
  const url = report.realId
    ? `https://tulospalvelu.leijonat.fi/game?season=${seasonOf(game.date)}&gameid=${report.realId}&lang=fi`
    : null;
  return (
    <div className="bx-footer">
      {refs.length > 0 && (
        <div className="bx-footer-row">Tuomarit: {refs.map((r) => r.name).join(", ")}</div>
      )}
      {report.spectators != null && (
        <div className="bx-footer-row"><LuUsers aria-hidden="true" /> {report.spectators} katsojaa</div>
      )}
      {url && (
        <a className="bx-footer-link" href={url} target="_blank" rel="noopener noreferrer">
          Avaa tulospalvelussa <LuExternalLink aria-hidden="true" />
        </a>
      )}
    </div>
  );
};

export default BoxScore;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.bx-root {
  min-height: 100dvh;
  background: var(--color-bg);
  font-family: var(--font-family-base);
  padding-bottom: var(--ui-bottom-nav-clearance, 80px);
}

.bx-topbar {
  display: flex; align-items: center; gap: 10px;
  padding: calc(env(safe-area-inset-top) + 12px) 14px 12px;
  position: sticky; top: 0; z-index: 5;
  background: var(--color-bg);
  border-bottom: 1px solid rgba(255,255,255,0.07);
}
.bx-back {
  flex: 0 0 auto; width: 38px; height: 38px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.10);
  color: var(--gz-text-secondary); cursor: pointer; -webkit-tap-highlight-color: transparent;
}
.bx-back svg { width: 20px; height: 20px; }
.bx-topbar-title {
  font-size: 15px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--color-primary);
}

.bx-body { width: 100%; max-width: 640px; margin: 0 auto; padding: 14px 12px 0; }
.bx-center { display: flex; justify-content: center; padding: 40px 0; }
.bx-note { text-align: center; padding: 28px 16px; color: var(--gz-text-tertiary); font-size: var(--gz-fs-sm); }

/* HEADER */
.bx-header {
  border-radius: var(--radius-card);
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.10);
  padding: 14px; margin-bottom: 14px;
}
.bx-header-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.bx-badge {
  font-size: var(--gz-fs-xs); font-weight: 800; letter-spacing: 0.04em;
  color: var(--color-primary); background: rgba(245,158,11,0.12);
  border: 1px solid rgba(245,158,11,0.30); border-radius: 999px; padding: 2px 9px;
}
.bx-status { font-size: var(--gz-fs-xs); font-weight: 700; color: var(--gz-text-tertiary); text-transform: uppercase; letter-spacing: 0.04em; }
.bx-status--live { color: #4ade80; }

.bx-teams { display: flex; align-items: center; gap: 8px; }
.bx-team { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; min-width: 0; }
.bx-team-logo {
  width: 56px; height: 56px; box-sizing: border-box; border-radius: 12px;
  background: #fff; object-fit: contain; padding: 5px; box-shadow: 0 4px 10px rgba(0,0,0,0.35);
}
.bx-team-name { font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-primary); line-height: 1.2; }
.bx-team-score { font-size: 30px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
.bx-vs { flex: 0 0 auto; font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-tertiary); }
.bx-header-rink {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin-top: 12px; font-size: var(--gz-fs-sm); color: var(--gz-text-tertiary);
}
.bx-header-rink svg { width: 15px; height: 15px; }

/* SECTIONS */
.bx-section { margin-bottom: 16px; }
.bx-section-title {
  font-size: var(--gz-fs-sm); font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--color-primary); margin-bottom: 8px; padding-left: 2px;
}

.bx-periods { display: flex; gap: 8px; }
.bx-period {
  flex: 1; text-align: center; padding: 8px 4px;
  border-radius: var(--radius-item); background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
}
.bx-period-n { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); }
.bx-period-s { font-size: var(--gz-fs-md); font-weight: 800; color: var(--gz-text-primary); font-variant-numeric: tabular-nums; }

/* EVENTS (goals / penalties) */
.bx-events { display: flex; flex-direction: column; gap: 6px; }
.bx-event {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: var(--radius-item);
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
}
.bx-event-time { flex: 0 0 auto; width: 52px; font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); font-variant-numeric: tabular-nums; }
.bx-event-logo {
  flex: 0 0 auto; width: 26px; height: 26px; box-sizing: border-box; border-radius: 6px;
  background: #fff; object-fit: contain; padding: 2px;
}
.bx-event-main { flex: 1; min-width: 0; }
.bx-event-scorer { font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-primary); }
.bx-jersey { color: var(--gz-text-tertiary); font-weight: 800; }
.bx-event-assists { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); margin-top: 1px; }
.bx-event-run { flex: 0 0 auto; font-size: var(--gz-fs-sm); font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
.bx-strength {
  margin-left: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.03em;
  padding: 1px 5px; border-radius: 4px; vertical-align: middle;
}
.bx-strength--yv { color: #fbbf24; background: rgba(245,158,11,0.15); }
.bx-strength--av { color: #60a5fa; background: rgba(96,165,250,0.15); }

/* GOALIES */
.bx-goalies { display: flex; flex-direction: column; gap: 6px; }
.bx-goalie {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: var(--radius-item);
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
}
.bx-goalie-name { font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-primary); }
.bx-goalie-team { flex: 1; font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); }
.bx-goalie-saves { font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-secondary); }

/* FOOTER */
.bx-footer { padding: 6px 2px 24px; display: flex; flex-direction: column; gap: 8px; }
.bx-footer-row { display: flex; align-items: center; gap: 6px; font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); }
.bx-footer-row svg { width: 14px; height: 14px; }
.bx-footer-link {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 4px;
  font-size: var(--gz-fs-sm); font-weight: 700; color: var(--color-primary); text-decoration: none;
}
.bx-footer-link svg { width: 15px; height: 15px; }
`;
