import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LuShieldCheck, LuScale, LuChevronRight, LuTrash2 } from "react-icons/lu";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";
import { useGoBack } from "../hooks/useGoBack";
import { getMe, getCachedUser, deleteAccount } from "../auth/authClient";

const Privacy = () => {
  const goBack = useGoBack("/account");
  const navigate = useNavigate();
  const [user, setUser] = useState(getCachedUser);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    <>
      <style>{css}</style>
      <div className="pr-root">
        <PageHeader
          title="TIETOSUOJA"
          left={
            <button type="button" className="pr-back" onClick={goBack} aria-label="Takaisin">
              <span className="material-symbols-rounded">&#xE5CB;</span>
            </button>
          }
        />

        <div className="pr-card">
          <div className="pr-section-title">Omat tietoni</div>
          <div className="pr-info">
            <div className="pr-info-row">
              <span>Nimimerkki</span>
              <strong>{(user && user.nickname) || "—"}</strong>
            </div>
            {user && user.email && (
              <div className="pr-info-row">
                <span>Sähköposti</span>
                <strong>{user.email}</strong>
              </div>
            )}
            <div className="pr-info-row">
              <span>Google</span>
              <strong>{user && user.googleLinked ? "Yhdistetty" : "Ei yhdistetty"}</strong>
            </div>
          </div>

          <div className="pr-links">
            <button className="pr-link-row" onClick={() => setNotice("Tietosuojaseloste tulossa pian.")}>
              <span className="pr-link-icon"><LuShieldCheck aria-hidden="true" /></span>
              <span className="pr-link-label">Tietosuojaseloste</span>
              <LuChevronRight className="pr-link-arrow" aria-hidden="true" />
            </button>
            <button className="pr-link-row" onClick={() => setNotice("Käyttöehdot tulossa pian.")}>
              <span className="pr-link-icon"><LuScale aria-hidden="true" /></span>
              <span className="pr-link-label">Käyttöehdot</span>
              <LuChevronRight className="pr-link-arrow" aria-hidden="true" />
            </button>
          </div>

          {notice && <div className="pr-notice">{notice}</div>}

          {!confirmDelete ? (
            <button
              type="button"
              className="pr-btn pr-btn--danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              <LuTrash2 aria-hidden="true" /> Poista tili
            </button>
          ) : (
            <div className="pr-confirm">
              <div className="pr-confirm-text">
                Oletko varma? Tämä poistaa tilisi, passkeyt, profiilikuvan ja
                mahdollisen Google-yhteyden pysyvästi. Tätä ei voi peruuttaa.
              </div>
              <div className="pr-confirm-actions">
                <button className="pr-btn pr-btn--danger-solid" onClick={handleDelete} disabled={busy}>
                  Poista pysyvästi
                </button>
                <button className="pr-btn pr-btn--ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Peruuta
                </button>
              </div>
            </div>
          )}

          {error && <div className="pr-error">{error}</div>}
        </div>
      </div>
    </>
  );
};

export default Privacy;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.pr-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}
.pr-back {
  display: flex; align-items: center;
  color: rgba(255,255,255,0.6);
  background: none; border: none; cursor: pointer;
  border-radius: 10px; padding: 2px;
  transition: color 0.15s;
}
.pr-back:hover { color: var(--color-primary); }
.pr-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.pr-card {
  width: 100%; max-width: 460px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 14px;
  padding: 18px 16px;
}
.pr-section-title {
  font-size: var(--gz-fs-xs);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-tertiary);
}

.pr-info {
  display: flex; flex-direction: column;
  border-radius: var(--radius-card);
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.07);
  overflow: hidden;
}
.pr-info-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 13px 16px;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-tertiary);
}
.pr-info-row + .pr-info-row { border-top: 1px solid rgba(255,255,255,0.06); }
.pr-info-row strong {
  color: var(--gz-text-primary);
  font-weight: var(--gz-fw-bold);
  max-width: 60%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.pr-links {
  display: flex; flex-direction: column;
  border-radius: var(--radius-card);
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.07);
  overflow: hidden;
}
.pr-link-row {
  display: flex; align-items: center; gap: 14px;
  width: 100%; padding: 14px 16px;
  background: none; border: none; text-align: left; cursor: pointer;
  color: var(--gz-text-primary);
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s;
}
.pr-link-row + .pr-link-row { border-top: 1px solid rgba(255,255,255,0.06); }
.pr-link-row:hover { background: rgba(255,255,255,0.03); }
.pr-link-icon {
  flex: 0 0 auto; width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: rgba(245,158,11,0.13); border: 1px solid rgba(245,158,11,0.35);
  color: var(--color-primary);
}
.pr-link-icon svg { width: 20px; height: 20px; }
.pr-link-label {
  flex: 1; min-width: 0;
  font-size: var(--gz-fs-md); font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide); text-transform: uppercase;
}
.pr-link-arrow { flex: 0 0 auto; width: 20px; height: 20px; color: rgba(255,255,255,0.35); }

.pr-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 14px 16px;
  border-radius: var(--radius-item);
  border: 1px solid transparent;
  font-size: var(--gz-fs-md); font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide); cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: filter 0.15s, background 0.15s;
}
.pr-btn svg { width: 18px; height: 18px; }
.pr-btn:disabled { opacity: 0.5; cursor: default; }
.pr-btn--danger {
  background: transparent;
  border-color: rgba(239,68,68,0.45);
  color: #f87171;
}
.pr-btn--danger:not(:disabled):hover { background: rgba(239,68,68,0.10); }
.pr-btn--danger-solid { background: #dc2626; color: #fff; flex: 1; }
.pr-btn--danger-solid:not(:disabled):hover { filter: brightness(1.08); }
.pr-btn--ghost {
  background: transparent; border-color: rgba(255,255,255,0.16);
  color: var(--gz-text-secondary); flex: 1;
}
.pr-btn--ghost:not(:disabled):hover { background: rgba(255,255,255,0.06); }

.pr-confirm {
  display: flex; flex-direction: column; gap: 12px;
  padding: 14px; border-radius: var(--radius-item);
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.30);
}
.pr-confirm-text { font-size: var(--gz-fs-sm); color: #fca5a5; text-align: center; line-height: 1.45; }
.pr-confirm-actions { display: flex; gap: 8px; }

.pr-notice {
  padding: 10px 12px; border-radius: var(--radius-item);
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  color: var(--gz-text-secondary); font-size: var(--gz-fs-sm); text-align: center;
}
.pr-error {
  padding: 10px 12px; border-radius: var(--radius-item);
  background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.30);
  color: #fca5a5; font-size: var(--gz-fs-sm); text-align: center;
}
`;
