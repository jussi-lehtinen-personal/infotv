import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LuArrowLeft, LuPlus, LuX, LuSearch } from "react-icons/lu";
import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { getAdminUsers, setUserRole } from "../auth/authClient";
import { JOPOX_TEAMS } from "../data/jopoxTeams";

// Admin › Käyttäjät & roolit (/admin/users). Each user lists their roles as
// removable chips; "＋ Lisää rooli" opens a popup to pick a role (+ a team for
// the team-scoped valmentaja, from the year-round Jopox team list). See memory:
// project_admin_roles + reference_data_map (teams = Jopox, NOT tulospalvelu).

const ROLE_LABELS = {
  pelaaja: "Pelaaja",
  valmentaja: "Valmentaja",
  toimihenkilo: "Toimihenkilö",
  media: "Media",
  admin: "Admin",
};
const ROLE_ORDER = ["pelaaja", "valmentaja", "toimihenkilo", "media", "admin"];
const TEAM_ROLES = new Set(["pelaaja", "valmentaja", "toimihenkilo"]);
const roleLabel = (r) =>
  TEAM_ROLES.has(r.role) ? `${ROLE_LABELS[r.role]} · ${r.team}` : ROLE_LABELS[r.role] || r.role;
const roleKey = (r) => `${r.role}:${r.team || ""}`;

