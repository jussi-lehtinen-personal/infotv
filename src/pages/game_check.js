import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Box, Typography, Stack, CircularProgress, Chip, ToggleButtonGroup, ToggleButton } from "@mui/material";
import { LuCheck, LuX, LuMinus, LuAlertTriangle, LuRefreshCw } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import { MuiHeader } from "../components/ui/MuiHeader";
import { fetchSeasonGames, peekSeasonGames } from "../lib/seasonGamesCache";
import { ageKey } from "../lib/teamMatch";
import { seriesLabel } from "../lib/teamLabels";
import { JOPOX_TEAMS } from "../data/jopoxTeams";

moment.locale("fi");

// Game-registration audit (/gamecheck). One row per Ahma game, one column per system that
// is SUPPOSED to know about it. Tulospalvelu is the ground truth — every other column
// answers "does this system agree?", never the other way round.
//
// Why it exists: the kiosk found games missing from Tilamisu two weeks out while
// tulospalvelu had the whole season (2026-09-14). The systems are maintained by different
// people and nothing compared them, so a gap only surfaced when someone stood at a locked
// door. This page is that comparison.
//
// Costs nothing new: the season cache is already loaded for the rest of the app, and both
// getTeamEvents (Jopox) and getReservations (tilamisu) are server-cached proxies. No
// tulospalvelu calls at all.

/* ── status vocabulary ───────────────────────────────────────────────────── */
// ok = the system has it · warn = has it, but not the way it should · miss = absent
// unknown = we genuinely cannot tell (source doesn't reach that far) · na = not applicable
const OK = "ok", WARN = "warn", MISS = "miss", UNKNOWN = "unknown", NA = "na";

const STATUS_META = {
  [OK]:      { Icon: LuCheck,         color: "var(--color-win)",     label: "Kunnossa" },
  [WARN]:    { Icon: LuAlertTriangle, color: "var(--color-primary)", label: "Huomio" },
  [MISS]:    { Icon: LuX,             color: "var(--color-loss)",    label: "Puuttuu" },
  [UNKNOWN]: { Icon: LuMinus,         color: "var(--gz-text-tertiary, rgba(255,255,255,.45))", label: "Ei tietoa" },
  [NA]:      { Icon: LuMinus,         color: "rgba(255,255,255,.22)", label: "Ei koske" },
};

const COLUMNS = [
  { key: "tp", label: "TP", title: "Ottelu tulospalvelussa" },
  { key: "jopox", label: "Jopox", title: "Ottelu Jopoxissa" },
  { key: "ice", label: "Jää", title: "Ottelulle varattu jää Tilamisussa" },
  { key: "kiosk", label: "Kioski", title: "Kioski avoinna" },
];

/* ── helpers ─────────────────────────────────────────────────────────────── */

