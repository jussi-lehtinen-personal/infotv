import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuStar, LuCalendarDays, LuTrophy, LuMapPin, LuLogIn, LuChevronDown, LuChevronRight, LuClock, LuPlane } from "react-icons/lu";
import moment from "moment";
import "moment/locale/fi";
import { Box, Typography, Card, Stack, Avatar, IconButton, Button, CircularProgress, Collapse, Link as MuiLink } from "@mui/material";
import { loadFavouriteTeams } from "../Util";
import { getMe, getCachedUser } from "../auth/authClient";
import { buildTeamAgenda, opponentLogo, opponentName } from "../lib/agenda";
import { peekSeasonGames, fetchSeasonGames, subscribe as subscribeSeason } from "../lib/seasonGamesCache";
import { isGameForFavourite } from "../lib/teamMatch";
import { gamePassesSubGroups, displaySub, SUBGROUPS_ENABLED } from "../lib/subGroups";

moment.locale("fi");

// Module-scope cache of each team's events (subsiteId -> { events, ts }), shared
// across mounts so revisiting /feed paints instantly from cache and revalidates
// in the background (stale-while-revalidate) instead of flashing a spinner.
const eventsCache = new Map();
const EVENTS_TTL = 15 * 60_000; // match the server cache

// Per-event free-text description (eventId -> string|null), fetched lazily when
// a card is expanded. null = known to have no description (don't refetch).
const detailCache = new Map();

