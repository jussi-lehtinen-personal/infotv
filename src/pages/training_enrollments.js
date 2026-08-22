import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Box, Typography, Card, Stack, IconButton, CircularProgress, Collapse, Button,
} from "@mui/material";
import { LuRefreshCw, LuChevronRight, LuUser, LuShield, LuUserCog, LuBriefcase, LuHelpCircle, LuShirt, LuSnowflake, LuTarget } from "react-icons/lu";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
import { getTrainingEnrollments } from "../auth/authClient";

// Coaching-manager report (/coaching): upcoming Taitojää events with who has
// signed up, per team, players vs coaches/staff. Unlisted, gated by the API to
// admin OR the `valmennuspaallikko` role. See api/functions/getTrainingEnrollments.
// Purpose: see at a glance how many PLAYERS are coming so ice can be planned.
//
// Serving is stale-while-revalidate: the server returns the durable cache
// instantly (with `stale`); when stale, the client fires a background refresh
// and shows a "Päivitetään…" indicator, then swaps in the fresh data.

// Role chip styling. Filled solid (white text) for everyone EXCEPT the goalie,
// who is black with an orange border only (stands out from field players).
const ROLE_META = {
  player: { icon: LuUser, bg: "var(--color-primary)", fg: "#fff", iconFg: "#fff" },
  goalie: { icon: LuShield, bg: "transparent", fg: "#fff", iconFg: "var(--color-primary)", border: "1.5px solid var(--color-primary)" },
  coach: { icon: LuUserCog, bg: "#0d9488", fg: "#fff", iconFg: "#fff" },
  staff: { icon: LuBriefcase, bg: "#2563eb", fg: "#fff", iconFg: "#fff" },
  unknown: { icon: LuHelpCircle, bg: "#4b5563", fg: "#fff", iconFg: "#fff" },
};
// Count string: "12" if only field players, "12 + 1" when goalies are included.
const countValue = (fieldN, goalieN) => (goalieN ? `${fieldN} + ${goalieN}` : String(fieldN));

// Per-event-type icon. PLACEHOLDER Lucide glyphs — swap for the club's own icons
// (skate / goalie mask / crossed sticks) when provided.
function eventIcon(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("maalivahti")) return LuShield;   // goalie mask
  if (n.includes("kilpuri")) return LuTarget;       // sticks / competitive
  return LuSnowflake;                               // Taitojää (skate)
}
// Club-provided illustration per type (public/coaching/*.webp). Add maalivahti/kilpuri
// filenames here as the assets land; until then those fall back to the placeholder glyph.
const EVENT_IMG = (name) => {
  const n = String(name || "").toLowerCase();
  if (n.includes("taito")) return "/coaching/taitojaa.webp";
  if (n.includes("maalivahti")) return "/coaching/maalivahti.webp";
  if (n.includes("kilpuri")) return "/coaching/kilpuri.webp";
  return null;
};
const EventGlyph = ({ name, size = 48 }) => {
  const img = EVENT_IMG(name);
  if (img) {
    return (
      <Box component="img" src={img} alt="" loading="lazy"
        sx={{ width: size, height: size, borderRadius: "14px", flexShrink: 0, objectFit: "cover",
              border: "1.5px solid var(--color-surface-border)" }} />
    );
  }
  const Icon = eventIcon(name);
  return (
    <Box sx={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
          border: "1.5px solid var(--color-surface-border)", bgcolor: "rgba(255,255,255,0.02)", color: "text.primary" }}>
      <Box component={Icon} sx={{ fontSize: size * 0.5 }} />
    </Box>
  );
};

