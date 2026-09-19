import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Box, Card, Typography, Stack, CircularProgress, Tooltip, ClickAwayListener, useMediaQuery, Collapse, IconButton } from "@mui/material";
import { LuCheck, LuX, LuMinus, LuAlertTriangle, LuRefreshCw, LuClock, LuMapPin } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import { MuiHeader } from "../components/ui/MuiHeader";
import { PillButton } from "../components/ui/PillButton";
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

// The ice column is wider because it prints the slot's LENGTH rather than a tick — the
// number is the thing the office books, and the colour still carries the verdict.
const COLUMNS = [
  { key: "tp", label: "TP", title: "Ottelu tulospalvelussa", width: 30 },
  { key: "jopox", label: "Jopox", title: "Ottelu Jopoxissa", width: 30 },
  { key: "ice", label: "Jää", title: "Jäävuoro Tilamisussa", width: 62 },
  { key: "kiosk", label: "Kioski", title: "Kioski avoinna", width: 30 },
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
  if (block) return { status: WARN, note: "ei omaa varausta — peli mahtuu Ahman viikkovuoroon", slots: covering, slot: block };
  // Ice IS booked for a game that day, just not around this game's time — either the
  // booking or tulospalvelu has the wrong hour, and both are worth knowing about.
  const elsewhere = sameDay.find((r) => r.isGame && ahma(r));
  if (elsewhere) return { status: WARN, note: `jää varattu klo ${hhmm(elsewhere.start)}`, slots: ahmaDay, slot: elsewhere };
  return { status: MISS, slots: ahmaDay };
}

// 4. Kiosk — no data source yet; the column exists so the row layout is final.
const checkKiosk = () => ({ status: UNKNOWN, note: "ei dataa" });

/* ── issues ──────────────────────────────────────────────────────────────── */

// The things worth fixing, in the order someone would work through them. `test` reads the
// row's checks, so the pills, their counts and the filtered list are all the same rule.
const ISSUES = [
  { key: "clash", label: "Päällekkäin", test: (c) => !!c.tp.clash },
  { key: "noTime", label: "Aika puuttuu", test: (c) => c.tp.status === WARN && !c.tp.clash },
  { key: "jopoxMiss", label: "Puuttuu Jopoxista", test: (c) => c.jopox.status === MISS },
  { key: "jopoxTime", label: "Jopoxissa eri aika", test: (c) => c.jopox.status === WARN },
  { key: "iceMiss", label: "Jää varaamatta", test: (c) => c.ice.status === MISS },
  { key: "iceBlock", label: "Ei omaa jäävarausta", test: (c) => c.ice.status === WARN },
];

/* ── evidence ────────────────────────────────────────────────────────────── */

