import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";

// Kannattajajäsenten lista. Data tulee staattisesta public/supporters.json
// -tiedostosta — sama kevyt malli kuin /news (gamezone-news.json). Listan
// päivitys = muokkaa supporters.json + deploy.
//
// Tiedoston muoto on tarkoituksella mahdollisimman helppo käsin ylläpidettävä:
// pelkkä taulukko nimi-merkkijonoja. Tämä sivu sietää myös {name}-objekteja,
// jos muotoa joskus laajennetaan.
const toName = (entry) => {
  if (typeof entry === "string") return entry.trim();
  if (entry && typeof entry === "object" && typeof entry.name === "string") {
    return entry.name.trim();
  }
  return "";
};

const Supporters = () => {
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/supporters.json")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const cleaned = data
            .map(toName)
            .filter(Boolean)
            // Aakkostus suomalaisittain (ä/ö oikeilla paikoillaan).
            .sort((a, b) => a.localeCompare(b, "fi"));
          setNames(cleaned);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const count = names.length;
  const subtitle = loading
    ? null
    : count > 0
    ? `${count} ${count === 1 ? "kannattaja" : "kannattajaa"}`
    : null;

  return (
    <>
      <style>{css}</style>
      <div className="sup-root">
        <PageHeader
          title="KANNATTAJAT"
          subtitle={subtitle}
          left={
            <Link to="/more" className="sup-back" aria-label="Takaisin">
              <span className="material-symbols-rounded">&#xE5CB;</span>
            </Link>
          }
        />

        <div className="sup-content">
          <p className="sup-intro">
            Kiitos, että tuette Kiekko-Ahmaa kannattajajäsenenä. 🧡
          </p>

          {loading && <div className="sup-status">Ladataan…</div>}

          {error && (
            <div className="sup-status sup-status--error">
              Listan lataus epäonnistui.
            </div>
          )}

          {!loading && !error && count === 0 && (
            <div className="sup-status">Ei kannattajajäseniä vielä.</div>
          )}

          {!loading && !error && count > 0 && (
            <ul className="sup-list">
              {names.map((name, i) => (
                <li key={`${name}-${i}`} className="sup-item">
                  <span className="sup-bullet" aria-hidden="true" />
                  <span className="sup-name">{name}</span>
                </li>
              ))}
            </ul>
          )}

          <a
            className="sup-cta"
            href="https://www.kiekko-ahma.fi/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Haluatko mukaan?</span>
            <span>Liity kannattajajäseneksi</span>
          </a>
        </div>
      </div>
    </>
  );
};

export default Supporters;

const css = `${themeCSS}

html, body, #root {
  height: 100%;
  background: var(--color-bg);
}
body { margin: 0; }

.sup-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  /* Bottom padding clears the BottomNav (GamezoneLayout) + iOS home indicator. */
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

/* Sama back-link -tyyli kuin /more ja /news -sivuilla. */
.sup-back {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  border-radius: 10px;
  padding: 2px;
  transition: color 0.15s;
}
.sup-back:hover { color: var(--color-primary); }
.sup-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.sup-content {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sup-intro {
  margin: 0;
  text-align: center;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-muted);
}

/* Frosted-glass -kortti, jonka sisällä nimet responsiivisena gridinä.
   Yksisarakkeinen kapealla, useampi sarake leveämmällä näytöllä. */
.sup-list {
  list-style: none;
  margin: 0;
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px 18px;
  border-radius: var(--radius-card);
  background:
    linear-gradient(rgba(20, 22, 26, 0.55), rgba(20, 22, 26, 0.55)) padding-box,
    linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05)) border-box;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid transparent;
  box-shadow: var(--shadow-card);
}

.sup-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: var(--radius-small);
}

.sup-bullet {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
}

.sup-name {
  flex: 1 1 auto;
  font-size: var(--gz-fs-md);
  font-weight: var(--gz-fw-medium);
  color: var(--gz-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sup-status {
  text-align: center;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-muted);
  padding: 28px 0;
}
.sup-status--error { color: var(--color-loss); }

.sup-cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
  font-size: var(--gz-fs-sm);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  color: var(--color-primary);
  text-decoration: none;
  padding: 6px 0 2px;
}
.sup-cta:hover { text-decoration: underline; }

@media (min-width: 560px) {
  .sup-list {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 768px) {
  .sup-root {
    padding: 26px 26px 28px 26px;
  }
}
`;
