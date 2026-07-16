import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import { LuArrowLeft, LuMapPin, LuUsers, LuExternalLink, LuFlag, LuRefreshCw } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import { Box, Typography, IconButton, Button, CircularProgress } from "@mui/material";
import { SwipeableTabs } from "../components/ui/SwipeableTabs";
import { useGoBack } from "../hooks/useGoBack";
import { splitTeamName } from "../Util";
import { peekSeasonGames, fetchSeasonGames, isSeasonLoaded } from "../lib/seasonGamesCache";
import { getCachedUser, getMe } from "../auth/authClient";

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

// ---- shared sx ----
const surfaceCardSx = { borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.10)" };
const logoSx = (size, pad) => ({ width: size, height: size, boxSizing: "border-box", borderRadius: 1.75, bgcolor: "#fff", objectFit: "contain", p: pad, boxShadow: "0 4px 12px rgba(0,0,0,0.35)", flexShrink: 0 });
const sectionTitleSx = { fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-primary)", mb: 1, pl: 0.25 };
const Center = ({ text }) => (
  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 5 }}>
    <CircularProgress color="primary" />
    {text && <Typography variant="body2" sx={{ color: "text.secondary" }}>{text}</Typography>}
  </Box>
);
const Note = ({ children }) => <Box sx={{ textAlign: "center", py: 3.5, px: 2, color: "var(--gz-text-tertiary)", fontSize: 14 }}>{children}</Box>;