// Popup: pick a role, and a team when the role is valmentaja.
const AddRoleModal = ({ user, onClose, onChange }) => {
  const [role, setRole] = useState("pelaaja");
  const [team, setTeam] = useState(JOPOX_TEAMS[0] ? JOPOX_TEAMS[0].name : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const needsTeam = TEAM_ROLES.has(role);
  const canAdd = !busy && (!needsTeam || !!team);

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await setUserRole({ userId: user.userId, role, team: needsTeam ? team : undefined, action: "add" });
      onChange(user.userId, res.roles);
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="au-modal-backdrop" onClick={onClose}>
      <div className="au-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="au-modal-head">
          <span>Lisää rooli · {user.nickname || "(nimetön)"}</span>
          <button type="button" className="au-modal-x" onClick={onClose} aria-label="Sulje"><LuX aria-hidden="true" /></button>
        </div>

        <div className="au-modal-label">Rooli</div>
        <div className="au-seg">
          {ROLE_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              className={`au-seg-btn${role === r ? " is-active" : ""}`}
              onClick={() => setRole(r)}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>

        {needsTeam && (
          <>
            <div className="au-modal-label">Joukkue</div>
            <div className="au-teams">
              {JOPOX_TEAMS.map((t) => (
                <button
                  key={t.subsiteId}
                  type="button"
                  className={`au-team-btn${team === t.name ? " is-active" : ""}`}
                  onClick={() => setTeam(t.name)}
                >
                  <span className="au-team-name">{t.name}</span>
                  {t.sub && <span className="au-team-sub">{t.sub}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {err && <div className="au-err">{err}</div>}

        <div className="au-modal-actions">
          <button type="button" className="au-btn au-btn--ghost" onClick={onClose} disabled={busy}>Peruuta</button>
          <button type="button" className="au-btn au-btn--primary" onClick={submit} disabled={!canAdd}>
            {busy ? "Lisätään…" : "Lisää"}
          </button>
        </div>
      </div>
    </div>
  );
};

const UserRow = ({ user, onOpenAdd, onChange }) => {
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

  const method = user.hasPasskey && user.googleLinked
    ? "passkey+google"
    : user.hasPasskey
    ? "passkey"
    : user.googleLinked
    ? "google"
    : "—";

  return (
    <div className="au-user ui-surface">
      <div className="au-user-top">
        <span className="au-nick">{user.nickname || "(nimetön)"}</span>
        <span className={`au-method au-method--${method.split("+")[0]}`}>{method}</span>
      </div>
      {user.email && <div className="au-email">{user.email}</div>}

      <div className="au-roles">
        {user.roles.length === 0 && <span className="au-norole">Ei rooleja</span>}
        {user.roles.map((r) => (
          <span key={roleKey(r)} className={`au-chip au-chip--${r.role}`}>
            {roleLabel(r)}
            <button type="button" className="au-chip-x" disabled={busy} aria-label="Poista rooli" onClick={() => remove(r)}>
              <LuX aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>

      {err && <div className="au-err">{err}</div>}

      <button type="button" className="au-add-link" onClick={() => onOpenAdd(user)}>
        <LuPlus aria-hidden="true" /> Lisää rooli
      </button>
    </div>
  );
};

const AdminUsers = () => {
  const [state, setState] = useState({ status: "loading" });
  const [q, setQ] = useState("");
  const [modalUser, setModalUser] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAdminUsers()
      .then((r) => !cancelled && setState(r))
      .catch((e) => !cancelled && setState({ status: "error", error: e.message }));
    return () => {
      cancelled = true;
    };
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
      (u) =>
        (u.nickname || "").toLowerCase().includes(needle) ||
        (u.email || "").toLowerCase().includes(needle) ||
        u.userId.toLowerCase().includes(needle)
    );
  }, [users, q]);

  const { status } = state;

  return (
    <>
      <style>{css}</style>
      <div className="au-root">
        <header className="au-head">
          <Link to="/admin" className="au-back" aria-label="Takaisin">
            <LuArrowLeft aria-hidden="true" />
          </Link>
          <div>
            <h1 className="au-title">KÄYTTÄJÄT</h1>
            <p className="au-subtitle">Roolien hallinta</p>
          </div>
        </header>

        {status === "loading" && <div className="au-status"><Spinner /></div>}

        {status === "unauthorized" && (
          <div className="au-status">
            Kirjaudu ensin sisään (<Link className="au-link" to="/account">Minä</Link>).
          </div>
        )}

        {status === "forbidden" && <div className="au-status">Tällä tilillä ei ole admin-oikeuksia.</div>}

        {status === "error" && <div className="au-status au-error">Lataus epäonnistui. {state.error}</div>}

        {status === "ok" && (
          <>
            <div className="au-searchbar">
              <LuSearch aria-hidden="true" className="au-search-icon" />
              <input
                className="au-search"
                type="search"
                placeholder="Hae nimellä, sähköpostilla tai id:llä"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <p className="au-count">{filtered.length} / {users.length} käyttäjää</p>

            <div className="au-list">
              {filtered.map((u) => (
                <UserRow key={u.userId} user={u} onOpenAdd={setModalUser} onChange={onChange} />
              ))}
              {filtered.length === 0 && <div className="au-empty">Ei osumia.</div>}
            </div>
          </>
        )}
      </div>

      {modalUser && <AddRoleModal user={modalUser} onClose={() => setModalUser(null)} onChange={onChange} />}
    </>
  );
};

export default AdminUsers;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.au-root {
  min-height: 100dvh;
  padding: 22px 14px 60px;
  max-width: 640px;
  margin: 0 auto;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
  color: var(--color-secondary);
}
.au-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.au-back {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: 999px; flex: 0 0 auto;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);
  color: var(--color-secondary); font-size: 18px; text-decoration: none;
}
.au-title {
  font-family: var(--font-family-display, var(--font-family-base));
  font-size: 26px; font-weight: 800; letter-spacing: 0.06em;
  margin: 0; color: var(--color-secondary);
}
.au-subtitle { margin: 2px 0 0; color: var(--color-accent); font-size: 13px; }

.au-status { text-align: center; padding: 40px 0; color: var(--color-accent); }
.au-error { color: var(--color-loss); }
.au-link { color: var(--color-primary); }

.au-searchbar { position: relative; margin-bottom: 8px; }
.au-search-icon {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  color: var(--color-accent); font-size: 16px; pointer-events: none;
}
.au-search {
  width: 100%; box-sizing: border-box; padding: 11px 12px 11px 36px;
  border-radius: var(--radius-item); border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.05); color: var(--color-secondary);
  font-family: inherit; font-size: 14px;
}
.au-count { margin: 0 0 12px; font-size: 12px; color: var(--color-accent); }

.au-list { display: flex; flex-direction: column; gap: 10px; }
.au-user { padding: 14px; border-radius: var(--radius-card); }
.au-user-top { display: flex; align-items: center; gap: 8px; }
.au-nick { font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.au-method {
  font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; flex: 0 0 auto;
  background: rgba(255,255,255,0.08); color: var(--color-accent);
}
.au-method--passkey { background: rgba(var(--color-primary-rgb),0.16); color: var(--color-primary); }
.au-method--google { background: rgba(96,165,250,0.16); color: #93c5fd; }
.au-email { font-size: 12px; color: var(--color-accent); margin-top: 2px; }

.au-roles { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.au-norole { font-size: 12px; color: var(--color-accent); opacity: 0.7; }
.au-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 700; padding: 3px 4px 3px 9px; border-radius: 999px;
  background: rgba(255,255,255,0.08); color: var(--color-secondary);
}
.au-chip--pelaaja { background: rgba(167,139,250,0.20); color: #c4b5fd; }
.au-chip--valmentaja { background: rgba(var(--color-primary-rgb),0.18); color: var(--color-primary); }
.au-chip--toimihenkilo { background: rgba(45,212,191,0.18); color: #5eead4; }
.au-chip--media { background: rgba(96,165,250,0.18); color: #93c5fd; }
.au-chip--admin { background: rgba(74,222,128,0.18); color: var(--color-live); }
.au-chip-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 999px; border: none; cursor: pointer;
  background: rgba(0,0,0,0.25); color: inherit; font-size: 12px; padding: 0;
}
.au-chip-x:disabled { opacity: 0.4; cursor: default; }

.au-err { margin-top: 8px; font-size: 12px; color: var(--color-loss); }

.au-add-link {
  margin-top: 10px; padding: 0; background: none; border: none; cursor: pointer;
  color: var(--color-primary); font-family: inherit; font-size: 13px; font-weight: 700;
  display: inline-flex; align-items: center; gap: 4px;
}
.au-empty { padding: 20px; text-align: center; color: var(--color-accent); }

/* ---- Add-role popup ---- */
.au-modal-backdrop {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(2px);
  display: flex; align-items: flex-end; justify-content: center;
  padding: 0;
}
.au-modal {
  width: 100%; max-width: 480px; box-sizing: border-box;
  background: var(--color-bg); border: 1px solid rgba(255,255,255,0.14);
  border-radius: 18px 18px 0 0; padding: 18px 16px calc(env(safe-area-inset-bottom) + 18px);
}
@media (min-width: 520px) {
  .au-modal-backdrop { align-items: center; }
  .au-modal { border-radius: 18px; }
}
.au-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 15px; font-weight: 700; margin-bottom: 14px;
}
.au-modal-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 999px; border: none; cursor: pointer;
  background: rgba(255,255,255,0.06); color: var(--color-secondary); flex: 0 0 auto;
}
.au-modal-label { font-size: 12px; color: var(--color-accent); margin: 10px 0 6px; }
.au-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.au-seg-btn {
  flex: 0 0 auto; padding: 9px 13px; border-radius: var(--radius-item); cursor: pointer;
  border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.04);
  color: var(--color-secondary); font-family: inherit; font-size: 13px; font-weight: 700;
}
.au-seg-btn.is-active {
  border-color: rgba(var(--color-primary-rgb),0.6);
  background: rgba(var(--color-primary-rgb),0.16); color: var(--color-primary);
}
.au-teams { display: flex; flex-wrap: wrap; gap: 6px; }
.au-team-btn {
  display: inline-flex; flex-direction: column; align-items: flex-start; gap: 1px;
  padding: 8px 12px; border-radius: var(--radius-item); cursor: pointer;
  border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.04);
  color: var(--color-secondary); font-family: inherit;
}
.au-team-btn.is-active {
  border-color: rgba(var(--color-primary-rgb),0.6);
  background: rgba(var(--color-primary-rgb),0.16); color: var(--color-primary);
}
.au-team-name { font-size: 13px; font-weight: 700; }
.au-team-sub { font-size: 10px; opacity: 0.65; }
.au-modal-actions { display: flex; gap: 8px; margin-top: 18px; }
.au-btn {
  flex: 1 1 0; padding: 12px; border-radius: var(--radius-item); cursor: pointer;
  font-family: inherit; font-size: 14px; font-weight: 700; border: 1px solid transparent;
}
.au-btn--ghost { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.14); color: var(--color-secondary); }
.au-btn--primary { background: var(--color-primary); color: var(--color-on-primary); }
.au-btn:disabled { opacity: 0.5; cursor: default; }
`;
