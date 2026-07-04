import React, { useEffect, useMemo, useState } from "react";
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
// "7:02" → seconds, for merging goals + penalties into one timeline.
const toSecs = (t) => {
  const [m, s] = String(t || "0:0").split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
};

// The box-score page (Flashscore-style layout, AHMA dark/amber theme). The clicked
// game object is passed via nav state for an instant paint; on a direct URL /
// refresh we look it up in the season cache by its ext id. Then /api/getGameReport
// (worker resolves the real getgames id + fetches the report) fills the events.
const BoxScore = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const goBack = useGoBack("/gamezone");

  const [game, setGame] = useState(
    () => (state && state.game) || peekSeasonGames().find((g) => String(g.id) === String(id)) || null
  );
  const [report, setReport] = useState(undefined); // undefined=loading, null=none, obj

  useEffect(() => {
    if (game) return;
    let cancelled = false;
    const find = () => peekSeasonGames().find((g) => String(g.id) === String(id)) || null;
    if (isSeasonLoaded()) setGame(find());
    else fetchSeasonGames().catch(() => {}).finally(() => { if (!cancelled) setGame(find()); });
    return () => { cancelled = true; };
  }, [id, game]);

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
                <Timeline report={report} game={game} />
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

const GameHeader = ({ game, report }) => {
  const started = report ? report.started : Number(game.finished) > 0;
  const finished = report ? report.finished : Number(game.finished) > 0;
  const score = report && report.score ? report.score : { home: game.home_goals, away: game.away_goals };
  const d = mdate(game.date);
  const status = finished ? "Päättynyt" : started ? "Käynnissä" : d.format("dd D.M.");

  return (
    <div className="bx-header">
      <div className="bx-hd-date">{d.format("D.M.YYYY [·] HH.mm")}</div>
      {game.level && <div className="bx-hd-level">{game.level.trim()}</div>}
      <div className="bx-hd-row">
        <div className="bx-hd-team">
          <img className="bx-hd-logo" src={game.home_logo} alt="" />
          <div className="bx-hd-name">{splitTeamName(game.home || "").main}</div>
        </div>
        <div className="bx-hd-mid">
          {started ? (
            <div className="bx-hd-score">{score.home ?? 0}<span className="bx-hd-dash">–</span>{score.away ?? 0}</div>
          ) : (
            <div className="bx-hd-time">{d.format("HH.mm")}</div>
          )}
          <div className={`bx-hd-status${started && !finished ? " bx-hd-status--live" : ""}`}>{status}</div>
        </div>
        <div className="bx-hd-team">
          <img className="bx-hd-logo" src={game.away_logo} alt="" />
          <div className="bx-hd-name">{splitTeamName(game.away || "").main}</div>
        </div>
      </div>
      {game.rink && (
        <div className="bx-hd-rink"><LuMapPin aria-hidden="true" /> {game.rink}</div>
      )}
    </div>
  );
};

