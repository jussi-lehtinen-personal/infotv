import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useGoBack } from "../hooks/useGoBack";
import { LuArrowLeft, LuShirt, LuUsers, LuPhone, LuBarChart3, LuTable, LuTarget, LuShield } from "react-icons/lu";
import { themeCSS } from "../theme";
import { Spinner } from "../components/ui/Spinner";
import { ContactCard } from "../components/ui/ContactCard";
import { findJopoxTeam } from "../data/jopoxTeams";

// Hero image. Swap to a real per-team hero photo later.
const HERO_PLACEHOLDER = "/gamezone_3d.webp";

const isGoalie = (p) => /maalivahti|goalie|gk/i.test(p.position || "");
const byNumber = (a, b) => {
  const na = a.number == null ? 9999 : parseInt(a.number, 10);
  const nb = b.number == null ? 9999 : parseInt(b.number, 10);
  return na - nb;
};

// "KAUSI 2026–2027" — the hockey season rolls to the next one in late spring
// (the previous one ends ~May/June), matching tulospalvelu's "current" season.
const seasonLabel = () => {
  const d = new Date();
  const start = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `KAUSI ${start}–${start + 1}`;
};

const Avatar = ({ photo, className }) => {
  const [failed, setFailed] = useState(false);
  if (photo && !failed) {
    return (
      <img className={className} src={photo} alt="" loading="lazy" onError={() => setFailed(true)} />
    );
  }
  return (
    <div className={`${className} tm-av--ph`} aria-hidden="true">
      <span className="material-symbols-rounded">&#xE7FD;</span>
    </div>
  );
};

const PlayerCard = ({ p }) => (
  <div className="tm-pcard">
    <Avatar photo={p.photo} className="tm-pphoto" />
    <div className="tm-pinfo">
      <div className="tm-pnum">
        {p.number != null ? p.number : ""}
        {p.captain ? <span className="tm-badge">C</span> : null}
        {p.viceCaptain ? <span className="tm-badge">A</span> : null}
      </div>
      <div className="tm-pname">{p.firstName}</div>
      <div className="tm-pname">{p.lastName}</div>
      {p.position && <div className="tm-ppos">{p.position}</div>}
    </div>
  </div>
);

