import React, { useEffect, useState } from "react";
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
  LuMoreHorizontal,
} from "react-icons/lu";
import { SiInstagram, SiFacebook, SiYoutube } from "react-icons/si";
import { themeCSS } from "../../theme";
import { splitTeamName } from "../../Util";
import { AppHeader } from "../ui/AppHeader";
import { NewsCard } from "../ui/NewsCard";
import {
  useHeroMatches,
  isLiveMatch,
  parseMatchDate,
} from "../../hooks/useHeroMatches";

const Index = () => {
  const [news, setNews] = useState([]);
  const { matches: heroMatches } = useHeroMatches();

  useEffect(() => {
    fetch('/gamezone-news.json')
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        // Lajitellaan päivämäärän mukaan uusin ensin — JSON-tiedoston
        // järjestyksellä ei ole väliä, ylläpitäjä voi lisätä mihin kohtaan
        // tahansa.
        const sorted = [...data].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );
        setNews(sorted);
      })
      .catch(() => {
        // Silent failure — Ajankohtaista-sektio piilotetaan jos data ei lataudu.
      });
  }, []);

  return (
    <>
      <style>{styles}</style>

      <div className="ahma-root">
        <AppHeader />

        <div className="ahma-menu">
          <HeroCarousel matches={heroMatches} />

          <div className="ahma-section-heading">Pikatoiminnot</div>
          <div className="ahma-quick">
            <QuickTile
              to="/gamezone?includeAway=1&options=1"
              icon={<LuTrophy />}
              label="Ottelut"
            />
            <QuickTile
              to="/gamezone/schedule"
              icon={<LuCalendarDays />}
              label="Jäävuorot"
            />
            <QuickTile
              to="/teams"
              icon={<LuUsers />}
              label="Joukkueet"
            />
            <QuickTile
              to="/ads"
              icon={<LuMegaphone />}
              label="Mainokset"
            />
            <QuickTile
              to="/next_home_game"
              icon={<LuShield />}
              label="Edustus"
            />
            <QuickTile
              to="/more"
              icon={<LuMoreHorizontal />}
              label="Lisää"
            />
          </div>

          {news.length > 0 && <NewsSection news={news} />}

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
                href="https://www.instagram.com/kiekkoahmaofficial/"
                label="Instagram"
                icon={<SiInstagram />}
              />
              <SocialBtn
                href="https://www.facebook.com/kiekkoahma/"
                label="Facebook"
                icon={<SiFacebook />}
              />
              <SocialBtn
                href="https://www.youtube.com/channel/UC9EPzx8chEerImpJhjl9JVw"
                label="YouTube"
                icon={<SiYoutube />}
              />
              <SocialBtn
                href="https://kiekko-ahma.fi"
                label="Kotisivut"
                icon={<LuGlobe />}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const SocialBtn = ({ href, label, icon }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    className="ahma-social-btn"
  >
    <span className="ahma-social-btn-circle">{icon}</span>
  </a>
);

const QuickTile = ({ to, icon, label }) => (
  <Link to={to} className="ahma-quick-tile">
    <span className="ahma-quick-icon" aria-hidden="true">{icon}</span>
    <span className="ahma-quick-label">{label}</span>
  </Link>
);

// Hero-korttikarusellin etusivun yläosassa. useHeroMatches palauttaa 0-3
// peli-objektia API-rajapinnasta. Tyhjä tila näyttää placeholder-kortin.
const FINNISH_WEEKDAYS = [
  "Sunnuntai", "Maanantai", "Tiistai", "Keskiviikko",
  "Torstai", "Perjantai", "Lauantai",
];

const formatMatchDate = (m) => {
  const d = parseMatchDate(m.date);
  const weekday = FINNISH_WEEKDAYS[d.getDay()];
  const dayMonth = `${d.getDate()}.${d.getMonth() + 1}`;
  const time = d.toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${weekday} ${dayMonth} · ${time}`;
};

// Eri taustakuva per kortti-slot, kierrätetään kolmella saatavilla olevalla
// hero-kuvalla. Empty-fallbackin slot 0 saa hero_1.
const HERO_BACKGROUNDS = ["/hero_1.png", "/hero_2.png", "/hero_3.png"];

// Karusellin wrapper — näyttää aktiivisen kortin täysleveänä, dots indikoi
// muut. Klikkaamalla pisteitä vaihtaa korttia. Ei swipe-elettä alkuvaiheessa
// — voidaan lisätä myöhemmin samaan tapaan kuin /gamezone-sivulla.
const HeroCarousel = ({ matches }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const cards = matches.length > 0 ? matches : [null];
  const safeIndex = Math.min(activeIndex, cards.length - 1);
  const bgImage = HERO_BACKGROUNDS[safeIndex % HERO_BACKGROUNDS.length];

  return (
    <div className="ahma-hero-carousel">
      <HeroMatchCard match={cards[safeIndex]} backgroundImage={bgImage} />
      {cards.length > 1 && (
        <div className="ahma-hero-dots">
          {cards.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`ahma-hero-dot${
                i === safeIndex ? " ahma-hero-dot--active" : ""
              }`}
              onClick={() => setActiveIndex(i)}
              aria-label={`Kortti ${i + 1}/${cards.length}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const HeroMatchCard = ({ match, backgroundImage = "/hero_1.png" }) => {
  const empty = !match;
  const live = !empty && isLiveMatch(match);
  const bgImage = backgroundImage;

  // Empty-tilassa kortti ei vie minnekään (placeholder); muuten linkki
  // ulkoiseen tulospalvelu-sivuun.
  let Wrapper, wrapperProps;
  if (empty) {
    Wrapper = "div";
    wrapperProps = {};
  } else {
    const url = `https://tulospalvelu.leijonat.fi/game/?season=0&gameid=${match.id}&lang=fi`;
    Wrapper = "a";
    wrapperProps = { href: url, target: "_blank", rel: "noopener noreferrer" };
  }

  const homeTeam = !empty ? splitTeamName(match.home || "").main : "";
  const awayTeam = !empty ? splitTeamName(match.away || "").main : "";
  const league = !empty ? match.level || "" : "";

  return (
    <Wrapper
      className="ahma-hero"
      style={{ backgroundImage: `url(${bgImage})` }}
      {...wrapperProps}
    >
      <div className="ahma-hero-overlay" />
      <div className="ahma-hero-content">
        <div className="ahma-hero-tag">
          {live && <span className="ahma-hero-live-dot" aria-hidden="true" />}
          <span>{live ? "LIVE" : "SEURAAVA OTTELU"}</span>
          {league && <span className="ahma-hero-tag-league"> · {league}</span>}
        </div>
        {empty ? (
          <div className="ahma-hero-title ahma-hero-title--empty">
            Ei tulevia otteluita
          </div>
        ) : (
          <>
            <div className="ahma-hero-title">
              {homeTeam}{" "}
              {live ? (
                <span className="ahma-hero-score">
                  {match.home_goals}–{match.away_goals}
                </span>
              ) : (
                "vs."
              )}{" "}
              {awayTeam}
            </div>
            <div className="ahma-hero-meta">{formatMatchDate(match)}</div>
            {match.rink && (
              <div className="ahma-hero-meta">
                <span
                  className="material-symbols-rounded ahma-hero-loc-icon"
                  aria-hidden="true"
                >
                  &#xE0C8;
                </span>
                {match.rink}
              </div>
            )}
            <span className="ahma-hero-cta">
              {live ? "Katso ottelu" : "Näytä ottelu"}{" "}
              <LuChevronRight aria-hidden="true" />
            </span>
          </>
        )}
      </div>
    </Wrapper>
  );
};

// Tiivis vertikaalinen uutislista — pikkukuva vasemmalla, otsikko + päivä
// oikealla. Näyttää vain ensimmäiset 3 uutista; loput "Näytä kaikki" -linkin
// takana (toteutetaan vaiheessa C).
const NEWS_PREVIEW_COUNT = 2;

const NewsSection = ({ news }) => (
  <section className="ahma-news">
    <div className="ahma-news-header">
      <div className="ahma-section-heading">Ajankohtaista</div>
      <Link to="/news" className="ahma-news-show-all">
        Näytä kaikki <LuChevronRight aria-hidden="true" />
      </Link>
    </div>
    <div className="ahma-news-list">
      {news.slice(0, NEWS_PREVIEW_COUNT).map((item) => (
        <NewsCard key={item.id || item.url} item={item} />
      ))}
    </div>
  </section>
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
  /* AppHeader ylös ja .ahma-menu alas — natiivi flex-jako, ei margin-trickkejä
     jotka voivat ylivenyttää sivua iOS:n viewport-quirkeissä. */
  justify-content:space-between;
  gap: 14px;

  /* Bottom padding clears the BottomNav (GamezoneLayout) + iOS home indicator + a small gap. */
  padding: 10px 7px var(--ui-bottom-nav-clearance, 80px) 7px;

  background: var(--bg-gradient);
  font-family: var(--font-family-base);
}

/* MENU LIST — wrapper that constrains width and stacks items.
   Bottom-anchoring tehdään .ahma-rootin justify-content: space-between
   -säädöllä, ei margin-top: auto -trickillä. */
.ahma-menu{
  width: 100%;
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* HERO MATCH CARD — etusivun ylin elementti, näyttää tämän/seuraavan
   pelin: tag (TÄNÄÄN/HUOMENNA) + otsikko (joukkueet) + päivä/aika +
   paikka + CTA-nappi. Tausta on kuva (jos annettu), muuten tumma
   gradientti. Carousel-pisteet pohjassa visuaalisena indikaattorina —
   itse swipe-toiminta tulee vaiheessa E kun datakin on aitoa. */
.ahma-hero{
  position: relative;
  display: block;
  width: 100%;
  height: 220px;
  border-radius: var(--radius-item);
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: var(--shadow-item);
  text-decoration: none;
  color: var(--gz-text-primary);
  -webkit-tap-highlight-color: transparent;
  /* Tausta tulee inline-stylestä (HeroMatchCard prop). Fallback-väri jos
     kuva ei lataudu. */
  background-color: #0e1118;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}
.ahma-hero:hover,
.ahma-hero:visited,
.ahma-hero:focus,
.ahma-hero:active{
  text-decoration: none;
  color: var(--gz-text-primary);
}

/* Dark gradient overlay tekstin luettavuuden takia */
.ahma-hero-overlay{
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.20) 30%, rgba(0,0,0,0.85) 100%);
  z-index: 1;
}

.ahma-hero-content{
  position: relative;
  z-index: 2;
  height: 100%;
  padding: 14px 16px 30px 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 2px;
}

.ahma-hero-tag{
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--gz-fs-xs);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--color-primary);
  margin-bottom: 4px;
}

