import React, { useEffect, useState } from "react";
import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { getStats } from "../auth/authClient";

// Unlisted admin stats page (/stats) — registered-user metrics from Table
// Storage. Not in any menu. Requires login + membership in ADMIN_USER_IDS.
// Complements Cloudflare Web Analytics (traffic). Opened directly at /stats.

const fmtDateTime = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

const Stat = ({ label, value, sub }) => (
  <div className="st-card ui-surface">
    <div className="st-value">{value}</div>
    <div className="st-label">{label}</div>
    {sub != null && <div className="st-sub">{sub}</div>}
  </div>
);

const Stats = () => {
  const [state, setState] = useState({ status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getStats()
      .then((r) => !cancelled && setState(r))
      .catch((e) => !cancelled && setState({ status: "error", error: e.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  const copyId = (id) => {
    try {
      navigator.clipboard?.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const { status } = state;

  return (
    <>
      <style>{css}</style>
      <div className="st-root">
        <header className="st-head">
          <h1 className="st-title">TILASTOT</h1>
          <p className="st-subtitle">Rekisteröityneet käyttäjät</p>
        </header>

        {status === "loading" && (
          <div className="st-status"><Spinner /></div>
        )}

        {status === "unauthorized" && (
          <div className="st-status">
            Kirjaudu ensin sisään (<a className="st-link" href="/account">Minä</a>) ja palaa
            tänne.
          </div>
        )}

        {status === "forbidden" && (
          <div className="st-status st-forbidden">
            <p>Tällä tilillä ei ole admin-oikeuksia.</p>
            <p className="st-muted">
              Lisää oma userId:si SWA App settings → <code>ADMIN_USER_IDS</code> (pilkulla
              erotettu) ja päivitä sivu.
            </p>
            <button type="button" className="st-id" onClick={() => copyId(state.youAre)}>
              <code>{state.youAre}</code>
              <span className="st-copy">{copied ? "Kopioitu ✓" : "Kopioi"}</span>
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="st-status st-error">Tilastojen haku epäonnistui. {state.error}</div>
        )}

        {status === "ok" && (
          <div className="st-body">
            <div className="st-grid">
              <Stat label="Käyttäjiä yhteensä" value={state.data.totalUsers} />
              <Stat
                label="Passkey"
                value={state.data.withPasskey}
                sub={`${pct(state.data.withPasskey, state.data.totalUsers)} %`}
              />
              <Stat
                label="Google linkattu"
                value={state.data.googleLinked}
                sub={`${pct(state.data.googleLinked, state.data.totalUsers)} %`}
              />
              <Stat label="Uusia (7 pv)" value={state.data.new7} />
              <Stat label="Uusia (30 pv)" value={state.data.new30} />
              <Stat label="Profiilikuva" value={state.data.withAvatar} />
            </div>

            <h2 className="st-h2">Viimeisimmät rekisteröitymiset</h2>
            <div className="st-recent ui-surface">
              {state.data.recent.length === 0 && (
                <div className="st-empty">Ei vielä rekisteröitymisiä.</div>
              )}
              {state.data.recent.map((r, i) => (
                <div className="st-row" key={i}>
                  <span className="st-nick">{r.nickname}</span>
                  <span className={`st-method st-method--${r.method.split("+")[0]}`}>
                    {r.method}
                  </span>
                  <span className="st-date">{fmtDateTime(r.createdAt)}</span>
                </div>
              ))}
            </div>

            <p className="st-foot">
              Päivitetty {fmtDateTime(state.data.generatedAt)} · välimuisti 5 min
            </p>
          </div>
        )}
      </div>
    </>
  );
};

export default Stats;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.st-root {
  min-height: 100dvh;
  padding: 22px 14px 60px;
  max-width: 640px;
  margin: 0 auto;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
  color: var(--color-secondary);
}
.st-head { margin-bottom: 18px; }
.st-title {
  font-family: var(--font-family-display, var(--font-family-base));
  font-size: 28px; font-weight: 800; letter-spacing: 0.06em;
  margin: 0; color: var(--color-secondary);
}
.st-subtitle { margin: 2px 0 0; color: var(--color-accent); font-size: 14px; }

.st-status { text-align: center; padding: 40px 0; color: var(--color-accent); }
.st-error { color: var(--color-loss); }
.st-link { color: var(--color-primary); }

.st-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
@media (max-width: 460px) { .st-grid { grid-template-columns: repeat(2, 1fr); } }

.st-card {
  padding: 16px 12px;
  border-radius: var(--radius-item);
  text-align: center;
}
.st-value { font-size: 30px; font-weight: 800; color: var(--color-primary); line-height: 1.1; }
.st-label { font-size: 12px; color: var(--color-accent); margin-top: 4px; }
.st-sub { font-size: 12px; color: var(--color-secondary); opacity: 0.7; margin-top: 2px; }

.st-h2 { font-size: 15px; font-weight: 700; margin: 24px 0 10px; color: var(--color-secondary); }
.st-recent { border-radius: var(--radius-card); overflow: hidden; }
.st-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  font-size: 14px;
}
.st-row:last-child { border-bottom: none; }
.st-nick { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-method {
  font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px;
  background: rgba(255,255,255,0.08); color: var(--color-accent);
}
.st-method--passkey { background: rgba(var(--color-primary-rgb),0.16); color: var(--color-primary); }
.st-method--google { background: rgba(96,165,250,0.16); color: #93c5fd; }
.st-date { font-size: 12px; color: var(--color-accent); white-space: nowrap; }
.st-empty { padding: 16px; text-align: center; color: var(--color-accent); }
.st-foot { margin-top: 14px; font-size: 12px; color: var(--color-accent); opacity: 0.7; text-align: center; }

.st-forbidden p { margin: 0 0 8px; }
.st-muted { color: var(--color-accent); font-size: 13px; }
.st-muted code, .st-forbidden code { background: rgba(255,255,255,0.08); padding: 1px 6px; border-radius: 6px; }
.st-id {
  display: inline-flex; align-items: center; gap: 10px;
  margin-top: 8px; padding: 8px 12px; cursor: pointer;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.14);
  border-radius: 10px; color: var(--color-secondary); font-family: inherit;
}
.st-copy { font-size: 12px; color: var(--color-primary); font-weight: 700; }
`;
