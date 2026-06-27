import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  LuKeyRound,
  LuLogOut,
  LuCheck,
  LuTrash2,
  LuArrowLeft,
  LuPencil,
  LuUser,
  LuBell,
  LuSettings,
  LuShield,
  LuChevronRight,
} from "react-icons/lu";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";
import { Spinner } from "../components/ui/Spinner";
import { GoogleButton } from "../auth/GoogleButton";
import { useGoBack } from "../hooks/useGoBack";
import {
  getMe,
  getCachedUser,
  getAuthConfig,
  registerPasskey,
  loginPasskey,
  linkGoogle,
  loginGoogle,
  unlinkGoogle,
  deleteAccount,
  logout,
} from "../auth/authClient";

// Hero background for the signed-in "MINÄ" view.
const HERO = "/profile_hero.webp";

// "Jussi Lehtinen" -> "JL"; single word -> first two chars.
const initials = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const MENU = [
  { key: "profiili", Icon: LuUser, title: "Profiili", sub: "Muokkaa tietojasi" },
  { key: "ilmoitukset", Icon: LuBell, title: "Ilmoitukset", sub: "Hallinnoi ilmoituksia" },
  { key: "asetukset", Icon: LuSettings, title: "Asetukset", sub: "Sovelluksen asetukset", to: "/settings" },
  { key: "tietosuoja", Icon: LuShield, title: "Tietosuoja", sub: "Tietosuoja ja käyttöehdot" },
];