/* Sarja-suffiksi tagissa "SEURAAVA OTTELU · U11 AA" — heikompi väri jotta
   ensisijainen tagi (LIVE/SEURAAVA OTTELU) erottuu. */
.ahma-hero-tag-league{
  color: rgba(255,255,255,0.7);
  font-weight: var(--gz-fw-medium);
}

/* Punainen pulssipiste LIVE-tilaisuudessa — pulse-animaatio alla. */
.ahma-hero-live-dot{
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
  animation: ahma-hero-live-pulse 1.6s ease-in-out infinite;
}
@keyframes ahma-hero-live-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
  70%  { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

/* LIVE-tilan score otsikon keskellä — isompi numero kuin tavallinen text. */
.ahma-hero-score{
  font-weight: var(--gz-fw-black);
  color: var(--color-primary);
  margin: 0 4px;
}

.ahma-hero-title{
  font-size: 22px;
  font-weight: var(--gz-fw-black);
  line-height: 1.15;
  color: #fff;
  margin-bottom: 6px;
}

.ahma-hero-meta{
  font-size: var(--gz-fs-xs);
  color: rgba(255,255,255,0.85);
  line-height: 1.35;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* Location pin -ikoni meta-rivin alussa — sama Material Symbols glyph
   (place, U+E0C8) jota gamezone-sivu käyttää match-korteissa. */
.ahma-hero-loc-icon{
  font-size: 16px;
  line-height: 1;
  color: var(--color-primary);
}

/* Empty-tilan otsikko (kun ei tulevia otteluita) — kevyempi, ei tarvitse
   lihavointia vasta lopulliselle hero-tiedolle. */
.ahma-hero-title--empty{
  font-weight: var(--gz-fw-medium);
  font-size: 18px;
  opacity: 0.85;
}

.ahma-hero-cta{
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  margin-top: 10px;
  padding: 7px 12px;
  background: rgba(0,0,0,0.5);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 8px;
  font-size: var(--gz-fs-2xs);
  font-weight: var(--gz-fw-medium);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: #fff;
}
.ahma-hero-cta svg{
  width: 12px;
  height: 12px;
}

/* Carousel-wrapper — sisältää kortin + dots-rivin alla */
.ahma-hero-carousel{
  position: relative;
}

/* Carousel-pisteet — kortin alla erillisenä rivinä, klikattavissa.
   Aktiivinen oranssi pylpyrä. */
.ahma-hero-dots{
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 8px;
}

.ahma-hero-dot{
  width: 7px;
  height: 7px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255,255,255,0.28);
  cursor: pointer;
  transition: width 0.2s, background-color 0.2s;
  -webkit-tap-highlight-color: transparent;
}

.ahma-hero-dot--active{
  background: var(--color-primary);
  width: 20px;
  border-radius: 4px;
}

/* PIKATOIMINNOT — 4-up icon grid for the most-used surfaces. Each tile
   stacks an orange icon over a small label. Sits at the top of the menu,
   replacing the previous full-width OTTELUT/JÄÄVUOROT/EDUSTUS/JOUKKUEET
   rows. */
.ahma-quick{
  display: grid;
  grid-template-columns: repeat(3, 1fr);
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

/* Hover/active eivät voi muuttaa background-shorthandia (rikkoisi gradient-
   borderin multi-bg setupin). Käytetään sen sijaan box-shadow-rinkiä ja
   pieniä transform-säätöjä. */
.ahma-quick-tile:hover{
  box-shadow: var(--shadow-item), 0 0 0 1px rgba(255,255,255,0.18);
}

.ahma-quick-tile:active{
  transform: scale(0.97);
  box-shadow: var(--shadow-item), 0 0 0 1px rgba(249, 115, 22, 0.45);
}

/* Ikoni renderöityy suoraan tilen päällä ilman erillistä väritettyä
   container-laatikkoa — refessä ikoneilla ei ole tinted box -taustaa,
   vain ikonin oma väri näkyy. Kaikki ikonit oransseja. */
.ahma-quick-icon{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
}

.ahma-quick-icon svg{
  width: 26px;
  height: 26px;
  stroke-width: 1.75;
}

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

/* Sama hover/active -treatment kuin pikatoiminnot-tileissä — box-shadow
   ei riko gradient-border-multi-bg-setuppia kuten background-shorthand. */
.ahma-item:hover{
  box-shadow: var(--shadow-item), 0 0 0 1px rgba(255,255,255,0.18);
  color: var(--gz-text-primary);
}

.ahma-item:active{
  transform: scale(0.99);
  box-shadow: var(--shadow-item), 0 0 0 1px rgba(249, 115, 22, 0.45);
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
  -webkit-mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 45%, black 55%);
  mask-image: linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 45%, black 55%);
}

