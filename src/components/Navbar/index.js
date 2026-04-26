import React from "react";
import { Link } from "react-router-dom";
import {
  LuShoppingBag,
  LuChevronRight,
  LuTrophy,
  LuCalendarDays,
  LuShield,
  LuUsers,
  LuGlobe,
  LuMegaphone,
} from "react-icons/lu";
import { SiInstagram, SiFacebook, SiYoutube } from "react-icons/si";
import { themeCSS } from "../../theme";
import { AppHeader } from "../ui/AppHeader";

const Index = () => {
  return (
    <>
      <style>{styles}</style>

      <div className="ahma-root">
        <AppHeader />

        <div className="ahma-menu">
          <div className="ahma-section-heading">Pikatoiminnot</div>
          <div className="ahma-quick">
            <QuickTile
              to="/gamezone?includeAway=1&options=1"
              icon={<LuTrophy />}
              label="Ottelut"
              variant="green"
            />
            <QuickTile
              to="/gamezone/schedule"
              icon={<LuCalendarDays />}
              label="Jäävuorot"
              variant="orange"
            />
            <QuickTile
              to="/ads"
              icon={<LuMegaphone />}
              label="Mainokset"
              variant="orange"
            />
            <QuickTile
              to="/next_home_game"
              icon={<LuShield />}
              label="Edustus"
              variant="orange"
            />
            <QuickTile
              to="/teams"
              icon={<LuUsers />}
              label="Joukkueet"
              variant="purple"
            />
          </div>

          <a
            href="https://www.tiimituote.fi/c/muiden-tiimituotteet/kiekko-ahma"
            target="_blank"
            rel="noopener noreferrer"
            className="ahma-merch"
          >
            <LuShoppingBag className="ahma-merch-icon" aria-hidden="true" />
            <div className="ahma-merch-text">
              <div className="ahma-merch-title">AHMA FANITUOTTEET</div>
              <div className="ahma-merch-subtitle">
                <span>Näytä koko valikoima</span>
                <LuChevronRight className="ahma-merch-arrow" aria-hidden="true" />
              </div>
            </div>
            <img
              className="ahma-merch-image"
              src="/fanituotteet.png"
              alt=""
              aria-hidden="true"
            />
          </a>

          <div className="ahma-social-section">
            <div className="ahma-section-heading">Seuraa meitä</div>
            <div className="ahma-social">
              <SocialBtn
                href="https://kiekko-ahma.fi"
                label="Kotisivut"
                variant="web"
                icon={<LuGlobe />}
              />
              <SocialBtn
                href="https://www.instagram.com/kiekkoahmaofficial/"
                label="Instagram"
                variant="ig"
                icon={<SiInstagram />}
              />
              <SocialBtn
                href="https://www.facebook.com/kiekkoahma/"
                label="Facebook"
                variant="fb"
                icon={<SiFacebook />}
              />
              <SocialBtn
                href="https://www.youtube.com/channel/UC9EPzx8chEerImpJhjl9JVw"
                label="YouTube"
                variant="yt"
                icon={<SiYoutube />}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const SocialBtn = ({ href, label, variant, icon }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    className={`ahma-social-btn ahma-social-btn--${variant}`}
  >
    {icon}
  </a>
);

const MenuItem = ({ to, title, subtitle }) => (
  <Link to={to} className="ahma-item">
    <div>
      <div className="ahma-title">{title}</div>
      {subtitle && <div className="ahma-sub">{subtitle}</div>}
    </div>
    <span className="material-symbols-rounded ahma-arrow">&#xE5CC;</span>
  </Link>
);

const QuickTile = ({ to, icon, label, variant = "orange" }) => (
  <Link to={to} className={`ahma-quick-tile ahma-quick-tile--${variant}`}>
    <span className="ahma-quick-icon" aria-hidden="true">{icon}</span>
    <span className="ahma-quick-label">{label}</span>
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
  position: relative;
  overflow: hidden;

  min-height: 100dvh;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:flex-start;
  gap: 14px;

  /* Bottom padding clears the BottomNav (GamezoneLayout) + iOS home indicator + a small gap. */
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;

  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

/* Subtle animated bear backdrop — large, dimmed, slowly breathing logo
   sitting behind the content for a bit of life without competing with the
   title or menu items. Painted before any sibling so default stacking
   keeps the menu and hero on top. Honours prefers-reduced-motion. */
.ahma-root::before {
  content: "";
  position: absolute;
  top: 3%;
  left: 50%;
  width: min(95vw, 440px);
  aspect-ratio: 1;
  background: url('/ahma_logo.png') center top / contain no-repeat;
  opacity: 0.5;
  filter: none;
  pointer-events: none;
  transform: translateX(-50%);
  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 30%, transparent 70%);
  mask-image: linear-gradient(180deg, #000 0%, #000 30%, transparent 70%);
  animation: ahma-bg-breathe 14s ease-in-out infinite;
  will-change: transform, opacity;
  z-index: 0;
}

@keyframes ahma-bg-breathe {
  0%, 100% {
    transform: translateX(-50%) translateY(0) scale(1);
    opacity: 0.46;
  }
  50% {
    transform: translateX(-50%) translateY(-1.5%) scale(1.04);
    opacity: 0.56;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ahma-root::before {
    animation: none;
  }
}

/* Make sure the menu content sits above the backdrop. */
.ahma-root > * {
  position: relative;
  z-index: 1;
}

/* MENU LIST — wrapper that constrains width and stacks items.
   No background/border of its own; menu items render directly over the
   animated dimmed bear backdrop.
   margin-top: auto pushes the entire menu (Pikatoiminnot, OTTELUMAINOKSET,
   FANITUOTTEET, SEURAA MEITÄ) to the bottom of the page while AppHeader
   stays anchored to the top. */
.ahma-menu{
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}

/* PIKATOIMINNOT — 4-up icon grid for the most-used surfaces. Each tile
   stacks an orange icon over a small label. Sits at the top of the menu,
   replacing the previous full-width OTTELUT/JÄÄVUOROT/EDUSTUS/JOUKKUEET
   rows. */
.ahma-quick{
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.ahma-quick-tile{
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 6px 9px 6px;
  border-radius: var(--radius-item);
  /* Glassmorphism + gradient-border:
     - Sisätausta semi-transparentti, backdrop-filter sumentaa karhun
     - Border on harmaa gradientti (kirkkaampi ylhäällä, tummempi alhaalla)
       jolloin napilla on "lifted card" -reuna kuten refessä */
  background:
    linear-gradient(rgba(20, 22, 26, 0.55), rgba(20, 22, 26, 0.55)) padding-box,
    linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.05)) border-box;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid transparent;
  box-shadow: var(--shadow-item);
  text-decoration: none;
  color: var(--gz-text-primary);
  -webkit-tap-highlight-color: transparent;
}

.ahma-quick-tile:hover,
.ahma-quick-tile:visited,
.ahma-quick-tile:focus{
  text-decoration: none;
  color: var(--gz-text-primary);
}

.ahma-quick-tile:hover{
  background: rgba(0,0,0,0.55);
}

.ahma-quick-tile:active{
  background: var(--color-primary-glow);
}

/* Ikoni renderöityy suoraan tilen päällä ilman erillistä väritettyä
   container-laatikkoa — refessä ikoneilla ei ole tinted box -taustaa,
   vain ikonin oma väri näkyy. */
.ahma-quick-icon{
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ahma-quick-icon svg{
  width: 26px;
  height: 26px;
  stroke-width: 1.75;
}

/* Per-tile värivariantit — ikoni saa kategoriavärin currentColor-pohjaisesti
   (Lucide-svg:t käyttävät stroke=currentColor). */
.ahma-quick-tile--green  .ahma-quick-icon{ color: #22c55e; }
.ahma-quick-tile--orange .ahma-quick-icon{ color: var(--color-primary); }
.ahma-quick-tile--purple .ahma-quick-icon{ color: #a855f7; }
.ahma-quick-tile--blue   .ahma-quick-icon{ color: #3b82f6; }

.ahma-quick-label{
  font-size: var(--gz-fs-2xs);
  font-weight: var(--gz-fw-medium);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-secondary);
  text-align: center;
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
  color: var(--gz-text-primary);

  border-radius: var(--radius-item);
  padding: 14px 16px;

  /* Sama frosted-glass + gradient-border -tyyli kuin pikatoiminnot-tileissä. */
  background:
    linear-gradient(rgba(20, 22, 26, 0.55), rgba(20, 22, 26, 0.55)) padding-box,
    linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.05)) border-box;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid transparent;
  box-shadow: var(--shadow-item);

  -webkit-tap-highlight-color: transparent;
}

.ahma-item:hover{
  background: rgba(0,0,0,0.55);
  color: var(--gz-text-primary);
}

.ahma-item:active{
  background: var(--color-primary-glow);
}

.ahma-title{
  font-size: 14px;
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  color: var(--gz-text-primary);
}

.ahma-sub{
  font-size: var(--gz-fs-2xs);
  font-weight: var(--gz-fw-regular);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-tertiary);
  margin-top: 2px;
}

.ahma-arrow{
  font-size: 22px;
  opacity: 0.55;
  line-height: 1;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.ahma-item:hover .ahma-arrow{
  transform: scale(1.2);
  opacity: 0.85;
}

/* AHMA FANITUOTTEET banner — external link to the merch shop. Shopping
   bag icon + title/subtitle on the left, product image bleeding off the
   right edge (cropped top/bottom on purpose so the products read big),
   faded into the dark row background via mask-image. */
.ahma-merch{
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 80px;
  padding: 14px 18px;
  border-radius: var(--radius-item);
  background: rgba(20, 22, 26, 0.55);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(249, 115, 22, 0.4);
  box-shadow: var(--shadow-item), 0 0 18px rgba(249, 115, 22, 0.08);
  overflow: hidden;
  text-decoration: none;
  color: var(--gz-text-primary);
  -webkit-tap-highlight-color: transparent;
}

.ahma-merch:hover,
.ahma-merch:focus,
.ahma-merch:visited,
.ahma-merch:active{
  text-decoration: none;
  color: var(--gz-text-primary);
}

.ahma-merch:active{
  background: rgba(249, 115, 22, 0.08);
}

.ahma-merch-icon{
  position: relative;
  z-index: 1;
  width: 22px;
  height: 22px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.ahma-merch-text{
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-width: 0;
}

.ahma-merch-title{
  font-size: 14px;
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--color-primary);
}

.ahma-merch-subtitle{
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: var(--gz-fs-2xs);
  font-weight: var(--gz-fw-regular);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-secondary);
}

.ahma-merch-arrow{
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.ahma-merch-image{
  position: absolute;
  bottom: -50px;
  right: -80px;
  height: 350%;
  width: auto;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 30%);
  mask-image: linear-gradient(to right, transparent 0%, black 30%);
}

/* SOSIAALISET LINKIT — pyöreät dark glass -napit brand-värisillä
   ikoneilla, jokainen avaa seuran tilin uuteen välilehteen. Sijaitsee
   fanituote-bannerin alla otsikon kanssa, kaikki vasempaan reunaan
   linjattuna. */
.ahma-social-section{
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  margin-top: 8px;
}

/* Pieni section-heading: PIKATOIMINNOT, SEURAA MEITÄ, jne.
   Käytetään home-sivun ryhmittelevien rivinopastien yli. */
.ahma-section-heading{
  padding-left: 2px;
  font-size: 11px;
  font-weight: var(--gz-fw-medium);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--gz-text-primary);
}

/* Some-napit grid-rivinä — leveät tummat suorakaide-napit 4 sarakkeessa,
   brändi-värisillä ikoneilla. Jokainen täyttää sarakkeen leveydeltään. */
.ahma-social{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.ahma-social-btn{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 50px;
  border-radius: var(--radius-item);
  background:
    linear-gradient(rgba(20, 22, 26, 0.55), rgba(20, 22, 26, 0.55)) padding-box,
    linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.05)) border-box;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid transparent;
  text-decoration: none;
  box-shadow: var(--shadow-item);
  transition: transform 0.15s ease, background-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.ahma-social-btn:hover{
  background: rgba(0, 0, 0, 0.55);
}

.ahma-social-btn:active{
  transform: scale(0.96);
}

.ahma-social-btn svg{
  width: 26px;
  height: 26px;
}

/* Brand-värit ikoneille (taustat tummia, ikoni saa väriarvonsa color-
   propsista jonka SiX-komponentti välittää SVG:n fill-currentColor-poluille). */
.ahma-social-btn--web svg{ color: var(--color-primary); }
.ahma-social-btn--ig  svg{ color: #E1306C; }
.ahma-social-btn--fb  svg{ color: #1877F2; }
.ahma-social-btn--yt  svg{ color: #FF0000; }

/* ============ TABLET / iPAD ============ */
@media (min-width: 768px){
  .ahma-root{
    padding: 26px 26px 28px 26px;
    gap: 18px;
  }

  .ahma-menu{
    max-width: 980px;
    gap: 12px;
  }

  .ahma-item{
    padding: 14px 16px;
  }

  .ahma-quick{
    gap: 12px;
  }

  .ahma-quick-tile{
    padding: 14px 6px 12px 6px;
  }
}

/* ============ VERY SMALL ============ */
@media (max-width: 380px){
  .ahma-item{ padding: 11px 12px; }
}
`;
