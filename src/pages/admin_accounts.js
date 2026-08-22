import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { Box, Typography, Card, Stack, Chip, TextField, IconButton, CircularProgress, Button } from "@mui/material";
import { LuRefreshCw, LuUserX, LuUserCheck, LuUserMinus, LuAlertTriangle } from "react-icons/lu";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
import { getAccountAudit } from "../auth/authClient";

// Admin-only: Microsoft 365 accounts vs Jopox officials.
//   PUUTTUVAT  = official, no @kiekko-ahma.fi account (create one?)
//   OLEMASSA   = official whose account exists
//   STALET     = M365 account matching no current official (former / review)
// Standalone admin tool — reached from /admin, not linked in the public nav.

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 6, fontSize: 14, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

const StatChip = ({ n, label, color }) => (
  <Box sx={{ flex: 1, minWidth: 96, bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", borderRadius: "var(--radius-item)", px: 1.5, py: 1.25, textAlign: "center" }}>
    <Typography sx={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color, fontFamily: "var(--font-family-display)" }}>{n}</Typography>
    <Typography sx={{ fontSize: 11, color: "text.disabled", textTransform: "uppercase", letterSpacing: ".04em", mt: 0.25 }}>{label}</Typography>
  </Box>
);

const EnabledChip = ({ on }) => (
  <Chip size="small" label={on ? "Käytössä" : "Estetty"} sx={{ height: 20, fontSize: 10.5, fontWeight: 700,
    bgcolor: on ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)", color: on ? "#22c55e" : "#ef4444" }} />
);

// One person row. `right` = a status chip; `sub` lines under the name.
const Row = ({ icon: Icon, iconColor, name, sub, right }) => (
  <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", px: 1.75, py: 1.1, borderTop: "1px solid var(--color-surface-divider)", "&:first-of-type": { borderTop: 0 } }}>
    <Box component={Icon} sx={{ fontSize: 18, color: iconColor, flexShrink: 0 }} />
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 14.5, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</Typography>
      {sub && <Typography sx={{ fontSize: 12, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</Typography>}
    </Box>
    {right}
  </Stack>
);

const Section = ({ title, hint, color, children, count }) => (
  <Box sx={{ mb: 2.5 }}>
    <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", mb: 0.75, px: 0.25 }}>
      <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 17, color }}>{title}</Typography>
      <Typography sx={{ fontSize: 13, color: "text.disabled" }}>{count}</Typography>
    </Stack>
    {hint && <Typography sx={{ fontSize: 12, color: "text.disabled", mb: 0.75, px: 0.25 }}>{hint}</Typography>}
    <Card variant="outlined" sx={{ bgcolor: "background.paper", borderColor: "divider", borderRadius: "var(--radius-item)", overflow: "hidden" }}>
      {children}
    </Card>
  </Box>
);

export default function AdminAccounts() {
  const goBack = useGoBack("/admin");
  const [state, setState] = useState({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback((refresh) => {
    if (refresh) setRefreshing(true);
    getAccountAudit({ refresh })
      .then((r) => { setState(r); })
      .catch((e) => setState({ status: "error", error: e.message }))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => { load(false); }, [load]);

  const { status } = state;
  const data = status === "ok" ? state.data : null;

  const f = q.toLocaleLowerCase("fi").trim();
  const match = (o) => !f || (o.name || "").toLowerCase().includes(f) || (o.m365email || o.email || "").toLowerCase().includes(f) || (o.role || "").toLowerCase().includes(f);
  const filtered = useMemo(() => data ? {
    missing: data.missing.filter(match), existing: data.existing.filter(match), stale: data.stale.filter(match),
  } : null, [data, f]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: 6 }}>
      <MuiHeader title="M365-tunnukset" subtitle="Toimihenkilöt vs. tilit" onBack={goBack}
        right={
          <IconButton onClick={() => load(true)} disabled={refreshing || status === "loading"} aria-label="Päivitä" sx={{ color: "text.primary" }}>
            <Box component={LuRefreshCw} sx={{ fontSize: 20, animation: refreshing ? "spin 0.9s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
          </IconButton>
        } />

      <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5, boxSizing: "border-box" }}>
        {status === "loading" && <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress color="primary" /></Box>}
        {status === "unauthorized" && <Status>Kirjaudu ensin sisään (<Box component={Link} to="/account" sx={{ color: "primary.main" }}>Tili</Box>).</Status>}
        {status === "forbidden" && <Status error>{state.error || "Ei käyttöoikeutta."}</Status>}
        {status === "error" && (
          <Status error>Lataus epäonnistui. {state.error}
            <Box sx={{ mt: 2 }}><Button onClick={() => load(true)} variant="outlined" color="primary">Yritä uudelleen</Button></Box>
          </Status>
        )}

        {status === "ok" && filtered && (
          <>
            <Stack direction="row" spacing={1} sx={{ my: 1.5 }}>
              <StatChip n={data.counts.missing} label="Puuttuvat" color="#ef4444" />
              <StatChip n={data.counts.existing} label="Olemassa" color="#22c55e" />
              <StatChip n={data.counts.stale} label="Stalet" color="var(--color-primary)" />
            </Stack>
            <TextField fullWidth size="small" placeholder="Hae nimellä, roolilla tai sähköpostilla…" value={q} onChange={(e) => setQ(e.target.value)}
              sx={{ mb: 2.5, "& .MuiOutlinedInput-root": { bgcolor: "var(--color-surface)" } }} />

            <Section title="PUUTTUVAT" count={filtered.missing.length} color="#ef4444"
              hint="Jopox-toimihenkilö, jolla EI ole @kiekko-ahma.fi-tiliä — pitäisikö luoda?">
              {filtered.missing.map((o, i) => (
                <Row key={i} icon={LuUserX} iconColor="#ef4444" name={o.name}
                  sub={[o.role, o.teams?.join(", "), o.email].filter(Boolean).join(" · ")} />
              ))}
              {filtered.missing.length === 0 && <Box sx={{ px: 1.75, py: 1.5, color: "text.secondary", fontSize: 13 }}>Ei puuttuvia. 🎉</Box>}
            </Section>

            <Section title="STALET" count={filtered.stale.length} color="var(--color-primary)"
              hint="M365-tili, joka ei täsmää nykyiseen toimihenkilöön — entinen tai tarkistettava.">
              {filtered.stale.map((o, i) => (
                <Row key={i} icon={LuUserMinus} iconColor="var(--color-primary)" name={o.name} sub={o.m365email}
                  right={<EnabledChip on={o.enabled} />} />
              ))}
              {filtered.stale.length === 0 && <Box sx={{ px: 1.75, py: 1.5, color: "text.secondary", fontSize: 13 }}>Ei staleja.</Box>}
            </Section>

            <Section title="OLEMASSA" count={filtered.existing.length} color="#22c55e"
              hint="Toimihenkilö, jolla on tili (täsmätty nimellä).">
              {filtered.existing.map((o, i) => (
                <Row key={i} icon={LuUserCheck} iconColor="#22c55e" name={o.name}
                  sub={[o.role, o.teams?.join(", "), o.m365email].filter(Boolean).join(" · ")}
                  right={<EnabledChip on={o.enabled} />} />
              ))}
              {filtered.existing.length === 0 && <Box sx={{ px: 1.75, py: 1.5, color: "text.secondary", fontSize: 13 }}>—</Box>}
            </Section>

            <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "text.disabled", mt: 1 }}>
              <Box component={LuAlertTriangle} sx={{ fontSize: 14, flexShrink: 0 }} />
              <Typography sx={{ fontSize: 11.5, lineHeight: 1.5 }}>
                Täsmäys nimellä (klubi-sähköpostit ≠ Jopoxin henkilökohtaiset). {data.counts.m365} tiliä · {data.counts.officials} toimihenkilöä.
                {data.cached ? " Välimuistista — päivitä kuvakkeesta." : ""}
              </Typography>
            </Stack>
          </>
        )}
      </Box>
    </Box>
  );
}
