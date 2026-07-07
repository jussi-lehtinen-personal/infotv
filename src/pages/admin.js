import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuUsers, LuChevronRight, LuDatabase, LuBarChart3 } from "react-icons/lu";
import { Box, Typography, Card, Stack, CircularProgress } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
import { getMe } from "../auth/authClient";

// Admin hub (/admin). Gated by login + admin (ADMIN_USER_IDS env OR a data
// `admin` role, per /api/me isAdmin). Links to the admin subpages. Reached from
// the NavDrawer (admins only) or directly. See memory: project_admin_roles.

const CopyId = ({ id }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Box
      component="button"
      type="button"
      onClick={() => {
        try {
          navigator.clipboard?.writeText(id);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* ignore */ }
      }}
      sx={{ display: "inline-flex", alignItems: "center", gap: 1.25, mt: 1, px: 1.5, py: 1, cursor: "pointer", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", borderRadius: 2, color: "text.primary", fontFamily: "inherit" }}
    >
      <Box component="code" sx={{ fontSize: 13 }}>{id}</Box>
      <Box component="span" sx={{ fontSize: 12, color: "primary.main", fontWeight: 700 }}>{copied ? "Kopioitu ✓" : "Kopioi"}</Box>
    </Box>
  );
};

const NavCard = ({ to, icon, title, sub }) => (
  <Card component={Link} to={to} variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 1.75, p: 2, bgcolor: "background.paper", borderColor: "divider", WebkitTapHighlightColor: "transparent", "&, &:hover, &:focus, &:active, &:visited": { color: "text.primary", textDecoration: "none" }, "&:hover": { borderColor: "rgba(var(--color-primary-rgb),0.35)" } }}>
    <Box sx={{ width: 42, height: 42, borderRadius: 1.5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, bgcolor: "rgba(var(--color-primary-rgb),0.16)", color: "primary.main" }}>{icon}</Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{title}</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>{sub}</Typography>
    </Box>
    <LuChevronRight style={{ flexShrink: 0, opacity: 0.6 }} />
  </Card>
);

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 5, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

const Admin = () => {
  const goBack = useGoBack("/");
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (cancelled) return;
        if (!u) setState({ status: "unauthorized" });
        else if (!u.isAdmin) setState({ status: "forbidden", youAre: u.userId });
        else setState({ status: "ok" });
      })
      .catch((e) => !cancelled && setState({ status: "error", error: e.message }));
    return () => { cancelled = true; };
  }, []);

  const { status } = state;

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "60px" }}>
      <MuiHeader title="Admin" subtitle="Ylläpito" onBack={goBack} />

      <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5 }}>
        {status === "loading" && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress color="primary" /></Box>}

        {status === "unauthorized" && (
          <Status>Kirjaudu ensin sisään (<Box component={Link} to="/account" sx={{ color: "primary.main" }}>Minä</Box>) ja palaa tänne.</Status>
        )}

        {status === "forbidden" && (
          <Box sx={{ py: 4, color: "text.secondary" }}>
            <Typography sx={{ mb: 1 }}>Tällä tilillä ei ole admin-oikeuksia.</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1 }}>
              Lisää oma userId:si SWA App settings → <Box component="code" sx={{ bgcolor: "var(--color-surface-divider)", px: 0.75, py: 0.25, borderRadius: 1 }}>ADMIN_USER_IDS</Box> (pilkulla erotettu) ja päivitä sivu, tai pyydä toista adminia myöntämään admin-rooli.
            </Typography>
            <CopyId id={state.youAre} />
          </Box>
        )}

        {status === "error" && <Status error>Lataus epäonnistui. {state.error}</Status>}

        {status === "ok" && (
          <Stack spacing={1.5}>
            <NavCard to="/admin/users" icon={<LuUsers />} title="Käyttäjät & roolit" sub="Merkitse käyttäjiä valmentajiksi, toimittajiksi tai admineiksi" />
            <NavCard to="/stats" icon={<LuBarChart3 />} title="Tilastot" sub="Rekisteröityneet käyttäjät" />
            <NavCard to="/admin/backups" icon={<LuDatabase />} title="Varmuuskopiot" sub="Käyttäjä- ja asetusdatan varmuuskopioiden tila" />
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default Admin;
