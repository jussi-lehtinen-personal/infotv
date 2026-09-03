import React, { useState, useEffect, useCallback } from "react";
import { Box, Typography, Stack, ButtonBase, CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button } from "@mui/material";
import { LuPlay, LuFastForward, LuRotateCcw, LuImage, LuRefreshCw, LuTrash2, LuWallet, LuClock, LuCalendarDays, LuZap, LuDownload, LuShieldCheck, LuTrophy, LuUsers, LuRocket, LuArchive } from "react-icons/lu";
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
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedText, setSeedText] = useState("");

  const load = useCallback(() => {
    ahmaliigaAdmin("status").then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (action, label, confirmText, extra, busyKey) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(busyKey || action); setMsg(null);
    try {
      const r = await ahmaliigaAdmin(action, extra);
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

  // Rewind ALL card prices to seed, then replay the settled rounds cleanly. Unlike
  // plain "Päivitä trendit" (which steps each settle from the CURRENT price and so can't
  // undo an earlier buggy move), this makes every card take one value step from the same
  // seed anchor → consistent price order. Standings/points unchanged.
  const resetAndResettle = async () => {
    const cur = s ? s.settled : 0;
    if (!window.confirm(`NOLLAA kaikkien korttien hinnat seediin ja ratkaise jaksot 0…${Math.max(0, cur - 1)} uudelleen puhtaalta ankkurilta. Sarjataulukko/pisteet EIVÄT muutu — vain hinnat. Jatketaanko?`)) return;
    setBusy("resetPrices"); setMsg(null);
    try {
      const r = await ahmaliigaAdmin("resetPrices", {});
      for (let j = 0; j < cur; j++) await ahmaliigaAdmin("settleRound", { round: j });
      setMsg({ type: "success", text: `Hinnat nollattu (${r.reset ?? "?"} korttia) + ratkaistu puhtaasti (jaksot 0…${Math.max(0, cur - 1)}) ✓` });
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setBusy(""); }
  };

  // Seed a NEW season from a pasted live-seed JSON (tools/gen-live-seed.js output). Uses
  // the admin's own session (no token copying). The current active season goes inactive
  // but is RETAINED — verified safe (transition test). Seed is generated offline because
  // the prior index needs the previous season's box scores.
  const seedLive = async () => {
    let parsed;
    try { parsed = JSON.parse(seedText); } catch { setMsg({ type: "error", text: "JSON ei kelpaa — tarkista liitos." }); return; }
    if (!parsed || !Array.isArray(parsed.cards)) { setMsg({ type: "error", text: "seed.cards puuttuu (live-seed käyttää []). Väärä tiedosto?" }); return; }
    if (!window.confirm(`Seedataan kausi "${parsed.season}". Nykyinen aktiivinen kausi DEAKTIVOITUU mutta SÄILYY (rivejä ei tyhjennetä). Jatketaanko?`)) return;
    setBusy("seedSeason"); setMsg(null);
    try {
      const r = await ahmaliigaAdmin("seedSeason", { seed: parsed });
      setMsg({ type: "success", text: `Kausi ${parsed.season} seedattu ✓ ${JSON.stringify(r).replace(/[{}"]/g, "").slice(0, 100)}` });
      setSeedOpen(false); setSeedText(""); load();
    } catch (e) { setMsg({ type: "error", text: e.message }); } finally { setBusy(""); }
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
          <Row k="Sim-päivä" v={s.simDate || "—"} />
          <Row k="Automaatti" v={s.autoStep ? "PÄÄLLÄ" : "pois"} />
          <Row k="Kello" v={s.realClock ? "REAALI (oikea päivä)" : "sim (replay)"} />
          <Row k="Nykyinen jakso" v={`${s.currentRound + 1} / ${s.roundCount}`} />
          <Row k="Ratkaistu" v={`${s.settled} / ${s.roundCount}`} />
          <Row k="Pelaajia" v={`${s.humans} rekisteröitynyt · ${s.squadsBuilt ?? 0} pakkaa rakennettu`} />
          <Row k="Pelit synkattu" v={s.gamesLoaded ? "kyllä" : "EI"} />
          {s.livePool && <Row k="Live-pooli" v={`${s.players ?? 0} pelaajaa · ${s.teams ?? 0} joukkuetta`} />}
          {s.livePool && <Row k="Avautuu" v={s.startAt ? new Date(String(s.startAt).replace(" ", "T")).toLocaleString("fi-FI", { dateStyle: "short", timeStyle: "short" }) : "heti (ei asetettu)"} />}
        </Box>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>Kausi ei ole käynnissä. Alusta kausi ensin koneelta.</Alert>
      )}

      {msg && <Alert severity={msg.type} sx={{ mb: 2 }} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <Stack spacing={1.25}>
        {/* Sim clock — step the replay a day/week, or let the hourly cron run it */}
        <AdminBtn icon={s && s.autoStep ? LuZap : LuClock}
                  label={s && s.autoStep ? "Automaatti: PÄÄLLÄ — sammuta" : "Käynnistä automaatti"}
                  busy={busy === "setAuto"} disabled={!s}
                  onClick={() => run("setAuto", s && s.autoStep ? "Automaatti sammutettu" : "Automaatti käynnistetty", null, { on: !(s && s.autoStep) }, "setAuto")} />
        <AdminBtn icon={LuCalendarDays}
                  label={s && s.realClock ? "Kello: REAALI — vaihda simiin" : "Vaihda reaalikelloon (F2.5)"}
                  busy={busy === "setClock"} disabled={!s}
                  onClick={() => run("setClock", s && s.realClock ? "Sim-kello käytössä" : "Reaalikello käytössä",
                    s && s.realClock
                      ? "Vaihdetaanko takaisin sim-kelloon (replay)?"
                      : "VAIHDA REAALIKELLOON? Sim-kello synkkaa tähän päivään joka tikki ja jaksot ratkeavat oikean päivämäärän mukaan. Älä tee tätä kesken sim-testipelin.",
                    { real: !(s && s.realClock) }, "setClock")} />
        <AdminBtn icon={LuClock} label="Steppaa 1 päivä"
                  busy={busy === "step1"} disabled={!s}
                  onClick={() => run("step", "Steppasi 1 pv", null, { days: 1 }, "step1")} />
        <AdminBtn icon={LuCalendarDays} label="Steppaa 1 viikko"
                  busy={busy === "step7"} disabled={!s}
                  onClick={() => run("step", "Steppasi 1 vk", null, { days: 7 }, "step7")} />
        <AdminBtn icon={LuPlay} label={s ? `Ratkaise jakso ${s.currentRound + 1}` : "Ratkaise jakso"}
                  busy={busy === "settleRound"} disabled={!s} onClick={() => run("settleRound", "Jakso ratkaistu")} />
        <AdminBtn icon={LuFastForward} label="Ratkaise koko kausi loppuun"
                  busy={busy === "settleAll"} disabled={!s} onClick={() => run("settleAll", "Kausi ratkaistu")} />
        <AdminBtn icon={LuTrophy} label={s && s.settled ? `Luo jakson ${s.settled} palkinnot (top 3)` : "Luo jakson palkinnot (top 3)"}
                  busy={busy === "genRound"} disabled={!s || !s.settled}
                  onClick={() => run("generateVouchers", "Jakson palkinnot luotu", null, { scope: "round", round: s.settled - 1 }, "genRound")} />
        <AdminBtn icon={LuTrophy} label="Luo kauden palkinnot (top 3)"
                  busy={busy === "genSeason"} disabled={!s}
                  onClick={() => run("generateVouchers", "Kauden palkinnot luotu", null, { scope: "season" }, "genSeason")} />
        <AdminBtn icon={LuImage} label="Hae pelaajakuvat (Jopox)"
                  busy={busy === "enrichPhotos"} disabled={!s} onClick={() => run("enrichPhotos", "Kuvat haettu")} />
        <AdminBtn icon={LuRefreshCw} label="Päivitä trendit + kausipisteet"
                  busy={busy === "resettle"} disabled={!s} onClick={resettle} />
        <AdminBtn icon={LuRotateCcw} label="Nollaa hinnat seediin + ratkaise puhtaasti"
                  busy={busy === "resetPrices"} disabled={!s} onClick={resetAndResettle} />
        <AdminBtn icon={LuWallet} label="Korjaa budjettisaldot"
                  busy={busy === "recomputeBanks"} disabled={!s}
                  onClick={() => run("recomputeBanks", "Saldot korjattu")} />
        {/* One-time credit after the 2026-09-03 "free until kickoff" fix — refunds any
            transfer a manager burned before the rule was corrected. Cards/captain/prices/
            scores untouched, only the transfer counter. */}
        <AdminBtn icon={LuRotateCcw} label="Palauta kaikkien vaihdot (0/5)"
                  busy={busy === "resetTransfers"} disabled={!s}
                  onClick={() => run("resetTransfers", "Vaihdot palautettu", "Nollataanko KAIKKIEN pelaajien tämän jakson käytetyt vaihdot (takaisin 0/5)? Kortit, kapteeni, hinnat ja pisteet EIVÄT muutu.", {}, "resetTransfers")} />
        <AdminBtn icon={LuDownload} label="Synkkaa pelit (worker + ID:t)"
                  busy={busy === "syncGames"} disabled={!s}
                  onClick={() => run("syncGames", "Pelit synkattu")} />
        {/* Live-beta: seed a new season (paste JSON), fill the pool, set the launch time */}
        <AdminBtn icon={LuRocket} label="Seedaa live-kausi (liitä JSON)"
                  busy={busy === "seedSeason"} onClick={() => { setSeedText(""); setSeedOpen(true); }} />
        <AdminBtn icon={LuUsers} label="Täydennä kortisto (Jopox-rosterit)"
                  busy={busy === "reconcileCards"} disabled={!s}
                  onClick={() => run("reconcileCards", "Kortisto täydennetty")} />
        <AdminBtn icon={LuRocket} label={s && s.startAt ? `Avautumisaika: ${new Date(String(s.startAt).replace(" ", "T")).toLocaleString("fi-FI", { dateStyle: "short", timeStyle: "short" })}` : "Aseta avautumisaika (launch)"}
                  busy={busy === "setStart"} disabled={!s}
                  onClick={() => {
                    const v = window.prompt("Avautumisaika ISO-muodossa (esim. 2026-08-12T12:00).\nTyhjä = avaa heti kaikille.", (s && s.startAt) || "2026-08-12T12:00");
                    if (v === null) return;
                    run("setStart", v ? "Avautumisaika asetettu" : "Avautumisaika poistettu (avoin kaikille)", null, { startAt: v }, "setStart");
                  }} />
        <AdminBtn icon={LuShieldCheck} label="Validoi tulokset (live vs. esilaskettu)"
                  busy={busy === "validateResults"} disabled={!s}
                  onClick={() => run("validateResults", "Tulokset validoitu")} />
        {/* Safe backup of the whole active season to a gzip blob (archive-to-file). Take
            this BEFORE a hard reset / re-seed to keep the old season for history. */}
        <AdminBtn icon={LuArchive} label="Arkistoi kausi (varmuuskopio)"
                  busy={busy === "archiveSeason"} disabled={!s}
                  onClick={() => run("archiveSeason", "Kausi arkistoitu", "Arkistoidaanko nykyinen kausi? Turvallinen varmuuskopio (gzip-blob) — ei muuta live-dataa. Ota tämä ennen kovaa resettiä.", {}, "archiveSeason")} />
        <AdminBtn icon={LuRotateCcw} label="Nollaa kausi (jakso 0, tyhjennä pisteet)" danger
                  busy={busy === "resetSim"} disabled={!s}
                  onClick={() => run("resetSim", "Kausi nollattu", "Nollataanko kausi jaksoon 0? Pisteet, hinnat ja veikkaukset resetoidaan. Pakat ja tulokset säilyvät.")} />
        <AdminBtn icon={LuTrash2} label="Nollaa KAIKKI (joukkueet, budjetit)" danger
                  busy={busy === "resetAll"} disabled={!s}
                  onClick={() => run("resetAll", "Kaikki nollattu", "Nollataanko KAIKKI? Tämä tyhjentää lisäksi kaikki joukkueet (budjetit täyteen) ja veikkaukset. Ihmiskäyttäjät säilyvät mutta menettävät joukkueensa. Kortit ja tulokset säilyvät.")} />
      </Stack>

      {s && !s.gamesLoaded && (
        <Typography variant="caption" sx={{ display: "block", mt: 2, color: "text.disabled" }}>
          Aja ensin <b>Synkkaa pelit</b> (hakee otteluohjelman workerista). Tulokset lasketaan tulospalvelusta automaattisesti kun jakso ratkeaa — ei esiseedattua dataa.
        </Typography>
      )}

      <Dialog open={seedOpen} onClose={() => setSeedOpen(false)} fullWidth maxWidth="sm"
              slotProps={{ paper: { sx: { bgcolor: "var(--color-bg)", backgroundImage: "none", border: "1px solid var(--color-surface-border)" } } }}>
        <DialogTitle sx={{ color: "text.primary", fontWeight: 800 }}>Seedaa live-kausi</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
            Generoi seed koneelta ja liitä tuloste tähän:<br />
            <Box component="code" sx={{ display: "block", mt: 0.5, p: 1, borderRadius: 1, bgcolor: "var(--color-surface)", fontSize: 12, color: "text.primary", overflowX: "auto" }}>
              node tools/gen-live-seed.js 2027 2026 --start=2026-08-11 --weeks=1 --count=3 --opens=2026-08-12T12:00 --u15flat=40
            </Box>
            <Box component="span" sx={{ display: "block", mt: 1, color: "text.disabled", fontSize: 12 }}>
              → liitä <b>tools/data/live-seed-2027.json</b>. Uusi kausi-id → nykyinen kausi säilyy (deaktivoituu).
            </Box>
          </Typography>
          <TextField multiline minRows={6} maxRows={14} fullWidth placeholder='{ "season": "2027", "cards": [], ... }'
                     value={seedText} onChange={(e) => setSeedText(e.target.value)}
                     slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: 12, color: "text.primary" } } }}
                     sx={{ "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-surface-border)" } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSeedOpen(false)} sx={{ color: "text.secondary" }}>Peruuta</Button>
          <Button onClick={seedLive} disabled={!seedText.trim() || busy === "seedSeason"} variant="contained"
                  sx={{ bgcolor: "primary.main", color: "var(--color-on-primary)", fontWeight: 800 }}>
            {busy === "seedSeason" ? <CircularProgress size={18} sx={{ color: "inherit" }} /> : "Seedaa"}
          </Button>
        </DialogActions>
      </Dialog>
    </Screen>
  );
}
