import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Box, Typography, Card, Stack, Chip, IconButton, CircularProgress, Collapse, Button,
} from "@mui/material";
import { LuRefreshCw, LuChevronDown, LuUser, LuBriefcase, LuHelpCircle } from "react-icons/lu";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
import { getTrainingEnrollments } from "../auth/authClient";

// Coaching-manager report (/coaching): upcoming Taitojää events with who has
// signed up, per team, players vs officials. Unlisted, gated by the API to
// admin OR the `valmennuspaallikko` role. See api/functions/getTrainingEnrollments.
// Purpose: see at a glance how many players are coming so ice can be planned.

const ROLE_META = {
  player: { label: "Pelaaja", icon: LuUser, fg: "var(--color-primary)", bg: "rgba(var(--color-primary-rgb),0.16)" },
  official: { label: "Huoltaja/valm.", icon: LuBriefcase, fg: "#5eead4", bg: "rgba(45,212,191,0.16)" },
  unknown: { label: "Ei rosterissa", icon: LuHelpCircle, fg: "var(--color-accent)", bg: "var(--color-surface-divider)" },
};

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 6, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

// One team's expandable row: headline count + a reveal of the names.
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
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.team}
            </Typography>
            {t.defaultIn && (
              <Chip label="oletus IN" size="small"
                sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: "rgba(251,191,36,0.16)", color: "#fcd34d" }} />
            )}
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            IN yht. {t.totalIn} / {t.totalMembers} jäsentä
            {t.officialsIn ? ` · ${t.officialsIn} huoltaja/valm.` : ""}
            {t.unknownIn ? ` · ${t.unknownIn} ei rosterissa` : ""}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 22, lineHeight: 1, color: "primary.main", fontFamily: "var(--font-family-display)" }}>
            {t.playersIn}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.disabled", letterSpacing: "0.04em" }}>PELAAJAA</Typography>
        </Box>
        <Box component={LuChevronDown} sx={{ flexShrink: 0, color: "text.disabled", fontSize: 18, transition: "transform .18s", transform: open ? "rotate(180deg)" : "none" }} />
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.75, pb: 1.5, pt: 0.5, display: "flex", flexWrap: "wrap", gap: 0.75, boxSizing: "border-box" }}>
          {t.people.map((p, i) => {
            const m = ROLE_META[p.role] || ROLE_META.unknown;
            return (
              <Box key={i} sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1, py: 0.4, borderRadius: 999,
                    bgcolor: m.bg, color: m.fg, maxWidth: "100%" }}>
                <Box component={m.icon} sx={{ fontSize: 13, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

function EventCard({ ev }) {
  const title = [ev.weekday, ev.date].filter(Boolean).join(" ");
  return (
    <Card variant="outlined" sx={{ bgcolor: "background.paper", borderColor: "divider", overflow: "hidden", boxSizing: "border-box" }}>
      <Box sx={{ p: 1.75, boxSizing: "border-box" }}>
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 16, color: "text.primary" }}>
              {title} · klo {ev.time}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>{ev.name}</Typography>
          </Box>
          <Box sx={{ textAlign: "right", flexShrink: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 30, lineHeight: 1, color: "primary.main", fontFamily: "var(--font-family-display)" }}>
              {ev.playersIn}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.disabled", letterSpacing: "0.04em" }}>PELAAJAA TULOSSA</Typography>
          </Box>
        </Stack>
        <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.5 }}>
          IN yhteensä {ev.totalIn}
          {ev.officialsIn ? ` · ${ev.officialsIn} huoltaja/valm.` : ""}
          {ev.unknownIn ? ` · ${ev.unknownIn} ei rosterissa` : ""}
        </Typography>
        {ev.error && (
          <Typography variant="caption" sx={{ color: "var(--color-loss)", display: "block", mt: 0.5 }}>
            Osallistujien haku epäonnistui.
          </Typography>
        )}
      </Box>
      {ev.teams.map((t, i) => <TeamRow key={t.subsiteId || t.team || i} t={t} />)}
      {ev.teams.length === 0 && !ev.error && (
        <Box sx={{ px: 1.75, pb: 1.75, pt: 0.5, borderTop: "1px solid var(--color-surface-divider)" }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>Ei ilmoittautumisia vielä.</Typography>
        </Box>
      )}
    </Card>
  );
}

export default function TrainingEnrollments() {
  const goBack = useGoBack("/");
  const [state, setState] = useState({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((refresh) => {
    if (refresh) setRefreshing(true);
    getTrainingEnrollments({ refresh })
      .then((r) => setState(r))
      .catch((e) => setState({ status: "error", error: e.message }))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => { load(false); }, [load]);

  const { status } = state;
  const data = status === "ok" ? state.data : null;

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: 6 }}>
      <MuiHeader
        title="Jääilmoittautumiset"
        subtitle="Taitojää · tulossa olevat"
        onBack={goBack}
        right={
          <IconButton onClick={() => load(true)} disabled={refreshing || status === "loading"} aria-label="Päivitä" sx={{ color: "text.primary" }}>
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
            <Box sx={{ mt: 2 }}><Button onClick={() => load(true)} variant="outlined" color="primary">Yritä uudelleen</Button></Box>
          </Status>
        )}

        {status === "ok" && (
          <>
            <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mb: 1.5 }}>
              {data.events.length} tulevaa tapahtumaa · avaa joukkue nähdäksesi nimet
            </Typography>
            <Stack spacing={1.5}>
              {data.events.map((ev) => <EventCard key={ev.id} ev={ev} />)}
              {data.events.length === 0 && <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>Ei tulevia Taitojää-tapahtumia.</Box>}
            </Stack>
            <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 2, lineHeight: 1.5 }}>
              Osa joukkueista on oletuksena IN — niiden luvut tarkentuvat lähempänä tapahtumaa. Pelaaja/huoltaja tunnistetaan seuran rosterista.
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
