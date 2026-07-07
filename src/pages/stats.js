import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Box, Typography, Card, Stack, CircularProgress } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
import { getStats } from "../auth/authClient";

// Unlisted admin stats page (/stats) — registered-user metrics from Table
// Storage. Requires login + membership in ADMIN_USER_IDS. Reached from /admin.

const fmtDateTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

const Stat = ({ label, value, sub }) => (
  <Card variant="outlined" sx={{ p: 2, textAlign: "center", bgcolor: "background.paper", borderColor: "divider" }}>
    <Typography sx={{ fontSize: 30, fontWeight: 800, color: "primary.main", lineHeight: 1.1 }}>{value}</Typography>
    <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>{label}</Typography>
    {sub != null && <Typography sx={{ fontSize: 12, color: "text.secondary", opacity: 0.7, mt: 0.25 }}>{sub}</Typography>}
  </Card>
);

const MethodBadge = ({ method }) => {
  const primary = method.split("+")[0];
  const c = primary === "passkey"
    ? { bg: "rgba(var(--color-primary-rgb),0.16)", fg: "var(--color-primary)" }
    : primary === "google" ? { bg: "rgba(96,165,250,0.16)", fg: "#93c5fd" }
    : { bg: "var(--color-surface-divider)", fg: "text.secondary" };
  return <Box sx={{ flexShrink: 0, fontSize: 11, fontWeight: 700, px: 0.875, py: 0.25, borderRadius: 999, bgcolor: c.bg, color: c.fg }}>{method}</Box>;
};

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 5, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

const Stats = () => {
  const goBack = useGoBack("/admin");
  const [state, setState] = useState({ status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStats()
      .then((r) => !cancelled && setState(r))
      .catch((e) => !cancelled && setState({ status: "error", error: e.message }));
    return () => { cancelled = true; };
  }, []);

  const copyId = (id) => {
    try {
      navigator.clipboard?.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const { status } = state;

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "60px" }}>
      <MuiHeader title="Tilastot" subtitle="Rekisteröityneet käyttäjät" onBack={goBack} />

      <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5 }}>
        {status === "loading" && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress color="primary" /></Box>}
        {status === "unauthorized" && <Status>Kirjaudu ensin sisään (<Box component={Link} to="/account" sx={{ color: "primary.main" }}>Tili</Box>) ja palaa tänne.</Status>}
        {status === "error" && <Status error>Tilastojen haku epäonnistui. {state.error}</Status>}

        {status === "forbidden" && (
          <Box sx={{ py: 4, color: "text.secondary" }}>
            <Typography sx={{ mb: 1 }}>Tällä tilillä ei ole admin-oikeuksia.</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>Lisää oma userId:si SWA App settings → <Box component="code" sx={{ bgcolor: "var(--color-surface-divider)", px: 0.75, py: 0.25, borderRadius: 1 }}>ADMIN_USER_IDS</Box> (pilkulla erotettu) ja päivitä sivu.</Typography>
            <Box component="button" type="button" onClick={() => copyId(state.youAre)} sx={{ display: "inline-flex", alignItems: "center", gap: 1.25, mt: 1, px: 1.5, py: 1, cursor: "pointer", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", borderRadius: 2, color: "text.primary", fontFamily: "inherit" }}>
              <Box component="code" sx={{ fontSize: 13 }}>{state.youAre}</Box>
              <Box component="span" sx={{ fontSize: 12, color: "primary.main", fontWeight: 700 }}>{copied ? "Kopioitu ✓" : "Kopioi"}</Box>
            </Box>
          </Box>
        )}

        {status === "ok" && (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" }, gap: 1.25 }}>
              <Stat label="Käyttäjiä yhteensä" value={state.data.totalUsers} />
              <Stat label="Passkey" value={state.data.withPasskey} sub={`${pct(state.data.withPasskey, state.data.totalUsers)} %`} />
              <Stat label="Google linkattu" value={state.data.googleLinked} sub={`${pct(state.data.googleLinked, state.data.totalUsers)} %`} />
              <Stat label="Uusia (7 pv)" value={state.data.new7} />
              <Stat label="Uusia (30 pv)" value={state.data.new30} />
              <Stat label="Profiilikuva" value={state.data.withAvatar} />
            </Box>

            <Typography sx={{ fontWeight: 700, mt: 3, mb: 1.25 }}>Viimeisimmät rekisteröitymiset</Typography>
            <Card variant="outlined" sx={{ bgcolor: "background.paper", borderColor: "divider", overflow: "hidden" }}>
              {state.data.recent.length === 0 && <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>Ei vielä rekisteröitymisiä.</Box>}
              {state.data.recent.map((r, i) => (
                <Stack key={i} direction="row" alignItems="center" spacing={1.25} sx={{ px: 1.75, py: 1.25, fontSize: 14, borderTop: i > 0 ? "1px solid var(--color-surface-divider)" : "none" }}>
                  <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nickname}</Typography>
                  <MethodBadge method={r.method} />
                  <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap", flexShrink: 0 }}>{fmtDateTime(r.createdAt)}</Typography>
                </Stack>
              ))}
            </Card>

            <Typography variant="body2" sx={{ mt: 2, textAlign: "center", color: "text.secondary", opacity: 0.7 }}>
              Päivitetty {fmtDateTime(state.data.generatedAt)} · välimuisti 5 min
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
};

export default Stats;
