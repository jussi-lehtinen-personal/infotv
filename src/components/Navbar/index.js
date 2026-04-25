import React from "react";
import { Link } from "react-router-dom";
import { themeCSS } from "../../theme";
import { Surface } from "../ui/Surface";

const Index = () => {
  return (
    <>
      <style>{styles}</style>

      <div className="ahma-root">

        {/* MENU CARD */}
        <Surface className="ahma-card">

          {/* HERO */}
          <div className="ahma-appTitle">AHMA GAMEZONE</div>
          <div className="ahma-hero">
            <img
              src="/ahma_logo.png"
              alt="Kiekko-Ahma"
              className="ahma-logo"
            />
          </div>

          <MenuItem
            // Mobile-appissa halutaan koti + vieras + asetukset (suosikit-nappi):
            to="/gamezone?includeAway=1&options=1"
            title="OTTELUT JA TULOKSET"
            subtitle="Selaa Ahma-joukkueiden pelejä ja tuloksia"
          />

          <MenuItem
            to="/schedule"
            title="JÄÄVUOROKALENTERI"
          />

          <MenuItem
            to="/teams"
            title="JOUKKUEET"
            subtitle="Valitse suosikkijoukkueesi"
          />

          <MenuItem
            to="/next_home_game"
            title="EDUSTUSJOUKKUE"
            subtitle="Edustusjoukkueen seuraava kotipeli"
          />

          <MenuItem
            to="/ads"
            title="OTTELUMAINOKSET"
            subtitle="Lataa valmiit ottelumainokset"
          />

        </Surface>
      </div>
    </>
  );
};

const MenuItem = ({ to, title, subtitle }) => (
  <Link to={to} className="ahma-item">
    <div>
      <div className="ahma-title">{title}</div>
      {subtitle && <div className="ahma-sub">{subtitle}</div>}
    </div>
    <span className="material-symbols-rounded ahma-arrow">&#xE5CC;</span>
  </Link>
);

export default Index;

/* ================== THEME ================== */

const styles = `${themeCSS}

.ahma-item,
.ahma-item:visited,
.ahma-item:hover,
.ahma-item:active{
  color: var(--color-secondary);
  text-decoration: none;
}

html, body, #root {
  height: 100%;
  background: var(--color-bg);
}
body { margin: 0; }

.ahma-root{
  min-height: 100dvh;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  gap: 14px;

  padding: 10px 7px 10px 7px;

  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

/* HERO */
.ahma-hero{
  flex: 0 0 auto;
  text-align:center;
}

.ahma-logo{
  width: min(58vw, 240px);
  max-height: 24vh;
  object-fit: contain;
  filter: drop-shadow(0 10px 26px rgba(0,0,0,0.55));
}

/* CARD — ui-surface antaa bg/border/radius/shadow/padding */
.ahma-card{
  width:100%;
  max-width: 520px;
  flex: 1 1 auto;
  display:flex;
  flex-direction:column;
  justify-content:start;
}

/* MENU ITEM */
.ahma-item{
  position: relative;
  overflow: hidden;

  display:flex;
  justify-content:space-between;
  align-items:center;
  gap: 12px;

  text-decoration:none;
  color: var(--color-secondary);

  border-radius: var(--radius-item);
  padding: 12px 14px;
  margin-bottom: 10px;

  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: var(--shadow-item);
}

.ahma-item:last-child{ margin-bottom:0; }

.ahma-item:hover{
  background: rgba(255,255,255,0.20);
  color: var(--color-secondary);
  transform: translateY(-1px);
}

.ahma-appTitle{
  font-size: var(--size-heading-xl);
  letter-spacing: 3px;
  margin-top: 8px;
  color: var(--color-primary);
  text-align:center;

  text-shadow: 0 6px 18px rgba(0,0,0,0.6);
}

.ahma-title{
  font-size: 15px;
  font-weight: 750;
  letter-spacing: 0.15px;
}

.ahma-sub{
  font-size: 12px;
  opacity: 0.78;
  margin-top: 2px;
}

.ahma-arrow{
  font-size: 26px;
  opacity: 0.55;
  line-height: 1;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.ahma-item:hover .ahma-arrow{
  transform: scale(1.2);
  opacity: 0.85;
}

/* ============ TABLET / iPAD ============ */
@media (min-width: 768px){
  .ahma-root{
    padding: 26px 26px 28px 26px;
    gap: 18px;
  }

  .ahma-logo{
    width: min(34vw, 300px);
    max-height: 22vh;
  }

  .ahma-card{
    max-width: 980px;
    padding: 16px;
    background: rgba(255,255,255,0.10);
    border-color: rgba(255,255,255,0.16);
    display:grid;
    grid-template-columns: 1fr;
    gap: 12px;
    align-content: start;
  }

  .ahma-item{
    margin-bottom: 0; /* grid hoitaa välit */
    padding: 14px 16px;
  }

  .ahma-title{ font-size: 16px; }
  .ahma-sub{ font-size: 12px; }
}

/* ============ VERY SMALL ============ */
@media (max-width: 380px){
  .ahma-title{ font-size: 14px; }
  .ahma-sub{ font-size: 11px; }
  .ahma-item{ padding: 11px 12px; }
}
`;