const Account = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nickname, setNickname] = useState("");
  const [clientId, setClientId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const supported = browserSupportsWebAuthn();
  const goBack = useGoBack("/");

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
    setConfirmDelete(false);
    setShowCreate(false);
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

      {supported && !loading && user ? (
        // ===== Signed-in "MINÄ" view =====
        <div className="acc-root acc-root--me">
          <div className="acc-hero">
            <img className="acc-hero-img" src={HERO} alt="" />
            <div className="acc-hero-scrim" />
            <div className="acc-hero-top">
              <button type="button" className="acc-icon-btn" onClick={goBack} aria-label="Takaisin">
                <LuArrowLeft aria-hidden="true" />
              </button>
              <div className="acc-hero-title">Minä</div>
              <span className="acc-icon-spacer" aria-hidden="true" />
            </div>
            <div className="acc-hero-center">
              <div className="acc-avatar-wrap">
                <div className="acc-avatar">{initials(user.nickname)}</div>
                <button
                  className="acc-avatar-edit"
                  onClick={() => setNotice("Profiilikuvan vaihto tulossa pian.")}
                  aria-label="Vaihda kuva"
                >
                  <LuPencil aria-hidden="true" />
                </button>
              </div>
              <div className="acc-me-name">{user.nickname || "Käyttäjä"}</div>
              <div className="acc-me-sub">Kirjautunut</div>
            </div>
          </div>

          <div className="acc-body">
            {user.googleLinked ? (
              <div className="acc-google-status">
                <div className="acc-google-linked">
                  <LuCheck aria-hidden="true" /> Google yhdistetty — kirjautuminen toimii kaikilla laitteilla
                </div>
                {user.hasPasskey && (
                  <button className="acc-link-btn" onClick={handleUnlinkGoogle} disabled={busy}>
                    Poista Google-yhteys
                  </button>
                )}
              </div>
            ) : clientId ? (
              <div className="acc-google-status">
                <div className="acc-google-label">Yhdistä Google monilaitekäyttöön</div>
                <GoogleButton clientId={clientId} onCredential={handleLinkGoogle} text="continue_with" />
              </div>
            ) : null}

            <div className="acc-menu">
              {MENU.map(({ key, Icon, title, sub, to }) => {
                const inner = (
                  <>
                    <span className="acc-menu-icon"><Icon aria-hidden="true" /></span>
                    <span className="acc-menu-text">
                      <span className="acc-menu-title">{title}</span>
                      <span className="acc-menu-sub">{sub}</span>
                    </span>
                    <LuChevronRight className="acc-menu-arrow" aria-hidden="true" />
                  </>
                );
                return to ? (
                  <Link key={key} to={to} className="acc-menu-row">{inner}</Link>
                ) : (
                  <button
                    key={key}
                    className="acc-menu-row"
                    onClick={() => setNotice(`${title} – tulossa pian.`)}
                  >
                    {inner}
                  </button>
                );
              })}
            </div>

            <button className="acc-btn acc-btn--ghost acc-full-btn" onClick={handleLogout} disabled={busy}>
              <LuLogOut aria-hidden="true" /> Kirjaudu ulos
            </button>

            {!confirmDelete ? (
              <button
                className="acc-btn acc-btn--danger-outline acc-full-btn"
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
                  <button className="acc-btn acc-btn--danger" onClick={handleDeleteAccount} disabled={busy}>
                    Poista pysyvästi
                  </button>
                  <button className="acc-btn acc-btn--ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                    Peruuta
                  </button>
                </div>
              </div>
            )}

            {notice && <div className="acc-notice">{notice}</div>}
            {error && <div className="acc-error">{error}</div>}
          </div>
        </div>
      ) : (
        // ===== Loading / signed-out view =====
        <div className="acc-root">
          <PageHeader
            title="MINÄ"
            left={
              <button type="button" className="acc-back" onClick={goBack} aria-label="Takaisin">
                <span className="material-symbols-rounded">&#xE5CB;</span>
              </button>
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

                <div className="acc-section">
                  <div className="acc-section-sub">Uusi täällä? Luo oma Gamezone-tili</div>
                  <button
                    className="acc-btn acc-btn--secondary acc-fixed-btn"
                    onClick={() => {
                      setError("");
                      setShowCreate(true);
                    }}
                    disabled={busy}
                  >
                    Luo uusi tili
                  </button>
                </div>
              </>
            )}

            {notice && <div className="acc-notice">{notice}</div>}
            {error && !showCreate && <div className="acc-error">{error}</div>}
          </div>
        </div>
      )}

      {showCreate && !user && (
        <div
          className="acc-modal-backdrop"
          onClick={() => !busy && setShowCreate(false)}
        >
          <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="acc-section-title">Luo uusi tili</div>
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
                autoFocus
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
              Google-tili käyttäjääsi myöhemmin Minä-sivulta.
            </p>
            {error && <div className="acc-error">{error}</div>}
            <button
              className="acc-link-btn"
              onClick={() => setShowCreate(false)}
              disabled={busy}
            >
              Peruuta
            </button>
          </div>
        </div>
      )}
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
/* MINÄ view: hero bleeds to the top, no side padding. */
.acc-root--me {
  gap: 0;
  padding: 0 0 var(--ui-bottom-nav-clearance, 80px);
  background: var(--color-bg);
}

.acc-back {
  display: flex; align-items: center;
  color: rgba(255,255,255,0.6);
  text-decoration: none; border-radius: 10px; padding: 2px;
  background: none; border: none; cursor: pointer;
  transition: color 0.15s;
}
.acc-back:hover { color: var(--color-primary); }
.acc-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

