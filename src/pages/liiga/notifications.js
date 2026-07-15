import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, ButtonBase } from "@mui/material";
import { LuMedal, LuStar, LuTrendingUp, LuGoal, LuArrowLeftRight, LuBell, LuChevronRight, LuTrash2 } from "react-icons/lu";
import { Screen, PageHead, Loading, EmptyState, ListCard, IconCircle, shortDate, PillButton } from "./_shared";
import { getAhmaliigaNotifications, deleteAhmaliigaNotification, clearAhmaliigaNotifications } from "../../lib/ahmaliigaApi";

// Ilmoitukset — the manager's inbox, filled by settlement (one round-summary batch
// per settled round). Each notification is clickable: it opens the round's
// Jakson yhteenveto AND is removed (handled → disappears).

// Icon + tint per notification kind.
const KIND = {
  round:   { icon: LuMedal,          tint: "rgba(249,115,22,0.15)", color: "primary.main" },
  captain: { icon: LuStar,           tint: "rgba(249,115,22,0.15)", color: "primary.main" },
  best:    { icon: LuTrendingUp,     tint: "rgba(34,197,94,0.15)",  color: "var(--color-live)" },
  predict: { icon: LuGoal,           tint: "rgba(249,115,22,0.15)", color: "primary.main" },
  penalty: { icon: LuArrowLeftRight, tint: "rgba(239,68,68,0.15)",  color: "#ef4444" },
};

// Where a notification takes you when clicked — every kind belongs to a settled
// round, so they all open that round's summary (shows rank, per-card points,
// captain ×2, best card and the prediction bonus).
const targetOf = (n) => (n.round != null ? `/ahmaliiga/round?round=${n.round}` : "/ahmaliiga");

const PointsBadge = ({ points }) => {
  if (points == null || points === 0) return null;
  const up = points > 0;
  return (
    <Box component="span" sx={{ flexShrink: 0, fontFamily: "var(--font-family-display)", fontSize: 20, lineHeight: 1,
          transform: "translateY(var(--font-display-shift))", letterSpacing: "var(--font-display-tracking)",
          color: up ? "var(--color-live)" : "#ef4444" }}>
      {up ? "+" : "−"}{Math.abs(points)}
    </Box>
  );
};

export default function LiigaNotifications() {
  const nav = useNavigate();
  const [items, setItems] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaNotifications()
      .then((d) => { if (!cancelled) setItems((d && d.items) || []); })
      .catch(() => { if (!cancelled) setItems(null); });
    return () => { cancelled = true; };
  }, []);

  const open = (n) => {
    // Handle it: drop it from the list, delete server-side, then navigate.
    setItems((prev) => (prev || []).filter((x) => x.id !== n.id));
    deleteAhmaliigaNotification(n.id).catch(() => {});
    nav(targetOf(n));
  };

  const clearAll = () => {
    setItems([]);
    clearAhmaliigaNotifications().catch(() => {});
  };

  if (items === undefined) return <Loading screen />;
  if (!items || !items.length) {
    return <EmptyState icon={LuBell} title="Ei ilmoituksia"
      text="Kun jakso ratkaistaan, näet täällä miten joukkueesi, kapteenisi ja veikkauksesi pärjäsivät. Klikkaa ilmoitusta nähdäksesi jakson yhteenvedon." />;
  }

  return (
    <Screen>
      <PageHead title="Ilmoitukset" right={
        <PillButton onClick={clearAll}>
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}>
            <Box component={LuTrash2} sx={{ fontSize: 14, display: "block" }} />
            Tyhjennä kaikki
          </Box>
        </PillButton>
      } />
      <ListCard>
        {items.map((n, i) => {
          const k = KIND[n.kind] || KIND.round;
          return (
            <ButtonBase key={n.id} onClick={() => open(n)}
              sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.75, py: 1.5, width: "100%", textAlign: "left",
                    borderBottom: i < items.length - 1 ? "1px solid var(--color-surface-divider)" : 0,
                    "&:hover": { bgcolor: "rgba(255,255,255,0.03)" } }}>
              <IconCircle icon={k.icon} tint={k.tint} color={k.color} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.3, color: "text.primary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</Typography>
                <Typography variant="caption" sx={{ display: "block", color: "text.secondary", lineHeight: 1.35, mt: 0.2 }}>{n.body}</Typography>
                {n.createdAt && <Typography variant="caption" sx={{ display: "block", color: "text.disabled", fontSize: 11, mt: 0.3 }}>{shortDate(n.createdAt)}</Typography>}
              </Box>
              <PointsBadge points={n.points} />
              <Box component={LuChevronRight} sx={{ fontSize: 18, color: "text.disabled", flexShrink: 0, display: "block" }} />
            </ButtonBase>
          );
        })}
      </ListCard>
    </Screen>
  );
}