// The box-score page (Flashscore-style layout). The clicked game is passed via nav
// state for an instant paint; on a direct URL / refresh we look it up in the
// season cache by its ext id. /api/getGameReport fills the events.
const BoxScore = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const goBack = useGoBack("/gamezone");

  const [game, setGame] = useState(
    () => (state && state.game) || peekSeasonGames().find((g) => String(g.id) === String(id)) || null
  );
  const [report, setReport] = useState(undefined); // undefined=loading, null=none, obj
  const [tab, setTab] = useState("events");

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
    const params = new URLSearchParams({ date: game.date, home: String(game.homeTeamId), away: String(game.awayTeamId), extId: String(game.id) });
    fetch(`/api/getGameReport?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) setReport(d && d.resolved ? d : null); })
      .catch(() => { if (!cancelled) setReport(null); });
    return () => { cancelled = true; };
  }, [game]);

  // Live: while the open game is in progress, re-poll every 30 s (foreground only).
  const live = !!(report && report.started && !report.finished);
  useEffect(() => {
    if (!game || !live) return;
    let cancelled = false;
    const params = new URLSearchParams({ date: game.date, home: String(game.homeTeamId), away: String(game.awayTeamId), extId: String(game.id) });
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/getGameReport?${params.toString()}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => { if (!cancelled && d && d.resolved) setReport(d); })
        .catch(() => {});
    };
    const iv = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [game, live]);

  // Admin-only "refresh from tulospalvelu" — busts the durable report cache
  // (?fresh=1) for the rare case a scorekeeper corrects a finished game's stats.
  const [isAdmin, setIsAdmin] = useState(() => !!(getCachedUser() && getCachedUser().isAdmin));
  useEffect(() => { getMe().then((u) => setIsAdmin(!!(u && u.isAdmin))).catch(() => {}); }, []);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    if (!game) return;
    setRefreshing(true);
    const params = new URLSearchParams({ date: game.date, home: String(game.homeTeamId), away: String(game.awayTeamId), extId: String(game.id), fresh: "1" });
    fetch(`/api/getGameReport?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (d && d.resolved) setReport(d); })
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [game]);

  const tpUrl =
    game && report && report.realId
      ? `https://tulospalvelu.leijonat.fi/game?season=${seasonOf(game.date)}&gameid=${report.realId}&lang=fi`
      : null;

  const topBtnSx = { width: 38, height: 38, borderRadius: 2.5, flexShrink: 0, bgcolor: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.10)", color: "var(--gz-text-secondary)", "&:hover": { bgcolor: "rgba(255,255,255,0.09)" } };

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "var(--color-bg)", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      <Box sx={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 1.25, px: 1.75, pt: "calc(env(safe-area-inset-top) + 12px)", pb: 1.5, bgcolor: "var(--color-bg)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <IconButton onClick={goBack} aria-label="Takaisin" sx={topBtnSx}><LuArrowLeft size={20} /></IconButton>
        <Typography sx={{ flex: 1, fontFamily: "var(--font-family-display)", fontSize: 18, fontWeight: 800, letterSpacing: "var(--font-display-tracking)", textTransform: "uppercase", color: "var(--color-primary)", transform: "translateY(var(--font-display-shift))" }}>Ottelu</Typography>
        {tpUrl && (
          <Button component="a" href={tpUrl} target="_blank" rel="noopener noreferrer" aria-label="Avaa tulospalvelussa" startIcon={<LuExternalLink size={16} />}
            sx={{ flexShrink: 0, px: 1.25, py: 0.75, borderRadius: 2, fontSize: 12.5, fontWeight: 700, textTransform: "none", bgcolor: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.10)", "&, &:hover, &:focus, &:visited": { color: "var(--gz-text-secondary)" }, "&:hover": { bgcolor: "rgba(255,255,255,0.09)" } }}>
            Tulospalvelu
          </Button>
        )}
        {isAdmin && game && (
          <IconButton onClick={refresh} disabled={refreshing} aria-label="Päivitä pöytäkirja tulospalvelusta" sx={topBtnSx}>
            {refreshing ? <CircularProgress size={16} sx={{ color: "var(--gz-text-secondary)" }} /> : <LuRefreshCw size={18} />}
          </IconButton>
        )}
      </Box>

      {!game ? (
        <Center text="Ladataan…" />
      ) : (
        <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5, pt: 1.5 }}>
          <GameHeader game={game} report={report} />
          {report === undefined && <Center text="Ladataan pöytäkirjaa…" />}
          {report === null && <Note>Ottelupöytäkirjaa ei ole saatavilla tälle ottelulle.</Note>}
          {report && (
            <>
              <SwipeableTabs
                tabs={[{ value: "events", label: "Tapahtumat" }, { value: "stats", label: "Tilastot" }, { value: "points", label: "Pisteet" }, { value: "rosters", label: "Kokoonpanot" }]}
                value={tab}
                onChange={setTab}
                tabsSx={{ mt: 0.25, mb: 1.75, borderBottom: "1px solid rgba(255,255,255,0.10)", "& .MuiTab-root": { minHeight: 0, py: 1.25, px: 0.5, fontSize: 12, fontWeight: 800, letterSpacing: ".01em", textTransform: "uppercase", whiteSpace: "nowrap", color: "var(--gz-text-tertiary)" }, "& .Mui-selected": { color: "var(--color-primary)" } }}
              >
                <Box>
                  <Timeline report={report} />
                  <WinningShots shots={report.winningShots} game={game} />
                  <Goalies report={report} game={game} />
                  <Footer report={report} game={game} />
                </Box>
                <Stats report={report} game={game} />
                <Scorers report={report} game={game} />
                <Rosters rosters={report.rosters} game={game} />
              </SwipeableTabs>
            </>
          )}
        </Box>
      )}
    </Box>
  );
};

const GameHeader = ({ game, report }) => {
  const started = report ? report.started : Number(game.finished) > 0;
  const finished = report ? report.finished : Number(game.finished) > 0;
  const score = report && report.score ? report.score : { home: game.home_goals, away: game.away_goals };
  const d = mdate(game.date);
  const finType = report ? report.finishedType : Number(game.finished) || 0;
  const status = finished
    ? finType === 3 ? "Päättynyt (VL)" : finType === 2 ? "Päättynyt (JA)" : "Päättynyt"
    : started ? "Käynnissä" : d.format("dd D.M.");

  const teamSx = { flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 };
  return (
    <Box sx={{ ...surfaceCardSx, p: "14px 12px 12px", mb: 1.75, textAlign: "center" }}>
      <Typography sx={{ fontSize: 12, color: "var(--gz-text-tertiary)" }}>{d.format("D.M.YYYY [·] HH.mm")}</Typography>
      {game.level && <Typography sx={{ fontSize: 12, fontWeight: 800, color: "var(--color-primary)", textTransform: "uppercase", letterSpacing: ".04em", mt: 0.375 }}>{game.level.trim()}</Typography>}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, mt: 1.25 }}>
        <Box sx={teamSx}>
          <Box component="img" src={game.home_logo} alt="" sx={logoSx(60, "6px")} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: "var(--gz-text-primary)", lineHeight: 1.2 }}>{splitTeamName(game.home || "").main}</Typography>
        </Box>
        <Box sx={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, pt: 0.5, px: 0.75 }}>
          {started ? (
            <Typography sx={{ fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{score.home ?? 0}<Box component="span" sx={{ color: "var(--gz-text-tertiary)", mx: 0.75, fontWeight: 700 }}>–</Box>{score.away ?? 0}</Typography>
          ) : (
            <Typography sx={{ fontSize: 26, fontWeight: 800, color: "var(--gz-text-secondary)", lineHeight: 1 }}>{d.format("HH.mm")}</Typography>
          )}
          <Typography sx={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1.2, color: started && !finished ? "var(--color-live)" : "var(--gz-text-tertiary)" }}>{status}</Typography>
        </Box>
        <Box sx={teamSx}>
          <Box component="img" src={game.away_logo} alt="" sx={logoSx(60, "6px")} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: "var(--gz-text-primary)", lineHeight: 1.2 }}>{splitTeamName(game.away || "").main}</Typography>
        </Box>
      </Box>
    </Box>
  );
};

