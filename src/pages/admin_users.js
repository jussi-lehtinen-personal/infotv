import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LuArrowLeft, LuPlus, LuX, LuSearch } from "react-icons/lu";
import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { getAdminUsers, setUserRole } from "../auth/authClient";

// Admin › Käyttäjät & roolit (/admin/users). List registered users and tag them
// with roles. `valmentaja` is team-scoped (pick a team = tulospalvelu teamKey);
// `toimittaja` and `admin` are global. See memory: project_admin_roles.

const roleLabel = (r) => {
  if (r.role === "valmentaja") return `Valmentaja · ${r.team}`;
  if (r.role === "toimittaja") return "Toimittaja";
  if (r.role === "admin") return "Admin";
  return r.role;
};
const roleKey = (r) => `${r.role}:${r.team || ""}`;

const AddRole = ({ teams, onAdd, busy }) => {
  const [team, setTeam] = useState("");
  useEffect(() => {
    if (!team && teams.length) setTeam(teams[0].teamKey);
  }, [teams, team]);

  return (
    <div className="au-add">
      <div className="au-add-row">
        <select
          className="au-select"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          aria-label="Joukkue"
        >
          {teams.length === 0 && <option value="">(joukkueita ladataan…)</option>}
          {teams.map((t) => (
            <option key={t.teamKey} value={t.teamKey}>
              {t.teamKey}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="au-add-btn"
          disabled={busy || !team}
          onClick={() => onAdd({ role: "valmentaja", team })}
        >
          <LuPlus aria-hidden="true" /> Valmentaja
        </button>
      </div>
      <div className="au-add-row">
        <button type="button" className="au-add-btn" disabled={busy} onClick={() => onAdd({ role: "toimittaja" })}>
          <LuPlus aria-hidden="true" /> Toimittaja
        </button>
        <button type="button" className="au-add-btn au-add-btn--admin" disabled={busy} onClick={() => onAdd({ role: "admin" })}>
          <LuPlus aria-hidden="true" /> Admin
        </button>
      </div>
    </div>
  );
};

const UserRow = ({ user, teams, onChange }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const apply = async (role, team, action) => {
    setBusy(true);
    setErr("");
    try {
      const res = await setUserRole({ userId: user.userId, role, team, action });
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
            <button
              type="button"
              className="au-chip-x"
              disabled={busy}
              aria-label="Poista rooli"
              onClick={() => apply(r.role, r.team, "remove")}
            >
              <LuX aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>

      {err && <div className="au-err">{err}</div>}

      <button type="button" className="au-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "Sulje" : "＋ Lisää rooli"}
      </button>
      {open && (
        <AddRole teams={teams} busy={busy} onAdd={({ role, team }) => apply(role, team, "add")} />
      )}
    </div>
  );
};

const AdminUsers = () => {
  const [state, setState] = useState({ status: "loading" });
  const [teams, setTeams] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAdminUsers()
      .then((r) => !cancelled && setState(r))
      .catch((e) => !cancelled && setState({ status: "error", error: e.message }));
    fetch("/api/getTeams")
      .then((r) => (r.ok ? r.json() : []))
      .then((t) => !cancelled && setTeams(Array.isArray(t) ? t : []))
      .catch(() => {});
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

        {status === "forbidden" && (
          <div className="au-status">Tällä tilillä ei ole admin-oikeuksia.</div>
        )}

        {status === "error" && (
          <div className="au-status au-error">Lataus epäonnistui. {state.error}</div>
        )}

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
                <UserRow key={u.userId} user={u} teams={teams} onChange={onChange} />
              ))}
              {filtered.length === 0 && <div className="au-empty">Ei osumia.</div>}
            </div>
          </>
        )}
      </div>
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
.au-chip--valmentaja { background: rgba(var(--color-primary-rgb),0.18); color: var(--color-primary); }
.au-chip--toimittaja { background: rgba(96,165,250,0.18); color: #93c5fd; }
.au-chip--admin { background: rgba(74,222,128,0.18); color: var(--color-live); }
.au-chip-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 999px; border: none; cursor: pointer;
  background: rgba(0,0,0,0.25); color: inherit; font-size: 12px; padding: 0;
}
.au-chip-x:disabled { opacity: 0.4; cursor: default; }

.au-err { margin-top: 8px; font-size: 12px; color: var(--color-loss); }

.au-toggle {
  margin-top: 10px; padding: 0; background: none; border: none; cursor: pointer;
  color: var(--color-primary); font-family: inherit; font-size: 13px; font-weight: 700;
}
.au-add { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.au-add-row { display: flex; gap: 8px; flex-wrap: wrap; }
.au-select {
  flex: 1 1 auto; min-width: 0; padding: 9px 10px; font-family: inherit; font-size: 13px;
  border-radius: var(--radius-item); border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.05); color: var(--color-secondary);
}
.au-add-btn {
  display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto;
  padding: 9px 12px; border-radius: var(--radius-item); cursor: pointer;
  border: 1px solid rgba(var(--color-primary-rgb),0.4);
  background: rgba(var(--color-primary-rgb),0.12); color: var(--color-primary);
  font-family: inherit; font-size: 13px; font-weight: 700;
}
.au-add-btn--admin { border-color: rgba(74,222,128,0.4); background: rgba(74,222,128,0.12); color: var(--color-live); }
.au-add-btn:disabled { opacity: 0.5; cursor: default; }
.au-empty { padding: 20px; text-align: center; color: var(--color-accent); }
`;
