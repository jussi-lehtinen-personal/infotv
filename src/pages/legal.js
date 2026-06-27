import React from "react";
import { useParams } from "react-router-dom";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";
import { useGoBack } from "../hooks/useGoBack";
import { LEGAL_DOCS } from "../data/legalDocs";

const Legal = () => {
  const { doc } = useParams();
  const goBack = useGoBack("/account/privacy");
  const data = LEGAL_DOCS[doc];

  return (
    <>
      <style>{css}</style>
      <div className="lg-root">
        <PageHeader
          title={(data && data.title) || "—"}
          left={
            <button type="button" className="lg-back" onClick={goBack} aria-label="Takaisin">
              <span className="material-symbols-rounded">&#xE5CB;</span>
            </button>
          }
        />

        <div className="lg-card">
          {!data ? (
            <p className="lg-intro">Asiakirjaa ei löytynyt.</p>
          ) : (
            <>
              <p className="lg-updated">Päivitetty {data.updated}</p>
              {data.intro && <p className="lg-intro">{data.intro}</p>}
              {data.sections.map((s, i) => (
                <section key={i} className="lg-section">
                  <h2 className="lg-h">{s.h}</h2>
                  {Array.isArray(s.p) ? (
                    <ul className="lg-list">
                      {s.p.map((item, j) => (
                        <li key={j}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="lg-p">{s.p}</p>
                  )}
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default Legal;

/* ================== STYLES ================== */

const css = `${themeCSS}

html, body, #root { height: 100%; background: var(--color-bg); }
body { margin: 0; }

.lg-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}
.lg-back {
  display: flex; align-items: center;
  color: rgba(255,255,255,0.6);
  background: none; border: none; cursor: pointer;
  border-radius: 10px; padding: 2px;
  transition: color 0.15s;
}
.lg-back:hover { color: var(--color-primary); }
.lg-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.lg-card {
  width: 100%; max-width: 640px; margin: 0 auto;
  display: flex; flex-direction: column; gap: 18px;
  padding: 4px 14px;
}
.lg-updated {
  margin: 0;
  font-size: var(--gz-fs-xs);
  color: var(--gz-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--gz-ls-wide);
}
.lg-intro {
  margin: 0;
  font-size: var(--gz-fs-md);
  color: var(--gz-text-secondary);
  line-height: 1.55;
}
.lg-section { display: flex; flex-direction: column; gap: 6px; }
.lg-h {
  margin: 0;
  font-size: var(--gz-fs-md);
  font-weight: 800;
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-primary);
}
.lg-p {
  margin: 0;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-secondary);
  line-height: 1.55;
}
.lg-list {
  margin: 0;
  padding-left: 20px;
  display: flex; flex-direction: column; gap: 4px;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-secondary);
  line-height: 1.5;
}
`;