// Goals + penalties merged into one chronological timeline, grouped by period,
// each event mirrored to its team's side (home left, away right) Flashscore-style.
const Timeline = ({ report, game }) => {
  const byPeriod = useMemo(() => {
    const evs = [
      ...(report.goals || []).map((g) => ({ ...g, kind: "goal" })),
      ...(report.penalties || []).map((p) => ({ ...p, kind: "penalty" })),
    ].sort((a, b) => a.period - b.period || toSecs(a.time) - toSecs(b.time));
    const map = new Map();
    for (const e of evs) {
      if (!map.has(e.period)) map.set(e.period, []);
      map.get(e.period).push(e);
    }
    return map;
  }, [report]);

  const periods = report.periods || [];
  const periodScore = (n) => periods[n - 1] && periods[n - 1].replace("-", " – ");

  if (byPeriod.size === 0) return null;

  return (
    <div className="bx-timeline">
      {[...byPeriod.keys()].sort((a, b) => a - b).map((n) => (
        <div className="bx-per" key={n}>
          <div className="bx-per-head">
            <span>{n}. erä</span>
            {periodScore(n) && <span className="bx-per-score">{periodScore(n)}</span>}
          </div>
          <div className="bx-per-evs">
            {byPeriod.get(n).map((e, i) => (
              <EventRow key={i} e={e} game={game} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const EventRow = ({ e, game }) => {
  const logo = e.side === "home" ? game.home_logo : game.away_logo;
  const isGoal = e.kind === "goal";
  const name = isGoal ? e.scorer.name : e.player.name;
  const jersey = isGoal ? e.scorer.jersey : e.player.jersey;
  const sub = isGoal ? (e.assists && e.assists.length ? e.assists.join(", ") : "") : e.reason || "";
  const strength = isGoal && (e.strength === "YV" || e.strength === "AV") ? e.strength : null;

  return (
    <div className={`bx-ev bx-ev--${e.side}`}>
      <div className="bx-ev-min">{e.time}</div>
      <img className="bx-ev-logo" src={logo} alt="" />
      {isGoal ? (
        <div className="bx-ev-tok bx-ev-tok--goal">{e.running.replace("-", "–")}</div>
      ) : (
        <div className="bx-ev-tok bx-ev-tok--pen">{e.minutes}′</div>
      )}
      <div className="bx-ev-body">
        <div className="bx-ev-name">
          {jersey ? <span className="bx-jersey">#{jersey}</span> : null} {name}
          {strength && <span className={`bx-strength bx-strength--${e.strength.toLowerCase()}`}>{strength}</span>}
        </div>
        {sub && <div className="bx-ev-sub">{sub}</div>}
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

.bx-body { width: 100%; max-width: 640px; margin: 0 auto; padding: 12px 12px 0; }
.bx-center { display: flex; justify-content: center; padding: 40px 0; }
.bx-note { text-align: center; padding: 28px 16px; color: var(--gz-text-tertiary); font-size: var(--gz-fs-sm); }

/* HEADER — Flashscore-style 3-col: teams flank a big centred score */
.bx-header {
  border-radius: var(--radius-card);
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.10);
  padding: 14px 12px 12px; margin-bottom: 14px;
  text-align: center;
}
.bx-hd-date { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); }
.bx-hd-level {
  font-size: var(--gz-fs-xs); font-weight: 800; color: var(--color-primary);
  text-transform: uppercase; letter-spacing: 0.04em; margin-top: 3px;
}
.bx-hd-row { display: flex; align-items: flex-start; gap: 6px; margin-top: 10px; }
.bx-hd-team { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.bx-hd-logo {
  width: 60px; height: 60px; box-sizing: border-box; border-radius: 14px;
  background: #fff; object-fit: contain; padding: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.35);
}
.bx-hd-name { font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-primary); line-height: 1.2; }
.bx-hd-mid { flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 6px 0; }
.bx-hd-score {
  font-size: 40px; font-weight: 800; color: #fff; line-height: 1;
  font-variant-numeric: tabular-nums; letter-spacing: 1px; white-space: nowrap;
}
.bx-hd-dash { color: var(--gz-text-tertiary); margin: 0 6px; font-weight: 700; }
.bx-hd-time { font-size: 26px; font-weight: 800; color: var(--gz-text-secondary); line-height: 1; }
.bx-hd-status {
  font-size: var(--gz-fs-xs); font-weight: 800; color: var(--gz-text-tertiary);
  text-transform: uppercase; letter-spacing: 0.04em; text-align: center; line-height: 1.2;
}
.bx-hd-status--live { color: #4ade80; }
.bx-hd-rink {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  margin-top: 12px; font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary);
}
.bx-hd-rink svg { width: 14px; height: 14px; }

/* TIMELINE — periods with a header bar, events mirrored by side */
.bx-timeline { margin-bottom: 16px; }
.bx-per { margin-bottom: 6px; }
.bx-per-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; border-radius: var(--radius-small);
  background: rgba(255,255,255,0.05);
  font-size: var(--gz-fs-xs); font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.05em; color: var(--gz-text-secondary);
}
.bx-per-score { color: var(--gz-text-primary); font-variant-numeric: tabular-nums; }
.bx-per-evs { display: flex; flex-direction: column; }

.bx-ev {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  width: 82%; /* leave the opposite half empty → clearly one side */
}
.bx-ev--home { margin-right: auto; }
.bx-ev--away { margin-left: auto; flex-direction: row-reverse; text-align: right; }
.bx-ev-min {
  flex: 0 0 auto; width: 42px; font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.bx-ev--home .bx-ev-min { text-align: left; }
.bx-ev--away .bx-ev-min { text-align: right; }
.bx-ev-logo {
  flex: 0 0 auto; width: 24px; height: 24px; box-sizing: border-box; border-radius: 6px;
  background: #fff; object-fit: contain; padding: 2px;
}
.bx-ev-tok {
  flex: 0 0 auto; min-width: 40px; text-align: center;
  font-size: var(--gz-fs-xs); font-weight: 800; font-variant-numeric: tabular-nums;
  padding: 3px 7px; border-radius: 6px;
}
.bx-ev-tok--goal { color: #fff; background: rgba(245,158,11,0.18); border: 1px solid rgba(245,158,11,0.40); }
.bx-ev-tok--pen { color: #fbbf24; background: rgba(245,158,11,0.10); border: 1px solid rgba(245,158,11,0.28); min-width: 30px; }
.bx-ev-body { flex: 1 1 auto; min-width: 0; }
.bx-ev-name { font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-primary); }
.bx-jersey { color: var(--gz-text-tertiary); font-weight: 800; }
.bx-ev-sub { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); margin-top: 1px; }
.bx-strength {
  margin: 0 5px; font-size: 10px; font-weight: 800; letter-spacing: 0.03em;
  padding: 1px 5px; border-radius: 4px; vertical-align: middle;
}
.bx-strength--yv { color: #fbbf24; background: rgba(245,158,11,0.15); }
.bx-strength--av { color: #60a5fa; background: rgba(96,165,250,0.15); }

/* GOALIES */
.bx-section { margin-bottom: 16px; }
.bx-section-title {
  font-size: var(--gz-fs-sm); font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--color-primary); margin-bottom: 8px; padding-left: 2px;
}
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
