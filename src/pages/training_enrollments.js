import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Box, Typography, Card, Stack, Chip, IconButton, CircularProgress, Collapse, Button,
} from "@mui/material";
import { LuRefreshCw, LuChevronRight, LuUser, LuUserCog, LuBriefcase, LuHelpCircle } from "react-icons/lu";
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

// Solid role colours (filled chip, white text). Player = Ahma orange.
const ROLE_META = {
  player: { icon: LuUser, bg: "var(--color-primary)" },
  coach: { icon: LuUserCog, bg: "#0d9488" },
  staff: { icon: LuBriefcase, bg: "#2563eb" },
  unknown: { icon: LuHelpCircle, bg: "#4b5563" },
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
// "18.08.2026" + weekday "ti" -> "Ti 18.8"
function shortDate(ev) {
  const m = String(ev.date || "").match(/(\d{1,2})\.(\d{1,2})\./);
  const dm = m ? `${+m[1]}.${+m[2]}` : ev.date;
  return [cap(ev.weekday), dm].filter(Boolean).join(" ");
}
function clockFi(iso) {
  try { return new Date(iso).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" }); }
  catch { return ""; }
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
const CountBlock = ({ value, size }) => (
  <Box sx={{ textAlign: "center", flexShrink: 0 }}>
    <Typography sx={{ fontWeight: 800, fontSize: size, lineHeight: 1, color: "primary.main", fontFamily: "var(--font-family-display)" }}>{value}</Typography>
    <Typography variant="caption" sx={{ color: "text.disabled", letterSpacing: "0.04em", display: "block" }}>PELAAJAA</Typography>
  </Box>
);

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 6, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

// One team's expandable row: player ratio + a reveal of the names.
function TeamRow({ t }) {
  const [open, setOpen] = useState(false);
  return (
    <Box sx={{ borderTop: "1px solid var(--color-surface-divider)" }}>
      <Box
        role="button"
        onClick={() => setOpen((v) => !v)}
        sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.75, py: 1.25, cursor: "pointer",
              boxSizing: "border-box", "&:hover": { bgcolor: "rgba(255,255,255,0.03)" } }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>
              {t.team}
            </Typography>
            {t.defaultIn && (
              <Chip label="Oletus IN" size="small"
                sx={{ flexShrink: 0, height: 18, "& .MuiChip-label": { px: 0.75, py: 0, fontSize: 10, fontWeight: 700, lineHeight: 1 }, bgcolor: "rgba(251,191,36,0.16)", color: "#fcd34d" }} />
            )}
          </Box>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25 }}>
            {backgroundText(t)}
          </Typography>
        </Box>
        <CountBlock value={t.playersIn} size={20} />
        <Box component={LuChevronRight} sx={{ flexShrink: 0, color: "text.disabled", fontSize: 18, transition: "transform .18s", transform: open ? "rotate(90deg)" : "none" }} />
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.75, pb: 1.5, pt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.75, boxSizing: "border-box" }}>
          {t.people.map((p, i) => {
            const m = ROLE_META[p.role] || ROLE_META.unknown;
            return (
              <Box key={i} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1, py: 0.4, borderRadius: 999,
                    bgcolor: m.bg, maxWidth: "100%" }}>
                <Box component={m.icon} sx={{ fontSize: 13, flexShrink: 0, color: "#fff" }} />
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
    <Card variant="outlined" sx={{ bgcolor: "background.paper", borderColor: "divider", overflow: "hidden", boxSizing: "border-box" }}>
      <Box
        role="button"
        onClick={() => setOpen((v) => !v)}
        sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.75, cursor: "pointer",
              boxSizing: "border-box", "&:hover": { bgcolor: "rgba(255,255,255,0.03)" } }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16, color: "text.primary" }}>
            {ev.name}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {shortDate(ev)} - {ev.time}
          </Typography>
        </Box>
        <CountBlock value={ev.playersIn} size={30} />
        <Box component={LuChevronRight} sx={{ flexShrink: 0, color: "text.disabled", fontSize: 20, transition: "transform .18s", transform: open ? "rotate(90deg)" : "none" }} />
      </Box>
      <Collapse in={open} unmountOnExit>
        {ev.error && (
          <Box sx={{ px: 1.75, pb: 1.5, borderTop: "1px solid var(--color-surface-divider)", pt: 1 }}>
            <Typography variant="caption" sx={{ color: "var(--color-loss)" }}>Osallistujien haku epäonnistui.</Typography>
          </Box>
        )}
        {ev.teams.map((t, i) => <TeamRow key={t.subsiteId || t.team || i} t={t} />)}
        {ev.teams.length === 0 && !ev.error && (
          <Box sx={{ px: 1.75, pb: 1.75, pt: 1, borderTop: "1px solid var(--color-surface-divider)" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>Ei ilmoittautumisia vielä.</Typography>
          </Box>
        )}
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
    getTrainingEnrollments({ refresh: true })
      .then((r) => { if (r.status === "ok") setState(r); })
      .catch(() => { /* keep showing the stale data */ })
      .finally(() => setRefreshing(false));
  }, []);

  // Initial load: render the durable cache instantly, then background-revalidate
  // if the server flagged it stale.
  useEffect(() => {
    let cancelled = false;
    getTrainingEnrollments({})
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
        subtitle="Taitojää · tulossa olevat"
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
              {refreshing ? (
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                  <CircularProgress size={13} thickness={5} color="primary" />
                  <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 700 }}>Päivitetään…</Typography>
                </Stack>
              ) : data.generatedAt ? (
                <Typography variant="caption" sx={{ color: "text.disabled", flexShrink: 0 }}>Päivitetty {clockFi(data.generatedAt)}</Typography>
              ) : null}
            </Stack>
            <Stack spacing={1.5}>
              {data.events.map((ev, i) => <EventCard key={ev.id} ev={ev} defaultOpen={i === 0} />)}
              {data.events.length === 0 && <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>Ei tulevia Taitojää-tapahtumia.</Box>}
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
