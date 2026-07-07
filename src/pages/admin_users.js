import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LuArrowLeft, LuPlus, LuX, LuSearch, LuChevronRight } from "react-icons/lu";
import {
  Box, Typography, Card, Stack, Chip, Button, TextField, InputAdornment,
  Dialog, List, ListItemButton, IconButton, CircularProgress,
} from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
import { getAdminUsers, setUserRole } from "../auth/authClient";
import { JOPOX_TEAMS } from "../data/jopoxTeams";

// Admin › Käyttäjät & roolit (/admin/users). Each user lists their roles as
// deletable chips; "Lisää rooli" opens a dialog to pick a role (+ a team for the
// team-scoped valmentaja, from the year-round Jopox team list). See memory:
// project_admin_roles + reference_data_map (teams = Jopox, NOT tulospalvelu).

const ROLE_LABELS = { pelaaja: "Pelaaja", valmentaja: "Valmentaja", toimihenkilo: "Toimihenkilö", media: "Media", admin: "Admin" };
const ROLE_ORDER = ["pelaaja", "valmentaja", "toimihenkilo", "media", "admin"];
const TEAM_ROLES = new Set(["pelaaja", "valmentaja", "toimihenkilo"]);
// Distinct per-role colours (role identity, not brand) so chips are scannable.
const ROLE_CHIP = {
  pelaaja: { bg: "rgba(167,139,250,0.20)", fg: "#c4b5fd" },
  valmentaja: { bg: "rgba(var(--color-primary-rgb),0.18)", fg: "var(--color-primary)" },
  toimihenkilo: { bg: "rgba(45,212,191,0.18)", fg: "#5eead4" },
  media: { bg: "rgba(96,165,250,0.18)", fg: "#93c5fd" },
  admin: { bg: "rgba(74,222,128,0.18)", fg: "var(--color-live)" },
};
const roleLabel = (r) => (TEAM_ROLES.has(r.role) ? `${ROLE_LABELS[r.role]} · ${r.team}` : ROLE_LABELS[r.role] || r.role);
const roleKey = (r) => `${r.role}:${r.team || ""}`;

// Add-role dialog: a two-step wizard. Step 1 = pick a role. A global role
// (media/admin) is added immediately; a team-scoped role advances to Step 2 =
// pick a team.
const AddRoleDialog = ({ user, onClose, onChange }) => {
  const [step, setStep] = useState("role"); // "role" | "team"
  const [role, setRole] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const add = async (chosenRole, team) => {
    setBusy(true);
    setErr("");
    try {
      const res = await setUserRole({ userId: user.userId, role: chosenRole, team, action: "add" });
      onChange(user.userId, res.roles);
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const pickRole = (r) => {
    if (busy) return;
    if (TEAM_ROLES.has(r)) { setRole(r); setErr(""); setStep("team"); }
    else add(r);
  };

  const rowSx = { borderRadius: 2, mb: 0.75, border: "1px solid var(--color-surface-border)", bgcolor: "var(--color-surface)", "&:hover": { bgcolor: "var(--color-surface-divider)" } };

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { bgcolor: "background.default", backgroundImage: "none", border: "1px solid var(--color-surface-border)", color: "text.primary", m: { xs: 0, sm: 2 }, position: { xs: "fixed", sm: "static" }, bottom: { xs: 0, sm: "auto" }, borderRadius: { xs: "18px 18px 0 0", sm: 2 }, width: "100%" } }}
    >
      <Box sx={{ p: 2, pb: "calc(env(safe-area-inset-bottom) + 16px)" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          {step === "team" && (
            <IconButton size="small" onClick={() => { setStep("role"); setErr(""); }} aria-label="Takaisin" sx={{ color: "text.primary" }}><LuArrowLeft /></IconButton>
          )}
          <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {step === "role" ? `Lisää rooli · ${user.nickname || "(nimetön)"}` : `${ROLE_LABELS[role]} — valitse joukkue`}
          </Typography>
          <IconButton size="small" onClick={onClose} aria-label="Sulje" sx={{ color: "text.primary" }}><LuX /></IconButton>
        </Stack>

        {err && <Typography sx={{ mb: 1, fontSize: 13, color: "var(--color-loss)" }}>{err}</Typography>}

        <List disablePadding sx={{ maxHeight: "54vh", overflowY: "auto" }}>
          {step === "role" && ROLE_ORDER.map((r) => (
            <ListItemButton key={r} disabled={busy} onClick={() => pickRole(r)} sx={rowSx}>
              <Typography sx={{ flex: 1, fontWeight: 700 }}>{ROLE_LABELS[r]}</Typography>
              <Box sx={{ fontSize: 12, color: "text.secondary", display: "inline-flex", alignItems: "center" }}>
                {TEAM_ROLES.has(r) ? <LuChevronRight /> : "Lisää"}
              </Box>
            </ListItemButton>
          ))}
          {step === "team" && JOPOX_TEAMS.map((t) => (
            <ListItemButton key={t.subsiteId} disabled={busy} onClick={() => add(role, t.name)} sx={rowSx}>
              <Typography sx={{ flex: 1, fontWeight: 700 }}>{t.name}</Typography>
              {t.sub && <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{t.sub}</Typography>}
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Dialog>
  );
};

const MethodBadge = ({ user }) => {
  const method = user.hasPasskey && user.googleLinked ? "passkey+google"
    : user.hasPasskey ? "passkey"
    : user.googleLinked ? "google" : "—";
  const primary = method.split("+")[0];
  const sx = primary === "passkey"
    ? { bg: "rgba(var(--color-primary-rgb),0.16)", fg: "var(--color-primary)" }
    : primary === "google" ? { bg: "rgba(96,165,250,0.16)", fg: "#93c5fd" }
    : { bg: "var(--color-surface-divider)", fg: "text.secondary" };
  return <Box sx={{ flexShrink: 0, fontSize: 11, fontWeight: 700, px: 0.875, py: 0.25, borderRadius: 999, bgcolor: sx.bg, color: sx.fg }}>{method}</Box>;
};

const UserCard = ({ user, onOpenAdd, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const remove = async (r) => {
    setBusy(true);
    setErr("");
    try {
      const res = await setUserRole({ userId: user.userId, role: r.role, team: r.team, action: "remove" });
      onChange(user.userId, res.roles);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ p: 1.75, bgcolor: "background.paper", borderColor: "divider" }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.nickname || "(nimetön)"}</Typography>
        <Box sx={{ flex: 1 }} />
        <MethodBadge user={user} />
      </Stack>
      {user.email && <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.25 }}>{user.email}</Typography>}

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.25 }}>
        {user.roles.length === 0 && <Typography variant="body2" sx={{ color: "text.secondary", opacity: 0.7 }}>Ei rooleja</Typography>}
        {user.roles.map((r) => {
          const c = ROLE_CHIP[r.role] || { bg: "var(--color-surface-divider)", fg: "text.secondary" };
          return (
            <Chip
              key={roleKey(r)}
              label={roleLabel(r)}
              size="small"
              onDelete={busy ? undefined : () => remove(r)}
              deleteIcon={<LuX />}
              sx={{ fontWeight: 700, bgcolor: c.bg, color: c.fg, "& .MuiChip-deleteIcon": { color: c.fg, opacity: 0.7, "&:hover": { color: c.fg, opacity: 1 } } }}
            />
          );
        })}
      </Box>

      {err && <Typography sx={{ mt: 1, fontSize: 12, color: "var(--color-loss)" }}>{err}</Typography>}

      <Button onClick={() => onOpenAdd(user)} startIcon={<LuPlus />} sx={{ mt: 1.25, p: 0, minWidth: 0, color: "primary.main", fontWeight: 700, fontSize: 13, textTransform: "none", "&:hover": { bgcolor: "transparent", textDecoration: "underline" } }}>
        Lisää rooli
      </Button>
    </Card>
  );
};

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 5, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

