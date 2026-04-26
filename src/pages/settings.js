import React from "react";
import { Link } from "react-router-dom";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";

const Settings = () => {
  return (
    <>
      <style>{css}</style>
      <div className="settings-root">
        <PageHeader
          title="ASETUKSET"
          left={
            <Link to="/more" className="settings-back" aria-label="Takaisin">
              <span className="material-symbols-rounded">&#xE5CB;</span>
            </Link>
          }
        />

        <div className="settings-status">
          Asetukset tulossa pian.
        </div>
      </div>
    </>
  );
};

export default Settings;

const css = `${themeCSS}

html, body, #root {
  height: 100%;
  background: var(--color-bg);
}
body { margin: 0; }

.settings-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

.settings-back {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  border-radius: 10px;
  padding: 2px;
}
.settings-back:hover { color: var(--color-primary); }
.settings-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.settings-status {
  text-align: center;
  font-size: var(--gz-fs-sm);
  color: var(--gz-text-muted);
  padding: 28px 0;
}
`;