// A jersey badge with the team's age number ("U10 (2017)" → 10). No number (Edustus/
// Naiset) → just the jersey.
const ageNum = (team) => (String(team || "").match(/\d{1,2}/) || [""])[0];
const JerseyBadge = ({ team }) => {
  const num = ageNum(team);
  return (
    <Box sx={{ position: "relative", width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", color: "var(--color-primary)" }}>
      <Box component={LuShirt} sx={{ fontSize: 30 }} />
      {num && (
        <Typography sx={{ position: "absolute", top: "54%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 10.5, fontWeight: 800, lineHeight: 1, color: "var(--color-primary)" }}>
          {num}
        </Typography>
      )}
    </Box>
  );
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
// "18.08.2026" + weekday "ti" -> "Ti 18.8"
function shortDate(ev) {
  const m = String(ev.date || "").match(/(\d{1,2})\.(\d{1,2})\./);
  const dm = m ? `${+m[1]}.${+m[2]}` : ev.date;
  return [cap(ev.weekday), dm].filter(Boolean).join(" ");
}
// "U13 (2014)" -> { base: "U13", year: "(2014)" } so the year can be dimmed.
function splitTeam(label) {
  const m = String(label || "").match(/^(.*?)\s*(\([^)]*\))\s*$/);
  return m ? { base: m[1], year: m[2] } : { base: label || "", year: "" };
}
// The non-player line (never players): "IN: 2 valmentaja · 1 huoltaja".
function backgroundText(t) {
  const parts = [];
  if (t.coachesIn) parts.push(`${t.coachesIn} valmentaja`);
  if (t.staffIn) parts.push(`${t.staffIn} huoltaja`);
  if (t.unknownIn) parts.push(`${t.unknownIn} ei rosterissa`);
  return parts.length ? `IN: ${parts.join(" · ")}` : "Vain pelaajia";
}

// A stacked, centred count block (number over a label) so the number optically
// centres with its label — and, in a flex row, with the chevron beside it.
const CountBlock = ({ value, size, label }) => (
  <Box sx={{ textAlign: "center", flexShrink: 0 }}>
    <Typography sx={{ fontWeight: 800, fontSize: size, lineHeight: 1, color: "primary.main", fontFamily: "var(--font-family-display)" }}>{value}</Typography>
    {label && <Typography variant="caption" sx={{ color: "text.disabled", letterSpacing: "0.04em", display: "block" }}>{label}</Typography>}
  </Box>
);

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 6, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

// One team's expandable row: player ratio + a reveal of the names.
function TeamRow({ t }) {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ "&:not(:first-of-type)": { borderTop: "1px solid var(--color-surface-divider)" } }}>
      <Box
        role="button"
        onClick={() => setOpen((v) => !v)}
        sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.5, py: 1.1, cursor: "pointer",
              boxSizing: "border-box", "&:hover": { bgcolor: "rgba(255,255,255,0.03)" } }}
      >
        <JerseyBadge team={t.team} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>
              {splitTeam(t.team).base}
              {splitTeam(t.team).year && (
                <Box component="span" sx={{ ml: 0.5, fontWeight: 600, color: "text.disabled" }}>{splitTeam(t.team).year}</Box>
              )}
            </Typography>
            {t.defaultIn && (
              <Box component="span" sx={{ flexShrink: 0, fontSize: 10, fontWeight: 700, lineHeight: 1, px: 0.75, py: "3px",
                    borderRadius: 999, bgcolor: "rgba(251,191,36,0.16)", color: "#fcd34d", whiteSpace: "nowrap" }}>
                Oletus IN
              </Box>
            )}
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25 }}>
            {backgroundText(t)}
          </Typography>
        </Box>
        <CountBlock value={countValue(t.playersIn, t.goaliesIn)} size={20} />
        <Box component={LuChevronRight} sx={{ flexShrink: 0, color: "text.disabled", fontSize: 18, transition: "transform .18s", transform: open ? "rotate(90deg)" : "none" }} />
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.75, pb: 1.5, pt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.75, boxSizing: "border-box" }}>
          {t.people.map((p, i) => {
            const m = ROLE_META[p.role] || ROLE_META.unknown;
            return (
              <Box key={i} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1, py: 0.4, borderRadius: 999,
                    bgcolor: m.bg, border: m.border || "1.5px solid transparent", boxSizing: "border-box", maxWidth: "100%" }}>
                <Box component={m.icon} sx={{ fontSize: 13, flexShrink: 0, color: m.iconFg }} />
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: m.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}

// One event: collapsible. The header (date + player count) toggles the team list.
function EventCard({ ev, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Card variant="outlined" sx={{ bgcolor: "background.paper", overflow: "hidden", boxSizing: "border-box",
          borderColor: open ? "var(--color-primary)" : "divider", borderWidth: open ? 2 : 1, borderStyle: "solid",
          transition: "border-color .15s ease" }}>
      <Box
        role="button"
        onClick={() => setOpen((v) => !v)}
        sx={{ display: "flex", alignItems: "center", gap: 1.25, p: 1.75, cursor: "pointer", boxSizing: "border-box",
              bgcolor: open ? "rgba(var(--color-primary-rgb),0.07)" : "transparent",
              "&:hover": { bgcolor: open ? "rgba(var(--color-primary-rgb),0.11)" : "rgba(255,255,255,0.03)" } }}
      >
        <EventGlyph name={ev.name} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 18, color: "text.primary", fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", lineHeight: 1.1 }}>
            {ev.name}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>
            {shortDate(ev)} · klo {ev.time}
          </Typography>
        </Box>
        <CountBlock value={countValue(ev.playersIn, ev.goaliesIn)} size={30} label="PELAAJAA" />
        <Box component={LuChevronRight} sx={{ flexShrink: 0, color: open ? "var(--color-primary)" : "text.disabled", fontSize: 20, transition: "transform .18s", transform: open ? "rotate(-90deg)" : "none" }} />
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ p: 1.25, pt: 0.25 }}>
          {ev.error && (
            <Typography variant="caption" sx={{ color: "var(--color-loss)", display: "block", px: 0.5, py: 1 }}>Osallistujien haku epäonnistui.</Typography>
          )}
          {ev.teams.length > 0 && (
            <Box sx={{ borderRadius: "var(--radius-item)", bgcolor: "rgba(255,255,255,0.03)", border: "1px solid var(--color-surface-divider)", overflow: "hidden" }}>
              {ev.teams.map((t, i) => <TeamRow key={t.subsiteId || t.team || i} t={t} />)}
            </Box>
          )}
          {ev.teams.length === 0 && !ev.error && (
            <Typography variant="body2" sx={{ color: "text.secondary", px: 0.5, py: 1.25 }}>Ei ilmoittautumisia vielä.</Typography>
          )}
        </Box>
      </Collapse>
    </Card>
  );
}

