import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuArrowLeft, LuDatabase, LuRefreshCw, LuCheckCircle, LuAlertTriangle } from "react-icons/lu";
import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { getBackups, runBackup } from "../auth/authClient";

// Admin › Varmuuskopiot (/admin/backups). Shows the latest backup time + a list,
// and a "Luo nyt" button. Backups run daily via a GitHub Actions cron hitting
// /api/exportBackup. See memory: project_backups.

const fmtDateTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}.${p(d.getMinutes())}`;
};

const ago = (iso) => {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const h = (Date.now() - t) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min sitten`;
  if (h < 48) return `${Math.round(h)} h sitten`;
  return `${Math.round(h / 24)} pv sitten`;
};

const fmtSize = (n) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// A backup is "stale" (warn) if the newest is older than ~26 h (daily cron).
const isStale = (iso) => {
  const t = new Date(iso).getTime();
  return isNaN(t) || Date.now() - t > 26 * 3_600_000;
};

const AdminBackups = () => {
  const [state, setState] = useState({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    getBackups()
      .then((r) => setState(r))
      .catch((e) => setState({ status: "error", error: e.message }));
  };
  useEffect(() => {
    let cancelled = false;
    getBackups()
      .then((r) => !cancelled && setState(r))
      .catch((e) => !cancelled && setState({ status: "error", error: e.message }));
    return () => { cancelled = true; };
  }, []);

  const createNow = async () => {
    setBusy(true);
    setErr("");
    try {
      await runBackup();
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const { status } = state;
  const data = status === "ok" ? state.data : null;
  const latest = data && data.latest;
  const stale = latest && isStale(latest.createdAt);

  return (
    <>
      <style>{css}</style>
      <div className="ab-root">
        <header className="ab-head">
          <Link to="/admin" className="ab-back" aria-label="Takaisin">
            <LuArrowLeft aria-hidden="true" />
          </Link>
          <div>
            <h1 className="ab-title">VARMUUSKOPIOT</h1>
            <p className="ab-subtitle">Käyttäjät, roolit, asetukset</p>
          </div>
        </header>

        {status === "loading" && <div className="ab-status"><Spinner /></div>}
        {status === "unauthorized" && (
          <div className="ab-status">Kirjaudu ensin sisään (<Link className="ab-link" to="/account">Minä</Link>).</div>
        )}
        {status === "forbidden" && <div className="ab-status">Tällä tilillä ei ole admin-oikeuksia.</div>}
        {status === "error" && <div className="ab-status ab-error">Lataus epäonnistui. {state.error}</div>}

        {status === "ok" && (
          <>
            <div className={`ab-latest ui-surface${stale ? " ab-latest--stale" : ""}`}>
              <div className="ab-latest-icon">
                {latest ? (stale ? <LuAlertTriangle aria-hidden="true" /> : <LuCheckCircle aria-hidden="true" />) : <LuAlertTriangle aria-hidden="true" />}
              </div>
              <div className="ab-latest-main">
                {latest ? (
                  <>
                    <div className="ab-latest-when">{fmtDateTime(latest.createdAt)}</div>
                    <div className="ab-latest-sub">
                      Viimeisin varmuuskopio · {ago(latest.createdAt)}
                      {stale ? " · vanhentunut!" : ""}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="ab-latest-when">Ei varmuuskopioita</div>
                    <div className="ab-latest-sub">Luo ensimmäinen alta.</div>
                  </>
                )}
              </div>
              <div className="ab-latest-count">{data.total}<span>kpl</span></div>
            </div>

            {err && <div className="ab-err">{err}</div>}

            <button type="button" className="ab-run" onClick={createNow} disabled={busy}>
              <LuRefreshCw className={busy ? "ab-spin" : ""} aria-hidden="true" />
              {busy ? "Luodaan…" : "Luo varmuuskopio nyt"}
            </button>

            <div className="ab-list">
              {data.backups.length === 0 && <div className="ab-empty">Ei varmuuskopioita vielä.</div>}
              {data.backups.map((b) => (
                <div className="ab-row" key={b.name}>
                  <LuDatabase className="ab-row-ico" aria-hidden="true" />
                  <span className="ab-row-when">{fmtDateTime(b.createdAt)}</span>
                  <span className="ab-row-size">{fmtSize(b.size)}</span>
                </div>
              ))}
            </div>

            <p className="ab-foot">
              Automaattinen varmuuskopio kerran vuorokaudessa (GitHub Actions).
              Retentio: 14 päivittäistä + 8 viikoittaista + 6 kuukausittaista.
            </p>
          </>
        )}
      </div>
    </>
  );
};

export default AdminBackups;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.ab-root {
  min-height: 100dvh; padding: 22px 14px 60px; max-width: 640px; margin: 0 auto;
  background: var(--bg-gradient); font-family: var(--font-family-base); color: var(--color-secondary);
}
.ab-head { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.ab-back {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: 999px; flex: 0 0 auto;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);
  color: var(--color-secondary); font-size: 18px; text-decoration: none;
}
.ab-title {
  font-family: var(--font-family-display, var(--font-family-base));
  font-size: 26px; font-weight: 800; letter-spacing: 0.06em; margin: 0; color: var(--color-secondary);
}
.ab-subtitle { margin: 2px 0 0; color: var(--color-accent); font-size: 13px; }
.ab-status { text-align: center; padding: 40px 0; color: var(--color-accent); }
.ab-error { color: var(--color-loss); }
.ab-link { color: var(--color-primary); }

.ab-latest {
  display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: var(--radius-card);
}
.ab-latest--stale { border-color: rgba(251,191,36,0.5); }
.ab-latest-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 42px; height: 42px; border-radius: 12px; flex: 0 0 auto; font-size: 22px;
  background: rgba(74,222,128,0.16); color: var(--color-live);
}
.ab-latest--stale .ab-latest-icon { background: rgba(251,191,36,0.16); color: var(--color-accent-yellow); }
.ab-latest-main { flex: 1 1 auto; min-width: 0; }
.ab-latest-when { font-size: 16px; font-weight: 700; }
.ab-latest-sub { font-size: 12px; color: var(--color-accent); margin-top: 2px; }
.ab-latest-count { font-size: 26px; font-weight: 800; color: var(--color-primary); line-height: 1; text-align: center; }
.ab-latest-count span { display: block; font-size: 10px; font-weight: 600; color: var(--color-accent); letter-spacing: 0.06em; }

.ab-err { margin: 12px 0 0; font-size: 13px; color: var(--color-loss); }
.ab-run {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; margin: 14px 0 20px; padding: 13px; border-radius: var(--radius-item); cursor: pointer;
  border: 1px solid rgba(var(--color-primary-rgb),0.4);
  background: rgba(var(--color-primary-rgb),0.12); color: var(--color-primary);
  font-family: inherit; font-size: 14px; font-weight: 700;
}
.ab-run:disabled { opacity: 0.6; cursor: default; }
.ab-spin { animation: ab-spin 1s linear infinite; }
@keyframes ab-spin { to { transform: rotate(360deg); } }

.ab-list { display: flex; flex-direction: column; gap: 6px; }
.ab-row {
  display: flex; align-items: center; gap: 10px; padding: 11px 14px;
  border-radius: var(--radius-item); background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
  font-size: 14px;
}
.ab-row-ico { color: var(--color-accent); flex: 0 0 auto; }
.ab-row-when { flex: 1 1 auto; }
.ab-row-size { font-size: 12px; color: var(--color-accent); }
.ab-empty { padding: 20px; text-align: center; color: var(--color-accent); }
.ab-foot { margin-top: 16px; font-size: 12px; color: var(--color-accent); opacity: 0.75; line-height: 1.5; }
`;
