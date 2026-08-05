import React, { useEffect, useState } from "react";
import { Box, Typography, CircularProgress } from "@mui/material";
import { LuCalendarDays, LuUsers, LuClock } from "react-icons/lu";
import { getAhmaliigaRounds, getAhmaliigaCards } from "../../lib/ahmaliigaApi";

// Launch-gate landing shown to NON-admins while the season hasn't opened yet
// (state.notStarted). Admins bypass this (they preview + test the live game). Shows the
// countdown + the schedule (jaksot) + the participating teams — "these rounds + teams as
// info, this-moment projection" (the pool is still filling from Jopox, so it can grow).

const MONTHS = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];
const d = (s) => { const x = new Date(String(s).replace(" ", "T")); return isNaN(x) ? "" : `${x.getDate()}.${x.getMonth() + 1}.`; };
const dt = (s) => { const x = new Date(String(s).replace(" ", "T")); return isNaN(x) ? "" : `${x.getDate()}. ${MONTHS[x.getMonth()]}kuuta klo ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };

function countdown(startAt) {
  const ms = new Date(startAt).getTime() - Date.now();
  if (!(ms > 0)) return "";
  const days = Math.floor(ms / 86400000);
  const hrs = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days >= 1) return `${days} pv ${hrs} h`;
  if (hrs >= 1) return `${hrs} h ${mins} min`;
  return `${mins} min`;
}

const Card = ({ children, sx }) => (
  <Box sx={{ bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", borderRadius: "var(--radius-card)", p: 2, ...sx }}>
    {children}
  </Box>
);
const SectionLabel = ({ Icon, children }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.25 }}>
    <Icon size={16} style={{ color: "var(--color-primary)" }} />
    <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-accent)" }}>{children}</Typography>
  </Box>
);

export default function ComingSoon({ state }) {
  const startAt = state && state.startAt;
  const [, setTick] = useState(0); // minute tick to refresh the countdown
  const [rounds, setRounds] = useState(null);
  const [teams, setTeams] = useState(null);

  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    getAhmaliigaRounds().then((r) => setRounds((r && r.rounds) || r || [])).catch(() => setRounds([]));
    getAhmaliigaCards("team").then((c) => setTeams((c && c.cards) || c || [])).catch(() => setTeams([]));
  }, []);

  const cd = startAt ? countdown(startAt) : "";

  return (
    <Box sx={{ px: 2, py: 3, maxWidth: 640, mx: "auto" }}>
      {/* hero */}
      <Box sx={{ textAlign: "center", mb: 3 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-primary)", mb: 1 }}>
          Beta-testipeli · tulossa
        </Typography>
        <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: "clamp(34px,9vw,52px)", lineHeight: 1, color: "text.primary" }}>
          Ahmaliiga alkaa pian
        </Typography>
        {startAt && (
          <Box sx={{ mt: 2, display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 0.5, px: 3, py: 1.5, borderRadius: "var(--radius-item)", bgcolor: "rgba(var(--color-primary-rgb),0.10)", border: "1px solid rgba(var(--color-primary-rgb),0.30)" }}>
            {cd
              ? (<>
                  <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 40, lineHeight: 1, color: "primary.main" }}>{cd}</Typography>
                  <Typography sx={{ fontSize: 13, color: "var(--color-accent)", display: "flex", alignItems: "center", gap: 0.5 }}><LuClock size={13} /> avautuu {dt(startAt)}</Typography>
                </>)
              : (<Typography sx={{ fontSize: 15, fontWeight: 700, color: "primary.main" }}>Avautuu aivan pian…</Typography>)}
          </Box>
        )}
        <Typography sx={{ mt: 2, fontSize: 14, color: "var(--color-accent)", lineHeight: 1.5 }}>
          Kokoa kortistosi valmiiksi mielessäsi — peli avautuu yllä olevaan aikaan.
        </Typography>
      </Box>

      {/* jaksot */}
      <Card sx={{ mb: 2 }}>
        <SectionLabel Icon={LuCalendarDays}>Jaksot</SectionLabel>
        {rounds == null ? <CircularProgress size={18} sx={{ color: "primary.main" }} />
          : rounds.length === 0 ? <Typography sx={{ fontSize: 14, color: "var(--color-muted)" }}>Aikataulu tarkentuu.</Typography>
          : rounds.map((r, i) => (
            <Box key={r.no ?? i} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 0.9, borderBottom: i < rounds.length - 1 ? "1px solid var(--color-surface-divider)" : 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>Jakso {(r.no ?? i) + 1}</Typography>
              <Typography sx={{ fontSize: 13, color: "var(--color-accent)" }}>{d(r.startDate)}–{d(r.endDate)}</Typography>
            </Box>
          ))}
      </Card>

      {/* joukkueet */}
      <Card>
        <SectionLabel Icon={LuUsers}>Mukana olevat joukkueet</SectionLabel>
        {teams == null ? <CircularProgress size={18} sx={{ color: "primary.main" }} />
          : teams.length === 0 ? <Typography sx={{ fontSize: 14, color: "var(--color-muted)" }}>Joukkueet tarkentuvat ohjelman myötä.</Typography>
          : (<Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {teams.map((t) => (
                <Box key={t.id || t.name} sx={{ px: 1.5, py: 0.75, borderRadius: "999px", bgcolor: "rgba(255,255,255,0.06)", border: "1px solid var(--color-surface-border)", fontSize: 13, fontWeight: 700, color: "text.primary" }}>
                  {t.name}
                </Box>
              ))}
            </Box>)}
        <Typography sx={{ mt: 1.5, fontSize: 12, color: "var(--color-muted)", lineHeight: 1.5 }}>
          Kortisto täydentyy vielä ennen alkua (pelaajia lisätään joukkueiden kokoonpanoihin).
        </Typography>
      </Card>
    </Box>
  );
}