const dayOf = (s) => String(s || "").slice(0, 10);
const hhmm = (s) => { const m = String(s || "").match(/\d{2}:\d{2}/); return m ? m[0] : ""; };
const minsOf = (s) => { const t = hhmm(s); if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const isHomeGame = (g) => /valkeakos/i.test(g.rink || "");

// A game's Jopox team. tulospalvelu levels ("U13 Sininen") map to an age key, which is
// the name JOPOX_TEAMS uses. Returns null when the club has no Jopox subsite for that age
// — which is itself worth reporting, since those games can never be checked.
const jopoxTeamOf = (game) => {
  const key = ageKey(`${game.level || ""} ${game.league || ""}`);
  if (!key) return null;
  const name = key === "naiset" ? "Edustus naiset" : key === "edustus" ? "Edustus" : key;
  return JOPOX_TEAMS.find((t) => t.name === name) || null;
};

// How long the ice is held for one game. Only used to judge whether a reservation covers
// the game, so it is deliberately generous at the short end.
const GAME_MINUTES = 75;

/* ── the three checks ────────────────────────────────────────────────────── */

// 1. Tulospalvelu — the source itself. The only thing that can be wrong here is a game
//    with no kickoff time, which blocks everyone downstream from booking anything.
const checkTp = (g) => (hhmm(g.date) ? { status: OK } : { status: WARN, note: "aika puuttuu" });

// The opponent's club word ("HPK Oranssi" → "hpk"). The colour half is useless for
// matching: half the teams in a junior series are somebody's "Valkoinen".
const clubWord = (s) => (String(s || "").toLowerCase().replace(/[^a-zåäö0-9 ]/g, " ").split(/\s+/).filter(Boolean)[0] || "");
// Everything a Jopox event says about who is playing. Jopox fills gameHometeam /
// gameGuestteam inconsistently (both null on plenty of rows, and the title's sides are not
// reliably home-then-away), so we search the lot rather than trusting one field.
const jopoxTeamsText = (e) => [e.title, e.gameHometeam, e.gameGuestteam].filter(Boolean).join(" ").toLowerCase();

// 2. Jopox — the team's own calendar on kiekko-ahma.fi. `events` is what /api/getTeamEvents
//    returned for this team; it only reaches a few months out and caps at 80 items, so past
//    that horizon the honest answer is "ei tietoa", NOT "puuttuu".
//
//    Matching is by opponent AND time, not by date alone: a junior team plays twice on the
//    same Saturday often enough that a date match would call a missing game present.
function checkJopox(g, teamEvents) {
  const team = jopoxTeamOf(g);
  if (!team) return { status: UNKNOWN, note: "ei Jopox-joukkuetta" };
  const ev = teamEvents[team.subsiteId];
  if (!ev) return { status: UNKNOWN, note: "ei haettu" };

  const day = dayOf(g.date);
  const sameDay = ev.list.filter((e) => e.type === "game" && dayOf(e.date) === day);
  if (!sameDay.length) {
    // Nothing that day — but can this list even see that day? The horizon is the last event
    // it returned; beyond it the list was truncated, not empty.
    if (ev.horizon && day > ev.horizon) return { status: UNKNOWN, note: "kalenterin ulkopuolella" };
    return { status: MISS };
  }

  const ahmaHome = /kiekko-?ahma/i.test(g.home || "");
  const cw = clubWord(ahmaHome ? g.away : g.home);
  const gm = minsOf(g.date);
  const named = sameDay.filter((e) => cw && jopoxTeamsText(e).includes(cw));
  const timed = sameDay.filter((e) => { const em = minsOf(e.uiTime || e.date); return gm != null && em != null && Math.abs(em - gm) <= 45; });

  if (named.length && gm == null) {
    // The game is in Jopox WITH a time that tulospalvelu is missing — show it, so whoever
    // fixes tulospalvelu can just copy it across.
    return { status: OK, note: `Jopoxissa klo ${hhmm(named[0].uiTime || named[0].date)}` };
  }
  if (named.some((e) => timed.includes(e))) return { status: OK };
  if (named.length) return { status: WARN, note: `eri aika (${hhmm(named[0].uiTime || named[0].date)})` };
  if (timed.length) return { status: OK, note: "nimi ei täsmää" };
  return { status: MISS, note: `${sameDay.length} muuta peliä sinä päivänä` };
}

// 3. Tilamisu — is the ice actually booked. Away games are somebody else's hall, so they
//    are not applicable. A game inside the weekly "Kiekko-Ahma otteluvuoro" block counts as
//    booked ice but NOT as a booked game: that is exactly the state the kiosk complained
//    about, so it gets its own colour rather than a clean tick.
function checkIce(g, reservations, range) {
  if (!isHomeGame(g)) return { status: NA };
  const day = dayOf(g.date);
  if (range && (day < range.from || day > range.to)) return { status: UNKNOWN, note: "haun ulkopuolella" };
  const start = minsOf(g.date);
  if (start == null) return { status: UNKNOWN, note: "ei kellonaikaa" };

  const sameDay = (reservations || []).filter((r) => dayOf(r.start) === day);
  const covers = (r) => {
    const s = minsOf(r.start), e = minsOf(r.end);
    return s != null && e != null && s <= start + 10 && e >= start + Math.min(GAME_MINUTES, 45);
  };
  const ahma = (r) => /kiekko-?ahma|(^|\s)ka\s|sarjaot|ahma/i.test(r.text || "");

  const covering = sameDay.filter(covers);
  if (covering.some((r) => r.isGame)) return { status: OK };
  const block = covering.find(ahma);
  if (block) return { status: WARN, note: "otteluvuoron sisällä" };
  // Ice IS booked for a game that day, just not around this game's time — either the
  // booking or tulospalvelu has the wrong hour, and both are worth knowing about.
  const elsewhere = sameDay.find((r) => r.isGame && ahma(r));
  if (elsewhere) return { status: WARN, note: `jää varattu klo ${hhmm(elsewhere.start)}` };
  return { status: MISS };
}

// 4. Kiosk — no data source yet; the column exists so the row layout is final.
const checkKiosk = () => ({ status: UNKNOWN, note: "" });

/* ── UI bits ─────────────────────────────────────────────────────────────── */

const StatusDot = ({ status, note }) => {
  const meta = STATUS_META[status] || STATUS_META[UNKNOWN];
  return (
    <Box title={note ? `${meta.label} — ${note}` : meta.label}
      sx={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            bgcolor: status === OK || status === WARN || status === MISS ? `color-mix(in srgb, ${meta.color} 16%, transparent)` : "transparent",
            border: `1px solid ${status === NA ? "transparent" : `color-mix(in srgb, ${meta.color} 45%, transparent)`}` }}>
      <Box component={meta.Icon} sx={{ fontSize: 14, color: meta.color, display: "block" }} />
    </Box>
  );
};