/* AJANKOHTAISTA — vertikaalinen lista, jokainen rivi: pikkukuva vasemmalla
   + otsikko ja päivä oikealla. Datalähde: public/gamezone-news.json.
   Klikkaus avaa ulkoisen URL:n uuteen välilehteen. */
.ahma-news{
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Heading-rivi: section-otsikko vasemmalla + "Näytä kaikki" -linkki
   oranssina oikealla. */
.ahma-news-header{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ahma-news-show-all{
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--gz-fs-2xs);
  font-weight: var(--gz-fw-medium);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--color-primary);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}
.ahma-news-show-all:hover,
.ahma-news-show-all:visited,
.ahma-news-show-all:focus,
.ahma-news-show-all:active{
  color: var(--color-primary);
  text-decoration: none;
}
.ahma-news-show-all svg{
  width: 12px;
  height: 12px;
}

.ahma-news-list{
  display: flex;
  flex-direction: column;
  gap: 8px;
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

/* Some-napit — flex 4 yhtä leveää slottia. Kukin slotin keskellä
   pyöreä tumma 36×36 nappi valkoisella ikonilla. Slottin koko alue on
   klikattava. Yhteneväinen tumma sävy, ei brand-värejä. */
.ahma-social{
  display: flex;
  flex-direction: row;
}

.ahma-social-btn{
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
  color: #fff;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
}

.ahma-social-btn:hover,
.ahma-social-btn:visited,
.ahma-social-btn:focus,
.ahma-social-btn:active{
  color: #fff;
  text-decoration: none;
}

.ahma-social-btn-circle{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  transition: transform 0.15s ease, background-color 0.15s ease;
}

.ahma-social-btn:hover .ahma-social-btn-circle{
  background: rgba(255, 255, 255, 0.12);
}

.ahma-social-btn:active .ahma-social-btn-circle{
  transform: scale(0.94);
}

.ahma-social-btn svg{
  width: 16px;
  height: 16px;
  color: #fff;
}

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