const Team = () => {
  const { subsiteId } = useParams();
  const goBack = useGoBack("/teams");
  const known = findJopoxTeam(subsiteId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Two "modes" (Joukkue / Tilastot) switched by a toggle OR a horizontal swipe;
  // each mode has its own tab row + content.
  const [mode, setMode] = useState("joukkue"); // "joukkue" | "tilastot"
  const [jTab, setJTab] = useState("players"); // players | officials | contacts
  const [tTab, setTTab] = useState("standings"); // standings | scorers | goalies

  // Lightweight horizontal-swipe → switch mode (ignores mostly-vertical drags so
  // it doesn't fight scrolling).
  const touch = useRef({ x: 0, y: 0 });
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setMode(dx < 0 ? "tilastot" : "joukkue");
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/getTeamRoster?subsiteId=${encodeURIComponent(subsiteId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subsiteId]);

  const heroTitle = `Kiekko-Ahma ${known?.name || data?.teamName || ""}`.trim();

  const players = data?.players || [];
  const field = players.filter((p) => !isGoalie(p)).sort(byNumber);
  const goalies = players.filter(isGoalie).sort(byNumber);
  const officials = data?.officials || [];
  const contacts = officials.filter((o) => o.email || o.phone);

  return (
    <>
      <style>{css}</style>
      <div className="tm-root">
        {/* HERO (placeholder = centered Ahma logo; swap to a per-team photo later) */}
        <div className="tm-hero">
          <img className="tm-hero-logo" src={HERO_PLACEHOLDER} alt="" />
          <div className="tm-hero-top">
            <button className="tm-icon-btn" onClick={goBack} aria-label="Takaisin">
              <LuArrowLeft />
            </button>
          </div>
          <div className="tm-hero-scrim" />
          <div className="tm-hero-titles">
            <h1 className="tm-hero-name">{heroTitle}</h1>
            <div className="tm-hero-season">{seasonLabel()}</div>
          </div>
        </div>

        {/* MODE TOGGLE + PAGE DOTS */}
        <div className="tm-modebar">
          <div className="tm-modetoggle" role="tablist" aria-label="Joukkue tai Tilastot">
            <button
              type="button"
              role="tab"
              className={`tm-mode${mode === "joukkue" ? " tm-mode--active" : ""}`}
              onClick={() => setMode("joukkue")}
              aria-selected={mode === "joukkue"}
            >
              <LuUsers className="tm-mode-ico" aria-hidden="true" /> <span>Joukkue</span>
            </button>
            <button
              type="button"
              role="tab"
              className={`tm-mode${mode === "tilastot" ? " tm-mode--active" : ""}`}
              onClick={() => setMode("tilastot")}
              aria-selected={mode === "tilastot"}
            >
              <LuBarChart3 className="tm-mode-ico" aria-hidden="true" /> <span>Tilastot</span>
            </button>
          </div>
          <div className="tm-dots" aria-hidden="true">
            <span className={`tm-dot${mode === "joukkue" ? " tm-dot--active" : ""}`} />
            <span className={`tm-dot${mode === "tilastot" ? " tm-dot--active" : ""}`} />
          </div>
        </div>

        <div className="tm-swipe" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {/* TABS (per mode) */}
          <div className="tm-tabs" role="tablist">
            {(mode === "joukkue"
              ? [["players", "Pelaajat", LuShirt], ["officials", "Toimihenkilöt", LuUsers], ["contacts", "Yhteystiedot", LuPhone]]
              : [["standings", "Sarjataulukko", LuTable], ["scorers", "Pistepörssi", LuTarget], ["goalies", "MV", LuShield]]
            ).map(([key, label, Icon]) => {
              const active = mode === "joukkue" ? jTab === key : tTab === key;
              const set = mode === "joukkue" ? setJTab : setTTab;
              return (
                <button
                  key={key}
                  role="tab"
                  className={`tm-tab${active ? " tm-tab--active" : ""}`}
                  onClick={() => set(key)}
                >
                  <Icon className="tm-tab-ico" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* CONTENT */}
          <div className="tm-content">
            {mode === "joukkue" ? (
              <>
                {loading && <div className="tm-status"><Spinner /></div>}
                {error && (
                  <div className="tm-status tm-status--error">
                    Joukkueen tietoja ei saatu haettua. Yritä myöhemmin uudelleen.
                  </div>
                )}

                {!loading && !error && data && jTab === "players" && (
                  <>
                    {data.description && <p className="tm-desc">{data.description}</p>}
                    <h2 className="tm-h">Pelaajat <span className="tm-count">({field.length})</span></h2>
                    <div className="tm-grid">
                      {field.map((p, i) => <PlayerCard key={i} p={p} />)}
                    </div>
                    {goalies.length > 0 && (
                      <>
                        <h2 className="tm-h">Maalivahdit <span className="tm-count">({goalies.length})</span></h2>
                        <div className="tm-grid">
                          {goalies.map((p, i) => <PlayerCard key={i} p={p} />)}
                        </div>
                      </>
                    )}
                    {players.length === 0 && <div className="tm-status">Ei kokoonpanoa saatavilla.</div>}
                  </>
                )}

                {!loading && !error && data && jTab === "officials" && (
                  <>
                    <h2 className="tm-h">Toimihenkilöt <span className="tm-count">({officials.length})</span></h2>
                    <div className="tm-list">
                      {officials.map((o, i) => (
                        <div className="tm-orow" key={i}>
                          <Avatar photo={o.photo} className="tm-ophoto" />
                          <div className="tm-oinfo">
                            <div className="tm-oname">{o.name}</div>
                            <div className="tm-orole">{o.role}</div>
                          </div>
                        </div>
                      ))}
                      {officials.length === 0 && <div className="tm-status">Ei toimihenkilöitä.</div>}
                    </div>
                  </>
                )}

                {!loading && !error && data && jTab === "contacts" && (
                  <div className="tm-contacts">
                    {contacts.map((o, i) => (
                      <ContactCard
                        key={i}
                        name={o.name}
                        role={o.role}
                        email={o.email}
                        phone={o.phone}
                        photo={o.photo}
                      />
                    ))}
                    {contacts.length === 0 && <div className="tm-status">Ei yhteystietoja.</div>}
                  </div>
                )}
              </>
            ) : (
              <div className="tm-status tm-soon">
                {tTab === "standings" ? "Sarjataulukko" : tTab === "scorers" ? "Pistepörssi" : "Maalivahtitilastot"} — tulossa.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Team;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.tm-root {
  min-height: 100dvh;
  background: #0a0b0e;
  font-family: var(--font-family-base);
  padding-bottom: var(--ui-bottom-nav-clearance, 80px);
}

/* HERO */
.tm-hero {
  position: relative;
  width: 100%;
  height: 300px;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% 30%, rgba(var(--color-primary-rgb),0.10), rgba(12,14,19,0) 60%),
    #0c0e13;
}
/* Hero image — fills the whole hero area. */
.tm-hero-logo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}
.tm-hero-top {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; justify-content: space-between; align-items: center;
  padding: calc(env(safe-area-inset-top) + 12px) 14px 0;
  z-index: 2;
}
.tm-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(0,0,0,0.38); backdrop-filter: blur(6px);
  border: none; color: #fff; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.tm-icon-btn svg { width: 22px; height: 22px; }
.tm-hero-scrim {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(8,10,15,0.15) 0%, rgba(8,10,15,0) 35%, rgba(8,10,15,0.55) 72%, var(--color-bg) 100%);
}
.tm-hero-titles {
  position: absolute; left: 0; right: 0; bottom: 12px;
  padding: 0 18px; z-index: 1;
  text-align: center;
}
.tm-hero-name {
  margin: 0;
  font-size: clamp(26px, 7vw, 34px);
  font-weight: 800;
  letter-spacing: 0.01em;
  text-transform: uppercase;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0,0,0,0.6);
}
.tm-hero-season {
  margin-top: 2px;
  font-size: var(--gz-fs-sm);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  color: rgba(255,255,255,0.72);
}

/* MODE TOGGLE (Joukkue / Tilastot) + page dots */
.tm-modebar {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 14px 12px 10px;
}
.tm-modetoggle {
  display: flex; gap: 4px; padding: 4px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.10);
}
.tm-mode {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 9px 18px; border-radius: 999px; border: none; background: none;
  color: var(--gz-text-tertiary); cursor: pointer; font-family: inherit;
  font-size: var(--gz-fs-sm); font-weight: 800; letter-spacing: var(--gz-ls-wide);
  -webkit-tap-highlight-color: transparent; transition: background 0.18s, color 0.18s;
}
.tm-mode-ico { width: 18px; height: 18px; flex: 0 0 auto; }
.tm-mode--active { background: var(--color-primary); color: var(--color-on-primary); }
/* Page dots — same style as the home hero carousel (7px dot, active = 20px pill). */
.tm-dots { display: flex; justify-content: center; gap: 6px; }
.tm-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(255,255,255,0.28); transition: width 0.2s, background-color 0.2s;
}
.tm-dot--active { background: var(--color-primary); width: 20px; border-radius: 4px; }

/* TABS */
.tm-tabs {
  display: flex;
  gap: 6px;
  padding: 4px 12px 0;
  border-bottom: 1px solid rgba(255,255,255,0.10);
  position: sticky; top: 0; z-index: 3;
  background: var(--color-bg);
}
.tm-tab {
  flex: 1 1 0;
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 10px 6px;
  background: none; border: none;
  color: var(--gz-text-tertiary);
  font-size: var(--gz-fs-sm);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  -webkit-tap-highlight-color: transparent;
}
.tm-tab-ico { width: 20px; height: 20px; flex: 0 0 auto; }
.tm-tab--active { color: var(--color-primary); border-bottom-color: var(--color-primary); }

/* CONTENT */
.tm-content { padding: 16px 12px 0; max-width: 760px; margin: 0 auto; }
.tm-status { text-align: center; padding: 28px 0; color: var(--gz-text-muted); font-size: var(--gz-fs-sm); }
.tm-status--error { color: var(--color-loss); }
.tm-soon { padding: 48px 0; }
.tm-desc { color: var(--gz-text-secondary); font-size: var(--gz-fs-sm); margin: 0 0 14px; }

.tm-h {
  font-size: var(--gz-fs-md);
  font-weight: 800;
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-primary);
  margin: 8px 0 10px;
}
.tm-count { color: var(--gz-text-tertiary); font-weight: var(--gz-fw-regular); }

/* PLAYER GRID (2 columns) */
.tm-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 18px;
}
.tm-pcard {
  display: flex; align-items: center; gap: 12px;
  padding: 10px;
  border-radius: var(--radius-item);
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.06);
}
.tm-pphoto {
  flex: 0 0 auto; width: 62px; height: 80px;
  border-radius: 10px;
  /* cover = never stretches (preserves aspect); top = keep the head, crop legs */
  object-fit: cover; object-position: center top;
  background: rgba(255,255,255,0.05);
}
.tm-pinfo { min-width: 0; line-height: 1.18; }
.tm-pnum { font-size: 17px; font-weight: 800; color: var(--color-primary); }
.tm-pname { font-size: var(--gz-fs-sm); font-weight: var(--gz-fw-medium); color: var(--gz-text-primary); }
.tm-ppos { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); margin-top: 2px; }
.tm-badge {
  display: inline-block; margin-left: 6px;
  font-size: 10px; font-weight: 800; color: var(--color-primary);
  border: 1px solid var(--color-primary); border-radius: 4px; padding: 0 3px;
  vertical-align: middle;
}

