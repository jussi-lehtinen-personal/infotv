import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { LuKeyRound, LuLogOut, LuCheck, LuTrash2 } from "react-icons/lu";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { GoogleButton } from "../auth/GoogleButton";
import {
  getMe,
  getCachedUser,
  getAuthConfig,
  registerPasskey,
  addPasskey,
  loginPasskey,
  linkGoogle,
  loginGoogle,
  unlinkGoogle,
  deleteAccount,
  logout,
} from "../auth/authClient";

const Account = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nickname, setNickname] = useState("");
  const [clientId, setClientId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const supported = browserSupportsWebAuthn();

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
    setConfirmDelete(false);
  };

  const handleDeleteAccount = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await deleteAccount();
      setUser(null);
      setConfirmDelete(false);
      setNickname("");
      setNotice("Tili poistettu.");
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handleAddPasskey = async () => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      setUser(await addPasskey());
      setNotice("Passkey lisätty tälle laitteelle.");
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
              <div className="acc-user-sub">Kirjautunut</div>

              {!user.hasPasskey && (
                <button
                  className="acc-btn acc-btn--secondary acc-method-btn"
                  onClick={handleAddPasskey}
                  disabled={busy}
                >
                  <LuKeyRound aria-hidden="true" /> Lisää passkey tälle laitteelle
                </button>
              )}

              <div className="acc-google-section">
                {user.googleLinked ? (
                  <>
                    <div className="acc-google-linked">
                      <LuCheck aria-hidden="true" /> Google yhdistetty — voit kirjautua muillakin laitteilla
                    </div>
                    <button
                      className="acc-link-btn"
                      onClick={handleUnlinkGoogle}
                      disabled={busy}
                    >
                      Poista Google-yhteys
                    </button>
                  </>
                ) : (
                  <>
                    <div className="acc-google-label">
                      Yhdistä Google-tili, niin voit kirjautua myös muilla laitteilla
                    </div>
                    {clientId && (
                      <GoogleButton
                        clientId={clientId}
                        onCredential={handleLinkGoogle}
                        text="continue_with"
                      />
                    )}
                  </>
                )}
              </div>

              <button className="acc-btn acc-btn--ghost" onClick={handleLogout} disabled={busy}>
                <LuLogOut aria-hidden="true" /> Kirjaudu ulos
              </button>

              {!confirmDelete ? (
                <button
                  className="acc-btn acc-btn--danger-outline"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  <LuTrash2 aria-hidden="true" /> Poista tili
                </button>
              ) : (
                <div className="acc-confirm">
                  <div className="acc-confirm-text">
                    Oletko varma? Tämä poistaa tilisi, passkeyt ja mahdollisen
                    Google-yhteyden pysyvästi. Tätä ei voi peruuttaa.
                  </div>
                  <div className="acc-confirm-actions">
                    <button
                      className="acc-btn acc-btn--danger"
                      onClick={handleDeleteAccount}
                      disabled={busy}
                    >
                      Poista pysyvästi
                    </button>
                    <button
                      className="acc-btn acc-btn--ghost"
                      onClick={() => setConfirmDelete(false)}
                      disabled={busy}
                    >
                      Peruuta
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {supported && !loading && !user && (
            <>
              {/* KIRJAUDU */}
              <div className="acc-section">
                <div className="acc-section-title">Kirjaudu</div>
                <div className="acc-section-sub">Onko sinulla jo tili? Kirjaudu sisään</div>
                {clientId && (
                  <GoogleButton
                    clientId={clientId}
                    onCredential={handleLoginGoogle}
                    text="signin_with"
                  />
                )}
                <button
                  className="acc-btn acc-btn--secondary acc-fixed-btn"
                  onClick={handleLogin}
                  disabled={busy}
                >
                  Kirjaudu passkeyllä
                </button>
              </div>

              <div className="acc-divider"><span>tai</span></div>

              {/* LUO UUSI TILI */}
              <div className="acc-section">
                <div className="acc-section-title">Luo uusi tili</div>
                <div className="acc-section-sub">Uusi täällä? Luo oma Gamezone-tili</div>
                <form className="acc-form" onSubmit={handleRegister}>
                  <label className="acc-label" htmlFor="acc-nick">Nimimerkki</label>
                  <input
                    id="acc-nick"
                    className="acc-input"
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="esim. Uusi käyttäjä"
                    maxLength={40}
                    autoComplete="off"
                  />
                  <button
                    className="acc-btn acc-btn--primary"
                    type="submit"
                    disabled={busy || nickname.trim().length < 1}
                  >
                    <LuKeyRound aria-hidden="true" /> Luo tili
                  </button>
                </form>
                <p className="acc-hint">
                  Jos haluat käyttää samaa tiliä useammalta laitteelta, yhdistä
                  Google-tili käyttäjääsi myöhemmin Tili-sivulta.
                </p>
              </div>
            </>
          )}

          {notice && <div className="acc-notice">{notice}</div>}
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
.acc-btn--danger { background: #dc2626; color: #fff; }
.acc-btn--danger:not(:disabled):hover { filter: brightness(1.08); }
.acc-btn--danger-outline {
  background: transparent;
  border-color: rgba(239,68,68,0.45);
  color: #f87171;
}
.acc-btn--danger-outline:not(:disabled):hover { background: rgba(239,68,68,0.10); }

/* Delete account: subtle red trigger → inline confirmation panel. */
.acc-danger-link {
  background: none;
  border: none;
  padding: 6px;
  color: var(--color-loss, #f87171);
  font-size: var(--gz-fs-xs);
  text-decoration: underline;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.acc-danger-link:disabled { opacity: 0.5; cursor: default; }
.acc-confirm {
  width: 100%;
  max-width: 340px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: var(--radius-item);
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.30);
}
.acc-confirm-text {
  font-size: var(--gz-fs-sm);
  color: #fca5a5;
  text-align: center;
  line-height: 1.45;
}
.acc-confirm-actions { display: flex; gap: 8px; }
.acc-confirm-actions .acc-btn { flex: 1; padding: 11px 10px; }

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
.acc-method-btn { width: 100%; }

/* Signup view split into two titled sections: Kirjaudu / Luo uusi tili. */
.acc-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.acc-section-title {
  font-size: var(--gz-fs-md);
  font-weight: 800;
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-primary);
}
.acc-section-sub {
  margin-top: -4px;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-tertiary);
  text-align: center;
}
.acc-section .acc-intro { width: 100%; text-align: center; margin: 0; }
.acc-section .acc-form { width: 100%; max-width: 280px; }
.acc-fixed-btn { width: 100%; max-width: 280px; }
.acc-rule { width: 100%; height: 1px; background: rgba(255,255,255,0.10); margin: 2px 0; }
.acc-hint {
  margin: 2px 0 0;
  max-width: 320px;
  font-size: var(--gz-fs-xs);
  color: var(--gz-text-tertiary);
  text-align: center;
  line-height: 1.45;
}
.acc-recommended {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(245,158,11,0.15);
  color: var(--color-primary);
  font-size: var(--gz-fs-xs);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
}

/* Google linking / login section */
.acc-google-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: 6px 0 10px;
  padding-top: 14px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.acc-google-label {
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-secondary);
  text-align: center;
  line-height: 1.4;
}
.acc-google-btn { display: flex; justify-content: center; min-height: 40px; }
.acc-google-linked {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: var(--gz-fs-sm);
  color: var(--color-win, #34d399);
}
.acc-google-linked svg { width: 18px; height: 18px; }
.acc-link-btn {
  background: none;
  border: none;
  padding: 4px;
  color: var(--gz-text-tertiary);
  font-size: var(--gz-fs-xs);
  text-decoration: underline;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.acc-link-btn:hover { color: var(--gz-text-secondary); }
.acc-link-btn:disabled { opacity: 0.5; cursor: default; }

.acc-status { text-align: center; padding: 24px 0; color: var(--gz-text-muted); font-size: var(--gz-fs-sm); }
.acc-status--error { color: var(--color-loss); }
.acc-notice {
  padding: 10px 12px;
  border-radius: var(--radius-item);
  background: rgba(52,211,153,0.10);
  border: 1px solid rgba(52,211,153,0.30);
  color: #6ee7b7;
  font-size: var(--gz-fs-sm);
  text-align: center;
}
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
