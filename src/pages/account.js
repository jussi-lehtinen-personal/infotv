import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { LuKeyRound, LuLogOut } from "react-icons/lu";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { getMe, registerPasskey, loginPasskey, logout } from "../auth/authClient";

const Account = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const supported = browserSupportsWebAuthn();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await getMe());
    } catch {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      setUser(await registerPasskey(nickname.trim()));
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
  };

  return (
    <>
      <style>{css}</style>
      <div className="acc-root">
        <PageHeader
          title="TILI"
          left={
            <Link to="/" className="acc-back" aria-label="Takaisin">
              <span className="material-symbols-rounded">&#xE5CB;</span>
            </Link>
          }
        />

        <div className="acc-card">
          {!supported && (
            <div className="acc-status acc-status--error">
              Laitteesi tai selaimesi ei tue passkey-kirjautumista.
            </div>
          )}

          {supported && loading && (
            <div className="acc-status"><Spinner /></div>
          )}

          {supported && !loading && user && (
            <div className="acc-user">
              <div className="acc-user-icon" aria-hidden="true"><LuKeyRound /></div>
              <div className="acc-user-name">{user.nickname || "Käyttäjä"}</div>
              <div className="acc-user-sub">Kirjautunut passkeyllä</div>
              <button className="acc-btn acc-btn--ghost" onClick={handleLogout} disabled={busy}>
                <LuLogOut aria-hidden="true" /> Kirjaudu ulos
              </button>
            </div>
          )}

          {supported && !loading && !user && (
            <>
              <p className="acc-intro">
                Luo passkey niin voit kirjautua sormenjäljellä tai kasvotunnistuksella —
                ilman salasanaa.
              </p>

              <form className="acc-form" onSubmit={handleRegister}>
                <label className="acc-label" htmlFor="acc-nick">Nimimerkki</label>
                <input
                  id="acc-nick"
                  className="acc-input"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="esim. Ahma-fani"
                  maxLength={40}
                  autoComplete="off"
                />
                <button
                  className="acc-btn acc-btn--primary"
                  type="submit"
                  disabled={busy || nickname.trim().length < 1}
                >
                  <LuKeyRound aria-hidden="true" /> Luo passkey
                </button>
              </form>

              <div className="acc-divider"><span>tai</span></div>

              <button
                className="acc-btn acc-btn--secondary"
                onClick={handleLogin}
                disabled={busy}
              >
                Kirjaudu passkeyllä
              </button>
            </>
          )}

          {error && <div className="acc-error">{error}</div>}
        </div>
      </div>
    </>
  );
};

export default Account;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.acc-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}
.acc-back {
  display: flex; align-items: center;
  color: rgba(255,255,255,0.6);
  text-decoration: none; border-radius: 10px; padding: 2px;
  transition: color 0.15s;
}
.acc-back:hover { color: var(--color-primary); }
.acc-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.acc-card {
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 18px;
  border-radius: var(--radius-card);
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: var(--shadow-card);
}

.acc-intro {
  margin: 0;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-secondary);
  line-height: 1.45;
}

.acc-form { display: flex; flex-direction: column; gap: 8px; }
.acc-label {
  font-size: var(--gz-fs-xs);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-tertiary);
}
.acc-input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: var(--radius-item);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.14);
  color: var(--gz-text-primary);
  font-size: var(--gz-fs-md);
  font-family: var(--font-family-base);
  outline: none;
  transition: border-color 0.15s;
}
.acc-input:focus { border-color: var(--color-primary); }

.acc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: var(--radius-item);
  border: 1px solid transparent;
  font-size: var(--gz-fs-md);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: filter 0.15s, background 0.15s, border-color 0.15s;
}
.acc-btn svg { width: 18px; height: 18px; }
.acc-btn:disabled { opacity: 0.5; cursor: default; }
.acc-btn--primary { background: var(--color-primary); color: #1a1206; }
.acc-btn--primary:not(:disabled):hover { filter: brightness(1.08); }
.acc-btn--secondary {
  background: rgba(255,255,255,0.05);
  border-color: rgba(255,255,255,0.16);
  color: var(--gz-text-primary);
}
.acc-btn--secondary:not(:disabled):hover { background: rgba(255,255,255,0.09); }
.acc-btn--ghost {
  background: transparent;
  border-color: rgba(255,255,255,0.16);
  color: var(--gz-text-secondary);
}
.acc-btn--ghost:not(:disabled):hover { background: rgba(255,255,255,0.06); }

.acc-divider {
  display: flex; align-items: center;
  color: var(--gz-text-tertiary);
  font-size: var(--gz-fs-xs);
  text-transform: uppercase;
  letter-spacing: var(--gz-ls-wide);
}
.acc-divider::before, .acc-divider::after {
  content: ""; flex: 1; height: 1px;
  background: rgba(255,255,255,0.10);
}
.acc-divider span { padding: 0 10px; }

.acc-user { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.acc-user-icon {
  display: flex; align-items: center; justify-content: center;
  width: 56px; height: 56px; margin-bottom: 4px;
  border-radius: 50%;
  background: rgba(245,158,11,0.12);
  color: var(--color-primary);
}
.acc-user-icon svg { width: 28px; height: 28px; }
.acc-user-name { font-size: var(--gz-fs-lg); font-weight: var(--gz-fw-bold); color: var(--gz-text-primary); }
.acc-user-sub { font-size: var(--gz-fs-sm); color: var(--gz-text-tertiary); margin-bottom: 8px; }

.acc-status { text-align: center; padding: 24px 0; color: var(--gz-text-muted); font-size: var(--gz-fs-sm); }
.acc-status--error { color: var(--color-loss); }
.acc-error {
  padding: 10px 12px;
  border-radius: var(--radius-item);
  background: rgba(239,68,68,0.10);
  border: 1px solid rgba(239,68,68,0.30);
  color: #fca5a5;
  font-size: var(--gz-fs-sm);
  text-align: center;
}
`;
