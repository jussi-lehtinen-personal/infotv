import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
import { LuChevronRight, LuClipboardList } from "react-icons/lu";
import { Screen, PageHead, RankBadge, RowValue, PillButton, Loading, CardAvatar, initialsNatural } from "./_shared";
import { getAhmaliigaRanking, getAhmaliigaRounds } from "../../lib/ahmaliigaApi";

// Ranking — leaderboard (last settled round / whole season) + an all-rounds tab
// that lists every settled round, each linking to that round's summary. Airy rows;
// the signed-in manager's own row is highlighted orange. NOTE: the "round" scope is
// the LAST SETTLED round (the in-progress round has no standings yet), hence the
// "Viime jakso" label — see ahmaliigaRanking.js (settledNo = curNo - 1).

const TABS = [
  { key: "round", label: "Viime jakso" },
  { key: "season", label: "Koko kausi" },
  { key: "rounds", label: "Kaikki jaksot" },
];

const ManagerAvatar = ({ avatar, nickname, size }) => {
  const [err, setErr] = useState(false);
  // Nicknames are Firstname-Surname → natural-order initials ("Lasse Ketvell" → "LK").
  if (!avatar || err) return <CardAvatar card={{ kind: "player", name: nickname }} size={size} label={initialsNatural(nickname)} />;
  return (
    <Box component="img" src={avatar} alt="" onError={() => setErr(true)}
      sx={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "center",
            display: "block", flexShrink: 0, bgcolor: "#222", border: "1px solid rgba(255,255,255,0.12)" }} />
  );
};

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
  const nav = useNavigate();
  const [params] = useSearchParams();
  // Deep-link the tab via ?tab=season (from the dashboard "Kausi päättynyt" card etc.).
  const [tab, setTab] = useState(() => (TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "round"));
  const [data, setData] = useState({});     // leaderboard rows per scope
  const [rounds, setRounds] = useState(null); // all-rounds list
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (tab === "rounds") {
      if (rounds != null) { setLoading(false); return; }
      setLoading(true);
      getAhmaliigaRounds()
        .then((d) => { if (!cancelled) setRounds(d.rounds || []); })
        .catch(() => { if (!cancelled) setRounds([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }
    if (data[tab]) { setLoading(false); return; }
    setLoading(true);
    getAhmaliigaRanking(tab)
      .then((d) => { if (!cancelled) setData((prev) => ({ ...prev, [tab]: d.rows || [] })); })
      .catch(() => { if (!cancelled) setData((prev) => ({ ...prev, [tab]: [] })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, data, rounds]);

  const rows = data[tab];

  return (
    <Screen>
      <PageHead title="Ranking" />

      <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: "auto", pb: 0.5, "&::-webkit-scrollbar": { display: "none" } }}>
        {TABS.map((t) => (
          <PillButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} sx={{ flex: 1, py: 0.9, whiteSpace: "nowrap" }}>
            {t.label}
          </PillButton>
        ))}
      </Stack>

      {tab === "rounds" ? (
        loading || rounds == null ? (
          <Loading />
        ) : rounds.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
            <Typography variant="body2">Ei ratkaistuja jaksoja vielä.</Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {rounds.map((j) => (
              <ButtonBase key={j.no} onClick={() => nav(`/ahmaliiga/round?round=${j.no}`)}
                sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", textAlign: "left", p: 1.5,
                      borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
                <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: "rgba(249,115,22,0.15)" }}>
                  <Box component={LuClipboardList} sx={{ fontSize: 19, color: "primary.main", display: "block" }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 800, fontSize: 15, color: "text.primary", lineHeight: 1.3 }}>Jakso {j.no + 1}</Typography>
                  <Typography noWrap variant="caption" sx={{ color: "text.disabled", display: "block", lineHeight: 1.3 }}>katso mistä pisteesi tulivat</Typography>
                </Box>
                <RowValue color="primary.main">{j.me ? j.me.total : "—"}</RowValue>
                <Box component={LuChevronRight} sx={{ fontSize: 18, color: "text.disabled", flexShrink: 0, display: "block" }} />
              </ButtonBase>
            ))}
          </Stack>
        )
      ) : rows == null || loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body2">Ei vielä tuloksia — jaksoa ei ole ratkaistu.</Typography>
        </Box>
      ) : (
        <Box>
          {rows.map((r) => (
            <Box key={r.userId} sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5, py: 1, px: 1.25,
                  borderRadius: "var(--radius-item)",
                  bgcolor: r.me ? "rgba(249,115,22,0.10)" : "transparent",
                  border: r.me ? "1px solid rgba(249,115,22,0.35)" : "1px solid transparent" }}>
              <RankBadge rank={r.rank} highlight={r.me} />
              <ManagerAvatar avatar={r.avatar} nickname={r.nickname} size={38} />
              <Typography noWrap sx={{ flex: 1, minWidth: 0, lineHeight: 1.2, fontWeight: r.me ? 800 : 700, fontSize: 15,
                    color: r.me ? "primary.main" : "text.primary" }}>{r.nickname}</Typography>
              <RowValue color={r.me ? "primary.main" : "text.primary"}>{r.total}</RowValue>
              <RankTrend delta={r.delta} />
            </Box>
          ))}
        </Box>
      )}
    </Screen>
  );
}
