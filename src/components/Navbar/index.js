import React from "react";
import { Link } from "react-router-dom";
import moment from "moment";

const getWeek = (offset) => {
  const now = new Date();
  const date = new Date(now.setDate(now.getDate() + offset * 7));
  return moment(date).format("YYYY-MM-DD");
};

const Index = () => {
  return (
    <>
      <style>{styles}</style>

      <div className="ahma-root">

        {/* MENU CARD */}
        <div className="ahma-card">

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
            to={"/week/" + getWeek(-1) + "?includeAway=1"}
            title="VIIME VIIKON TULOKSET"
            subtitle="Viime viikon kotiottelut ja tulokset"
          />

          <MenuItem
            // Mobile-appissa halutaan koti + vieras:
            to="/this_week?includeAway=1"
            title="TÄMÄN VIIKON OTTELUT"
            subtitle="Ajankohtaiset koti- ja vieraspelit"
            highlight
          />

          <MenuItem
            to={"/week/" + getWeek(1) + "?includeAway=1"}
            title="OTTELUT (+1 VIIKKO)"
          />

          <MenuItem
            to={"/week/" + getWeek(2) + "?includeAway=1"}
            title="OTTELUT (+2 VIIKKOA)"
          />

          <MenuItem
            to={"/week/" + getWeek(3) + "?includeAway=1"}
            title="OTTELUT (+3 VIIKKOA)"
          />

          <MenuItem
            to={"/week/" + getWeek(4) + "?includeAway=1"}
            title="OTTELUT (+4 VIIKKOA)"
          />

          <MenuItem
            to="/schedule"
            title="JÄÄVUOROKALENTERI"
          />

        </div>
      </div>
    </>
  );
};

const MenuItem = ({ to, title, subtitle, highlight }) => (
  <Link to={to} className={`ahma-item ${highlight ? "ahma-highlight" : ""}`}>
    <div>
      <div className="ahma-title">{title}</div>
      {subtitle && <div className="ahma-sub">{subtitle}</div>}
    </div>
    <div className="ahma-arrow">›</div>
  </Link>
);

export default Index;

/* ================== THEME ================== */

const styles = `

html, body{
  margin:0;
  background:#0f1112; /* sama kuin sun gradientin alku */
}

.ahma-root{
  min-height: 100dvh;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  gap: 14px;

  padding: 10px 7px 10px 7px;

  /* Vaaleampi “sports app” tausta */
  background:
    radial-gradient(circle at 50% 0%, rgba(243, 223, 191, 0.22), transparent 55%),
    linear-gradient(180deg, #0f1112 0%, #101213 55%, #090b0b 100%);

  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
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

/* CARD (surface) */
.ahma-card{
  width:100%;
  max-width: 520px;
  flex: 1 1 auto;

  border-radius: 18px;
  padding: 12px;

  /* selkeämpi surface + erottuvuus */
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 14px 34px rgba(0,0,0,0.35);

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
  color: rgba(255,255,255,0.95);

  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;

  /* flat + selkeä erottuvuus */
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 6px 14px rgba(0,0,0,0.40);
}

.ahma-item:last-child{ margin-bottom:0; }

.ahma-item:hover{
  background: rgba(255,255,255,0.20);
  transform: translateY(-1px);
}

/* Highlight (This Week) */
.ahma-highlight{
  background: rgba(245,158,11,0.24);
  border-color: rgba(245,158,11,0.55);
  color: #ffffff;
}

.ahma-appTitle{
  font-size: clamp(28px, 6vw, 42px);
  letter-spacing: 3px;
  margin-top: 8px;
  color: #f59e0b;
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
  font-size: 22px;
  opacity: 0.45;
  line-height: 1;
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

    /* tabletilla vähän “korttimaisempi” */
    background: rgba(255,255,255,0.10);
    border-color: rgba(255,255,255,0.16);
  }

  /* 2-column menu tabletilla */
  .ahma-card{
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
