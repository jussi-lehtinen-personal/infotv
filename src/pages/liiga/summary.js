import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, Stack } from "@mui/material";
import { LuStar, LuGoal, LuTrophy } from "react-icons/lu";
import { Screen, PageHead, EmptyState, Loading, AccentPanel, CardAvatar, StatCard, ListCard, ListRow, RowValue, signed } from "./_shared";
import { getAhmaliigaSummary } from "../../lib/ahmaliigaApi";

// Jakson yhteenveto — big jakso points + rank, then each card with its reason and
// points, a total, and the best card. Built on the shared ListRow/StatCard templates.

const RowIcon = ({ card }) =>
  card.kind === "predict" ? (
    <Box sx={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", bgcolor: "rgba(249,115,22,0.14)" }}>
      <Box component={LuGoal} sx={{ color: "primary.main", fontSize: 22, display: "block" }} />
    </Box>
  ) : (
    <CardAvatar card={card} size={44} />
  );

const CaptainTag = () => (
  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, flexShrink: 0, color: "primary.main" }}>
    <Box component={LuStar} sx={{ fontSize: 14, display: "block" }} fill="currentColor" />
    <Box component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>kapteeni ×2</Box>
  </Box>
);

export default function LiigaSummary() {
  const [data, setData] = useState(undefined);
  const [params] = useSearchParams();
  const jakso = params.get("jakso");

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    getAhmaliigaSummary(jakso != null ? Number(jakso) : undefined)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [jakso]);

  if (data === undefined) return <Loading screen />;
  if (!data || !data.settled) {
    return <EmptyState title="Jakson yhteenveto" text="Jaksoa ei ole vielä ratkaistu — pisteet ilmestyvät kun jakso päättyy." />;
  }

  const best = data.best;
  return (
    <Screen>
      <PageHead eyebrow={`Jakso ${data.jakso + 1}`} title="Jakson yhteenveto" />

      <Stack direction="row" spacing={1.25} sx={{ mb: 2.5 }}>
        <StatCard label="Jakson pisteet" value={data.total} accent />
        <StatCard label="Sijoitus" value={data.rank != null ? `${data.rank}` : "—"}
                  sub={data.managerCount ? `/ ${data.managerCount}` : null} />
      </Stack>

      <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>
        Pisteet korteittain
      </Typography>
      <ListCard>
        {data.cards.map((c) => (
          <ListRow key={c.id} divider
            leading={<RowIcon card={c} />}
            title={c.name}
            titleRight={c.isCaptain ? <CaptainTag /> : null}
            subtitle={c.reason || "Ei pisteitä"}
            trailing={<RowValue size={22} color={c.pts > 0 ? "primary.main" : "text.disabled"}>{signed(c.pts)}</RowValue>} />
        ))}
        {/* total — same row geometry so the number lines up with the rows above */}
        <Box sx={{ display: "flex", alignItems: "center", px: 1.75, py: 1.25, borderTop: "2px solid rgba(249,115,22,0.4)" }}>
          <Box sx={{ flex: 1, fontFamily: "var(--font-family-display)", fontSize: 18, lineHeight: 1,
                letterSpacing: "var(--font-display-tracking)", color: "primary.main" }}>Yhteensä</Box>
          <RowValue size={22}>{data.total}</RowValue>
        </Box>
      </ListCard>

      {best && (
        <AccentPanel sx={{ mt: 2 }}>
          <Box component={LuTrophy} sx={{ fontSize: 26, color: "primary.main", flexShrink: 0, display: "block" }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "primary.main" }}>
              Eniten pisteitä
            </Typography>
            <Typography sx={{ fontWeight: 700, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {best.name}
            </Typography>
          </Box>
          <RowValue size={22} color="primary.main">{signed(best.pts)}</RowValue>
        </AccentPanel>
      )}
    </Screen>
  );
}