const AdminUsers = () => {
  const goBack = useGoBack("/admin");
  const [state, setState] = useState({ status: "loading" });
  const [q, setQ] = useState("");
  const [modalUser, setModalUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAdminUsers()
      .then((r) => !cancelled && setState(r))
      .catch((e) => !cancelled && setState({ status: "error", error: e.message }));
    return () => { cancelled = true; };
  }, []);

  const onChange = (userId, roles) => {
    setState((s) => {
      if (s.status !== "ok") return s;
      const users = s.data.users.map((u) => (u.userId === userId ? { ...u, roles } : u));
      return { ...s, data: { ...s.data, users } };
    });
    setModalUser((m) => (m && m.userId === userId ? { ...m, roles } : m));
  };

  const users = useMemo(() => (state.status === "ok" ? state.data.users : []), [state]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (u) => (u.nickname || "").toLowerCase().includes(needle) || (u.email || "").toLowerCase().includes(needle) || u.userId.toLowerCase().includes(needle)
    );
  }, [users, q]);

  const { status } = state;

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "60px" }}>
      <MuiHeader title="Käyttäjät" subtitle="Roolien hallinta" onBack={goBack} />

      <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5 }}>
        {status === "loading" && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress color="primary" /></Box>}
        {status === "unauthorized" && <Status>Kirjaudu ensin sisään (<Box component={Link} to="/account" sx={{ color: "primary.main" }}>Tili</Box>).</Status>}
        {status === "forbidden" && <Status>Tällä tilillä ei ole admin-oikeuksia.</Status>}
        {status === "error" && <Status error>Lataus epäonnistui. {state.error}</Status>}

        {status === "ok" && (
          <>
            <TextField
              fullWidth
              size="small"
              type="search"
              placeholder="Hae nimellä, sähköpostilla tai id:llä"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><LuSearch /></InputAdornment> }}
              sx={{ "& .MuiOutlinedInput-root": { bgcolor: "var(--color-surface)" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-surface-border)" } }}
            />
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, mb: 1.5, fontSize: 12 }}>{filtered.length} / {users.length} käyttäjää</Typography>

            <Stack spacing={1.25}>
              {filtered.map((u) => <UserCard key={u.userId} user={u} onOpenAdd={setModalUser} onChange={onChange} />)}
              {filtered.length === 0 && <Box sx={{ p: 2.5, textAlign: "center", color: "text.secondary" }}>Ei osumia.</Box>}
            </Stack>
          </>
        )}
      </Box>

      {modalUser && <AddRoleDialog user={modalUser} onClose={() => setModalUser(null)} onChange={onChange} />}
    </Box>
  );
};

export default AdminUsers;