const GameRow = ({ g, checks }) => {
  const time = hhmm(g.date);
  const notes = COLUMNS.map((c) => checks[c.key]).filter((r) => r && r.note).map((r) => r.note);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 1.1, px: 1.25,
          borderBottom: "1px solid var(--color-surface-divider, rgba(255,255,255,.08))" }}>
      <Box sx={{ width: 46, flexShrink: 0 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 14, fontVariantNumeric: "tabular-nums", color: time ? "text.primary" : "var(--color-primary)" }}>
          {time || "—:—"}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {g.home} – {g.away}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {seriesLabel(g.level)} · {isHomeGame(g) ? "koti" : g.rink || "vieras"}
          {notes.length ? ` · ${notes.join(" · ")}` : ""}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
        {COLUMNS.map((c) => <StatusDot key={c.key} {...(checks[c.key] || { status: UNKNOWN })} />)}
      </Stack>
    </Box>
  );
};

/* ── page ────────────────────────────────────────────────────────────────── */

export default function GameCheck() {
  const [games, setGames] = useState(() => peekSeasonGames());
  const [teamEvents, setTeamEvents] = useState({});
  const [reservations, setReservations] = useState(null);
  const [range, setRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("upcoming"); // upcoming | all
  const [reload, setReload] = useState(0);

  // Rows: Ahma games, oldest first. Past games are opt-in — Jopox's calendar only returns
  // UPCOMING events, so every past row would show a red cross it cannot justify.
  const rows = useMemo(() => {
    const today = moment().format("YYYY-MM-DD");
    return [...games]
      .filter((g) => (scope === "all" ? true : dayOf(g.date) >= today))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [games, scope]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const season = await fetchSeasonGames().catch(() => peekSeasonGames());
      if (cancelled) return;
      const list = Array.isArray(season) ? season : peekSeasonGames();
      setGames(list);

      // One reservations call for the whole span we are about to judge.
      const days = list.map((g) => dayOf(g.date)).filter(Boolean).sort();
      const from = moment().format("YYYY-MM-DD");
      const to = days.length ? days[days.length - 1] : from;
      fetch(`/api/getReservations?from=${from}&to=${to}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => { if (!cancelled) { setReservations(Array.isArray(d) ? d : []); setRange({ from, to }); } })
        .catch(() => { if (!cancelled) setReservations([]); });

      // Jopox: one call per team, in parallel. `horizon` = the last day this list can speak
      // for; beyond it a missing game means "truncated", not "not entered".
      await Promise.all(JOPOX_TEAMS.map(async (t) => {
        try {
          const d = await fetch(`/api/getTeamEvents?subsiteId=${t.subsiteId}`).then((r) => (r.ok ? r.json() : null));
          const ev = (d && (Array.isArray(d) ? d : d.events)) || [];
          const dates = ev.map((e) => dayOf(e.date)).filter(Boolean).sort();
          if (!cancelled) {
            setTeamEvents((prev) => ({ ...prev, [t.subsiteId]: { list: ev, horizon: dates[dates.length - 1] || null } }));
          }
        } catch { /* a team that fails stays "ei haettu" rather than "puuttuu" */ }
      }));
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reload]);

  const checksFor = useCallback((g) => ({
    tp: checkTp(g),
    jopox: checkJopox(g, teamEvents),
    ice: checkIce(g, reservations, range),
    kiosk: checkKiosk(g),
  }), [teamEvents, reservations, range]);

  // Headline counts — what actually needs fixing, per column.
  const summary = useMemo(() => {
    const s = { jopoxMiss: 0, iceMiss: 0, iceBlock: 0, noTime: 0 };
    for (const g of rows) {
      const c = checksFor(g);
      if (c.tp.status === WARN) s.noTime += 1;
      if (c.jopox.status === MISS) s.jopoxMiss += 1;
      if (c.ice.status === MISS) s.iceMiss += 1;
      if (c.ice.status === WARN) s.iceBlock += 1;
    }
    return s;
  }, [rows, checksFor]);

  // Group by day so the list reads like a calendar.
  const byDay = useMemo(() => {
    const out = [];
    for (const g of rows) {
      const d = dayOf(g.date);
      if (!out.length || out[out.length - 1].day !== d) out.push({ day: d, games: [] });
      out[out.length - 1].games.push(g);
    }
    return out;
  }, [rows]);

  return (
    <Box sx={{ minHeight: "100dvh", background: "var(--bg-gradient)", pb: 6 }}>
      <MuiHeader title="Ottelujen tarkistus" />

      <Box sx={{ px: 1.5, maxWidth: 820, mx: "auto" }}>
        <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.5, mb: 1.5 }}>
          Tulospalvelu on totuus. Jokaisen ottelun kohdalta tarkistetaan, tietävätkö muut
          järjestelmät siitä.
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <ToggleButtonGroup size="small" exclusive value={scope} onChange={(e, v) => v && setScope(v)}>
            <ToggleButton value="upcoming">Tulevat</ToggleButton>
            <ToggleButton value="all">Koko kausi</ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ flex: 1 }} />
          <Box component="button" onClick={() => setReload((n) => n + 1)} aria-label="Päivitä"
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.25, py: 0.6, borderRadius: 999, cursor: "pointer",
                  bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", color: "text.secondary" }}>
            <Box component={LuRefreshCw} sx={{ fontSize: 14, display: "block" }} />
            <Box component="span" sx={{ fontSize: 12.5, fontWeight: 700 }}>Päivitä</Box>
          </Box>
        </Stack>

        {/* What needs doing, in one line each. */}
        <Stack direction="row" spacing={0.75} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.75 }}>
          <Chip size="small" label={`${rows.length} ottelua`} />
          {summary.jopoxMiss > 0 && <Chip size="small" color="error" variant="outlined" label={`Jopoxista puuttuu ${summary.jopoxMiss}`} />}
          {summary.iceMiss > 0 && <Chip size="small" color="error" variant="outlined" label={`Jää varaamatta ${summary.iceMiss}`} />}
          {summary.iceBlock > 0 && <Chip size="small" color="warning" variant="outlined" label={`Vain otteluvuorossa ${summary.iceBlock}`} />}
          {summary.noTime > 0 && <Chip size="small" color="warning" variant="outlined" label={`Aika puuttuu ${summary.noTime}`} />}
        </Stack>

        {/* Column key — the dots are unreadable without it. */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.25, py: 0.75, mb: 0.5,
              borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>
              Ottelu
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
            {COLUMNS.map((c) => (
              <Typography key={c.key} title={c.title}
                sx={{ width: 26, textAlign: "center", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.02em",
                      textTransform: "uppercase", color: "text.secondary" }}>
                {c.label}
              </Typography>
            ))}
          </Stack>
        </Box>

        {loading && !rows.length ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress size={28} /></Box>
        ) : (
          byDay.map(({ day, games: gs }) => (
            <Box key={day} sx={{ mb: 1.25, borderRadius: "var(--radius-card)", overflow: "hidden",
                  bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
              <Typography sx={{ px: 1.25, py: 0.75, fontSize: 12, fontWeight: 800, letterSpacing: "0.04em",
                    textTransform: "uppercase", color: "primary.main", bgcolor: "rgba(var(--color-primary-rgb),0.07)" }}>
                {moment(day).format("dd D.M.YYYY")}
              </Typography>
              {gs.map((g, i) => <GameRow key={g.id ?? i} g={g} checks={checksFor(g)} />)}
            </Box>
          ))
        )}

        {loading && rows.length > 0 && (
          <Typography sx={{ fontSize: 12, color: "text.secondary", textAlign: "center", py: 1 }}>Haetaan lähteitä…</Typography>
        )}

        <Stack spacing={0.5} sx={{ mt: 2, px: 0.5 }}>
          {Object.entries(STATUS_META).map(([k, m]) => (
            <Stack key={k} direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <StatusDot status={k} />
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{m.label}</Typography>
            </Stack>
          ))}
          <Typography sx={{ fontSize: 11.5, color: "text.disabled", lineHeight: 1.5, mt: 1 }}>
            Jopoxin kalenterista saadaan vain tulevat tapahtumat ja rajallinen määrä kerrallaan,
            joten kauas tulevaisuuteen menevät ottelut jäävät "ei tietoa" -tilaan. Kioski-sarake
            odottaa vielä aukiolodataa.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}