/* ===== MINÄ HERO ===== */
.acc-hero {
  position: relative;
  width: 100%;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% 30%, rgba(245,158,11,0.10), rgba(12,14,19,0) 60%),
    #0c0e13;
}
.acc-hero-img {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover; object-position: center;
}
.acc-hero-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(8,10,15,0.35) 0%, rgba(8,10,15,0.05) 28%, rgba(8,10,15,0.6) 72%, var(--color-bg) 100%);
}
.acc-hero-top {
  position: relative; z-index: 2;
  display: flex; align-items: center; justify-content: space-between;
  padding: calc(env(safe-area-inset-top) + 12px) 14px 0;
}
.acc-hero-title {
  font-size: 18px; font-weight: 800;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--color-primary);
  text-shadow: 0 2px 10px rgba(0,0,0,0.6);
}
.acc-icon-btn, .acc-icon-spacer {
  width: 40px; height: 40px; flex: 0 0 auto;
}
.acc-icon-btn {
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgba(0,0,0,0.38);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  color: #fff; text-decoration: none;
  border: none; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.acc-icon-btn svg { width: 22px; height: 22px; }
.acc-hero-center {
  position: relative; z-index: 2;
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 14px 18px 24px;
}
.acc-avatar-wrap { position: relative; }
.acc-avatar {
  width: 108px; height: 108px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: #16181d;
  border: 3px solid var(--color-primary);
  box-shadow: 0 0 0 5px rgba(245,158,11,0.14), 0 10px 28px rgba(0,0,0,0.55);
  color: #fff; font-weight: 800; font-size: 42px; letter-spacing: 0.03em;
}
.acc-avatar-edit {
  position: absolute; right: 0; bottom: 6px;
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--color-primary); color: #1a1206;
  border: 3px solid var(--color-bg);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.acc-avatar-edit svg { width: 16px; height: 16px; }
.acc-me-name {
  margin-top: 14px;
  font-size: 24px; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.01em;
  color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.6);
}
.acc-me-sub { font-size: var(--gz-fs-sm); color: rgba(255,255,255,0.72); }

/* ===== MINÄ BODY ===== */
.acc-body {
  width: 100%; max-width: 460px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 14px;
  padding: 14px 14px 0;
}
.acc-google-status {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}

/* Menu card */
.acc-menu {
  display: flex; flex-direction: column;
  border-radius: var(--radius-card);
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.07);
  overflow: hidden;
}
.acc-menu-row {
  display: flex; align-items: center; gap: 14px;
  width: 100%; padding: 14px 16px;
  background: none; border: none; text-align: left;
  text-decoration: none; color: var(--gz-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s;
}
.acc-menu-row + .acc-menu-row { border-top: 1px solid rgba(255,255,255,0.06); }
.acc-menu-row:hover { background: rgba(255,255,255,0.03); }
.acc-menu-icon {
  flex: 0 0 auto;
  width: 44px; height: 44px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(245,158,11,0.13);
  border: 1px solid rgba(245,158,11,0.35);
  color: var(--color-primary);
}
.acc-menu-icon svg { width: 22px; height: 22px; }
.acc-menu-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.acc-menu-title {
  font-size: var(--gz-fs-md); font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide); text-transform: uppercase;
  color: #fff;
}
.acc-menu-sub { font-size: var(--gz-fs-sm); color: var(--gz-text-tertiary); }
.acc-menu-arrow { flex: 0 0 auto; width: 20px; height: 20px; color: rgba(255,255,255,0.35); }

.acc-full-btn { width: 100%; padding: 15px 16px; }

/* ===== CARD (signed-out / loading) ===== */
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

.acc-confirm {
  width: 100%;
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

/* Signup sections */
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
.acc-section .acc-form { width: 100%; max-width: 280px; }
.acc-fixed-btn { width: 100%; max-width: 280px; }

/* Create-account dialog */
.acc-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0,0,0,0.6);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
}
.acc-modal {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 22px 20px;
  border-radius: var(--radius-card);
  background: #1c1c1f;
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: var(--shadow-card);
}
.acc-modal .acc-form { width: 100%; max-width: 300px; }
.acc-modal .acc-error { width: 100%; }
.acc-hint {
  margin: 2px 0 0;
  max-width: 320px;
  font-size: var(--gz-fs-xs);
  color: var(--gz-text-tertiary);
  text-align: center;
  line-height: 1.45;
}

/* Google bits */
.acc-google-label {
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-secondary);
  text-align: center;
  line-height: 1.4;
}
.acc-google-linked {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: var(--gz-fs-sm);
  color: var(--color-win, #34d399);
  text-align: center;
}
.acc-google-linked svg { width: 18px; height: 18px; flex: 0 0 auto; }
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
