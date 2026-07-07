import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { LuKeyRound, LuLogOut, LuCheck, LuArrowLeft, LuPencil, LuBell, LuSettings, LuShield, LuChevronRight } from "react-icons/lu";
import { Box, Typography, Card, Stack, Avatar, IconButton, Button, Chip, Dialog, TextField, Divider, CircularProgress } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { GoogleButton } from "../auth/GoogleButton";
import { useGoBack } from "../hooks/useGoBack";
import {
  getMe, getCachedUser, getAuthConfig, registerPasskey, loginPasskey,
  linkGoogle, loginGoogle, unlinkGoogle, uploadAvatar, renameNickname, logout,
} from "../auth/authClient";

// Crop+resize a picked image to a square webp blob, client-side (offscreen
// canvas, no server image lib). Center-crop (cover) to `size`px.
async function resizeToBlob(file, size = 256) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  if (bitmap.close) bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Kuvan käsittely epäonnistui."))), "image/webp", 0.85);
  });
}

const HERO = "/profile_hero.webp";

// "Jussi Lehtinen" -> "JL"; single word -> first two chars.
const initials = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// Role tags (see project_admin_roles). Team-scoped roles append the team.
const ROLE_LABELS = { pelaaja: "Pelaaja", valmentaja: "Valmentaja", toimihenkilo: "Toimihenkilö", media: "Media", admin: "Admin" };
const TEAM_ROLES = new Set(["pelaaja", "valmentaja", "toimihenkilo"]);
const roleTag = (r) => (TEAM_ROLES.has(r.role) ? `${ROLE_LABELS[r.role] || r.role} · ${r.team}` : ROLE_LABELS[r.role] || r.role);
const ROLE_CHIP = {
  pelaaja: { bg: "rgba(167,139,250,0.20)", fg: "#c4b5fd" },
  valmentaja: { bg: "rgba(var(--color-primary-rgb),0.18)", fg: "var(--color-primary)" },
  toimihenkilo: { bg: "rgba(45,212,191,0.18)", fg: "#5eead4" },
  media: { bg: "rgba(96,165,250,0.18)", fg: "#93c5fd" },
  admin: { bg: "rgba(74,222,128,0.18)", fg: "var(--color-live)" },
};

const MENU = [
  { key: "ilmoitukset", Icon: LuBell, title: "Ilmoitukset", sub: "Hallinnoi ilmoituksia" },
  { key: "asetukset", Icon: LuSettings, title: "Asetukset", sub: "Sovelluksen asetukset", to: "/settings" },
  { key: "tietosuoja", Icon: LuShield, title: "Tietosuoja", sub: "Tietosuoja ja käyttöehdot", to: "/account/privacy" },
];

