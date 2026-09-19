import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Box, Card, Typography, Stack, CircularProgress, Chip, ToggleButtonGroup, ToggleButton, Tooltip, Collapse, IconButton } from "@mui/material";
import { LuCheck, LuX, LuMinus, LuAlertTriangle, LuRefreshCw, LuChevronDown, LuClock, LuMapPin } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
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
// Accepts both separators: tulospalvelu and tilamisu write "14:40", Jopox's uiTime writes
// "14.40". Matching on the colon alone left every Jopox time unparseable, which made the
// time comparison silently fail and stamped "eri aika" on games that were perfectly fine.
const hhmm = (s) => { const m = String(s || "").match(/(\d{1,2})[:.](\d{2})/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : ""; };
const minsOf = (s) => { const t = hhmm(s); if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const isHomeGame = (g) => /valkeakos/i.test(g.rink || "");
// Stable row identity. Friendlies occasionally arrive without an id, and a Map keyed on
// undefined would make two of them look like the same game.
const gameKey = (g) => String(g.id ?? `${g.date}|${g.home}|${g.away}`);

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

// Full-ice game? U9–U12 play small-area games ACROSS the rink — two or three at once is the
// format, not a clash — so they are excluded from the overlap check. U13 and up own the
// whole sheet, and at Wareena those are consistently booked 90 minutes apart.
const fullIce = (g) => {
  const key = ageKey(`${g.level || ""} ${g.league || ""}`);
  if (!key) return false;
  const m = key.match(/^U(\d+)$/i);
  return m ? Number(m[1]) >= 13 : true; // naiset / edustus
};
// Two home games starting closer together than this share the ice. The real spacing is 90.
const CLASH_MINUTES = 75;

// Home games that collide with another home game. Built once per row set, keyed by game id
// → the games it clashes with. Ground truth disagreeing with ITSELF is the one error no
// downstream system can absorb: whoever books the ice has to pick one.
function clashMap(games) {
  const byDay = {};
  for (const g of games) {
    if (!isHomeGame(g) || !fullIce(g) || minsOf(g.date) == null) continue;
    (byDay[dayOf(g.date)] ||= []).push(g);
  }
  const out = new Map();
  for (const list of Object.values(byDay)) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (Math.abs(minsOf(list[i].date) - minsOf(list[j].date)) >= CLASH_MINUTES) continue;
        out.set(gameKey(list[i]), [...(out.get(gameKey(list[i])) || []), list[j]]);
        out.set(gameKey(list[j]), [...(out.get(gameKey(list[j])) || []), list[i]]);
      }
    }
  }
  return out;
}

// 1. Tulospalvelu — the source itself. Two things can be wrong here: a game with no kickoff
//    time (which blocks everyone downstream from booking anything), and a game booked on
//    top of another home game.
function checkTp(g, clashes) {
  const clash = clashes && clashes.get(gameKey(g));
  const noTime = !hhmm(g.date);
  if (clash) {
    const when = hhmm(clash[0].date);
    return { status: WARN, note: `päällekkäin klo ${when}${noTime ? " · aika puuttuu" : ""}`, clash };
  }
  return noTime ? { status: WARN, note: "aika puuttuu" } : { status: OK };
}

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
    return { status: OK, note: `Jopoxissa klo ${hhmm(named[0].uiTime || named[0].date)}`, events: named, team };
  }
  const hit = named.find((e) => timed.includes(e));
  if (hit) return { status: OK, events: [hit], team };
  if (named.length) return { status: WARN, note: `eri aika (${hhmm(named[0].uiTime || named[0].date)})`, events: named, team };
  if (timed.length) return { status: OK, note: "nimi ei täsmää", events: timed, team };
  return { status: MISS, note: `${sameDay.length} muuta peliä sinä päivänä`, events: sameDay, team };
}

