import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, ButtonBase, CircularProgress } from "@mui/material";
import { Screen, Title, ListCard, ListRow, RankBadge, RowValue } from "./_shared";
import { getAhmaliigaRanking } from "../../lib/ahmaliigaApi";

// Ranking — global leaderboard, two tabs (current jakso / whole season). Uses the
// shared ListRow template so rows match the rest of the app.

const TABS = [
  { key: "jakso", label: "Nykyinen jakso" },
  { key: "kausi", label: "Koko kausi" },
];

export default function LiigaRanking() {
  const [tab, setTab] = useState("jakso");
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (data[tab]) return;
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
        <ListCard>
          {rows.map((r, i) => (
            <ListRow key={r.userId} highlight={r.me} divider={i < rows.length - 1}
              leading={<RankBadge rank={r.rank} highlight={r.me} />}
              title={r.me ? `${r.nickname} (sinä)` : r.nickname}
              trailing={<RowValue color={r.me ? "primary.main" : "text.primary"}>{r.total}</RowValue>} />
          ))}
        </ListCard>
      )}
    </Screen>
  );
}
