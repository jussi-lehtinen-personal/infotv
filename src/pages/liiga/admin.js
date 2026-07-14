import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, Stack, ButtonBase, CircularProgress, Alert } from "@mui/material";
import { LuPlay, LuFastForward, LuBot, LuRotateCcw, LuImage, LuRefreshCw, LuTrash2 } from "react-icons/lu";
import { Screen, PageHead, Loading } from "./_shared";
import { ahmaliigaAdmin } from "../../lib/ahmaliigaApi";

// Ahmaliiga admin panel — drive the season replay from buttons (no scripts). The
// whole Ahmaliiga mode is already env-admin gated, so this is visible only to the
// root operator. One-time results upload still runs from the machine (noted below).

const Row = ({ k, v }) => (
  <Stack direction="row" spacing={1}
         sx={{ alignItems: "center", justifyContent: "space-between", width: "100%", py: 0.75, borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
    <Typography variant="body2" sx={{ color: "text.secondary" }}>{k}</Typography>
    <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 700, textAlign: "right" }}>{v}</Typography>
  </Stack>
);

const AdminBtn = ({ icon: Icon, label, onClick, busy, disabled, danger }) => (
  <ButtonBase onClick={onClick} disabled={busy || disabled}
    sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2, py: 1.4, borderRadius: "var(--radius-item)",
          justifyContent: "flex-start", textAlign: "left",
          bgcolor: danger ? "rgba(239,68,68,0.08)" : "var(--color-surface)",
          border: `1px solid ${danger ? "rgba(239,68,68,0.4)" : "var(--color-surface-border)"}`,
          color: danger ? "#fca5a5" : "text.primary",
          "&:hover": { borderColor: danger ? "#ef4444" : "primary.main" },
          "&.Mui-disabled": { opacity: 0.5 } }}>
    {busy ? <CircularProgress size={18} sx={{ color: "inherit" }} /> : <Box component={Icon} sx={{ fontSize: 20, flexShrink: 0, color: danger ? "#ef4444" : "primary.main" }} />}
    <Box component="span" sx={{ fontSize: 14, fontWeight: 700 }}>{label}</Box>
  </ButtonBase>
);

export default function LiigaAdmin() {
  const [status, setStatus] = useState(undefined);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => {
    ahmaliigaAdmin("status").then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (action, label, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action); setMsg(null);
    try {
      const r = await ahmaliigaAdmin(action);
      setMsg({ type: "success", text: `${label} ✓ ${JSON.stringify(r).replace(/[{}"]/g, "").slice(0, 120)}` });
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setBusy(""); }
  };

  // Re-settle the already-settled rounds (0..settled-1) in order. Idempotent:
  // recomputes trend + seasonPts without changing the standings or the pointer.
  // Same as `node tools/sim.js resettle`, but from the panel.
  const resettle = async () => {
    const cur = s ? s.settled : 0;
    if (cur < 1) { setMsg({ type: "error", text: "Ei ratkaistuja jaksoja." }); return; }
    if (!window.confirm(`Ratkaistaan jaksot 0…${cur - 1} uudelleen. Idempotentti: sarjataulukko ei muutu, päivittää trendit ja kausipisteet.`)) return;
    setBusy("resettle"); setMsg(null);
    try {
      for (let j = 0; j < cur; j++) await ahmaliigaAdmin("settleRound", { round: j });
      setMsg({ type: "success", text: `Trendit + kausipisteet päivitetty (jaksot 0…${cur - 1}) ✓` });
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setBusy(""); }
  };

  if (status === undefined) return <Loading screen />;
  const s = status && status.active ? status : null;

  return (
    <Screen>
      <PageHead eyebrow="Vain sinulle" title="Admin · kauden toisto" />

      {s ? (
        <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
              border: "1px solid var(--color-surface-border)", px: 2, py: 1, mb: 2 }}>
          <Row k="Kausi" v={s.season} />
          <Row k="Nykyinen jakso" v={`${s.currentRound + 1} / ${s.roundCount}`} />
          <Row k="Ratkaistu" v={`${s.settled} / ${s.roundCount}`} />
          <Row k="Managerit" v={`${s.humans} pelaajaa · ${s.bots} bottia`} />
          <Row k="Tulokset ladattu" v={s.resultsLoaded ? "kyllä" : "EI"} />
          <Row k="Ottelut ladattu" v={s.gamesLoaded ? "kyllä" : "EI"} />
        </Box>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>Kausi ei ole käynnissä. Aja ensin siemennys koneelta.</Alert>
      )}

      {msg && <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Stack spacing={1.25}>
        <AdminBtn icon={LuPlay} label={s ? `Ratkaise jakso ${s.currentRound + 1}` : "Ratkaise jakso"}
                  busy={busy === "settleRound"} disabled={!s} onClick={() => run("settleRound", "Jakso ratkaistu")} />
        <AdminBtn icon={LuFastForward} label="Ratkaise koko kausi loppuun"
                  busy={busy === "settleAll"} disabled={!s} onClick={() => run("settleAll", "Kausi ratkaistu")} />
        <AdminBtn icon={LuBot} label="Lisää / päivitä botit"
                  busy={busy === "seedBots"} disabled={!s} onClick={() => run("seedBots", "Botit lisätty")} />
        <AdminBtn icon={LuImage} label="Hae pelaajakuvat (Jopox)"
                  busy={busy === "enrichPhotos"} disabled={!s} onClick={() => run("enrichPhotos", "Kuvat haettu")} />
        <AdminBtn icon={LuRefreshCw} label="Päivitä trendit + kausipisteet"
                  busy={busy === "resettle"} disabled={!s} onClick={resettle} />
        <AdminBtn icon={LuRotateCcw} label="Nollaa kausi (jakso 0, tyhjennä pisteet)" danger
                  busy={busy === "resetSim"} disabled={!s}
                  onClick={() => run("resetSim", "Kausi nollattu", "Nollataanko kausi jaksoon 0? Pisteet ja hinnat resetoidaan. Pakat, botit ja tulokset säilyvät.")} />
        <AdminBtn icon={LuTrash2} label="Nollaa KAIKKI (joukkueet, budjetit, botit)" danger
                  busy={busy === "resetAll"} disabled={!s}
                  onClick={() => run("resetAll", "Kaikki nollattu", "Nollataanko KAIKKI? Tämä tyhjentää lisäksi kaikki joukkueet (budjetit täyteen), veikkaukset ja botit. Ihmiskäyttäjät säilyvät mutta menettävät joukkueensa. Kortit ja tulokset säilyvät.")} />
      </Stack>

      {s && !s.resultsLoaded && (
        <Typography variant="caption" sx={{ display: "block", mt: 2, color: "text.disabled" }}>
          Tulokset ladataan kerran koneelta: <code>node tools/sim.js setup</code>. Sen jälkeen kaikki hoituu näistä napeista.
        </Typography>
      )}
    </Screen>
  );
}
