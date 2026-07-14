import React, { useState, useEffect } from "react";
import { Box, Typography } from "@mui/material";
import { LuMedal, LuStar, LuTrendingUp, LuGoal, LuArrowLeftRight, LuBell } from "react-icons/lu";
import { Screen, PageHead, Loading, EmptyState, ListCard, IconCircle, shortDate } from "./_shared";
import { getAhmaliigaNotifications, markAhmaliigaNotificationsRead } from "../../lib/ahmaliigaApi";

// Ilmoitukset — the manager's inbox, filled by settlement (one round-summary batch
// per settled round). Round-level for now; per-game events come later. Opening the
// page marks everything read so the top-bar badge clears.

// Icon + tint per notification kind.
const KIND = {
  round:   { icon: LuMedal,          tint: "rgba(249,115,22,0.15)", color: "primary.main" },
  captain: { icon: LuStar,           tint: "rgba(249,115,22,0.15)", color: "primary.main" },
  best:    { icon: LuTrendingUp,     tint: "rgba(34,197,94,0.15)",  color: "var(--color-live)" },
  predict: { icon: LuGoal,           tint: "rgba(249,115,22,0.15)", color: "primary.main" },
  penalty: { icon: LuArrowLeftRight, tint: "rgba(239,68,68,0.15)",  color: "#ef4444" },
};

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
  const [data, setData] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaNotifications()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Mark read after we've captured the unread state for this view.
        if (d.unread > 0) markAhmaliigaNotificationsRead().catch(() => {});
      })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, []);

  if (data === undefined) return <Loading screen />;
  const items = (data && data.items) || [];
  if (!items.length) {
    return <EmptyState icon={LuBell} title="Ei ilmoituksia"
      text="Kun jakso ratkaistaan, näet täällä miten joukkueesi, kapteenisi ja veikkauksesi pärjäsivät." />;
  }

  return (
    <Screen>
      <PageHead title="Ilmoitukset" />
      <ListCard>
        {items.map((n, i) => {
          const k = KIND[n.kind] || KIND.round;
          return (
            <Box key={n.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 1.75, py: 1.5,
                  borderBottom: i < items.length - 1 ? "1px solid var(--color-surface-divider)" : 0,
                  bgcolor: n.read ? "transparent" : "rgba(249,115,22,0.06)" }}>
              <IconCircle icon={k.icon} tint={k.tint} color={k.color} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: n.read ? 700 : 800, fontSize: 14.5, lineHeight: 1.3, color: "text.primary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</Typography>
                <Typography variant="caption" sx={{ display: "block", color: "text.secondary", lineHeight: 1.35, mt: 0.2 }}>{n.body}</Typography>
                {n.createdAt && <Typography variant="caption" sx={{ display: "block", color: "text.disabled", fontSize: 11, mt: 0.3 }}>{shortDate(n.createdAt)}</Typography>}
              </Box>
              <PointsBadge points={n.points} />
            </Box>
          );
        })}
      </ListCard>
    </Screen>
  );
}