export default function TrainingEnrollments() {
  const goBack = useGoBack("/");
  const [state, setState] = useState({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  // Force a blocking recompute on the server; swap in the fresh data.
  const refreshNow = useCallback(() => {
    setRefreshing(true);
    getTrainingEnrollments({ refresh: true, limit: 12 })
      .then((r) => { if (r.status === "ok") setState(r); })
      .catch(() => { /* keep showing the stale data */ })
      .finally(() => setRefreshing(false));
  }, []);

  // Initial load: render the durable cache instantly, then background-revalidate
  // if the server flagged it stale.
  useEffect(() => {
    let cancelled = false;
    getTrainingEnrollments({ limit: 12 })
      .then((r) => {
        if (cancelled) return;
        setState(r);
        if (r.status === "ok" && r.data.stale) refreshNow();
      })
      .catch((e) => { if (!cancelled) setState({ status: "error", error: e.message }); });
    return () => { cancelled = true; };
  }, [refreshNow]);

  const { status } = state;
  const data = status === "ok" ? state.data : null;

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: 6 }}>
      <MuiHeader
        title="Jääilmoittautumiset"
        subtitle="Taito-, kilpuri- ja maalivahtijäät · tulossa olevat"
        onBack={goBack}
        right={
          <IconButton onClick={refreshNow} disabled={refreshing || status === "loading"} aria-label="Päivitä" sx={{ color: "text.primary" }}>
            <Box component={LuRefreshCw} sx={{ fontSize: 20, animation: refreshing ? "spin 0.9s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
          </IconButton>
        }
      />

      <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5, boxSizing: "border-box" }}>
        {status === "loading" && <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress color="primary" /></Box>}
        {status === "unauthorized" && (
          <Status>Kirjaudu ensin sisään (<Box component={Link} to="/account" sx={{ color: "primary.main" }}>Tili</Box>).</Status>
        )}
        {status === "forbidden" && <Status>Tällä tilillä ei ole käyttöoikeutta tähän raporttiin.</Status>}
        {status === "error" && (
          <Status error>
            Lataus epäonnistui. {state.error}
            <Box sx={{ mt: 2 }}><Button onClick={refreshNow} variant="outlined" color="primary">Yritä uudelleen</Button></Box>
          </Status>
        )}

        {status === "ok" && (
          <>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, minHeight: 22 }}>
              <Typography variant="caption" sx={{ color: "text.disabled", flex: 1, minWidth: 0 }}>
                {data.events.length} tulevaa tapahtumaa
              </Typography>
              {refreshing && (
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                  <CircularProgress size={13} thickness={5} color="primary" />
                  <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 700 }}>Päivitetään…</Typography>
                </Stack>
              )}
            </Stack>
            <Stack spacing={1.5}>
              {data.events.map((ev, i) => <EventCard key={ev.id} ev={ev} defaultOpen={i === 0} />)}
              {data.events.length === 0 && <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>Ei tulevia jäätapahtumia.</Box>}
            </Stack>
            <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 2, lineHeight: 1.5 }}>
              Osa joukkueista on oletuksena IN — niiden luvut tarkentuvat lähempänä tapahtumaa. Pelaaja/valmentaja/huoltaja tunnistetaan seuran rosterista.
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