// Per-card expand state. DEFAULT: only this week's events start expanded (keeps
// the list tidy + limits how many detail fetches fire on load). We remember the
// user's explicit overrides (localStorage) so toggles persist across visits.
const CARDS_KEY = "ahma_feed_cards";
const loadCardState = () => {
  try {
    const o = JSON.parse(localStorage.getItem(CARDS_KEY));
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
};
const saveCardState = (obj) => {
  try {
    const keys = Object.keys(obj);
    const trimmed = keys.length > 300 ? Object.fromEntries(keys.slice(-300).map((k) => [k, obj[k]])) : obj;
    localStorage.setItem(CARDS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
};

// Pull the "17.00 - 19.00" time range out of the subtitle; fall back to start time.
const timeRange = (e) => {
  const m = String(e.subtitle || "").match(/(\d{1,2}[.:]\d{2})\s*-\s*(\d{1,2}[.:]\d{2})/);
  if (m) return `${m[1]} – ${m[2]}`;
  return e.uiTime || null;
};

const sortKey = (e) => String(e.date || "").replace(" ", "T");

// Tag each GAME with which source(s) it came from (QA aid — spot out-of-sync):
//   both = tp + Jopox matched · tp = only tulospalvelu · jopox = only Jopox.
const gameSource = (e) => (e.tp && e.eventId ? "both" : e.tp ? "tp" : "jopox");
function annotateSources(items) {
  for (const it of items) it.source = it.type === "game" ? gameSource(it) : null;
  return items;
}
const SOURCE_LABEL = { both: "OK", tp: "Tulospalvelu", jopox: "Jopox" };
const SOURCE_CHIP = {
  both: { fg: "var(--color-live)", bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.35)" },
  tp: { fg: "var(--color-accent-yellow)", bg: "rgba(var(--color-primary-rgb),0.12)", bd: "rgba(var(--color-primary-rgb),0.35)" },
  jopox: { fg: "var(--color-info)", bg: "rgba(96,165,250,0.12)", bd: "rgba(96,165,250,0.38)" },
};

// The "Minä" feed: a signed-in user's favourite team(s) upcoming events
// (harjoitukset + games), from the PUBLIC Jopox calendar via getTeamEvents,
// interleaved chronologically. See memory: project_gamezone_feed_plan.

const initials = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const dayLabel = (key) => {
  const m = moment(key, "YYYY-MM-DD");
  if (!m.isValid()) return key;
  const s = m.format("dddd D.M.");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const MiniChip = ({ children, sx }) => (
  <Box component="span" sx={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", px: 0.75, py: "1px", borderRadius: 999, whiteSpace: "nowrap", ...sx }}>{children}</Box>
);

const Detail = ({ icon, children }) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ fontSize: 14, color: "text.secondary" }}>
    <Box sx={{ display: "flex", flexShrink: 0, opacity: 0.7 }}>{icon}</Box>
    <span>{children}</span>
  </Stack>
);

const EventRow = ({ e, expanded, onToggle }) => {
  const isGame = e.type === "game";
  const range = timeRange(e);
  const tp = e.tp;
  const oppLogo = opponentLogo(tp);
  const played = tp && Number(tp.finished) > 0;
  const score = played ? `${tp.home_goals ?? ""}–${tp.away_goals ?? ""}` : null;
  const rawHeading = isGame && tp ? opponentName(tp) || e.title : e.title;
  const heading = isGame
    ? String(rawHeading || "").replace(/^\s*[–-]\s*/, "").replace(/\s*[–-]\s*$/, "").trim() || rawHeading
    : rawHeading;
  const detailKey = `${e.subsiteId}|${e.eventId}`;
  const [desc, setDesc] = useState(() => detailCache.get(detailKey));

  // Lazily fetch the event's free-text description, only when expanded (cached).
  useEffect(() => {
    if (!expanded || e.eventId == null) return;
    if (detailCache.has(detailKey)) {
      setDesc(detailCache.get(detailKey));
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ eventId: String(e.eventId), subsiteId: String(e.subsiteId ?? ""), type: e.type });
    fetch(`/api/getEventDetail?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const val = d.description || null;
        detailCache.set(detailKey, val);
        if (!cancelled) setDesc(val);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [expanded, detailKey, e.eventId, e.subsiteId, e.type]);

  return (
    <Card variant="outlined" sx={{ overflow: "hidden", bgcolor: isGame ? "rgba(var(--color-primary-rgb),0.06)" : "background.paper", borderColor: isGame ? "rgba(var(--color-primary-rgb),0.30)" : "divider" }}>
      <Box component="button" type="button" onClick={onToggle} aria-expanded={expanded}
        sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", p: "11px 14px", bgcolor: "transparent", border: 0, textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        {isGame && oppLogo ? (
          <Box component="img" src={oppLogo} alt="" sx={{ width: 38, height: 38, flexShrink: 0, boxSizing: "border-box", borderRadius: 1, bgcolor: "#fff", objectFit: "contain", p: "3px", boxShadow: "0 4px 10px rgba(0,0,0,0.35)" }} />
        ) : (
          <Box sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: 1.25, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: isGame ? "rgba(var(--color-primary-rgb),0.15)" : "var(--color-surface-divider)", color: isGame ? "primary.main" : "text.secondary" }}>
            {isGame ? <LuTrophy size={20} /> : <LuCalendarDays size={20} />}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {e.teamName && (
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75, mb: "1px" }}>
              <Typography component="span" sx={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "primary.main" }}>{e.teamName}</Typography>
              {isGame && e.home != null && <MiniChip sx={{ color: "text.secondary", bgcolor: "var(--color-surface-divider)", border: "1px solid var(--color-surface-border)" }}>{e.home ? "koti" : "vieras"}</MiniChip>}
              {isGame && e.source && <MiniChip sx={{ color: SOURCE_CHIP[e.source].fg, bgcolor: SOURCE_CHIP[e.source].bg, border: `1px solid ${SOURCE_CHIP[e.source].bd}` }}>{SOURCE_LABEL[e.source]}</MiniChip>}
              {SUBGROUPS_ENABLED && isGame && Array.isArray(e.subGroups) && e.subGroups.map((s) => (
                <MiniChip key={s} sx={{ color: "rgba(255,255,255,0.85)", bgcolor: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.28)" }}>{displaySub(s)}</MiniChip>
              ))}
            </Box>
          )}
          <Typography sx={{ fontWeight: 700, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{heading}</Typography>
        </Box>
        <Box sx={{ flexShrink: 0, textAlign: "right", whiteSpace: "nowrap", pl: 0.5 }}>
          {score ? <Typography sx={{ fontWeight: 800, color: "primary.main", fontVariantNumeric: "tabular-nums" }}>{score}</Typography>
            : e.uiTime ? <Typography variant="body2" sx={{ fontWeight: 700, color: "text.secondary" }}>klo {e.uiTime}</Typography> : null}
        </Box>
        <LuChevronDown size={18} style={{ flexShrink: 0, opacity: 0.5, transition: "transform .18s ease", transform: expanded ? "rotate(180deg)" : "none" }} />
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.875, p: "10px 14px 12px", borderTop: "1px solid var(--color-surface-divider)" }}>
          {range && <Detail icon={<LuClock size={15} />}>{range}</Detail>}
          {e.place && <Detail icon={<LuMapPin size={15} />}>{e.place}</Detail>}
          {isGame && e.league && <Detail icon={<LuTrophy size={15} />}>{e.league}</Detail>}
          {isGame && e.home != null && <Detail icon={<LuPlane size={15} />}>{e.home ? "Kotipeli" : "Vieraspeli"}</Detail>}
          {desc && <Typography variant="body2" sx={{ whiteSpace: "pre-line", mt: 0.5, pt: 1, borderTop: "1px solid var(--color-surface-divider)", color: "text.secondary", lineHeight: 1.5 }}>{desc}</Typography>}
          {isGame && tp && (
            <MuiLink component={Link} to={`/gamezone/game/${tp.id}`} state={{ game: tp }} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mt: 1, fontWeight: 700, color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>
              Näytä ottelu <LuChevronRight size={16} />
            </MuiLink>
          )}
        </Box>
      </Collapse>
    </Card>
  );
};

// component={Link} → lock the text colour for every anchor state so hover/visited
// don't paint it the default link blue.
const primaryBtnSx = { mt: 0.75, px: 2.75, py: 1.5, borderRadius: 2, fontWeight: 700, textTransform: "none", bgcolor: "primary.main", "&, &:hover, &:focus, &:visited": { color: "primary.contrastText" }, "&:hover": { bgcolor: "primary.main", filter: "brightness(1.08)" } };

const Gate = ({ icon, title, text, action }) => (
  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 1.5, py: 5.5, px: 2.75, maxWidth: 380, mx: "auto", mt: 3 }}>
    <Box sx={{ width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(var(--color-primary-rgb),0.13)", border: "1px solid rgba(var(--color-primary-rgb),0.35)", color: "primary.main" }}>{icon}</Box>
    <Typography sx={{ fontWeight: 800, textTransform: "uppercase", fontSize: 18 }}>{title}</Typography>
    <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.5 }}>{text}</Typography>
    {action}
  </Box>
);

const Loading = ({ text }) => (
  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1.5, py: 6 }}>
    <CircularProgress color="primary" />
    {text && <Typography variant="body2" sx={{ color: "text.secondary" }}>{text}</Typography>}
  </Box>
);

const Feed = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(getCachedUser);
  const [authLoading, setAuthLoading] = useState(!getCachedUser());
  const [favourites, setFavourites] = useState(loadFavouriteTeams);
  const [events, setEvents] = useState(null); // null = loading, [] = loaded/empty
  const [eventsError, setEventsError] = useState(false);
  const [cardState, setCardState] = useState(loadCardState); // { id: bool } overrides

  const toggleCard = useCallback((id, current) => {
    setCardState((prev) => {
      const next = { ...prev, [id]: !current };
      saveCardState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setFavourites(loadFavouriteTeams());
      })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const reloadFavs = useCallback(() => setFavourites(loadFavouriteTeams()), []);
  useEffect(() => {
    window.addEventListener("focus", reloadFavs);
    return () => window.removeEventListener("focus", reloadFavs);
  }, [reloadFavs]);

  const teams = useMemo(() => favourites.filter((t) => t.subsiteId != null), [favourites]);
  const teamsKey = teams.map((t) => t.subsiteId).join(",");

  const jopoxRef = useRef([]);
  useEffect(() => {
    if (!user || teams.length === 0) {
      setEvents(null);
      return;
    }
    let cancelled = false;
    const now = Date.now();
    const todayStr = moment().format("YYYY-MM-DD");

    const computeMerged = () => {
      const all = [];
      teams.forEach((t, i) => {
        const jopox = jopoxRef.current[i] || [];
        const tp = peekSeasonGames().filter(
          (g) => isGameForFavourite(g, t) && (!SUBGROUPS_ENABLED || gamePassesSubGroups(g, t.subGroups))
        );
        all.push(...buildTeamAgenda(jopox, tp, t.name, t.subsiteId));
      });
      const upcoming = all
        .filter((e) => String(e.date || "").slice(0, 10) >= todayStr)
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      return annotateSources(upcoming);
    };
    const rebuild = () => { if (!cancelled) setEvents(computeMerged()); };

    jopoxRef.current = teams.map((t) => eventsCache.get(String(t.subsiteId))?.events || null);
    if (jopoxRef.current.some(Boolean) || peekSeasonGames().length) rebuild();
    else setEvents(null);
    setEventsError(false);

    fetchSeasonGames().catch(() => {});
    const unsub = subscribeSeason(rebuild);

    let anyError = false;
    Promise.all(
      teams.map((t) => {
        const key = String(t.subsiteId);
        const cached = eventsCache.get(key);
        if (cached && now - cached.ts < EVENTS_TTL) return Promise.resolve(cached.events);
        return fetch(`/api/getTeamEvents?subsiteId=${encodeURIComponent(t.subsiteId)}`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((d) => {
            const evs = d.events || [];
            eventsCache.set(key, { events: evs, ts: Date.now() });
            return evs;
          })
          .catch(() => { anyError = true; return (cached && cached.events) || []; });
      })
    ).then((lists) => {
      if (cancelled) return;
      jopoxRef.current = lists;
      const merged = computeMerged();
      setEvents(merged);
      setEventsError(anyError && merged.length === 0);
    });

    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId, teamsKey]);

  const days = useMemo(() => {
    if (!events) return [];
    const map = new Map();
    for (const e of events) {
      const key = String(e.date || "").slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return Array.from(map.keys()).sort().map((key) => ({ key, label: dayLabel(key), items: map.get(key) }));
  }, [events]);

  const defaultExpanded = useMemo(() => {
    const seenTeam = new Set();
    const ids = new Set();
    for (const e of events || []) {
      const tn = String(e.teamName);
      if (!seenTeam.has(tn)) { seenTeam.add(tn); ids.add(e.key); }
    }
    return ids;
  }, [events]);

  // Incremental render: grow the visible day-groups as the user scrolls near the bottom.
  const DAY_CHUNK = 4;
  const [visibleDays, setVisibleDays] = useState(DAY_CHUNK);
  useEffect(() => { setVisibleDays(DAY_CHUNK); }, [events]);
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleDays((n) => Math.min(n + DAY_CHUNK, days.length)); },
      { rootMargin: "400px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [days.length, visibleDays]);

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      {/* HEADER (title + avatar → profile) */}
      <Box sx={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, pt: "calc(env(safe-area-inset-top) + 14px)", pb: 1.5, bgcolor: "background.default", borderBottom: "1px solid var(--color-surface-divider)" }}>
        <Typography sx={{ fontSize: 20, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "primary.main" }}>Minä</Typography>
        <IconButton onClick={() => navigate("/account")} aria-label="Oma profiili" sx={{ p: 0 }}>
          <Avatar src={user && user.avatar ? user.avatar : undefined} sx={{ width: 40, height: 40, fontSize: 15, fontWeight: 800, bgcolor: "#16181d", color: "#fff", border: "2px solid", borderColor: "primary.main" }}>{user ? initials(user.nickname) : "?"}</Avatar>
        </IconButton>
      </Box>

      <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5, pt: 1.75 }}>
        {authLoading && <Loading text="Ladataan…" />}

        {!authLoading && !user && (
          <Gate
            icon={<LuStar size={30} />}
            title="Oman joukkueen tapahtumat"
            text="Kirjaudu sisään ja valitse suosikkijoukkue, niin näet sen harjoitukset ja pelit tässä."
            action={<Button onClick={() => navigate("/account")} startIcon={<LuLogIn size={18} />} sx={primaryBtnSx}>Kirjaudu</Button>}
          />
        )}

        {!authLoading && user && teams.length === 0 && (
          <Gate
            icon={<LuStar size={30} />}
            title="Valitse suosikkijoukkue"
            text="Merkitse joukkue suosikiksi tähdellä, niin sen tapahtumat ilmestyvät tänne."
            action={<Button component={Link} to="/teams" sx={primaryBtnSx}>Joukkueet</Button>}
          />
        )}

        {!authLoading && user && teams.length > 0 && (
          <>
            {events === null && !eventsError && <Loading text="Ladataan tapahtumia…" />}
            {eventsError && <Box sx={{ textAlign: "center", py: 4, color: "var(--color-loss)" }}>Tapahtumia ei saatu haettua. Yritä myöhemmin uudelleen.</Box>}
            {events && events.length === 0 && !eventsError && (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 1, pt: 5, pb: 3, px: 2.75, maxWidth: 360, mx: "auto" }}>
                <Box sx={{ width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", color: "text.secondary" }}><LuCalendarDays size={26} /></Box>
                <Typography sx={{ fontWeight: 800, textTransform: "uppercase", color: "text.secondary" }}>Ei tulevia tapahtumia</Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.5 }}>Harjoitukset ja pelit ilmestyvät tähän, kun niitä on kalenterissa.</Typography>
              </Box>
            )}
            {days.slice(0, visibleDays).map((d) => (
              <Box key={d.key} sx={{ mb: 2.25 }}>
                <Box sx={{ position: "sticky", top: 66, zIndex: 2, px: 0.25, pt: 0.75, pb: 1, fontSize: 14, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "primary.main", background: "linear-gradient(180deg, var(--color-bg) 70%, rgba(17,17,17,0))" }}>{d.label}</Box>
                <Stack spacing={1}>
                  {d.items.map((e) => {
                    const id = e.key;
                    const expanded = id in cardState ? cardState[id] : defaultExpanded.has(id);
                    return <EventRow key={id} e={e} expanded={expanded} onToggle={() => toggleCard(id, expanded)} />;
                  })}
                </Stack>
              </Box>
            ))}
            {events && visibleDays < days.length && <Box ref={sentinelRef} sx={{ height: 1 }} aria-hidden="true" />}
          </>
        )}
      </Box>
    </Box>
  );
};

export default Feed;