// 3. Tilamisu — is the ice actually booked. Away games are somebody else's hall, so they
//    are not applicable. A game inside the weekly "Kiekko-Ahma otteluvuoro" block counts as
//    booked ice but NOT as a booked game: that is exactly the state the kiosk complained
//    about, so it gets its own colour rather than a clean tick.
//    Returns the reservations it judged on, so the row can show exactly WHAT is booked
//    instead of only whether something is.
function checkIce(g, reservations, range) {
  if (!isHomeGame(g)) return { status: NA, note: "vieraspeli" };
  const day = dayOf(g.date);
  if (range && (day < range.from || day > range.to)) return { status: UNKNOWN, note: "haun ulkopuolella" };
  const start = minsOf(g.date);

  const sameDay = (reservations || []).filter((r) => dayOf(r.start) === day);
  const ahma = (r) => /kiekko-?ahma|(^|\s)ka\s|sarjaot|ahma/i.test(r.text || "");
  const ahmaDay = sameDay.filter(ahma);
  // With no kickoff time we cannot say WHICH slot is this game's — but the day's Ahma ice
  // is still worth showing, so the note and the evidence stay useful.
  if (start == null) return { status: UNKNOWN, note: "ei kellonaikaa", slots: ahmaDay };

  const covers = (r) => {
    const s = minsOf(r.start), e = minsOf(r.end);
    return s != null && e != null && s <= start + 10 && e >= start + Math.min(GAME_MINUTES, 45);
  };
  const covering = sameDay.filter(covers);
  const own = covering.find((r) => r.isGame);
  if (own) return { status: OK, slots: covering, slot: own };
  const block = covering.find(ahma);
  if (block) return { status: WARN, note: "otteluvuoron sisällä", slots: covering, slot: block };
  // Ice IS booked for a game that day, just not around this game's time — either the
  // booking or tulospalvelu has the wrong hour, and both are worth knowing about.
  const elsewhere = sameDay.find((r) => r.isGame && ahma(r));
  if (elsewhere) return { status: WARN, note: `jää varattu klo ${hhmm(elsewhere.start)}`, slots: ahmaDay, slot: elsewhere };
  return { status: MISS, slots: ahmaDay };
}

// 4. Kiosk — no data source yet; the column exists so the row layout is final.
const checkKiosk = () => ({ status: UNKNOWN, note: "ei dataa" });

/* ── evidence ────────────────────────────────────────────────────────────── */

// Every column shows the SOURCE ROWS behind its verdict, in the source's own words — a tick
// you cannot audit is just a claim. Each row is the same three facts in the same order as
// the feed's event card: when, where, and what the source calls it.
const fiDate = (d) => (d ? moment(dayOf(d)).format("dd D.M.") : "");
const slotLine = (r) => ({
  time: `${fiDate(r.start)} klo ${hhmm(r.start)}–${hhmm(r.end)}${r.durationMinutes ? ` (${r.durationMinutes} min)` : ""}`,
  place: "Wareena",
  text: [r.text, r.userGroup].filter(Boolean).join(" · "),
});
const eventLine = (e) => ({
  time: `${fiDate(e.date)} klo ${hhmm(e.uiTime || e.date) || "—"}`,
  place: e.place || "",
  text: [e.title, e.league].filter(Boolean).join(" · "),
});

// The lines a column's verdict rests on. Tulospalvelu's is the game itself.
function evidenceOf(key, g, check) {
  if (key === "tp") {
    const self = { time: `${fiDate(g.date)} ${hhmm(g.date) ? `klo ${hhmm(g.date)}` : "— aika puuttuu"}`, place: g.rink || "", text: [seriesLabel(g.level), `${g.home} – ${g.away}`].filter(Boolean).join(" · ") };
    // A clash is only legible next to the game it collides with, so both are listed.
    const others = (check.clash || []).map((o) => ({ time: `${fiDate(o.date)} klo ${hhmm(o.date)} — päällekkäinen`, place: o.rink || "", text: [seriesLabel(o.level), `${o.home} – ${o.away}`].filter(Boolean).join(" · ") }));
    return [self, ...others];
  }
  if (key === "jopox") return (check.events || []).map(eventLine);
  if (key === "ice") return (check.slots || []).map(slotLine);
  return [];
}

// One fact per line, icon + text — the feed's `Detail` row, same sizes and same muting.
const Detail = ({ icon, children }) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ fontSize: 14, color: "text.secondary" }}>
    <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0, opacity: 0.7, mt: "-1px" }}>{icon}</Box>
    <Box component="span" sx={{ lineHeight: 1.2 }}>{children}</Box>
  </Stack>
);

const EvidenceLines = ({ lines, size = 15 }) => (
  <Stack spacing={1.25}>
    {lines.map((l, i) => (
      <Stack key={i} spacing={0.5}>
        {l.time && <Detail icon={<LuClock size={size} />}>{l.time}</Detail>}
        {l.place && <Detail icon={<LuMapPin size={size} />}>{l.place}</Detail>}
        {l.text && <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.45, pl: `${size + 8}px` }}>{l.text}</Typography>}
      </Stack>
    ))}
  </Stack>
);

/* ── UI bits ─────────────────────────────────────────────────────────────── */

// "TULOSPALVELU ✓" — the source's name with its verdict right behind it. Used identically
// in the tooltip and in the expanded row, so the page has ONE heading style, not two.
const SourceHeading = ({ title, status, note }) => {
  const meta = STATUS_META[status] || STATUS_META[UNKNOWN];
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.25 }}>
      <Typography component="span" sx={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "text.primary" }}>
        {title}
      </Typography>
      <Box component={meta.Icon} sx={{ fontSize: 14, color: meta.color, display: "block" }} />
      {note && <Typography component="span" sx={{ fontSize: 11.5, color: meta.color }}>{note}</Typography>}
    </Stack>
  );
};

