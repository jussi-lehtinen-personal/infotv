import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuDatabase, LuRefreshCw, LuCheckCircle, LuAlertTriangle, LuHistory } from "react-icons/lu";
import {
  Box, Typography, Card, Stack, Button, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Checkbox, FormControlLabel, Alert,
} from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
import { getBackups, runBackup, restoreBackup } from "../auth/authClient";

// Admin › Varmuuskopiot (/admin/backups). Shows the latest backup time + a list,
// and a "Luo nyt" button. Backups run daily via a GitHub Actions cron hitting
// /api/exportBackup. See memory: project_backups.

const fmtDateTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}.${p(d.getMinutes())}`;
};

const ago = (iso) => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const h = (Date.now() - t) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min sitten`;
  if (h < 48) return `${Math.round(h)} h sitten`;
  return `${Math.round(h / 24)} pv sitten`;
};

const fmtSize = (n) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// A backup is "stale" (warn) if the newest is older than ~26 h (daily cron).
const isStale = (iso) => {
  const t = new Date(iso).getTime();
  return isNaN(t) || Date.now() - t > 26 * 3_600_000;
};

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 5, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

const AdminBackups = () => {
  const goBack = useGoBack("/admin");
  const [state, setState] = useState({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [restoreTarget, setRestoreTarget] = useState(null); // backup chosen to restore
  const [ahmaOnly, setAhmaOnly] = useState(true);           // restore only Ahmaliiga tables
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState(null);       // { type, text }

  const load = () => {
    getBackups()
      .then((r) => setState(r))
      .catch((e) => setState({ status: "error", error: e.message }));
  };
  useEffect(() => {
    let cancelled = false;
    getBackups()
      .then((r) => !cancelled && setState(r))
      .catch((e) => !cancelled && setState({ status: "error", error: e.message }));
    return () => { cancelled = true; };
  }, []);

  const createNow = async () => {
    setBusy(true);
    setErr("");
    try {
      await runBackup();
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const r = await restoreBackup(restoreTarget.name, ahmaOnly ? "Ahmaliiga" : "");
      setRestoreMsg({ type: "success", text: `Palautettu: ${r.rows} riviä, ${r.tables} taulua${r.filter ? ` (${r.filter})` : ""}.` });
      setRestoreTarget(null);
      load();
    } catch (e) {
      setRestoreMsg({ type: "error", text: e.message });
    } finally {
      setRestoring(false);
    }
  };

  const { status } = state;
  const data = status === "ok" ? state.data : null;
  const latest = data && data.latest;
  const stale = latest && isStale(latest.createdAt);
  const warn = !latest || stale;
  const statusColor = warn ? "var(--color-accent-yellow)" : "var(--color-live)";
  const statusBg = warn ? "rgba(251,191,36,0.16)" : "rgba(74,222,128,0.16)";

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "60px" }}>
      <MuiHeader title="Varmuuskopiot" subtitle="Käyttäjät, roolit, asetukset" onBack={goBack} />

      <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5 }}>
        {status === "loading" && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress color="primary" /></Box>}
        {status === "unauthorized" && <Status>Kirjaudu ensin sisään (<Box component={Link} to="/account" sx={{ color: "primary.main" }}>Tili</Box>).</Status>}
        {status === "forbidden" && <Status>Tällä tilillä ei ole admin-oikeuksia.</Status>}
        {status === "error" && <Status error>Lataus epäonnistui. {state.error}</Status>}

        {status === "ok" && (
          <>
            <Card variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 1.75, p: 2, bgcolor: "background.paper", borderColor: stale ? "rgba(251,191,36,0.5)" : "divider" }}>
              <Box sx={{ width: 42, height: 42, borderRadius: 1.5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, bgcolor: statusBg, color: statusColor }}>
                {latest && !stale ? <LuCheckCircle /> : <LuAlertTriangle />}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {latest ? (
                  <>
                    <Typography sx={{ fontWeight: 700 }}>{fmtDateTime(latest.createdAt)}</Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>Viimeisin varmuuskopio · {ago(latest.createdAt)}{stale ? " · vanhentunut!" : ""}</Typography>
                  </>
                ) : (
                  <>
                    <Typography sx={{ fontWeight: 700 }}>Ei varmuuskopioita</Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>Luo ensimmäinen alta.</Typography>
                  </>
                )}
              </Box>
              <Box sx={{ textAlign: "center", flexShrink: 0 }}>
                <Typography sx={{ fontSize: 26, fontWeight: 800, color: "primary.main", lineHeight: 1 }}>{data.total}</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: "text.secondary", letterSpacing: ".06em" }}>kpl</Typography>
              </Box>
            </Card>

            {err && <Typography sx={{ mt: 1.5, fontSize: 13, color: "var(--color-loss)" }}>{err}</Typography>}
            {restoreMsg && <Alert severity={restoreMsg.type} sx={{ mt: 1.5 }} onClose={() => setRestoreMsg(null)}>{restoreMsg.text}</Alert>}

            <Button
              onClick={createNow}
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <LuRefreshCw />}
              sx={{ my: 2.5, width: "100%", py: 1.5, borderRadius: 2, fontWeight: 700, textTransform: "none", color: "primary.main", border: "1px solid rgba(var(--color-primary-rgb),0.4)", bgcolor: "rgba(var(--color-primary-rgb),0.12)", "&:hover": { bgcolor: "rgba(var(--color-primary-rgb),0.2)" } }}
            >
              {busy ? "Luodaan…" : "Luo varmuuskopio nyt"}
            </Button>

            <Stack spacing={0.75}>
              {data.backups.length === 0 && <Box sx={{ p: 2.5, textAlign: "center", color: "text.secondary" }}>Ei varmuuskopioita vielä.</Box>}
              {data.backups.map((b) => (
                <Stack key={b.name} direction="row" alignItems="center" spacing={1.25} sx={{ px: 1.75, py: 1.25, borderRadius: 2, bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-divider)", fontSize: 14 }}>
                  <LuDatabase style={{ flexShrink: 0, opacity: 0.6 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>{fmtDateTime(b.createdAt)}</Box>
                  <Box sx={{ fontSize: 12, color: "text.secondary" }}>{fmtSize(b.size)}</Box>
                  <Button size="small" startIcon={<LuHistory size={15} />}
                    onClick={() => { setRestoreMsg(null); setAhmaOnly(true); setRestoreTarget(b); }}
                    sx={{ flexShrink: 0, textTransform: "none", color: "text.secondary", minWidth: 0 }}>Palauta</Button>
                </Stack>
              ))}
            </Stack>

            <Typography variant="body2" sx={{ mt: 2, color: "text.secondary", opacity: 0.8, lineHeight: 1.5 }}>
              Automaattinen varmuuskopio kerran vuorokaudessa (GitHub Actions). Retentio: 14 päivittäistä + 8 viikoittaista + 6 kuukausittaista.
            </Typography>
          </>
        )}
      </Box>

      {/* Restore confirm — DESTRUCTIVE */}
      <Dialog open={!!restoreTarget} onClose={() => !restoring && setRestoreTarget(null)}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LuAlertTriangle color="var(--color-accent-yellow)" /> Palauta varmuuskopio?
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            Palautetaan tila hetkestä <b>{restoreTarget && fmtDateTime(restoreTarget.createdAt)}</b>. Tämä <b>ylikirjoittaa nykyiset tiedot</b> tämän varmuuskopion riveillä (kopion jälkeen lisätyt rivit jäävät).
            <FormControlLabel
              sx={{ mt: 1.5, display: "flex" }}
              control={<Checkbox checked={ahmaOnly} onChange={(e) => setAhmaOnly(e.target.checked)} />}
              label="Vain Ahmaliiga-taulut (suositus)"
            />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {ahmaOnly ? "Käyttäjät, roolit ja varaukset jäävät koskematta." : "Palauttaa KAIKKI taulut (käyttäjät, tunnistautumiset, varaukset ml.)."}
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRestoreTarget(null)} disabled={restoring} sx={{ color: "text.secondary" }}>Peruuta</Button>
          <Button onClick={doRestore} disabled={restoring} variant="contained" color="warning"
            startIcon={restoring ? <CircularProgress size={16} color="inherit" /> : <LuHistory size={16} />}>
            {restoring ? "Palautetaan…" : "Palauta"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminBackups;
