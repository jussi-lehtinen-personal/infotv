import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, ButtonBase } from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import { LuTrophy, LuCheck, LuScanLine } from "react-icons/lu";
import { Screen, PageHead, Loading, EmptyState, ListCard, ListRow, IconCircle } from "./_shared";
import { getAhmaliigaVouchers } from "../../lib/ahmaliigaApi";

// Palkintosi (F10) — the manager's prizes + their identity QR. Staff scan the QR at
// the rink to mark a prize collected (see kiosk.js). Prizes are pre-assigned by the
// admin from the round/season top-3; the QR only identifies the manager.

// Which round/season a prize is for → a short label.
const scopeLabel = (v) => (v.scope === "season" ? "Koko kausi" : `Jakso ${(v.round ?? 0) + 1}`);
const rankLabel = (rank) => `Sija ${rank}`;

export default function LiigaRewards() {
  const nav = useNavigate();
  const [data, setData] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaVouchers().then((d) => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, []);

  if (data === undefined) return <Loading screen />;
  const vouchers = (data && data.vouchers) || [];
  const issued = vouchers.filter((v) => v.status === "issued");
  const qrUrl = data && data.qrCode ? `${window.location.origin}/ahmaliiga/kiosk?c=${data.qrCode}` : null;

  return (
    <Screen>
      <PageHead title="Palkinnot"
        right={data && data.canRedeem ? (
          <ButtonBase onClick={() => nav("/ahmaliiga/kiosk")}
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.25, py: 0.6, borderRadius: 999,
                  bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", color: "text.secondary" }}>
            <Box component={LuScanLine} sx={{ fontSize: 15, display: "block" }} />
            <Box component="span" sx={{ fontSize: 12.5, fontWeight: 700 }}>Kioski</Box>
          </ButtonBase>
        ) : null} />

      {/* Identity QR — shown when there's something to claim. */}
      {issued.length > 0 && qrUrl && (
        <Box sx={{ mb: 3, p: 2.5, borderRadius: "var(--radius-card)", textAlign: "center",
              bgcolor: "rgba(249,115,22,0.10)", border: "1px solid rgba(249,115,22,0.35)" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "primary.main", mb: 0.5 }}>
            {issued.length === 1 ? "Sinulla on 1 lunastamaton palkinto" : `Sinulla on ${issued.length} lunastamatonta palkintoa`}
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 2 }}>Näytä tämä koodi Kiekko-Ahman kioskissa lunastaaksesi.</Typography>
          <Box sx={{ display: "inline-block", p: 1.5, borderRadius: "var(--radius-item)", bgcolor: "#fff", lineHeight: 0 }}>
            <QRCodeSVG value={qrUrl} size={188} level="M" bgColor="#ffffff" fgColor="#0e0e0e" />
          </Box>
        </Box>
      )}

      {vouchers.length === 0 ? (
        <EmptyState icon={LuTrophy} title="Ei vielä palkintoja"
          text="Jakson ja kauden parhaat palkitaan. Kiipeä Top 3:een niin palkinto ilmestyy tänne." />
      ) : (
        <ListCard>
          {vouchers.map((v) => {
            const redeemed = v.status === "redeemed";
            return (
              <ListRow key={v.prizeId} divider
                leading={<IconCircle icon={redeemed ? LuCheck : LuTrophy}
                  tint={redeemed ? "rgba(255,255,255,0.06)" : "rgba(249,115,22,0.15)"}
                  color={redeemed ? "text.disabled" : "primary.main"} />}
                title={v.prize}
                subtitle={`${scopeLabel(v)} · ${rankLabel(v.rank)}`}
                trailing={
                  <Box component="span" sx={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
                        color: redeemed ? "text.disabled" : "var(--color-live)" }}>
                    {redeemed ? "Lunastettu" : "Lunastamatta"}
                  </Box>
                }
                sx={{ opacity: redeemed ? 0.6 : 1 }} />
            );
          })}
        </ListCard>
      )}
    </Screen>
  );
}
