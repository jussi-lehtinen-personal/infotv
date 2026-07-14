import React, { useState, useEffect } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { Screen, PageHead, ListCard, ListRow, RankBadge, RowValue, PillButton, Loading, CardAvatar } from "./_shared";
import { getAhmaliigaRanking } from "../../lib/ahmaliigaApi";

// Ranking — global leaderboard, two tabs (current jakso / whole season). Each row:
// rank + manager avatar + nickname + points + up/down trend. The signed-in
// manager's row is highlighted orange (no "(sinä)" label needed).

const TABS = [
  { key: "jakso", label: "Nykyinen jakso" },
  { key: "kausi", label: "Koko kausi" },
];

// Rank movement vs the previous point: ▲ N green (up), ▼ N red (down), — none.
const RankTrend = ({ delta }) => {
  if (delta == null || delta === 0) {
    return <Box component="span" sx={{ width: 34, textAlign: "right", flexShrink: 0, color: "text.disabled", fontWeight: 700, fontSize: 15 }}>—</Box>;
  }
  const up = delta > 0;
  return (
    <Box component="span" sx={{ width: 34, textAlign: "right", flexShrink: 0, fontWeight: 800, fontSize: 13,
          color: up ? "var(--color-live)" : "#f87171" }}>
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </Box>
  );
};

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
      <PageHead title="Ranking" />

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {TABS.map((t) => (
          <PillButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} sx={{ flex: 1, py: 0.9 }}>
            {t.label}
          </PillButton>
        ))}
      </Stack>

      {rows == null || loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body2">Ei vielä tuloksia — jaksoa ei ole ratkaistu.</Typography>
        </Box>
      ) : (
        <ListCard>
          {rows.map((r, i) => (
            <ListRow key={r.userId} highlight={r.me} divider={i < rows.length - 1}
              leading={
                <Stack direction="row" alignItems="center" spacing={1}>
                  <RankBadge rank={r.rank} highlight={r.me} />
                  <CardAvatar card={{ kind: "player", name: r.nickname }} size={32} />
                </Stack>
              }
              title={r.nickname}
              trailing={
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <RowValue color={r.me ? "primary.main" : "text.primary"}>{r.total}</RowValue>
                  <RankTrend delta={r.delta} />
                </Stack>
              } />
          ))}
        </ListCard>
      )}
    </Screen>
  );
}
