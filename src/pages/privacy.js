import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuShieldCheck, LuScale, LuChevronRight, LuTrash2 } from "react-icons/lu";
import { Box, Typography, Card, Stack, Button, Divider } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
import { getMe, getCachedUser, deleteAccount } from "../auth/authClient";

const InfoRow = ({ label, value }) => (
  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.5 }}>
    <Typography variant="body2" sx={{ color: "text.secondary", flexShrink: 0 }}>{label}</Typography>
    <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 700, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</Typography>
  </Stack>
);

const LinkRow = ({ to, icon, label }) => (
  <Stack component={Link} to={to} direction="row" alignItems="center" spacing={1.75} sx={{ px: 2, py: 1.75, WebkitTapHighlightColor: "transparent", "&, &:hover, &:focus, &:active, &:visited": { color: "text.primary", textDecoration: "none" }, "&:hover": { bgcolor: "var(--color-surface)" } }}>
    <Box sx={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(var(--color-primary-rgb),0.13)", border: "1px solid rgba(var(--color-primary-rgb),0.35)", color: "primary.main" }}>{icon}</Box>
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 40, display: "flex", alignItems: "center" }}>
      <Typography sx={{ fontWeight: 700, color: "text.primary", lineHeight: 1.2 }}>{label}</Typography>
    </Box>
    <Box sx={{ alignSelf: "stretch", display: "flex", alignItems: "center", flexShrink: 0 }}><LuChevronRight style={{ opacity: 0.4 }} /></Box>
  </Stack>
);

const Privacy = () => {
  const goBack = useGoBack("/account");
  const navigate = useNavigate();
  const [user, setUser] = useState(getCachedUser);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getMe().then((u) => u && setUser(u)).catch(() => {});
  }, []);

  const handleDelete = async () => {
    setError("");
    setBusy(true);
    try {
      await deleteAccount();
      navigate("/account", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      <MuiHeader title="Tietosuoja" onBack={goBack} />

      <Box sx={{ maxWidth: 460, mx: "auto", px: 2 }}>
        <Stack spacing={1.75}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "text.secondary" }}>Omat tietoni</Typography>

          <Card variant="outlined" sx={{ bgcolor: "background.paper", borderColor: "divider" }}>
            <InfoRow label="Nimimerkki" value={(user && user.nickname) || "—"} />
            {user && user.email && (<><Divider sx={{ borderColor: "var(--color-surface-divider)" }} /><InfoRow label="Sähköposti" value={user.email} /></>)}
            <Divider sx={{ borderColor: "var(--color-surface-divider)" }} />
            <InfoRow label="Google" value={user && user.googleLinked ? "Yhdistetty" : "Ei yhdistetty"} />
          </Card>

          <Card variant="outlined" sx={{ bgcolor: "background.paper", borderColor: "divider" }}>
            <LinkRow to="/legal/privacy" icon={<LuShieldCheck size={20} />} label="Tietosuojaseloste" />
            <Divider sx={{ borderColor: "var(--color-surface-divider)" }} />
            <LinkRow to="/legal/terms" icon={<LuScale size={20} />} label="Käyttöehdot" />
          </Card>

          {!confirmDelete ? (
            <Button
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              startIcon={<LuTrash2 size={18} />}
              sx={{ py: 1.5, borderRadius: 2, fontWeight: 700, textTransform: "none", color: "#f87171", border: "1px solid rgba(239,68,68,0.45)", "&:hover": { bgcolor: "rgba(239,68,68,0.1)" } }}
            >
              Poista tili
            </Button>
          ) : (
            <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <Typography variant="body2" sx={{ color: "#fca5a5", textAlign: "center", lineHeight: 1.45, mb: 1.5 }}>
                Oletko varma? Tämä poistaa tilisi, passkeyt, profiilikuvan ja mahdollisen Google-yhteyden pysyvästi. Tätä ei voi peruuttaa.
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button fullWidth onClick={handleDelete} disabled={busy} sx={{ py: 1.25, borderRadius: 2, fontWeight: 700, textTransform: "none", color: "#fff", bgcolor: "#dc2626", "&:hover": { bgcolor: "#dc2626", filter: "brightness(1.08)" } }}>Poista pysyvästi</Button>
                <Button fullWidth onClick={() => setConfirmDelete(false)} disabled={busy} sx={{ py: 1.25, borderRadius: 2, fontWeight: 700, textTransform: "none", color: "text.secondary", border: "1px solid var(--color-surface-border)", "&:hover": { bgcolor: "var(--color-surface)" } }}>Peruuta</Button>
              </Stack>
            </Box>
          )}

          {error && <Box sx={{ px: 1.5, py: 1.25, borderRadius: 2, textAlign: "center", fontSize: 14, color: "#fca5a5", bgcolor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>{error}</Box>}
        </Stack>
      </Box>
    </Box>
  );
};

export default Privacy;
