import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuUsers, LuArrowLeft, LuChevronRight, LuDatabase, LuBarChart3 } from "react-icons/lu";
import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { getMe } from "../auth/authClient";

// Admin hub (/admin). Gated by login + admin (ADMIN_USER_IDS env OR a data
// `admin` role, per /api/me isAdmin). Links to the admin subpages. Reached from
// the NavDrawer (admins only) or directly. See memory: project_admin_roles.

const CopyId = ({ id }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="ad-id"
      onClick={() => {
        try {
          navigator.clipboard?.writeText(id);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
    >
      <code>{id}</code>
      <span className="ad-copy">{copied ? "Kopioitu ✓" : "Kopioi"}</span>
    </button>
  );
};

const Admin = () => {
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
    return () => {
      cancelled = true;
    };
  }, []);

  const { status } = state;

  return (
    <>
      <style>{css}</style>
      <div className="ad-root">
        <header className="ad-head">
          <Link to="/" className="ad-back" aria-label="Takaisin">
            <LuArrowLeft aria-hidden="true" />
          </Link>
          <div>
            <h1 className="ad-title">ADMIN</h1>
            <p className="ad-subtitle">Ylläpito</p>
          </div>
        </header>

        {status === "loading" && (
          <div className="ad-status"><Spinner /></div>
        )}

        {status === "unauthorized" && (
          <div className="ad-status">
            Kirjaudu ensin sisään (<Link className="ad-link" to="/account">Minä</Link>) ja palaa
            tänne.
          </div>
        )}

        {status === "forbidden" && (
          <div className="ad-status ad-forbidden">
            <p>Tällä tilillä ei ole admin-oikeuksia.</p>
            <p className="ad-muted">
              Lisää oma userId:si SWA App settings → <code>ADMIN_USER_IDS</code> (pilkulla
              erotettu) ja päivitä sivu, tai pyydä toista adminia myöntämään admin-rooli.
            </p>
            <CopyId id={state.youAre} />
          </div>
        )}

        {status === "error" && (
          <div className="ad-status ad-error">Lataus epäonnistui. {state.error}</div>
        )}

        {status === "ok" && (
          <div className="ad-cards">
            <Link to="/admin/users" className="ad-card ui-surface">
              <span className="ad-card-icon"><LuUsers aria-hidden="true" /></span>
              <span className="ad-card-main">
                <span className="ad-card-title">Käyttäjät &amp; roolit</span>
                <span className="ad-card-sub">Merkitse käyttäjiä valmentajiksi, toimittajiksi tai admineiksi</span>
              </span>
              <LuChevronRight className="ad-card-arrow" aria-hidden="true" />
            </Link>

            <Link to="/stats" className="ad-card ui-surface">
              <span className="ad-card-icon"><LuBarChart3 aria-hidden="true" /></span>
              <span className="ad-card-main">
                <span className="ad-card-title">Tilastot</span>
                <span className="ad-card-sub">Rekisteröityneet käyttäjät</span>
              </span>
              <LuChevronRight className="ad-card-arrow" aria-hidden="true" />
            </Link>

            <Link to="/admin/backups" className="ad-card ui-surface">
              <span className="ad-card-icon"><LuDatabase aria-hidden="true" /></span>
              <span className="ad-card-main">
                <span className="ad-card-title">Varmuuskopiot</span>
                <span className="ad-card-sub">Käyttäjä- ja asetusdatan varmuuskopioiden tila</span>
              </span>
              <LuChevronRight className="ad-card-arrow" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </>
  );
};

export default Admin;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.ad-root {
  min-height: 100dvh;
  padding: 22px 14px 60px;
  max-width: 640px;
  margin: 0 auto;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
  color: var(--color-secondary);
}
.ad-head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.ad-back {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: 999px; flex: 0 0 auto;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);
  color: var(--color-secondary); font-size: 18px; text-decoration: none;
}
.ad-title {
  font-family: var(--font-family-display, var(--font-family-base));
  font-size: 26px; font-weight: 800; letter-spacing: 0.06em;
  margin: 0; color: var(--color-secondary);
}
.ad-subtitle { margin: 2px 0 0; color: var(--color-accent); font-size: 13px; }

.ad-status { text-align: center; padding: 40px 0; color: var(--color-accent); }
.ad-error { color: var(--color-loss); }
.ad-link { color: var(--color-primary); }

.ad-cards { display: flex; flex-direction: column; gap: 12px; }
.ad-card {
  display: flex; align-items: center; gap: 14px;
  padding: 16px; border-radius: var(--radius-card);
  text-decoration: none; color: var(--color-secondary);
}
.ad-card--soon { opacity: 0.5; }
.ad-card-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 42px; height: 42px; border-radius: 12px; flex: 0 0 auto; font-size: 20px;
  background: rgba(var(--color-primary-rgb), 0.16); color: var(--color-primary);
}
.ad-card-main { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.ad-card-title { font-size: 16px; font-weight: 700; }
.ad-card-sub { font-size: 13px; color: var(--color-accent); }
.ad-card-arrow { color: var(--color-accent); font-size: 20px; flex: 0 0 auto; }

.ad-forbidden p { margin: 0 0 8px; }
.ad-muted { color: var(--color-accent); font-size: 13px; }
.ad-muted code, .ad-forbidden code { background: rgba(255,255,255,0.08); padding: 1px 6px; border-radius: 6px; }
.ad-id {
  display: inline-flex; align-items: center; gap: 10px;
  margin-top: 8px; padding: 8px 12px; cursor: pointer;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);
  border-radius: 10px; color: var(--color-secondary); font-family: inherit;
}
.ad-copy { font-size: 12px; color: var(--color-primary); font-weight: 700; }
`;