// Every column shows the SOURCE ROWS behind its verdict, in the source's own words — a tick
// you cannot audit is just a claim. Each row is the same three facts in the same order as
// the feed's event card: when, where, and what the source calls it.
// "Su 4.10." — moment's Finnish weekday is lower case, which reads as a typo next to the
// capitalised day headings.
const capitalise = (s) => (s ? s.charAt(0).toLocaleUpperCase("fi") + s.slice(1) : s);
const fiDate = (d) => (d ? capitalise(moment(dayOf(d)).format("dd D.M.")) : "");
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
// The ice cell: the booked slot's LENGTH, coloured by the verdict. Same tooltip as a dot,
// so the reason is one hover away — a number the office recognises beats a tick it doesn't.
const IceCell = ({ check, title, lines }) => {
  const meta = STATUS_META[check.status] || STATUS_META[UNKNOWN];
  const mins = check.slot && check.slot.durationMinutes;
  const text = mins ? `${mins} min` : check.status === NA ? "–" : check.status === MISS ? "ei jäätä" : "–";
  return (
    <StatusCell status={check.status} note={check.note} title={title} lines={lines} width={62}>
      <Typography sx={{ fontSize: 12, fontWeight: 800, color: meta.color, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {text}
      </Typography>
    </StatusCell>
  );
};

// Shared shell for both cell kinds: the tooltip and the tinted pill are identical, only the
// content differs.
//
// Pointing device decides HOW the tooltip opens. With a mouse it is hover, as expected. On
// a touch screen there is no hover: the browser synthesises one for any touch, so scrolling
// the list popped tooltips open the whole way down. There the cell is a button — tap opens,
// tap again or anywhere else closes — and the tap never reaches the row underneath, so
// checking a verdict doesn't also expand the row.
const StatusCell = ({ status, note, title, lines = [], width = 30, children }) => {
  const canHover = useMediaQuery("(hover: hover) and (pointer: fine)", { noSsr: true });
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[status] || STATUS_META[UNKNOWN];
  const tinted = status === OK || status === WARN || status === MISS;
  const tip = (
    <Box sx={{ py: 0.5, px: 0.25, maxWidth: 260 }}>
      <SourceHeading title={title} status={status} note={note} />
      {lines.length ? <Box sx={{ mt: 0.75 }}><EvidenceLines lines={lines} size={13} /></Box> : null}
    </Box>
  );
  const cell = (
    <Box
      onClick={canHover ? undefined : (e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
      sx={{ display: "grid", placeItems: "center", width, height: 26, borderRadius: 999, flexShrink: 0,
            cursor: canHover ? "help" : "pointer",
            bgcolor: tinted ? `color-mix(in srgb, ${meta.color} 16%, transparent)` : "transparent",
            border: `1px solid ${status === NA ? "transparent" : `color-mix(in srgb, ${meta.color} 45%, transparent)`}` }}>
      {children}
    </Box>
  );

  if (canHover) {
    return <Tooltip title={tip} arrow disableTouchListener>{cell}</Tooltip>;
  }
  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Tooltip title={tip} arrow open={open} disableHoverListener disableFocusListener disableTouchListener>
        {cell}
      </Tooltip>
    </ClickAwayListener>
  );
};

const StatusDot = ({ status, note, title, lines = [] }) => {
  const meta = STATUS_META[status] || STATUS_META[UNKNOWN];
  return (
    <StatusCell status={status} note={note} title={title} lines={lines}>
      <Box component={meta.Icon} sx={{ fontSize: 14, color: meta.color, display: "block" }} />
    </StatusCell>
  );
};

// The row grid, shared by the header and every game row so the columns actually line up.
// "Kiekko-Ahma" is shortened to "Ahma" here only — it is on both sides of half the fixtures
// and eats the width the opponent needs.
const ROW_GRID = { display: "grid", gridTemplateColumns: "58px minmax(0, 1fr) auto", alignItems: "center", gap: "12px" };
const shortTeam = (s) => String(s || "").replace(/kiekko-?ahma/i, "Ahma").trim();

// One game. The closed row is the table: time, series, teams, four verdicts. Everything a
// source has to SAY about the game lives behind its dot (hover) or in the expanded block,
// so the row itself never turns into a pile of notes in four colours.
const GameRow = ({ g, checks }) => {
  const [open, setOpen] = useState(false);
  const time = hhmm(g.date);

  return (
    <Box sx={{ borderTop: "1px solid var(--color-surface-divider)", "&:first-of-type": { borderTop: 0 } }}>
      <Box component="button" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        sx={{ ...ROW_GRID, width: "100%", p: "10px 12px", bgcolor: open ? "rgba(255,255,255,.03)" : "transparent",
              border: 0, textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer",
              WebkitTapHighlightColor: "transparent", "&:hover": { bgcolor: "rgba(255,255,255,.05)" } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.25, color: time ? "text.primary" : "primary.main" }}>
            {time || "—:—"}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {seriesLabel(g.level)}
          </Typography>
        </Box>
        {/* Home over away, as the fixture list shows them — two club names on one line get
            truncated to uselessness on a phone. */}
        <Box sx={{ minWidth: 0 }}>
          {[g.home, g.away].map((t, i) => (
            <Typography key={i}
              sx={{ fontWeight: 700, lineHeight: 1.25, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shortTeam(t)}
            </Typography>
          ))}
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
          {COLUMNS.map((c) => {
            const check = checks[c.key] || { status: UNKNOWN };
            const lines = evidenceOf(c.key, g, check);
            return c.key === "ice"
              ? <IceCell key={c.key} check={check} title={c.title} lines={lines} />
              : <StatusDot key={c.key} title={c.title} lines={lines} {...check} />;
          })}
        </Stack>
      </Box>

      {/* Expanded: one line per source, all four times in the SAME column — the whole point
          of the page is comparing them, and that only works if they are under each other. */}
      <Collapse in={open} unmountOnExit>
        <Box sx={{ p: "4px 12px 14px" }}>
          {COLUMNS.map((c) => {
            const check = checks[c.key] || {};
            const lines = evidenceOf(c.key, g, check);
            const meta = STATUS_META[check.status] || STATUS_META[UNKNOWN];
            return (
              <Box key={c.key} sx={{ display: "grid", gridTemplateColumns: "18px 56px minmax(0, 1fr)", gap: "10px",
                    alignItems: "start", py: 0.85, borderTop: "1px solid var(--color-surface-divider)" }}>
                <Box component={meta.Icon} sx={{ fontSize: 15, color: meta.color, display: "block", mt: "1px" }} />
                <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "text.secondary", mt: "3px" }}>
                  {c.label}
                </Typography>
                <Box sx={{ minWidth: 0 }}>
                  {lines.length ? lines.map((l, i) => (
                    <Box key={i} sx={{ mb: i < lines.length - 1 ? 0.75 : 0 }}>
                      <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "text.primary" }}>{l.time}</Typography>
                      {l.place && <Detail icon={<LuMapPin size={14} />}>{l.place}</Detail>}
                      {l.text && <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.4 }}>{l.text}</Typography>}
                    </Box>
                  )) : (
                    <Typography variant="body2" sx={{ color: "text.disabled" }}>{check.note || "Ei rivejä."}</Typography>
                  )}
                  {lines.length > 0 && check.note && (
                    <Typography variant="body2" sx={{ color: meta.color, mt: 0.25 }}>{check.note}</Typography>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
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
  const [venue, setVenue] = useState("home"); // home | all — the ice and kiosk columns only
                                              // mean anything at Wareena, so that is the default view
  // Issue filters are additive: picking two shows the games that have EITHER, which is how
  // you build a work list ("everything missing ice or missing from Jopox").
  const [issueFilter, setIssueFilter] = useState(() => new Set());
  const [reload, setReload] = useState(0);

  // Rows: Ahma games, oldest first. Past games are opt-in — Jopox's calendar only returns
  // UPCOMING events, so every past row would show a red cross it cannot justify.
  const baseRows = useMemo(() => {
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
  const clashes = useMemo(() => clashMap(baseRows), [baseRows]);

  const checksFor = useCallback((g) => ({
    tp: checkTp(g, clashes),
    jopox: checkJopox(g, teamEvents),
    ice: checkIce(g, reservations, range),
    kiosk: checkKiosk(g),
  }), [teamEvents, reservations, range, clashes]);

  // Which issues each game has — computed once, then reused for the counts and the filter.
  const issuesByGame = useMemo(() => {
    const m = new Map();
    for (const g of baseRows) {
      const c = checksFor(g);
      m.set(gameKey(g), ISSUES.filter((i) => i.test(c)).map((i) => i.key));
    }
    return m;
  }, [baseRows, checksFor]);

  const counts = useMemo(() => {
    const out = {};
    for (const list of issuesByGame.values()) for (const k of list) out[k] = (out[k] || 0) + 1;
    return out;
  }, [issuesByGame]);

  const rows = useMemo(() => {
    if (!issueFilter.size) return baseRows;
    return baseRows.filter((g) => (issuesByGame.get(gameKey(g)) || []).some((k) => issueFilter.has(k)));
  }, [baseRows, issuesByGame, issueFilter]);

  const toggleIssue = useCallback((key) => {
    setIssueFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

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
          Ottelut verrataan tulospalveluun, joka on ottelutietojen virallinen lähde.
          Jokaisesta ottelusta tarkistetaan, onko se kirjattu joukkueen Jopox-kalenteriin,
          onko sille varattu jää Tilamisusta ja onko kioski auki.
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          {[{ k: "upcoming", l: "Tulevat" }, { k: "all", l: "Koko kausi" }].map((o) => (
            <PillButton key={o.k} active={scope === o.k} onClick={() => setScope(o.k)} sx={{ flex: 1, py: 0.9 }}>{o.l}</PillButton>
          ))}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          {[{ k: "home", l: "Kotipelit" }, { k: "all", l: "Kaikki" }].map((o) => (
            <PillButton key={o.k} active={venue === o.k} onClick={() => setVenue(o.k)} sx={{ flex: 1, py: 0.9 }}>{o.l}</PillButton>
          ))}
        </Stack>

        {/* Issue filters. Each pill is one thing that needs fixing, with how many games have
            it; several can be on at once, and the list then shows the union. Picking none
            shows everything — that is what "Kaikki" means here. */}
        <Stack direction="row" spacing={0.75} sx={{ mb: 1.5, flexWrap: "wrap", rowGap: 0.75 }}>
          <PillButton active={issueFilter.size === 0} onClick={() => setIssueFilter(new Set())}>
            Kaikki
          </PillButton>
          {ISSUES.filter((i) => counts[i.key]).map((i) => (
            <PillButton key={i.key} active={issueFilter.has(i.key)} onClick={() => toggleIssue(i.key)}>
              <Box component={LuAlertTriangle} sx={{ fontSize: 13, mr: 0.6, display: "block" }} />
              {i.label} {counts[i.key]}
            </PillButton>
          ))}
        </Stack>

        {/* Row count, right above the list it describes. */}
        <Typography variant="caption" sx={{ display: "block", textAlign: "right", color: "text.disabled", mb: 0.75 }}>
          Yhteensä {rows.length} ottelua
        </Typography>

        {loading && !rows.length ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress size={28} /></Box>
        ) : (
          <Card variant="outlined" sx={{ overflow: "hidden" }}>
            {/* Header: names the columns once, so every dot below is readable without a
                legend and the two halves of the table (the game / the systems) are labelled. */}
            <Box sx={{ ...ROW_GRID, p: "8px 12px", borderBottom: "1px solid var(--color-surface-divider)" }}>
              {["Aika", "Ottelu"].map((h) => (
                <Typography key={h} sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "text.disabled" }}>
                  {h}
                </Typography>
              ))}
              <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
                {COLUMNS.map((c) => (
                  <Typography key={c.key} title={c.title}
                    sx={{ width: c.width, textAlign: "center", fontSize: 9, fontWeight: 800, letterSpacing: ".04em",
                          textTransform: "uppercase", color: "text.disabled" }}>
                    {c.label}
                  </Typography>
                ))}
              </Stack>
            </Box>

            {byDay.map(({ day, games: gs }) => (
              <Box key={day}>
                <Typography sx={{ px: 1.5, py: 0.75, fontSize: 12.5, fontWeight: 800, letterSpacing: ".04em",
                      textTransform: "uppercase", color: "primary.main", bgcolor: "rgba(var(--color-primary-rgb),0.08)",
                      borderTop: "1px solid var(--color-surface-divider)" }}>
                  {moment(day).format("dd D.M.YYYY")}
                </Typography>
                {gs.map((g) => <GameRow key={gameKey(g)} g={g} checks={checksFor(g)} />)}
              </Box>
            ))}
          </Card>
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
