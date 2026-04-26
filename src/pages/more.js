import React from "react";
import { Link } from "react-router-dom";
import { LuMail, LuSettings, LuChevronRight } from "react-icons/lu";
import { themeCSS } from "../theme";
import { PageHeader } from "../components/ui/PageHeader";

const More = () => {
  return (
    <>
      <style>{css}</style>
      <div className="more-root">
        <PageHeader
          title="LISÄÄ"
          left={
            <Link to="/" className="more-back" aria-label="Takaisin">
              <span className="material-symbols-rounded">&#xE5CB;</span>
            </Link>
          }
        />

        <div className="more-list">
          <ExternalRow
            href="https://www.kiekko-ahma.fi/organisaatio"
            icon={<LuMail />}
            label="Yhteystiedot"
          />
          <InternalRow
            to="/settings"
            icon={<LuSettings />}
            label="Asetukset"
          />
        </div>
      </div>
    </>
  );
};

const InternalRow = ({ to, icon, label }) => (
  <Link to={to} className="more-row">
    <span className="more-row-icon" aria-hidden="true">{icon}</span>
    <span className="more-row-label">{label}</span>
    <LuChevronRight className="more-row-arrow" aria-hidden="true" />
  </Link>
);

const ExternalRow = ({ href, icon, label }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="more-row"
  >
    <span className="more-row-icon" aria-hidden="true">{icon}</span>
    <span className="more-row-label">{label}</span>
    <LuChevronRight className="more-row-arrow" aria-hidden="true" />
  </a>
);

export default More;

const css = `${themeCSS}

html, body, #root {
  height: 100%;
  background: var(--color-bg);
}
body { margin: 0; }

.more-root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;
  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

.more-back {
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  border-radius: 10px;
  padding: 2px;
  transition: color 0.15s;
}
.more-back:hover { color: var(--color-primary); }
.more-back .material-symbols-rounded { font-size: 30px; line-height: 1; }

.more-list {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Sama frosted-glass + gradient-border -tyyli kuin etusivun napeissa */
.more-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-item);
  background:
    linear-gradient(rgba(20, 22, 26, 0.55), rgba(20, 22, 26, 0.55)) padding-box,
    linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05)) border-box;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid transparent;
  box-shadow: var(--shadow-item);
  text-decoration: none;
  color: var(--gz-text-primary);
  -webkit-tap-highlight-color: transparent;
}
.more-row:hover,
.more-row:visited,
.more-row:focus,
.more-row:active {
  text-decoration: none;
  color: var(--gz-text-primary);
}

.more-row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--color-primary);
}
.more-row-icon svg {
  width: 22px;
  height: 22px;
}

.more-row-label {
  flex: 1 1 auto;
  font-size: var(--gz-fs-md);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-primary);
}

.more-row-arrow {
  width: 18px;
  height: 18px;
  opacity: 0.5;
  flex: 0 0 auto;
}

@media (min-width: 768px) {
  .more-root {
    padding: 26px 26px 28px 26px;
  }
}
`;
