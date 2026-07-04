import React, { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { LuArrowLeft, LuMapPin, LuUsers, LuExternalLink, LuFlag } from "react-icons/lu";
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

// tulospalvelu names are "SURNAME Firstname" (surname ALL-CAPS). Flashscore-style
// display = "Surname F." — Title-case the surname, first name to an initial, no
// jersey number.
const formatName = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  const tokens = s.split(/\s+/);
  const isUpper = (t) => t === t.toLocaleUpperCase("fi") && /[A-ZÅÄÖ]/i.test(t);
  const title = (w) => w.charAt(0).toLocaleUpperCase("fi") + w.slice(1).toLocaleLowerCase("fi");
  const surname = [];
  let i = 0;
  while (i < tokens.length && isUpper(tokens[i])) surname.push(tokens[i++]);
  const given = tokens.slice(i);
  const sn = (surname.length ? surname : [tokens[0]]).map(title).join(" ");
  const init = given.length ? `${given[0].charAt(0).toLocaleUpperCase("fi")}.` : "";
  return init ? `${sn} ${init}` : sn;
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
  const [tab, setTab] = useState("events"); // "events" | "rosters"

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
                <div className="bx-tabs" role="tablist">
                  <button
                    type="button"
                    className={`bx-tab${tab === "events" ? " is-active" : ""}`}
                    role="tab"
                    aria-selected={tab === "events"}
                    onClick={() => setTab("events")}
                  >
                    Tapahtumat
                  </button>
                  <button
                    type="button"
                    className={`bx-tab${tab === "rosters" ? " is-active" : ""}`}
                    role="tab"
                    aria-selected={tab === "rosters"}
                    onClick={() => setTab("rosters")}
                  >
                    Kokoonpanot
                  </button>
                </div>
                {tab === "events" ? (
                  <>
                    <Timeline report={report} />
                    <Goalies goalies={report.goalies} game={game} />
                    <Footer report={report} game={game} />
                  </>
                ) : (
                  <Rosters rosters={report.rosters} game={game} />
                )}
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
    </div>
  );
};

// Goals + penalties merged into one chronological timeline, grouped by period,
// each event mirrored to its team's side (home left, away right) Flashscore-style.
const Timeline = ({ report }) => {
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
              <EventRow key={i} e={e} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// One event = exactly 2 rows.
//  Row 1: [fixed-width time] [pill] [name (+strength)]. The pill ALWAYS starts
//         with an icon (goal → puck + score; penalty → the minutes number IS the
//         icon). Time is fixed-width and the pill follows it, so the icons line
//         up in a column. Mirrored per side (icon on the clock side).
//  Row 2: assists (goal) or reason (penalty) — ONE line, truncated with … (never
//         a third row).
const EventRow = ({ e }) => {
  const isGoal = e.kind === "goal";
  const rawName = (isGoal ? e.scorer.name : e.player.name) || "";
  // A penalty with no player (blank or a "Null" sentinel) is a team/bench penalty.
  const name =
    !isGoal && (!rawName.trim() || /^\s*null\b/i.test(rawName))
      ? "Joukkuerangaistus"
      : formatName(rawName);
  const sub = isGoal
    ? (e.assists && e.assists.length ? e.assists.map(formatName).join(" + ") : "")
    : e.reason || "";
  const strength = isGoal && e.strength === "YV" ? "Ylivoima" : isGoal && e.strength === "AV" ? "Alivoima" : null;

  return (
    <div className={`bx-ev bx-ev--${e.side}`}>
      <div className="bx-ev-time">{e.time}</div>
      <div className="bx-ev-content">
        <div className="bx-ev-line">
          <div className="bx-ev-pill">
            {isGoal ? (
              <>
                <span className="bx-ev-badge bx-ev-badge--goal">MAALI</span>
                <span className="bx-ev-val">{e.running.replace("-", " – ")}</span>
              </>
            ) : (
              <>
                <span className="bx-ev-badge bx-ev-badge--pen">JÄÄHY</span>
                <span className="bx-ev-val bx-ev-val--pen">{e.minutes} min</span>
              </>
            )}
          </div>
          <div className="bx-ev-name">
            {name}
            {strength && <span className="bx-ev-str"> ({strength})</span>}
          </div>
        </div>
        {sub && <div className="bx-ev-sub">{sub}</div>}
      </div>
    </div>
  );
};

// Goalie: full name, title-cased ("SIREN Elmeri" → "Siren Elmeri").
const goalieName = (raw) =>
  String(raw || "")
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase("fi") + w.slice(1).toLocaleLowerCase("fi") : w))
    .join(" ")
    .trim();