// Auth buttons match Google's rendered button (280px pill) so the login stack is consistent.
const authBtnSx = { width: 280, maxWidth: "100%", py: 1.25, borderRadius: 999, fontWeight: 700, textTransform: "none", color: "text.primary", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", "&:hover": { bgcolor: "var(--color-surface-divider)" } };
const primaryBtnSx = { py: 1.5, borderRadius: 2, fontWeight: 700, textTransform: "none", color: "primary.contrastText", bgcolor: "primary.main", "&:hover": { bgcolor: "primary.main", filter: "brightness(1.05)" } };
const ghostBtnSx = { py: 1.5, borderRadius: 2, fontWeight: 700, textTransform: "none", color: "text.secondary", border: "1px solid var(--color-surface-border)", "&:hover": { bgcolor: "var(--color-surface)" } };

const Notice = ({ children }) => (
  <Box sx={{ px: 1.5, py: 1.25, borderRadius: 2, textAlign: "center", fontSize: 14, color: "text.secondary", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>{children}</Box>
);
const ErrorBox = ({ children }) => (
  <Box sx={{ px: 1.5, py: 1.25, borderRadius: 2, textAlign: "center", fontSize: 14, color: "#fca5a5", bgcolor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>{children}</Box>
);

const Account = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nickname, setNickname] = useState("");
  const [clientId, setClientId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const supported = browserSupportsWebAuthn();
  const goBack = useGoBack("/");
  const fileInputRef = useRef(null);

  const refresh = useCallback(async () => {
    const cached = getCachedUser();
    if (cached) setUser(cached);
    setLoading(!cached);
    try {
      setUser(await getMe());
    } catch {
      if (!cached) setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    getAuthConfig().then((c) => setClientId(c.googleClientId || ""));
  }, [refresh]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setUser(await registerPasskey(nickname.trim()));
      setShowCreate(false);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handleLogin = async () => {
    setError("");
    setBusy(true);
    try {
      setUser(await loginPasskey());
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setNickname("");
    setNotice("");
    setError("");
    setShowCreate(false);
    setShowRename(false);
  };

  const handleRename = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setUser(await renameNickname(renameValue.trim()));
      setShowRename(false);
      setNotice("Nimimerkki päivitetty.");
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  // Stable callbacks so the Google button isn't re-rendered each tick.
  const handleLinkGoogle = useCallback(async (credential) => {
    setError("");
    setBusy(true);
    try {
      setUser(await linkGoogle(credential));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }, []);

  const handleLoginGoogle = useCallback(async (credential) => {
    setError("");
    setBusy(true);
    try {
      setUser(await loginGoogle(credential));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }, []);

  const handleUnlinkGoogle = async () => {
    setError("");
    setBusy(true);
    try {
      setUser(await unlinkGoogle());
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handleAvatarPick = () => fileInputRef.current && fileInputRef.current.click();
  const handleAvatarFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const blob = await resizeToBlob(file, 256);
      const avatar = await uploadAvatar(blob);
      setUser((u) => (u ? { ...u, avatar } : u));
      setNotice("Profiilikuva päivitetty.");
    } catch (err) {
      setError(err.message || "Kuvan lataus epäonnistui.");
    }
    setBusy(false);
  };

  return (
    <>
      {supported && !loading && user ? (
        // ===== Signed-in "MINÄ" view =====
        <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
          {/* HERO */}
          <Box sx={{ position: "relative", overflow: "hidden", backgroundImage: `url(${HERO})`, backgroundSize: "cover", backgroundPosition: "center", pb: 3 }}>
            <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,10,15,.35) 0%, rgba(8,10,15,.15) 30%, rgba(8,10,15,.6) 78%, var(--color-bg) 100%)" }} />
            <Box sx={{ position: "relative" }}>
              <Stack direction="row" alignItems="center" sx={{ px: 1.5, pt: "calc(env(safe-area-inset-top) + 10px)" }}>
                <IconButton onClick={goBack} aria-label="Takaisin" sx={{ color: "#fff", bgcolor: "rgba(0,0,0,.38)", backdropFilter: "blur(6px)", "&:hover": { bgcolor: "rgba(0,0,0,.5)" } }}><LuArrowLeft /></IconButton>
                <Typography sx={{ flex: 1, textAlign: "center", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>Minä</Typography>
                <Box sx={{ width: 40, flexShrink: 0 }} />
              </Stack>

              {/* textAlign center + inline-block children centre reliably (flex
                  alignItems was leaving these stretched/left). */}
              <Box sx={{ px: 2, pt: 2, textAlign: "center" }}>
                <Box sx={{ position: "relative", width: 96, height: 96, display: "inline-block" }}>
                  <Avatar src={user.avatar || undefined} sx={{ width: 96, height: 96, fontSize: 30, fontWeight: 800, bgcolor: "rgba(var(--color-primary-rgb),0.25)", color: "primary.main", border: "3px solid rgba(255,255,255,0.15)" }}>{initials(user.nickname)}</Avatar>
                  <IconButton onClick={handleAvatarPick} disabled={busy} aria-label="Vaihda kuva" sx={{ position: "absolute", right: -4, bottom: -4, width: 32, height: 32, bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.main", filter: "brightness(1.05)" } }}><LuPencil size={16} /></IconButton>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarFile} style={{ display: "none" }} />
                </Box>

                {/* name centred on the avatar; the pencil floats to its right without shifting it */}
                <Box sx={{ position: "relative", display: "inline-block", mt: 1.5 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 22, textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>{user.nickname || "Käyttäjä"}</Typography>
                  <IconButton size="small" onClick={() => { setRenameValue(user.nickname || ""); setError(""); setShowRename(true); }} disabled={busy} aria-label="Muokkaa nimimerkkiä" sx={{ position: "absolute", left: "100%", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.7)" }}><LuPencil size={15} /></IconButton>
                </Box>

                <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.75)" }}>Kirjautunut</Typography>
                {user.email && <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.6)" }}>{user.email}</Typography>}
                {user.roles && user.roles.length > 0 && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 0.75, mt: 1 }}>
                    {user.roles.map((r) => {
                      const c = ROLE_CHIP[r.role] || { bg: "var(--color-surface-divider)", fg: "text.secondary" };
                      return <Chip key={`${r.role}:${r.team || ""}`} label={roleTag(r)} size="small" sx={{ fontWeight: 700, bgcolor: c.bg, color: c.fg }} />;
                    })}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>

          {/* BODY */}
          <Box sx={{ maxWidth: 480, mx: "auto", px: 1.5, pt: 2 }}>
            <Stack spacing={1.5}>
              {user.googleLinked ? (
                <Stack spacing={0.5} sx={{ textAlign: "center" }}>
                  <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ color: "var(--color-live)", fontSize: 13 }}>
                    <LuCheck style={{ flexShrink: 0 }} /><span>Google yhdistetty — kirjautuminen toimii kaikilla laitteilla</span>
                  </Stack>
                  {user.hasPasskey && (
                    <Button onClick={handleUnlinkGoogle} disabled={busy} sx={{ alignSelf: "center", p: 0.5, minWidth: 0, color: "primary.main", fontWeight: 700, textTransform: "none", "&:hover": { bgcolor: "transparent", textDecoration: "underline" } }}>Poista Google-yhteys</Button>
                  )}
                </Stack>
              ) : clientId ? (
                <Stack spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>Yhdistä Google monilaitekäyttöön</Typography>
                  <Box sx={{ display: "flex", justifyContent: "center", width: "100%" }}><GoogleButton clientId={clientId} onCredential={handleLinkGoogle} text="continue_with" /></Box>
                </Stack>
              ) : null}

              <Card variant="outlined" sx={{ bgcolor: "background.paper", borderColor: "divider" }}>
                {MENU.map(({ key, Icon, title, sub, to }, i) => {
                  const rowSx = { display: "flex", alignItems: "center", gap: 1.75, px: 2, py: 1.75, width: "100%", textAlign: "left", cursor: "pointer", bgcolor: "transparent", border: 0, fontFamily: "inherit", WebkitTapHighlightColor: "transparent", "&, &:hover, &:focus, &:active, &:visited": { color: "text.primary", textDecoration: "none" }, "&:hover": { bgcolor: "var(--color-surface)" } };
                  const inner = (
                    <>
                      <Box sx={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(var(--color-primary-rgb),0.14)", color: "primary.main" }}><Icon size={20} /></Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{title}</Typography>
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>{sub}</Typography>
                      </Box>
                      <LuChevronRight style={{ flexShrink: 0, opacity: 0.5 }} />
                    </>
                  );
                  return (
                    <React.Fragment key={key}>
                      {i > 0 && <Divider sx={{ borderColor: "var(--color-surface-divider)" }} />}
                      {to ? <Box component={Link} to={to} sx={rowSx}>{inner}</Box> : <Box component="button" type="button" onClick={() => setNotice(`${title} – tulossa pian.`)} sx={rowSx}>{inner}</Box>}
                    </React.Fragment>
                  );
                })}
              </Card>

              <Button onClick={handleLogout} disabled={busy} startIcon={<LuLogOut size={18} />} sx={ghostBtnSx}>Kirjaudu ulos</Button>

              {notice && <Notice>{notice}</Notice>}
              {error && <ErrorBox>{error}</ErrorBox>}
            </Stack>
          </Box>
        </Box>
      ) : (
        // ===== Loading / signed-out view =====
        <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
          <MuiHeader title="Minä" onBack={goBack} />

          <Box sx={{ maxWidth: 460, mx: "auto", px: 2 }}>
            {!supported && <ErrorBox>Laitteesi tai selaimesi ei tue passkey-kirjautumista.</ErrorBox>}

            {supported && loading && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress color="primary" /></Box>}

            {supported && !loading && !user && (
              <Box sx={{ textAlign: "center" }}>
                <Typography sx={{ fontWeight: 800, fontSize: 18 }}>Kirjaudu</Typography>
                <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, mb: 1.5 }}>Onko sinulla jo tili? Kirjaudu sisään</Typography>
                {clientId && <Box sx={{ display: "flex", justifyContent: "center", mb: 1.25 }}><GoogleButton clientId={clientId} onCredential={handleLoginGoogle} text="signin_with" /></Box>}
                <Button onClick={handleLogin} disabled={busy} sx={authBtnSx}>Kirjaudu passkeyllä</Button>

                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ color: "text.secondary", fontSize: 12, my: 2 }}>
                  <Divider sx={{ flex: 1, borderColor: "var(--color-surface-divider)" }} /><span>tai</span><Divider sx={{ flex: 1, borderColor: "var(--color-surface-divider)" }} />
                </Stack>

                <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.25 }}>Uusi täällä? Luo oma Gamezone-tili</Typography>
                <Button onClick={() => { setError(""); setShowCreate(true); }} disabled={busy} sx={authBtnSx}>Luo uusi tili</Button>
              </Box>
            )}

            {notice && <Box sx={{ mt: 2 }}><Notice>{notice}</Notice></Box>}
            {error && !showCreate && <Box sx={{ mt: 2 }}><ErrorBox>{error}</ErrorBox></Box>}
          </Box>
        </Box>
      )}

      {/* Create-account modal */}
      <Dialog open={showCreate && !user} onClose={() => !busy && setShowCreate(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { bgcolor: "background.default", backgroundImage: "none", border: "1px solid var(--color-surface-border)", color: "text.primary", borderRadius: 3 } }}>
        <Box sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>Luo uusi tili</Typography>
          <Box component="form" onSubmit={handleRegister}>
            <TextField fullWidth size="small" autoFocus label="Nimimerkki" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="esim. Uusi käyttäjä" inputProps={{ maxLength: 40, autoComplete: "off" }} sx={{ mb: 1.5 }} />
            <Button type="submit" fullWidth disabled={busy || nickname.trim().length < 1} startIcon={<LuKeyRound size={18} />} sx={primaryBtnSx}>Luo tili</Button>
          </Box>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1.5 }}>Jos haluat käyttää samaa tiliä useammalta laitteelta, yhdistä Google-tili käyttäjääsi myöhemmin Minä-sivulta.</Typography>
          {error && <Box sx={{ mt: 1.5 }}><ErrorBox>{error}</ErrorBox></Box>}
          <Button onClick={() => setShowCreate(false)} disabled={busy} sx={{ mt: 1, color: "text.secondary", textTransform: "none" }}>Peruuta</Button>
        </Box>
      </Dialog>

      {/* Rename modal */}
      <Dialog open={showRename && !!user} onClose={() => !busy && setShowRename(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { bgcolor: "background.default", backgroundImage: "none", border: "1px solid var(--color-surface-border)", color: "text.primary", borderRadius: 3 } }}>
        <Box sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 800, mb: 1.5 }}>Muokkaa nimimerkkiä</Typography>
          <Box component="form" onSubmit={handleRename}>
            <TextField fullWidth size="small" autoFocus label="Nimimerkki" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} inputProps={{ maxLength: 40, autoComplete: "off" }} sx={{ mb: 1.5 }} />
            <Button type="submit" fullWidth disabled={busy || renameValue.trim().length < 1} sx={primaryBtnSx}>Tallenna</Button>
          </Box>
          {error && <Box sx={{ mt: 1.5 }}><ErrorBox>{error}</ErrorBox></Box>}
          <Button onClick={() => setShowRename(false)} disabled={busy} sx={{ mt: 1, color: "text.secondary", textTransform: "none" }}>Peruuta</Button>
        </Box>
      </Dialog>
    </>
  );
};

export default Account;
