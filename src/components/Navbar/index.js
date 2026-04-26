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

const Index = () => {
  const [news, setNews] = useState([]);
  const [heroMatch, setHeroMatch] = useState(null);

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

  // Hakee seuraavan tulevan Ahma-ottelun /api/getGames -rajapinnasta hero-
  // korttiin. Ensin nykyinen viikko, jos ei tulevia niin seuraava viikko.
  // Jos ei mitään, jätetään null ja hero-kortti piilotetaan.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = new Date();
      const isoDate = (d) => d.toISOString().slice(0, 10);
      const findUpcoming = (matches) =>
        (matches || []).find((m) => parseMatchDate(m.date) > now);
      try {
        const r1 = await fetch(`/api/getGames?date=${isoDate(now)}&includeAway=1`);
        const w1 = r1.ok ? await r1.json() : [];
        let next = findUpcoming(w1);
        if (!next) {
          const nextWeekDate = new Date(now.getTime() + 7 * 86400000);
          const r2 = await fetch(`/api/getGames?date=${isoDate(nextWeekDate)}&includeAway=1`);
          const w2 = r2.ok ? await r2.json() : [];
          next = findUpcoming(w2);
        }
        if (next && !cancelled) setHeroMatch(matchToHeroData(next));
      } catch {
        // Silent failure — hero-kortti piilotetaan.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <style>{styles}</style>

      <div className="ahma-root">
        <AppHeader />

        <div className="ahma-menu">
          <HeroMatchCard match={heroMatch} />

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

// Hero match card näyttää seuraavan tulevan Ahma-ottelun etusivun
// huipulla. Datalähde: /api/getGames; matchToHeroData muotoilee
// rajapinnan match-objektin kortin odottamaan muotoon.
const FINNISH_WEEKDAYS = [
  "Sunnuntai", "Maanantai", "Tiistai", "Keskiviikko",
  "Torstai", "Perjantai", "Lauantai",
];

// API palauttaa muodossa "YYYY-MM-DD HH:mm" — muunnetaan ISO-yhteensopivaan
// muotoon jotta Date-konstruktori toimii Safarissa.
const parseMatchDate = (s) => new Date(String(s).replace(" ", "T"));

const matchToHeroData = (m) => {
  const d = parseMatchDate(m.date);
  const weekday = FINNISH_WEEKDAYS[d.getDay()];
  const dayMonth = `${d.getDate()}.${d.getMonth() + 1}`;
  const time = d.toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });
  // splitTeamName karsii pois variantti-sanat (Sininen, Junior, jne.) ja
  // typistää liian pitkät nimet — sama logiikka kuin ottelumainoksissa.
  return {
    tag: "SEURAAVA OTTELU",
    homeTeam: splitTeamName(m.home || "").main,
    awayTeam: splitTeamName(m.away || "").main,
    dateText: `${weekday} ${dayMonth} · ${time}`,
    location: m.rink,
    url: `https://tulospalvelu.leijonat.fi/game/?season=0&gameid=${m.id}&lang=fi`,
    backgroundImage: "/hero_1.png",
  };
};

const HeroMatchCard = ({ match }) => {
  const empty = !match;
  const bgImage = (match && match.backgroundImage) || "/hero_1.png";

  // Empty-tilassa kortti ei vie minnekään (placeholder); muuten linkki
  // joko sisäiseen reittiin (Link) tai ulkoiseen URL:iin (<a target=_blank>).
  let Wrapper, wrapperProps;
  if (empty) {
    Wrapper = "div";
    wrapperProps = {};
  } else {
    const url = match.url || "#";
    const isExternal = /^https?:\/\//i.test(url);
    Wrapper = isExternal ? "a" : Link;
    wrapperProps = isExternal
      ? { href: url, target: "_blank", rel: "noopener noreferrer" }
      : { to: url };
  }

  return (
    <Wrapper className="ahma-hero" {...wrapperProps}>
      <div
        className="ahma-hero-bg"
        style={{ backgroundImage: `url(${bgImage})` }}
      />
      <div className="ahma-hero-overlay" />
      <div className="ahma-hero-content">
        <div className="ahma-hero-tag">SEURAAVA OTTELU</div>
        {empty ? (
          <div className="ahma-hero-title ahma-hero-title--empty">
            Ei tulevia otteluita
          </div>
        ) : (
          <>
            <div className="ahma-hero-title">
              {match.homeTeam} vs. {match.awayTeam}
            </div>
            <div className="ahma-hero-meta">{match.dateText}</div>
            {match.location && (
              <div className="ahma-hero-meta">
                <span
                  className="material-symbols-rounded ahma-hero-loc-icon"
                  aria-hidden="true"
                >
                  &#xE0C8;
                </span>
                {match.location}
              </div>
            )}
            <span className="ahma-hero-cta">
              Näytä ottelu <LuChevronRight aria-hidden="true" />
            </span>
          </>
        )}
      </div>
      <div className="ahma-hero-dots" aria-hidden="true">
        <span className="ahma-hero-dot ahma-hero-dot--active" />
        <span className="ahma-hero-dot" />
        <span className="ahma-hero-dot" />
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
  width: 100%;
  height: 220px;
  border-radius: var(--radius-item);
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: var(--shadow-item);
  text-decoration: none;
  color: var(--gz-text-primary);
  -webkit-tap-highlight-color: transparent;
  /* Default-fallback tausta jos backgroundImage puuttuu */
  background:
    linear-gradient(135deg, #1c2330 0%, #0e1118 60%, #1a0f0a 100%);
}
.ahma-hero:hover,
.ahma-hero:visited,
.ahma-hero:focus,
.ahma-hero:active{
  text-decoration: none;
  color: var(--gz-text-primary);
}

.ahma-hero-bg{
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  z-index: 0;
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
  font-size: var(--gz-fs-xs);
  font-weight: var(--gz-fw-bold);
  letter-spacing: var(--gz-ls-wide);
  text-transform: uppercase;
  color: var(--color-primary);
  margin-bottom: 4px;
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

/* Carousel-pisteet — aktiivinen oranssi, isompi pylpyrä */
.ahma-hero-dots{
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 5px;
  z-index: 3;
}

.ahma-hero-dot{
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255,255,255,0.30);
  transition: width 0.2s, background-color 0.2s;
}

.ahma-hero-dot--active{
  background: var(--color-primary);
  width: 18px;
  border-radius: 3px;
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

.ahma-quick-tile:hover{
  background: rgba(0,0,0,0.55);
}

.ahma-quick-tile:active{
  background: var(--color-primary-glow);
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