const Goalies = ({ goalies, game }) => {
  if (!goalies || goalies.length === 0) return null;
  const ordered = [...goalies].sort((a, b) => (a.side === "home" ? 0 : 1) - (b.side === "home" ? 0 : 1));
  return (
    <div className="bx-section">
      <div className="bx-section-title">Maalivahdit</div>
      <div className="bx-goalies">
        {ordered.map((t, i) =>
          (t.keepers || []).map((k, j) => {
            const logo = t.side === "home" ? game.home_logo : t.side === "away" ? game.away_logo : null;
            const per = (k.saves || []).filter((s) => Number(s.period) !== 0);
            const totEntry = (k.saves || []).find((s) => Number(s.period) === 0);
            const total = totEntry ? totEntry.saves : per.reduce((a, s) => a + (Number(s.saves) || 0), 0);
            const breakdown = per.map((s) => s.saves).join(" + ");
            const out = (k.out || []).filter(Boolean);
            return (
              <div className="bx-goalie" key={`${i}-${j}`}>
                <img className="bx-goalie-logo" src={logo || ""} alt="" />
                <div className="bx-goalie-main">
                  <div className="bx-goalie-name">{goalieName(k.name)}</div>
                  <div className="bx-goalie-saves">{breakdown ? `${breakdown} = ${total}` : `${total} torjuntaa`}</div>
                  {out.length > 0 && (
                    <div className="bx-goalie-out">(Poissa maalilta: {out.join(", ")})</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// "MIKKOLA" + "Jusu" → "Mikkola Jusu"
const personName = (last, first) =>
  `${String(last || "")
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase("fi") + w.slice(1).toLocaleLowerCase("fi") : w))
    .join(" ")} ${first || ""}`.trim();

const RosterTeam = ({ side, logo, name }) => {
  const players = [...((side && side.players) || [])].sort((a, b) => {
    const ga = a.role === "MV" ? 0 : 1;
    const gb = b.role === "MV" ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return (Number(a.number) || 99) - (Number(b.number) || 99);
  });
  const staff = (side && side.staff) || [];
  return (
    <div className="bx-rteam">
      <div className="bx-rteam-head">
        <img className="bx-rteam-logo" src={logo} alt="" />
        <span className="bx-rteam-name">{splitTeamName(name || "").main}</span>
      </div>
      {players.length > 0 && (
        <>
          <div className="bx-rsub">Pelaajat</div>
          <div className="bx-rlist">
            {players.map((p, i) => (
              <div className="bx-rplayer" key={i}>
                <span className="bx-rnum">{p.number}</span>
                <span className="bx-rname">{personName(p.last, p.first)}</span>
                {p.role === "MV" && <span className="bx-rtag">MV</span>}
                {p.captain && <span className="bx-rtag bx-rtag--c">{p.captain}</span>}
              </div>
            ))}
          </div>
        </>
      )}
      {staff.length > 0 && (
        <>
          <div className="bx-rsub">Toimihenkilöt</div>
          <div className="bx-rstaff">
            {staff.map((s, i) => (
              <div className="bx-rstaff-row" key={i}>
                <span>{personName(s.last, s.first)}</span>
                <span className="bx-rstaff-role">{s.role}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const Rosters = ({ rosters, game }) => {
  const empty =
    !rosters || (!(rosters.home && rosters.home.players.length) && !(rosters.away && rosters.away.players.length));
  if (empty) {
    return <div className="bx-note">Kokoonpanoja ei ole saatavilla tälle ottelulle.</div>;
  }
  return (
    <div className="bx-rosters">
      <RosterTeam side={rosters.home} logo={game.home_logo} name={game.home} />
      <RosterTeam side={rosters.away} logo={game.away_logo} name={game.away} />
    </div>
  );
};

const Footer = ({ report, game }) => {
  const refs = (report.referees || []).map((r) => formatName(r.name)).filter(Boolean);
  const venue = report.arena || game.rink;
  const url = report.realId
    ? `https://tulospalvelu.leijonat.fi/game?season=${seasonOf(game.date)}&gameid=${report.realId}&lang=fi`
    : null;
  const hasInfo = refs.length > 0 || venue || report.spectators != null;
  return (
    <div className="bx-footer">
      {hasInfo && (
        <div className="bx-section">
          <div className="bx-section-title">Ottelun lisätiedot</div>
          <div className="bx-info">
          {refs.map((r, i) => (
            <div className="bx-info-row" key={`ref-${i}`}>
              <span className="bx-info-label"><LuFlag aria-hidden="true" /> Tuomari</span>
              <span className="bx-info-val">{r}</span>
            </div>
          ))}
          {venue && (
            <div className="bx-info-row">
              <span className="bx-info-label"><LuMapPin aria-hidden="true" /> Pelipaikka</span>
              <span className="bx-info-val">{venue}</span>
            </div>
          )}
          {report.spectators != null && (
            <div className="bx-info-row">
              <span className="bx-info-label"><LuUsers aria-hidden="true" /> Katsojia</span>
              <span className="bx-info-val">{Number(report.spectators).toLocaleString("fi-FI")}</span>
            </div>
          )}
          </div>
        </div>
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
  display: flex; align-items: flex-start; gap: 9px;
  padding: 9px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  width: 92%;
}
.bx-ev--home { margin-right: auto; }
.bx-ev--away { margin-left: auto; flex-direction: row-reverse; }

/* fixed-width time on the outer edge → the pill starts at a fixed x → pills line
   up in a column; both rows of content sit AFTER the time (no extra indent) */
.bx-ev-time {
  flex: 0 0 40px; width: 40px; padding-top: 4px;
  font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); font-variant-numeric: tabular-nums;
}
.bx-ev--home .bx-ev-time { text-align: left; }
.bx-ev--away .bx-ev-time { text-align: right; }

/* content = row 1 (pill + name, vertically centred) over row 2 (assists/reason);
   both start at the same (pill) edge, so no indent under the name */
.bx-ev-content { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.bx-ev--away .bx-ev-content { align-items: flex-end; }
.bx-ev-line { display: flex; align-items: center; gap: 8px; max-width: 100%; min-width: 0; }
.bx-ev--away .bx-ev-line { flex-direction: row-reverse; }

/* pill = a letter badge (M = maali / J = jäähy) + the value beside it; the badge
   sits on the clock side. Goal: amber badge (black M) + light score. Penalty:
   amber-outline badge (amber J) + amber minutes. Keeps text readable on dark. */
.bx-ev-pill {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--gz-fs-xs); font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.bx-ev--away .bx-ev-pill { flex-direction: row-reverse; }
.bx-ev-badge {
  flex: 0 0 auto; border-radius: 5px; box-sizing: border-box;
  display: inline-flex; align-items: center; justify-content: center;
  padding: 2px 6px; font-size: 10px; font-weight: 800;
  letter-spacing: 0.03em; text-transform: uppercase; line-height: 1.3;
}
.bx-ev-badge--goal { background: var(--color-primary); color: #1a1206; }
.bx-ev-badge--pen  { background: transparent; color: var(--color-primary); border: 1px solid var(--color-primary); }
.bx-ev-val, .bx-ev-val--pen { color: var(--color-primary); }

.bx-ev-name {
  flex: 0 1 auto; min-width: 0;
  font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.bx-ev-str { font-size: var(--gz-fs-xs); font-weight: 700; color: var(--gz-text-tertiary); }
.bx-ev-sub {
  max-width: 100%;
  font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* TABS */
.bx-tabs { display: flex; gap: 4px; margin: 2px 0 14px; border-bottom: 1px solid rgba(255,255,255,0.10); }
.bx-tab {
  flex: 1 1 auto; padding: 10px 8px; background: none; border: none; cursor: pointer;
  font-size: var(--gz-fs-sm); font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--gz-text-tertiary); border-bottom: 2px solid transparent; margin-bottom: -1px;
  -webkit-tap-highlight-color: transparent;
}
.bx-tab.is-active { color: var(--color-primary); border-bottom-color: var(--color-primary); }

/* ROSTERS (Kokoonpanot) */
.bx-rosters { display: flex; flex-direction: column; }
.bx-rteam + .bx-rteam { margin-top: 22px; padding-top: 22px; border-top: 1px solid rgba(255,255,255,0.12); }
.bx-rteam-head { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
.bx-rteam-logo {
  width: 36px; height: 36px; box-sizing: border-box; border-radius: 8px;
  background: #fff; object-fit: contain; padding: 3px; box-shadow: 0 3px 8px rgba(0,0,0,0.3);
}
.bx-rteam-name { font-size: var(--gz-fs-lg, 18px); font-weight: 800; color: var(--gz-text-primary); }
.bx-rsub {
  font-size: var(--gz-fs-xs); font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--color-primary); margin: 12px 0 4px; padding-left: 2px;
}
.bx-rlist { display: flex; flex-direction: column; }
.bx-rplayer {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: var(--gz-fs-sm);
}
.bx-rnum {
  flex: 0 0 26px; text-align: center; font-weight: 800; color: var(--gz-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.bx-rname { flex: 1 1 auto; min-width: 0; color: var(--gz-text-primary); font-weight: 600; }
.bx-rtag {
  flex: 0 0 auto; font-size: 10px; font-weight: 800; letter-spacing: 0.03em;
  padding: 1px 5px; border-radius: 4px;
  color: var(--gz-text-tertiary); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10);
}
.bx-rtag--c { color: var(--color-primary); background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.30); }
.bx-rstaff { display: flex; flex-direction: column; }
.bx-rstaff-row {
  display: flex; justify-content: space-between; gap: 10px;
  padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,0.05);
  font-size: var(--gz-fs-sm); color: var(--gz-text-secondary);
}
.bx-rstaff-role { flex: 0 0 auto; color: var(--gz-text-tertiary); font-size: var(--gz-fs-xs); align-self: center; }
.bx-rstaff-role { flex: 0 0 auto; }

/* GOALIES */
.bx-section { margin-bottom: 16px; }
.bx-section-title {
  font-size: var(--gz-fs-sm); font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--color-primary); margin-bottom: 8px; padding-left: 2px;
}
.bx-goalies { display: flex; flex-direction: column; gap: 8px; }
.bx-goalie { display: flex; align-items: center; gap: 12px; padding: 4px 2px; }
/* fixed logo column → both goalie logos line up */
.bx-goalie-logo {
  flex: 0 0 auto; width: 34px; height: 34px; box-sizing: border-box; border-radius: 8px;
  background: #fff; object-fit: contain; padding: 3px; box-shadow: 0 3px 8px rgba(0,0,0,0.3);
}
.bx-goalie-main { flex: 1 1 auto; min-width: 0; }
.bx-goalie-name { font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-primary); }
.bx-gk-num { color: var(--gz-text-tertiary); font-weight: 800; margin-right: 3px; }
.bx-goalie-saves { font-size: var(--gz-fs-xs); font-weight: 700; color: var(--gz-text-secondary); font-variant-numeric: tabular-nums; margin-top: 1px; }
.bx-goalie-out { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); margin-top: 1px; }

/* MATCH INFO (Ottelun lisätiedot) */
.bx-info {
  border-radius: var(--radius-card); background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08); padding: 12px 14px; margin-bottom: 10px;
}
.bx-info-title {
  font-size: var(--gz-fs-xs); font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--gz-text-tertiary); margin-bottom: 6px;
}
.bx-info-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 7px 0; border-top: 1px solid rgba(255,255,255,0.05);
}
.bx-info-row:first-child { border-top: none; }
.bx-info-label {
  display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
  font-size: var(--gz-fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--gz-text-tertiary);
}
.bx-info-label svg { width: 15px; height: 15px; }
.bx-info-val { font-size: var(--gz-fs-sm); font-weight: 700; color: var(--gz-text-primary); text-align: right; min-width: 0; }

/* FOOTER */
.bx-footer { padding: 6px 2px 24px; display: flex; flex-direction: column; gap: 8px; }
.bx-footer-link {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 4px;
  font-size: var(--gz-fs-sm); font-weight: 700; color: var(--color-primary); text-decoration: none;
}
.bx-footer-link svg { width: 15px; height: 15px; }
`;