// Hovering (or tapping) a dot shows the data behind it — day, time, description — so the
// answer to "why is this a cross?" never requires opening anything.
const StatusDot = ({ status, note, title, lines = [] }) => {
  const meta = STATUS_META[status] || STATUS_META[UNKNOWN];
  const tip = (
    <Box sx={{ py: 0.5, px: 0.25, maxWidth: 260 }}>
      <SourceHeading title={title} status={status} note={note} />
      {lines.length ? <Box sx={{ mt: 0.75 }}><EvidenceLines lines={lines} size={13} /></Box> : null}
    </Box>
  );
  return (
    <Tooltip title={tip} arrow enterTouchDelay={0} leaveTouchDelay={4000}>
      <Box sx={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: "50%", flexShrink: 0, cursor: "help",
            bgcolor: status === OK || status === WARN || status === MISS ? `color-mix(in srgb, ${meta.color} 16%, transparent)` : "transparent",
            border: `1px solid ${status === NA ? "transparent" : `color-mix(in srgb, ${meta.color} 45%, transparent)`}` }}>
        <Box component={meta.Icon} sx={{ fontSize: 14, color: meta.color, display: "block" }} />
      </Box>
    </Tooltip>
  );
};

// One game. The closed row carries only what identifies it — time, teams, series, home/away
// and the ice slot's length. Every per-source remark lives behind its own dot (hover) or in
// the expanded block, so the row stays one line of plain facts instead of a pile of notes
// in four colours.
const GameRow = ({ g, checks }) => {
  const [open, setOpen] = useState(false);
  const time = hhmm(g.date);
  // The ice slot this game sits in — its length is the number the office actually books.
  const slot = checks.ice && checks.ice.slot;

  return (
    // Same card as the feed's event row — outlined, self-contained, one per game.
    <Card variant="outlined" sx={{ overflow: "hidden" }}>
      <Box component="button" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        sx={{ display: "flex", alignItems: "center", gap: 1.25, width: "100%", p: "11px 14px", bgcolor: "transparent",
              border: 0, textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer",
              WebkitTapHighlightColor: "transparent", "&:hover": { bgcolor: "rgba(255,255,255,.03)" } }}>
        <Box sx={{ width: 46, flexShrink: 0 }}>
          <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: time ? "text.primary" : "primary.main" }}>
            {time || "—:—"}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {g.home} – {g.away}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[
              seriesLabel(g.level),
              isHomeGame(g) ? "koti" : g.rink || "vieras",
              slot && slot.durationMinutes ? `jäävuoro ${slot.durationMinutes} min` : null,
            ].filter(Boolean).join(" · ")}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
          {COLUMNS.map((c) => (
            <StatusDot key={c.key} title={c.title} lines={evidenceOf(c.key, g, checks[c.key] || {})}
              {...(checks[c.key] || { status: UNKNOWN })} />
          ))}
        </Stack>
        <LuChevronDown size={18} style={{ flexShrink: 0, opacity: 0.5, transition: "transform .18s ease", transform: open ? "rotate(180deg)" : "none" }} />
      </Box>

      {/* Expanded: every column's source rows, in full. */}
      <Collapse in={open} unmountOnExit>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75, p: "12px 14px 14px", borderTop: "1px solid var(--color-surface-divider)" }}>
          {COLUMNS.map((c) => {
            const check = checks[c.key] || {};
            const lines = evidenceOf(c.key, g, check);
            return (
              <Box key={c.key}>
                <SourceHeading title={c.title} status={check.status} note={check.note} />
                <Box sx={{ mt: 0.75 }}>
                  {lines.length
                    ? <EvidenceLines lines={lines} />
                    : <Typography variant="body2" sx={{ color: "text.disabled" }}>Ei rivejä.</Typography>}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Card>
  );
};

/* ── page ────────────────────────────────────────────────────────────────── */

export default function GameCheck() {
  const goBack = useGoBack("/");
  const [games, setGames] = useState(() => peekSeasonGames());
  const [teamEvents, setTeamEvents] = useState({});
  const [reservations, setReservations] = useState(null);
  const [range, setRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState("upcoming"); // upcoming | all
  // Two of the four columns only mean anything at Wareena, so the away games are 91 rows of
  // "ei koske" between the ones worth reading. Home-only is the view for checking ice.
  const [venue, setVenue] = useState("all"); // all | home
  const [reload, setReload] = useState(0);

  // Rows: Ahma games, oldest first. Past games are opt-in — Jopox's calendar only returns
  // UPCOMING events, so every past row would show a red cross it cannot justify.
  const rows = useMemo(() => {
    const today = moment().format("YYYY-MM-DD");
    return [...games]
      .filter((g) => (scope === "all" ? true : dayOf(g.date) >= today))
      .filter((g) => (venue === "home" ? isHomeGame(g) : true))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [games, scope, venue]);

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

  // Clashes are a property of the SET, not of one game, so they are resolved once per row
  // list rather than inside the per-row check.
  const clashes = useMemo(() => clashMap(rows), [rows]);

  const checksFor = useCallback((g) => ({
    tp: checkTp(g, clashes),
    jopox: checkJopox(g, teamEvents),
    ice: checkIce(g, reservations, range),
    kiosk: checkKiosk(g),
  }), [teamEvents, reservations, range, clashes]);

  // Headline counts — what actually needs fixing, per column.
  const summary = useMemo(() => {
    const s = { jopoxMiss: 0, iceMiss: 0, iceBlock: 0, noTime: 0, clash: 0 };
    for (const g of rows) {
      const c = checksFor(g);
      if (c.tp.clash) s.clash += 1;
      else if (c.tp.status === WARN) s.noTime += 1;
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
    // Same shell as the other report page (/coaching) — page background, header with a
    // working back arrow, refresh in the header slot, 640 px column.
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: 6 }}>
      <MuiHeader
        title="Ottelujen tarkistus"
        subtitle="Tulospalvelu vs. Jopox, Tilamisu ja kioski"
        onBack={goBack}
        right={
          <IconButton onClick={() => setReload((n) => n + 1)} disabled={loading} aria-label="Päivitä" sx={{ color: "text.primary" }}>
            <Box component={LuRefreshCw} sx={{ fontSize: 20, animation: loading ? "spin 0.9s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
          </IconButton>
        }
      />

      <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5, boxSizing: "border-box" }}>
        <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.5, mb: 1.5 }}>
          Tulospalvelu on totuus. Jokaisen ottelun kohdalta tarkistetaan, tietävätkö muut
          järjestelmät siitä.
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <ToggleButtonGroup size="small" exclusive value={scope} onChange={(e, v) => v && setScope(v)}>
            <ToggleButton value="upcoming">Tulevat</ToggleButton>
            <ToggleButton value="all">Koko kausi</ToggleButton>
          </ToggleButtonGroup>
          <ToggleButtonGroup size="small" exclusive value={venue} onChange={(e, v) => v && setVenue(v)}>
            <ToggleButton value="all">Kaikki</ToggleButton>
            <ToggleButton value="home">Kotipelit</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {/* What needs doing, in one line each. */}
        <Stack direction="row" spacing={0.75} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.75 }}>
          <Chip size="small" label={`${rows.length} ottelua`} />
          {summary.jopoxMiss > 0 && <Chip size="small" color="error" variant="outlined" label={`Jopoxista puuttuu ${summary.jopoxMiss}`} />}
          {summary.iceMiss > 0 && <Chip size="small" color="error" variant="outlined" label={`Jää varaamatta ${summary.iceMiss}`} />}
          {summary.iceBlock > 0 && <Chip size="small" color="warning" variant="outlined" label={`Vain otteluvuorossa ${summary.iceBlock}`} />}
          {summary.noTime > 0 && <Chip size="small" color="warning" variant="outlined" label={`Aika puuttuu ${summary.noTime}`} />}
          {summary.clash > 0 && <Chip size="small" color="error" variant="outlined" label={`Päällekkäisiä ${summary.clash}`} />}
        </Stack>

        {/* Column key: the four dots in row order. Plain text, no bar — the dots each carry
            their own tooltip and the expanded row names its source in full. */}
        <Typography variant="caption" sx={{ display: "block", color: "text.disabled", mb: 1.5 }}>
          Merkit vasemmalta oikealle: {COLUMNS.map((c) => c.label).join(" · ")}
        </Typography>

        {loading && !rows.length ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress size={28} /></Box>
        ) : (
          // Day grouping exactly as the feed does it: a sticky plain label, then the day's
          // cards. No container box per day — that was the odd rounding.
          byDay.map(({ day, games: gs }) => (
            <Box key={day} sx={{ mb: 2.25 }}>
              <Box sx={{ position: "sticky", top: 0, zIndex: 2, px: 0.25, pt: 0.75, pb: 1, fontSize: 14, fontWeight: 800,
                    letterSpacing: ".04em", textTransform: "uppercase", color: "primary.main",
                    background: "linear-gradient(180deg, var(--color-bg) 70%, rgba(17,17,17,0))" }}>
                {moment(day).format("dd D.M.YYYY")}
              </Box>
              <Stack spacing={1}>
                {gs.map((g) => <GameRow key={gameKey(g)} g={g} checks={checksFor(g)} />)}
              </Stack>
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