// Goals + penalties merged into one chronological timeline, grouped by period,
// each event mirrored to its team's side (home left, away right) Flashscore-style.
const Timeline = ({ report }) => {
  const byPeriod = useMemo(() => {
    const evs = [
      ...(report.goals || []).map((g) => ({ ...g, kind: "goal" })),
      ...(report.penalties || []).map((p) => ({ ...p, kind: "penalty" })),
      ...(report.extras || []),
    ].sort((a, b) => a.period - b.period || toSecs(a.time) - toSecs(b.time));
    const map = new Map();
    for (const e of evs) {
      if (!map.has(e.period)) map.set(e.period, []);
      map.get(e.period).push(e);
    }
    return map;
  }, [report]);

  const periods = report.periods || [];
  const finType = report.finishedType || 0;
  const maxEvPeriod = byPeriod.size ? Math.max(...byPeriod.keys()) : 0;
  const regCount = Math.max(0, periods.length - 1) ? Math.min(3, periods.length - 1) : Math.min(3, maxEvPeriod);

  const blocks = [];
  for (let n = 1; n <= regCount; n++) {
    blocks.push({ label: `${n}. erä`, score: periods[n - 1] ? periods[n - 1].replace("-", " – ") : null, events: byPeriod.get(n) || [] });
  }
  if (finType >= 2 || maxEvPeriod > 3) {
    let ot = [];
    for (const [p, evs] of byPeriod) if (p > 3) ot = ot.concat(evs);
    if (finType === 3) ot = ot.filter((e) => e.kind !== "goal");
    ot.sort((a, b) => toSecs(a.time) - toSecs(b.time));
    let oh = 0, oa = 0;
    for (const e of ot) if (e.kind === "goal") e.side === "home" ? (oh += 1) : (oa += 1);
    blocks.push({ label: "Jatkoaika", score: `${oh} – ${oa}`, events: ot });
  }
  if (blocks.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      {blocks.map((b, i) => (
        <Box key={i} sx={{ mb: 0.75 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.5, py: 0.75, borderRadius: "var(--radius-small)", bgcolor: "rgba(255,255,255,0.05)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--gz-text-secondary)" }}>
            <span>{b.label}</span>
            {b.score && <Box component="span" sx={{ color: "var(--gz-text-primary)", fontVariantNumeric: "tabular-nums" }}>{b.score}</Box>}
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {b.events.map((e, j) => <EventRow key={j} e={e} />)}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

// One event = time (fixed-width outer edge) + content (pill + name over a sub
// line), mirrored per side (home left, away right).
const EventRow = ({ e }) => {
  const isGoal = e.kind === "goal";
  const isPen = e.kind === "penalty";
  const away = e.side === "away";

  const rawName = isGoal ? e.scorer.name || "" : isPen ? e.player.name || "" : "";
  let name, sub;
  if (isGoal) {
    name = fullName(rawName);
    sub = e.assists && e.assists.length ? e.assists.map(fullName).join(" + ") : "";
  } else if (isPen) {
    name = !rawName.trim() || /^\s*null\b/i.test(rawName) ? "Joukkuerangaistus" : fullName(rawName);
    sub = e.reason || "";
  } else if (e.kind === "gk") {
    const gk = fullName(e.name);
    name = gk || e.sub;
    sub = gk ? e.sub : "";
  } else {
    name = e.name;
    sub = "";
  }
  const strength = isGoal && e.strength === "YV" ? "Ylivoima" : isGoal && e.strength === "AV" ? "Alivoima" : null;
  const badge = isGoal ? "MAALI" : isPen ? "JÄÄHY" : e.badge;
  const value = isGoal ? e.running.replace("-", " – ") : isPen ? `${e.minutes} min` : null;
  const badgeSx = isGoal
    ? { bgcolor: "var(--color-primary)", color: "var(--color-on-primary)" }
    : isPen ? { bgcolor: "transparent", color: "var(--color-primary)", border: "1px solid var(--color-primary)" }
      : { bgcolor: "transparent", color: "var(--gz-text-tertiary)", border: "1px solid rgba(255,255,255,0.20)" };

  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: "9px", py: "9px", px: "6px", borderBottom: "1px solid rgba(255,255,255,0.05)", width: "92%", ...(away ? { ml: "auto", flexDirection: "row-reverse" } : { mr: "auto" }) }}>
      <Box sx={{ flex: "0 0 40px", width: 40, pt: "4px", fontSize: 12, color: "var(--gz-text-tertiary)", fontVariantNumeric: "tabular-nums", textAlign: away ? "right" : "left" }}>{e.time}</Box>
      <Box sx={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: "2px", alignItems: away ? "flex-end" : "flex-start" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, maxWidth: "100%", minWidth: 0, flexDirection: away ? "row-reverse" : "row" }}>
          <Box sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "6px", fontSize: 12, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", flexDirection: away ? "row-reverse" : "row" }}>
            <Box component="span" sx={{ flexShrink: 0, borderRadius: "5px", display: "inline-flex", alignItems: "center", justifyContent: "center", px: "6px", py: "2px", fontSize: 10, fontWeight: 800, letterSpacing: ".03em", textTransform: "uppercase", lineHeight: 1.3, ...badgeSx }}>{badge}</Box>
            {value != null && <Box component="span" sx={{ color: "var(--color-primary)" }}>{value}</Box>}
          </Box>
          <Box sx={{ flex: "0 1 auto", minWidth: 0, fontSize: 13, fontWeight: 700, color: "var(--gz-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {strength && away && <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: "var(--gz-text-tertiary)" }}>({strength}) </Box>}
            {name}
            {strength && !away && <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: "var(--gz-text-tertiary)" }}> ({strength})</Box>}
          </Box>
        </Box>
        {sub && <Box sx={{ maxWidth: "100%", fontSize: 12, color: "var(--gz-text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</Box>}
      </Box>
    </Box>
  );
};

const goalieName = (raw) =>
  String(raw || "").split(/\s+/).map((w) => (w ? w.charAt(0).toLocaleUpperCase("fi") + w.slice(1).toLocaleLowerCase("fi") : w)).join(" ").trim();

// Time-attributed goals-against per keeper (matches scoring.js / the tulospalvelu MV
// tab): a backup coming in late isn't charged the starter's goals. Returns { name: ga }.
function goalieGA(report, side) {
  const t = (report.goalies || []).find((x) => x.side === side);
  if (!t || !t.keepers || !t.keepers.length) return {};
  const oppSide = side === "home" ? "away" : "home";
  const conceded = (report.goals || []).filter((x) => x.side === oppSide).map((x) => toSecs(x.time));
  const gkEv = (report.extras || []).filter((x) => x.side === side && x.kind === "gk")
    .map((x) => ({ time: toSecs(x.time), name: x.name, sub: x.sub })).sort((a, b) => a.time - b.time);
  const names = t.keepers.map((k) => k.name);
  const subsIn = new Set(gkEv.filter((e) => /vaihto/i.test(e.sub)).map((e) => e.name));
  const starter = names.find((n) => !subsIn.has(n)) || names[0];
  const tl = [{ time: 0, who: starter }];
  for (const e of gkEv) tl.push({ time: e.time, who: /pois/i.test(e.sub) ? null : e.name });
  const whoAt = (tt) => { let w = tl[0].who; for (const s of tl) if (s.time <= tt) w = s.who; return w; };
  const ga = {};
  for (const k of t.keepers) ga[k.name] = 0;
  for (const c of conceded) { const w = whoAt(c); if (w && ga[w] != null) ga[w] += 1; }
  return ga;
}

const pctStr = (v) => `${(Math.round(v * 10) / 10).toString().replace(".", ",")} %`;

const Goalies = ({ report, game }) => {
  const goalies = report.goalies;
  if (!goalies || goalies.length === 0) return null;
  const ordered = [...goalies].sort((a, b) => (a.side === "home" ? 0 : 1) - (b.side === "home" ? 0 : 1));
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={sectionTitleSx}>Maalivahdit</Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {ordered.map((t, i) => {
          const gaMap = goalieGA(report, t.side);
          const logo = t.side === "home" ? game.home_logo : t.side === "away" ? game.away_logo : null;
          return (t.keepers || []).map((k, j) => {
            const per = (k.saves || []).filter((s) => Number(s.period) !== 0);
            const totEntry = (k.saves || []).find((s) => Number(s.period) === 0);
            const total = Number(totEntry ? totEntry.saves : per.reduce((a, s) => a + (Number(s.saves) || 0), 0)) || 0;
            const breakdown = per.map((s) => s.saves).join(" + ");
            const out = (k.out || []).filter(Boolean);
            const shots = total + (gaMap[k.name] || 0);
            const pct = shots > 0 ? (total / shots) * 100 : null;
            return (
              <Box key={`${i}-${j}`} sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 0.25, py: 0.5 }}>
                <Box component="img" src={logo || ""} alt="" sx={logoSx(34, "3px")} />
                <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: "var(--gz-text-primary)" }}>{goalieName(k.name)}</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: "var(--gz-text-secondary)", fontVariantNumeric: "tabular-nums", mt: "1px" }}>{breakdown ? `${breakdown} = ${total}` : `${total}`} torjuntaa</Typography>
                  {out.length > 0 && <Typography sx={{ fontSize: 12, color: "var(--gz-text-tertiary)", mt: "1px" }}>(Poissa maalilta: {out.join(", ")})</Typography>}
                </Box>
                {pct != null && (
                  <Box sx={{ flexShrink: 0, textAlign: "right" }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 800, color: "var(--color-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{pctStr(pct)}</Typography>
                    <Typography sx={{ fontSize: 11, color: "var(--gz-text-tertiary)", mt: "2px", fontVariantNumeric: "tabular-nums" }}>{shots} laukausta</Typography>
                  </Box>
                )}
              </Box>
            );
          });
        })}
      </Box>
    </Box>
  );
};

