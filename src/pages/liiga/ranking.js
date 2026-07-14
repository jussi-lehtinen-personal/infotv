import React, { useState, useEffect } from "react";
import { Box, Typography, Stack } from "@mui/material";
import { Screen, PageHead, RankBadge, RowValue, PillButton, Loading, CardAvatar } from "./_shared";
import { getAhmaliigaRanking } from "../../lib/ahmaliigaApi";

// Ranking — global leaderboard, two tabs (current jakso / whole season). An airy
// row list (no card container): rank + manager avatar + nickname + points + an
// up/down trend. The signed-in manager's row is highlighted orange.

const TABS = [
  { key: "jakso", label: "Nykyinen jakso" },
  { key: "kausi", label: "Koko kausi" },
];

// Manager avatar from the profile; falls back to initials (bots / no photo).
const ManagerAvatar = ({ avatar, nickname, size }) => {
  const [err, setErr] = useState(false);
  if (!avatar || err) return <CardAvatar card={{ kind: "player", name: nickname }} size={size} />;
  return (
    <Box component="img" src={avatar} alt="" onError={() => setErr(true)}
      sx={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "top",
            flexShrink: 0, bgcolor: "#222", border: "1px solid rgba(255,255,255,0.12)" }} />
  );
};

// Rank movement vs the previous point: ▲ N green (up), ▼ N red (down), — none.
const RankTrend = ({ delta }) => {
  if (delta == null || delta === 0) {
    return <Box component="span" sx={{ width: 36, textAlign: "right", flexShrink: 0, color: "text.disabled", fontWeight: 700, fontSize: 15 }}>—</Box>;
  }
  const up = delta > 0;
  return (
    <Box component="span" sx={{ width: 36, textAlign: "right", flexShrink: 0, fontWeight: 800, fontSize: 13,
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
        <Stack spacing={0.5}>
          {rows.map((r) => (
            <Stack key={r.userId} direction="row" alignItems="center" spacing={1.5}
              sx={{ py: 1, px: 1.25, borderRadius: "var(--radius-item)",
                    bgcolor: r.me ? "rgba(249,115,22,0.10)" : "transparent",
                    border: r.me ? "1px solid rgba(249,115,22,0.35)" : "1px solid transparent" }}>
              <RankBadge rank={r.rank} highlight={r.me} />
              <ManagerAvatar avatar={r.avatar} nickname={r.nickname} size={38} />
              <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: r.me ? 800 : 700, fontSize: 15,
                    color: r.me ? "primary.main" : "text.primary" }}>{r.nickname}</Typography>
              <RowValue color={r.me ? "primary.main" : "text.primary"}>{r.total}</RowValue>
              <RankTrend delta={r.delta} />
            </Stack>
          ))}
        </Stack>
      )}
    </Screen>
  );
}
