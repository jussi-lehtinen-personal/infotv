import React, { useState } from "react";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
import { Screen, Title } from "./_shared";

// Ranking — global leaderboard with two tabs (current jakso / whole season).
// No friend leagues, so one shared board. Mock data; "Sinä" highlighted.

const JAKSO = [
  { rank: 1, name: "Kiekko-Kalle", pts: 58 },
  { rank: 2, name: "Ahma_Ville", pts: 54 },
  { rank: 3, name: "Jääkiekko-Jaana", pts: 51 },
  { rank: 4, name: "Sinä", pts: 46, me: true },
  { rank: 5, name: "PuolustajaPena", pts: 44 },
  { rank: 6, name: "Molari_Mikko", pts: 41 },
  { rank: 7, name: "SyöttöSalla", pts: 39 },
  { rank: 8, name: "LaituriLauri", pts: 37 },
];

const KAUSI = [
  { rank: 1, name: "Jääkiekko-Jaana", pts: 312 },
  { rank: 2, name: "Ahma_Ville", pts: 305 },
  { rank: 3, name: "Kiekko-Kalle", pts: 298 },
  { rank: 4, name: "Sinä", pts: 291, me: true },
  { rank: 5, name: "PuolustajaPena", pts: 287 },
  { rank: 6, name: "Molari_Mikko", pts: 274 },
  { rank: 7, name: "SyöttöSalla", pts: 268 },
  { rank: 8, name: "LaituriLauri", pts: 259 },
];

const TABS = [
  { key: "jakso", label: "Nykyinen jakso", rows: JAKSO },
  { key: "kausi", label: "Koko kausi", rows: KAUSI },
];

export default function LiigaRanking() {
  const [tab, setTab] = useState("jakso");
  const rows = TABS.find((t) => t.key === tab).rows;

  return (
    <Screen>
      <Title sx={{ mb: 1.5 }}>Ranking</Title>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <ButtonBase key={t.key} onClick={() => setTab(t.key)}
              sx={{ flex: 1, py: 0.9, borderRadius: 999, fontSize: 13, fontWeight: 700,
                    border: "1px solid", borderColor: active ? "primary.main" : "var(--color-surface-border)",
                    bgcolor: active ? "rgba(249,115,22,0.15)" : "transparent",
                    color: active ? "primary.main" : "text.secondary" }}>
              {t.label}
            </ButtonBase>
          );
        })}
      </Stack>

      <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
            border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
        {rows.map((r) => (
          <Stack key={r.rank} direction="row" alignItems="center" spacing={1.5}
                 sx={{ px: 2, py: 1.25, borderBottom: "1px solid var(--color-surface-divider)",
                       "&:last-of-type": { borderBottom: 0 },
                       bgcolor: r.me ? "rgba(249,115,22,0.10)" : "transparent" }}>
            <Box sx={{ width: 26, textAlign: "center", fontFamily: "var(--font-family-display)",
                  fontSize: 20, letterSpacing: "var(--font-display-tracking)",
                  color: r.rank <= 3 ? "primary.main" : "text.disabled" }}>
              {r.rank}
            </Box>
            <Typography sx={{ flex: 1, fontWeight: r.me ? 800 : 600, fontSize: 14,
                  color: r.me ? "primary.main" : "text.primary" }}>
              {r.name}
            </Typography>
            <Box component="span" sx={{ fontFamily: "var(--font-family-display)", fontSize: 20,
                  letterSpacing: "var(--font-display-tracking)", color: "text.primary" }}>
              {r.pts}
            </Box>
          </Stack>
        ))}
      </Box>
    </Screen>
  );
}