const rosterName = (last, first) => `${String(last || "").toLocaleUpperCase("fi")} ${first || ""}`.trim();

const fullName = (raw) => {
  const s = String(raw || "").trim();
  if (!s) return "";
  const tokens = s.split(/\s+/);
  const isUpper = (t) => t === t.toLocaleUpperCase("fi") && /[A-ZÅÄÖ]/i.test(t);
  const title = (w) => w.charAt(0).toLocaleUpperCase("fi") + w.slice(1).toLocaleLowerCase("fi");
  const surname = [];
  let i = 0;
  while (i < tokens.length && isUpper(tokens[i])) surname.push(tokens[i++]);
  const given = tokens.slice(i);
  const sn = (surname.length ? surname : [tokens[0]]).map((t) => t.toLocaleUpperCase("fi")).join(" ");
  const gn = given.map(title).join(" ");
  return gn ? `${sn} ${gn}` : sn;
};

const WinningShots = ({ shots, game }) => {
  if (!shots || shots.length === 0) return null;
  let soHome = 0, soAway = 0;
  const rows = shots.map((w) => {
    if (w.scored) { if (w.side === "home") soHome += 1; else soAway += 1; }
    return { ...w, tally: `${soHome}–${soAway}` };
  });
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={sectionTitleSx}>Voittomaalikilpailu</Box>
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {rows.map((w, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 0.75, py: "7px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.05)", ...(w.winner && { bgcolor: "rgba(var(--color-primary-rgb),0.10)", borderRadius: "var(--radius-small)", borderBottomColor: "transparent" }) }}>
            <Box component="img" src={w.side === "home" ? game.home_logo : game.away_logo} alt="" sx={{ ...logoSx(24, "2px"), boxShadow: "none" }} />
            {w.jersey ? <Box component="span" sx={{ flexShrink: 0, fontWeight: 800, color: "var(--gz-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{w.jersey}</Box> : null}
            <Box component="span" sx={{ flex: "1 1 auto", minWidth: 0, color: "var(--gz-text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rosterName(w.last, w.first)}</Box>
            <Box component="span" sx={{ flexShrink: 0, minWidth: 34, textAlign: "right", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: w.scored ? "var(--color-primary)" : "var(--gz-text-tertiary)" }}>{w.scored ? w.tally : "–"}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// Two half-bars meeting at a centre gap; each fill ∝ value/max; the BETTER side is amber.
const StatBar = ({ home, away, lowerBetter }) => {
  const h = Number(home) || 0;
  const a = Number(away) || 0;
  const max = Math.max(h, a) || 1;
  const homeHi = lowerBetter ? h < a : h > a;
  const awayHi = lowerBetter ? a < h : a > h;
  const halfSx = { flex: "1 1 0", height: "100%", display: "flex", overflow: "hidden", borderRadius: "3px", bgcolor: "rgba(255,255,255,0.07)" };
  const fill = (hi, w) => ({ height: "100%", width: `${w}%`, bgcolor: hi ? "var(--color-primary)" : "rgba(255,255,255,0.30)" });
  return (
    <Box sx={{ display: "flex", alignItems: "center", height: 6 }}>
      <Box sx={{ ...halfSx, justifyContent: "flex-end" }}><Box sx={fill(homeHi, (h / max) * 100)} /></Box>
      <Box sx={{ flex: "0 0 10px" }} />
      <Box sx={{ ...halfSx, justifyContent: "flex-start" }}><Box sx={fill(awayHi, (a / max) * 100)} /></Box>
    </Box>
  );
};

const Stats = ({ report }) => {
  const s = report.stats;
  if (!s) return <Note>Tilastoja ei ole saatavilla tälle ottelulle.</Note>;
  const score = report.score || {};
  const num = (v) => (v == null || v === "" ? 0 : Number(v) || 0);
  const pen = { home: 0, away: 0 };
  const penMin = { home: 0, away: 0 };
  for (const p of report.penalties || []) {
    const side = p.side === "away" ? "away" : "home";
    pen[side] += 1;
    penMin[side] += num(p.minutes);
  }
  const ppGH = num(s.ppGoals.home);
  const ppGA = num(s.ppGoals.away);
  const pctNum = (made, opp) => (opp > 0 ? Math.max(0, Math.min(100, Math.round((made / opp) * 100))) : null);
  const toSec = (t) => {
    const [m, x] = String(t || "0:0").split(":").map(Number);
    return (m || 0) * 60 + (x || 0);
  };
  const ppmH = s.ppMins.home || "0:00";
  const ppmA = s.ppMins.away || "0:00";
  const rows = [
    { label: "Maalit", home: num(score.home), away: num(score.away) },
    { label: "Laukaukset", home: num(s.saves.away) + num(score.home), away: num(s.saves.home) + num(score.away) },
    { label: "Torjunnat", home: num(s.saves.home), away: num(s.saves.away) },
    { label: "Jäähyt", home: pen.home, away: pen.away },
    { label: "Jäähyminuutit", home: penMin.home, away: penMin.away },
    { label: "Ylivoimamaalit", home: ppGH, away: ppGA },
    { label: "Alivoimamaalit", home: num(s.shGoals.home), away: num(s.shGoals.away) },
    { label: "Ylivoima-%", home: pctNum(ppGH, pen.away), away: pctNum(ppGA, pen.home), pct: true },
    { label: "Alivoima-%", home: pctNum(pen.home - ppGA, pen.home), away: pctNum(pen.away - ppGH, pen.away), pct: true },
    { label: "Ylivoima-aika", home: toSec(ppmH), away: toSec(ppmA), time: [ppmH, ppmA] },
  ];
  const disp = (r, side) => {
    if (r.time) return side === "home" ? r.time[0] : r.time[1];
    const v = side === "home" ? r.home : r.away;
    return r.pct ? (v == null ? "–" : `${v} %`) : v;
  };
  const valSx = { flex: "0 0 52px", fontSize: 15, fontWeight: 800, color: "var(--gz-text-primary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.875, pt: 0.5 }}>
      {rows.map((r, i) => (
        <Box key={i} sx={{ display: "flex", flexDirection: "column", gap: 0.625 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box component="span" sx={valSx}>{disp(r, "home")}</Box>
            <Box component="span" sx={{ flex: "1 1 auto", textAlign: "center", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--gz-text-tertiary)", fontWeight: 700 }}>{r.label}</Box>
            <Box component="span" sx={{ ...valSx, textAlign: "right" }}>{disp(r, "away")}</Box>
          </Box>
          <StatBar home={r.home ?? 0} away={r.away ?? 0} lowerBetter={r.lowerBetter} />
        </Box>
      ))}
    </Box>
  );
};

// order-independent name key (scorer "SALONEN Jooa" ↔ roster last "Salonen" + first).
const nameKey = (s) => Array.from(new Set(String(s || "").toLocaleUpperCase("fi").split(/\s+/).filter(Boolean))).sort().join(" ");

// Per-game scoring leaders (tulospalvelu "Pisteet"): goals + assists tallied per
// player, ranked by points. Row = jersey number (left) · name / team (middle, two
// rows) · "goals + assists = total" formula (right, total in orange). Jersey numbers
// come from the rosters (goal events carry none).
const Scorers = ({ report, game }) => {
  const numByName = {};
  const idx = (players, side) => { for (const p of players || []) { const k = nameKey(`${p.last} ${p.first}`); if (k) numByName[`${side}|${k}`] = p.number; } };
  if (report.rosters) { idx(report.rosters.home && report.rosters.home.players, "home"); idx(report.rosters.away && report.rosters.away.players, "away"); }

  const tally = {};
  const add = (side, name, isGoal) => {
    const key = `${side}|${name}`;
    if (!tally[key]) tally[key] = { side, name, g: 0, a: 0 };
    if (isGoal) tally[key].g += 1; else tally[key].a += 1;
  };
  for (const gl of report.goals || []) {
    if (gl.scorer && gl.scorer.name) add(gl.side, gl.scorer.name, true);
    for (const as of gl.assists || []) if (as) add(gl.side, as, false);
  }
  const rows = Object.values(tally).map((r) => ({ ...r, p: r.g + r.a, number: numByName[`${r.side}|${nameKey(r.name)}`] }))
    .sort((a, b) => b.p - a.p || b.g - a.g || String(a.name).localeCompare(String(b.name)));
  if (!rows.length) return <Note>Tehopisteitä ei ole tälle ottelulle.</Note>;
  return (
    <Box sx={{ pt: 0.5 }}>
      <Box sx={sectionTitleSx}>Pistepörssi</Box>
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => {
          const team = splitTeamName((r.side === "home" ? game.home : game.away) || "").main;
          return (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1.6, borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              {/* jersey number */}
              <Box sx={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", bgcolor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", display: "grid", placeItems: "center" }}>
                <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1, color: "var(--gz-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{r.number != null && r.number !== "" ? r.number : "–"}</Typography>
              </Box>
              {/* name (bigger) / team */}
              <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 16, fontWeight: 700, color: "var(--gz-text-primary)", lineHeight: 1.2 }}>{fullName(r.name)}</Typography>
                <Typography noWrap sx={{ fontSize: 13, color: "var(--gz-text-tertiary)", mt: "3px" }}>{team}</Typography>
              </Box>
              {/* points as a formula: maalit + syötöt = total (total in orange) */}
              <Box component="span" sx={{ flexShrink: 0, fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--gz-text-secondary)" }}>
                {r.g} + {r.a} = <Box component="span" sx={{ color: "var(--color-primary)" }}>{r.p}</Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

const RosterTeam = ({ side, logo, name, first }) => {
  const players = [...((side && side.players) || [])].sort((a, b) => {
    const ga = a.role === "MV" ? 0 : 1;
    const gb = b.role === "MV" ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return (Number(a.number) || 99) - (Number(b.number) || 99);
  });
  const staff = (side && side.staff) || [];
  const subSx = { fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--color-primary)", m: "12px 0 4px", pl: 0.25 };
  return (
    <Box sx={first ? {} : { mt: 2.75, pt: 2.75, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.375, mb: 1.5 }}>
        <Box component="img" src={logo} alt="" sx={logoSx(36, "3px")} />
        <Typography sx={{ fontSize: 18, fontWeight: 800, color: "var(--gz-text-primary)" }}>{splitTeamName(name || "").main}</Typography>
      </Box>
      {players.length > 0 && (
        <>
          <Box sx={subSx}>Pelaajat</Box>
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {players.map((p, i) => (
              <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 0.5, py: 0.75, borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
                <Box component="span" sx={{ flex: "0 0 26px", textAlign: "center", fontWeight: 800, color: "var(--gz-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{p.number}</Box>
                <Box component="span" sx={{ flex: "1 1 auto", minWidth: 0, color: "var(--gz-text-primary)", fontWeight: 600 }}>{rosterName(p.last, p.first)}</Box>
                {p.role === "MV" && <RTag>MV</RTag>}
                {p.captain && <RTag c>{p.captain}</RTag>}
              </Box>
            ))}
          </Box>
        </>
      )}
      {staff.length > 0 && (
        <>
          <Box sx={subSx}>Toimihenkilöt</Box>
          <Box sx={{ display: "flex", flexDirection: "column" }}>
            {staff.map((s, i) => (
              <Box key={i} sx={{ display: "flex", justifyContent: "space-between", gap: 1.25, px: 0.5, py: 0.75, borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13, color: "var(--gz-text-secondary)" }}>
                <span>{rosterName(s.last, s.first)}</span>
                <Box component="span" sx={{ flexShrink: 0, color: "var(--gz-text-tertiary)", fontSize: 12, alignSelf: "center" }}>{s.role}</Box>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};

const RTag = ({ c, children }) => (
  <Box component="span" sx={{ flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".03em", px: "5px", py: "1px", borderRadius: "4px", ...(c
    ? { color: "var(--color-primary)", bgcolor: "rgba(var(--color-primary-rgb),0.12)", border: "1px solid rgba(var(--color-primary-rgb),0.30)" }
    : { color: "var(--gz-text-tertiary)", bgcolor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }) }}>{children}</Box>
);

const Rosters = ({ rosters, game }) => {
  const empty = !rosters || (!(rosters.home && rosters.home.players.length) && !(rosters.away && rosters.away.players.length));
  if (empty) return <Note>Kokoonpanoja ei ole saatavilla tälle ottelulle.</Note>;
  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <RosterTeam first side={rosters.home} logo={game.home_logo} name={game.home} />
      <RosterTeam side={rosters.away} logo={game.away_logo} name={game.away} />
    </Box>
  );
};

const Footer = ({ report, game }) => {
  const refs = (report.referees || []).map((r) => fullName(r.name)).filter(Boolean);
  const venue = report.arena || game.rink;
  const hasInfo = refs.length > 0 || venue || report.spectators != null;
  if (!hasInfo) return null;
  const InfoRow = ({ icon, label, value }) => (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, py: "7px", borderTop: "1px solid rgba(255,255,255,0.05)", "&:first-of-type": { borderTop: "none" } }}>
      <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--gz-text-tertiary)" }}>{icon} {label}</Box>
      <Box component="span" sx={{ fontSize: 13, fontWeight: 700, color: "var(--gz-text-primary)", textAlign: "right", minWidth: 0 }}>{value}</Box>
    </Box>
  );
  return (
    <Box sx={{ pt: 0.75, pb: 3 }}>
      <Box sx={sectionTitleSx}>Ottelun lisätiedot</Box>
      <Box sx={{ ...surfaceCardSx, bgcolor: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.08)", p: "12px 14px" }}>
        {refs.map((r, i) => <InfoRow key={`ref-${i}`} icon={<LuFlag size={15} />} label="Tuomari" value={r} />)}
        {venue && <InfoRow icon={<LuMapPin size={15} />} label="Pelipaikka" value={venue} />}
        {report.spectators != null && <InfoRow icon={<LuUsers size={15} />} label="Katsojia" value={Number(report.spectators).toLocaleString("fi-FI")} />}
      </Box>
    </Box>
  );
};

export default BoxScore;
