import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  LuHome,
  LuTrophy,
  LuCalendarDays,
  LuUsers,
  LuMegaphone,
  LuShield,
  LuNewspaper,
  LuMail,
  LuHeart,
  LuMessageSquare,
  LuSettings,
  LuKeyRound,
  LuX,
} from "react-icons/lu";

// Full navigation, in display order. `external` rows open in a new tab.
const NAV_SECTIONS = [
  [
    { to: "/", label: "Etusivu", Icon: LuHome },
    { to: "/gamezone?includeAway=1&options=1", label: "Ottelut", Icon: LuTrophy },
    { to: "/gamezone/schedule", label: "Jäävuorot", Icon: LuCalendarDays },
    { to: "/teams", label: "Joukkueet", Icon: LuUsers },
    { to: "/ads", label: "Mainokset", Icon: LuMegaphone },
    { to: "/next_home_game", label: "Edustus", Icon: LuShield },
    { to: "/news", label: "Uutiset", Icon: LuNewspaper },
  ],
  [
    { to: "/tili", label: "Tili", Icon: LuKeyRound },
    { to: "/organisaatio", label: "Yhteystiedot", Icon: LuMail },
    { to: "/supporters", label: "Kannattajajäsenet", Icon: LuHeart },
    {
      href: "https://forms.office.com/pages/responsepage.aspx?id=lnGL4VX2Lku9oA4GU2KdCUogyNsQep9AiquFHORrgR1UN1ZONVk2VTEzSDJHS0QwN0EyQzlWTFNJMy4u&route=shorturl",
      label: "Palaute",
      Icon: LuMessageSquare,
      external: true,
    },
    { to: "/settings", label: "Asetukset", Icon: LuSettings },
  ],
];

export const NavDrawer = ({ open, onClose }) => {
  // Close on Escape + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const renderRow = ({ to, href, label, Icon, external }) => {
    const inner = (
      <>
        <Icon className="ui-drawer-row-icon" aria-hidden="true" />
        <span className="ui-drawer-row-label">{label}</span>
      </>
    );
    if (external) {
      return (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="ui-drawer-row"
          onClick={onClose}
        >
          {inner}
        </a>
      );
    }
    return (
      <Link key={label} to={to} className="ui-drawer-row" onClick={onClose}>
        {inner}
      </Link>
    );
  };

  return (
    <div className={`ui-drawer-portal${open ? " ui-drawer-portal--open" : ""}`} aria-hidden={!open}>
      <div className="ui-drawer-backdrop" onClick={onClose} />
      <aside className="ui-drawer" role="dialog" aria-modal="true" aria-label="Valikko">
        <div className="ui-drawer-head">
          <div className="ui-drawer-wordmark" aria-label="Ahma Gamezone">
            <span className="ui-drawer-wordmark-top">AHMA</span>
            <span className="ui-drawer-wordmark-bottom">GAMEZONE</span>
          </div>
          <button
            type="button"
            className="ui-drawer-close"
            onClick={onClose}
            aria-label="Sulje valikko"
          >
            <LuX aria-hidden="true" />
          </button>
        </div>

        <nav className="ui-drawer-nav">
          {NAV_SECTIONS.map((section, i) => (
            <div className="ui-drawer-section" key={i}>
              {section.map(renderRow)}
            </div>
          ))}
        </nav>
      </aside>
    </div>
  );
};
