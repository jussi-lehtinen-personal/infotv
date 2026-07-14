import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, ButtonBase, CircularProgress } from "@mui/material";
import { Screen, Title } from "./_shared";
import { getAhmaliigaRanking } from "../../lib/ahmaliigaApi";

// Ranking — global leaderboard, two tabs (current jakso / whole season). Data from
// /api/ahmaliiga/ranking; the signed-in manager's row is highlighted.

const TABS = [
  { key: "jakso", label: "Nykyinen jakso" },
  { key: "kausi", label: "Koko kausi" },
];

export default function LiigaRanking() {
  const [tab, setTab] = useState("jakso");
  const [data, setData] = useState({}); // { jakso: rows, kausi: rows }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (data[tab]) return; // cached
    setLoading(true);
    getAhmaliigaRanking(tab)
      .then((d) => { if (!cancelled) setData((prev) => ({ ...prev, [tab]: d.rows || [] })); })
      .catch(() => { if (!cancelled) setData((prev) => ({ ...prev, [tab]: [] })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, data]);

  const rows = data[tab];

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

      {rows == null || loading ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress sx={{ color: "primary.main" }} /></Box>
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body2">Ei vielä tuloksia — jaksoa ei ole ratkaistu.</Typography>
        </Box>
      ) : (
        <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
              border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
          {rows.map((r) => (
            <Stack key={r.userId} direction="row" alignItems="center" spacing={1.5}
                   sx={{ px: 2, py: 1.25, borderBottom: "1px solid var(--color-surface-divider)",
                         "&:last-of-type": { borderBottom: 0 },
                         bgcolor: r.me ? "rgba(249,115,22,0.10)" : "transparent" }}>
              <Box sx={{ width: 26, textAlign: "center", fontFamily: "var(--font-family-display)", fontSize: 20,
                    lineHeight: 1, transform: "translateY(var(--font-display-shift))",
                    letterSpacing: "var(--font-display-tracking)", color: r.rank <= 3 ? "primary.main" : "text.disabled" }}>
                {r.rank}
              </Box>
              <Typography sx={{ flex: 1, fontWeight: r.me ? 800 : 600, fontSize: 14, lineHeight: 1,
                    color: r.me ? "primary.main" : "text.primary" }}>
                {r.me ? "Sinä" : r.nickname}
              </Typography>
              <Box component="span" sx={{ fontFamily: "var(--font-family-display)", fontSize: 20,
                    lineHeight: 1, transform: "translateY(var(--font-display-shift))",
                    letterSpacing: "var(--font-display-tracking)", color: "text.primary" }}>
                {r.total}
              </Box>
            </Stack>
          ))}
        </Box>
      )}
    </Screen>
  );
}
