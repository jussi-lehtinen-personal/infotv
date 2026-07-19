import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Box, Typography, Stack, Button, CircularProgress, Alert } from "@mui/material";
import { LuTrophy, LuCheck, LuScanLine, LuUser } from "react-icons/lu";
import { Html5Qrcode } from "html5-qrcode";
import { Screen, PageHead, Loading, EmptyState, ListCard, ListRow, IconCircle } from "./_shared";
import { getAhmaliigaVouchers, redeemAhmaliigaVoucher } from "../../lib/ahmaliigaApi";

// Kioski (F10) — staff mark a manager's prize collected at the rink. Open the page
// and scan the manager's QR with the in-page camera; it opens /ahmaliiga/kiosk?c=CODE
// and shows their prizes. Gated to the `kioski` role or admins server-side.

const scopeLabel = (v) => (v.scope === "season" ? "Koko kausi" : `Jakso ${(v.round ?? 0) + 1}`);

// The manager QR encodes a full .../ahmaliiga/kiosk?c=CODE URL — pull the code out
// (or accept a bare code if someone encoded just that).
const codeFromScan = (text) => {
  try { return new URL(text).searchParams.get("c") || text; } catch { return text; }
};

// In-page QR scanner (camera). Calls onDetected(code) once, then stops the camera.
function KioskScanner({ onDetected }) {
  const [starting, setStarting] = useState(true);
  const [err, setErr] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode("kiosk-reader", { verbose: false });
    let live = true;
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (text) => {
          if (doneRef.current) return;
          doneRef.current = true;
          scanner.stop().catch(() => {}).finally(() => onDetected(codeFromScan(text)));
        },
        () => { /* per-frame no-match — ignore */ }
      )
      .then(() => { if (live) setStarting(false); })
      .catch((e) => { if (live) { setErr(String((e && e.message) || e)); setStarting(false); } });

    return () => {
      live = false;
      try {
        scanner.stop().then(() => scanner.clear()).catch(() => { try { scanner.clear(); } catch { /* ignore */ } });
      } catch { /* ignore */ }
    };
  }, [onDetected]);

  return (
    <Box sx={{ textAlign: "center" }}>
      <Box id="kiosk-reader" sx={{ width: "100%", maxWidth: 340, mx: "auto", aspectRatio: "1 / 1", borderRadius: "var(--radius-card)",
            overflow: "hidden", bgcolor: "#000", border: "1px solid var(--color-surface-border)",
            "& video": { width: "100% !important", height: "100% !important", objectFit: "cover" } }} />
      {starting && !err && (
        <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "center", alignItems: "center", color: "text.secondary" }}>
          <CircularProgress size={16} /><Typography variant="body2">Käynnistetään kamera…</Typography>
        </Stack>
      )}
      {err ? (
        <Alert severity="warning" sx={{ mt: 2, textAlign: "left" }}>
          Kameraa ei saatu käyttöön ({err}). Salli kameran käyttö selaimen asetuksista, tai skannaa managerin QR laitteen omalla kameralla.
        </Alert>
      ) : (
        <Typography sx={{ mt: 2, fontSize: 13.5, color: "text.secondary" }}>Kohdista managerin palkinto-QR ruutuun.</Typography>
      )}
    </Box>
  );
}

export default function LiigaKiosk() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const code = params.get("c");

  const [manager, setManager] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [error, setError] = useState("");
  const [loadState, setLoadState] = useState("idle"); // idle | loading | ready | error
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    if (!code) { setLoadState("idle"); return; }
    let cancelled = false;
    setLoadState("loading");
    getAhmaliigaVouchers(code)
      .then((d) => { if (cancelled) return; setManager({ userId: d.userId, nickname: d.nickname }); setVouchers(d.vouchers || []); setLoadState("ready"); })
      .catch((e) => { if (cancelled) return; setError(e.message || "Lataus epäonnistui."); setLoadState("error"); });
    return () => { cancelled = true; };
  }, [code]);

  const onDetected = useCallback((c) => { if (c) navigate(`/ahmaliiga/kiosk?c=${encodeURIComponent(c)}`); }, [navigate]);

  const redeem = async (v) => {
    setBusyId(v.prizeId); setError("");
    try {
      await redeemAhmaliigaVoucher(manager.userId, v.prizeId);
      setVouchers((prev) => prev.map((x) => (x.prizeId === v.prizeId ? { ...x, status: "redeemed" } : x)));
    } catch (e) {
      setError(e.message || "Lunastus epäonnistui.");
    } finally { setBusyId(""); }
  };

  // No code yet → scan a manager's QR with the camera.
  if (!code) {
    return (
      <Screen>
        <PageHead eyebrow="Kioski" title="Skannaa QR" />
        <KioskScanner onDetected={onDetected} />
      </Screen>
    );
  }
  if (loadState === "loading" || loadState === "idle") return <Loading screen />;
  if (loadState === "error") {
    return (
      <Screen>
        <PageHead title="Kioski" right={<Button size="small" startIcon={<LuScanLine size={16} />} onClick={() => navigate("/ahmaliiga/kiosk")} sx={{ textTransform: "none" }}>Skannaa</Button>} />
        <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>
      </Screen>
    );
  }

  const issued = vouchers.filter((v) => v.status === "issued");

  return (
    <Screen>
      <PageHead title="Kioski"
        right={<Button size="small" startIcon={<LuScanLine size={16} />} onClick={() => navigate("/ahmaliiga/kiosk")} sx={{ textTransform: "none" }}>Skannaa toinen</Button>} />

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
