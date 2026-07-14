import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, Button } from "@mui/material";
import { LuCrown, LuPencil, LuShieldCheck } from "react-icons/lu";
import { Screen, PageHead, EmptyState, Loading, CoinPill, Coins, CardAvatar } from "./_shared";
import { getMySquad } from "../../lib/ahmaliigaApi";

// Oma joukkue — the signed-in manager's squad from /api/ahmaliiga/squad. Captain
// hero (×2) + 2×2 grid. Empty state → build via "Kokoa joukkue". (Jakso points
// fill in after settlement in M2.)

const KindTag = ({ kind }) => (
  <Box component="span" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "text.disabled" }}>
    {kind === "team" ? "Joukkue" : kind === "goalie" ? "Maalivahti" : "Pelaaja"}
  </Box>
);

const StatChip = ({ children }) => (
  <Box sx={{ px: 1.1, py: 0.5, borderRadius: 999, bgcolor: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.12)", fontSize: 12, fontWeight: 600,
        color: "text.secondary", whiteSpace: "nowrap" }}>
    {children}
  </Box>
);

export default function LiigaTeam() {
  const nav = useNavigate();
  const [data, setData] = useState(undefined); // undefined=loading, null=no squad, obj=squad

  useEffect(() => {
    let cancelled = false;
    getMySquad()
      .then((d) => { if (!cancelled) setData(d.squad ? d : null); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, []);

  if (data === undefined) return <Loading screen />;

  if (data === null) {
    return (
      <EmptyState icon={LuShieldCheck} title="Kokoa joukkueesi"
        text="Valitse 5 korttia budjetilla 120 coinia, nimeä kapteeni ja lähde keräämään pisteitä."
        action={
          <Button variant="contained" startIcon={<LuShieldCheck size={18} />}
                  onClick={() => nav("/ahmaliiga/joukkue/muokkaa")} sx={{ py: 1.1, px: 3 }}>
            Kokoa joukkue
          </Button>
        } />
    );
  }

  const cards = data.squad.cards || [];
  const captain = cards.find((c) => c.isCaptain) || cards[0];
  const rest = cards.filter((c) => c !== captain);
  const playerCount = cards.filter((c) => c.kind !== "team").length;

  return (
    <Screen>
      <PageHead eyebrow="Kokoonpano" title="Oma joukkue" right={<CoinPill value={data.bank} total={data.budget} />} sx={{ mb: 1.5 }} />

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
        <StatChip>{cards.length} / {data.budget != null ? 5 : cards.length} korttia</StatChip>
        <StatChip>1 kapteeni ×2</StatChip>
        <StatChip>{playerCount} pelaajakorttia</StatChip>
      </Stack>

      {captain && (
        <Box sx={{ position: "relative", borderRadius: "var(--radius-card)", p: 2, mb: 2,
              background: "linear-gradient(150deg, rgba(249,115,22,0.22), rgba(249,115,22,0.04))",
              border: "1px solid rgba(249,115,22,0.55)",
              boxShadow: "0 0 0 1px rgba(249,115,22,0.15), 0 18px 40px rgba(249,115,22,0.14)" }}>
          <Stack direction="row" alignItems="center" spacing={0.5}
                 sx={{ position: "absolute", top: 12, right: 12, color: "primary.main" }}>
            <LuCrown size={15} />
            <Box component="span" sx={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em",
                  textTransform: "uppercase", lineHeight: 1 }}>Kapteeni ×2</Box>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={2}>
            <CardAvatar card={captain} size={72} />
            <Box sx={{ minWidth: 0 }}>
              <KindTag kind={captain.kind} />
              <Typography sx={{ fontFamily: "var(--font-family-display)",
                    letterSpacing: "var(--font-display-tracking)", fontSize: 28, lineHeight: 1,
                    color: "text.primary", mt: 0.25 }}>{captain.name}</Typography>
              {captain.sub && <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>{captain.sub}</Typography>}
              <Box sx={{ mt: 1 }}><Coins value={captain.buyPrice} size={15} /></Box>
            </Box>
          </Stack>
        </Box>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mb: 2 }}>
        {rest.map((c) => (
          <Box key={c.id} sx={{ position: "relative", borderRadius: "var(--radius-item)", p: 1.5,
                bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
            <Stack alignItems="center" spacing={1}>
              <CardAvatar card={c} size={56} />
              <Box sx={{ textAlign: "center", minWidth: 0, width: "100%" }}>
                <KindTag kind={c.kind} />
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: "text.primary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</Typography>
                {c.sub && <Typography variant="caption" sx={{ color: "text.disabled", display: "block",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</Typography>}
              </Box>
              <Coins value={c.buyPrice} size={13} />
            </Stack>
          </Box>
        ))}
      </Box>

      <Button fullWidth variant="contained" startIcon={<LuPencil size={18} />}
              onClick={() => nav("/ahmaliiga/joukkue/muokkaa")} sx={{ py: 1.25 }}>
        Muokkaa joukkuetta
      </Button>
    </Screen>
  );
}
