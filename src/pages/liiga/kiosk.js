import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, Stack, Button, CircularProgress, Alert } from "@mui/material";
import { LuTrophy, LuCheck, LuScanLine, LuUser } from "react-icons/lu";
import { Screen, PageHead, Loading, EmptyState, ListCard, ListRow, IconCircle } from "./_shared";
import { getAhmaliigaVouchers, redeemAhmaliigaVoucher } from "../../lib/ahmaliigaApi";

// Kioski (F10) — staff mark a manager's prize collected at the rink. Reached by
// scanning the manager's QR (which opens /ahmaliiga/kiosk?c=CODE). Gated to the
// `kioski` role or admins server-side; the page just surfaces what the API allows.

const scopeLabel = (v) => (v.scope === "season" ? "Koko kausi" : `Jakso ${(v.round ?? 0) + 1}`);

export default function LiigaKiosk() {
  const [params] = useSearchParams();
  const code = params.get("c");

  const [state, setState] = useState(code ? undefined : "nocode"); // undefined=loading | nocode | error | ready
  const [manager, setManager] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    getAhmaliigaVouchers(code)
      .then((d) => { if (cancelled) return; setManager({ userId: d.userId, nickname: d.nickname }); setVouchers(d.vouchers || []); setState("ready"); })
      .catch((e) => { if (cancelled) return; setError(e.message || "Lataus epäonnistui."); setState("error"); });
    return () => { cancelled = true; };
  }, [code]);

  const redeem = async (v) => {
    setBusyId(v.prizeId); setError("");
    try {
      await redeemAhmaliigaVoucher(manager.userId, v.prizeId);
      setVouchers((prev) => prev.map((x) => (x.prizeId === v.prizeId ? { ...x, status: "redeemed" } : x)));
    } catch (e) {
      setError(e.message || "Lunastus epäonnistui.");
    } finally { setBusyId(""); }
  };

  if (state === "nocode") {
    return (
      <Screen>
        <PageHead title="Kioski" />
        <EmptyState icon={LuScanLine} title="Skannaa managerin QR-koodi"
          text="Pyydä manageria näyttämään palkinto-QR-koodinsa ja skannaa se laitteen kameralla — tämä sivu avautuu koodilla ja näyttää lunastettavat palkinnot." />
      </Screen>
    );
  }
  if (state === undefined) return <Loading screen />;
  if (state === "error") {
    return (
      <Screen>
        <PageHead title="Kioski" />
        <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>
      </Screen>
    );
  }

  const issued = vouchers.filter((v) => v.status === "issued");

  return (
    <Screen>
      <PageHead title="Kioski" />

      {/* Whose prizes these are */}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2.5, p: 1.75, borderRadius: "var(--radius-card)",
            bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
        <IconCircle icon={LuUser} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.disabled" }}>Manageri</Typography>
          <Typography noWrap sx={{ fontWeight: 800, fontSize: 17, color: "text.primary" }}>{manager.nickname || "Manageri"}</Typography>
        </Box>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {vouchers.length === 0 ? (
        <EmptyState icon={LuTrophy} title="Ei palkintoja" text="Tällä managerilla ei ole palkintoja." />
      ) : (
        <>
          <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>
            {issued.length > 0 ? `Lunastettavat (${issued.length})` : "Kaikki lunastettu"}
          </Typography>
          <ListCard>
            {vouchers.map((v) => {
              const redeemed = v.status === "redeemed";
              return (
                <ListRow key={v.prizeId} divider
                  leading={<IconCircle icon={redeemed ? LuCheck : LuTrophy}
                    tint={redeemed ? "rgba(255,255,255,0.06)" : "rgba(249,115,22,0.15)"}
                    color={redeemed ? "text.disabled" : "primary.main"} />}
                  title={v.prize}
                  subtitle={`${scopeLabel(v)} · Sija ${v.rank}`}
                  trailing={redeemed ? (
                    <Box component="span" sx={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", color: "text.disabled" }}>Lunastettu</Box>
                  ) : (
                    <Button variant="contained" size="small" disabled={!!busyId} onClick={() => redeem(v)}
                      sx={{ minWidth: 132, py: 0.75 }}>
                      {busyId === v.prizeId ? <CircularProgress size={16} sx={{ color: "inherit" }} /> : "Merkitse saaduksi"}
                    </Button>
                  )}
                  sx={{ opacity: redeemed ? 0.6 : 1 }} />
              );
            })}
          </ListCard>
        </>
      )}
    </Screen>
  );
}