/* OFFICIALS / CONTACTS (single column) */
.tm-list { display: flex; flex-direction: column; gap: 8px; }
.tm-orow {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-item);
  background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.07);
}
.tm-orow--contact { background: rgba(var(--color-primary-rgb),0.09); border-color: rgba(var(--color-primary-rgb),0.28); }
.tm-ophoto {
  flex: 0 0 auto; width: 62px; height: 80px;
  border-radius: 10px;
  object-fit: cover; object-position: center top;
  background: rgba(255,255,255,0.05);
}
.tm-av--ph {
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.28);
}
.tm-av--ph .material-symbols-rounded { font-size: 26px; }
.tm-pphoto.tm-av--ph .material-symbols-rounded { font-size: 30px; }
.tm-oinfo { min-width: 0; }
.tm-oname { font-weight: var(--gz-fw-bold); color: var(--gz-text-primary); }
.tm-orole { font-size: var(--gz-fs-xs); color: var(--gz-text-tertiary); text-transform: uppercase; letter-spacing: var(--gz-ls-wide); }
/* CONTACTS tab uses the shared <ContactCard> (.ui-contact-* in index.css) */
.tm-contacts { display: flex; flex-direction: column; gap: 12px; }

@media (min-width: 768px) {
  .tm-grid { grid-template-columns: repeat(3, 1fr); }
}
`;
