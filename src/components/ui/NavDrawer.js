import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  LuMegaphone,
  LuShield,
  LuNewspaper,
  LuMail,
  LuHeart,
  LuAward,
  LuMessageSquare,
  LuUserCircle,
  LuCalendarClock,
  LuShieldCheck,
  LuClipboardList,
  LuListChecks,
  LuDumbbell,
  LuX,
} from "react-icons/lu";
import { getCachedUser, getMe } from "../../auth/authClient";

// External valmennus app (own Cloudflare Worker, no kiekko-ahma.fi hostname). It
// signs coaches in via Gamezone's /authorize handover — see valmennus/AUTH.md.
const VALMENNUS_URL = "https://ahma-valmennus.zapmies.workers.dev";

// Full navigation, in display order. `external` rows open in a new tab. Grouped by theme,
// each group rendered as its own divided section.
//
// The bottom bar's five destinations (Etusivu / Ottelut / Jäävuorot / Joukkueet / Minä)
// are deliberately NOT repeated here: they are one thumb-reach away at all times, and
// duplicating them pushed everything this drawer uniquely offers below the fold.
const NAV_SECTIONS = [
  // Tilavaraukset (oheistilat)
  [
    { to: "/facilities", label: "Tilavaraukset", Icon: LuCalendarClock },
  ],
  // Seura & sisältö
  [
    { to: "/news", label: "Uutiset", Icon: LuNewspaper },
    { to: "/infotv/kotipeli", label: "Edustus", Icon: LuShield },
    { to: "/ads", label: "Mainokset", Icon: LuMegaphone },
  ],
  // Yhteystiedot & tuki
  [
    { to: "/organization", label: "Yhteystiedot", Icon: LuMail },
    { to: "/partners", label: "Yhteistyökumppanit", Icon: LuAward },
    { to: "/supporters", label: "Kannattajajäsenet", Icon: LuHeart },
  ],
  // Oma
  [
    { to: "/account", label: "Tili", Icon: LuUserCircle },
    {
      href: "https://forms.office.com/pages/responsepage.aspx?id=lnGL4VX2Lku9oA4GU2KdCUogyNsQep9AiquFHORrgR1UN1ZONVk2VTEzSDJHS0QwN0EyQzlWTFNJMy4u&route=shorturl",
      label: "Palaute",
      Icon: LuMessageSquare,
      external: true,
    },
  ],
];

// Coaching-manager access (for the /coaching enrolment report row): admins OR the
// `valmennuspaallikko` role. Same rule as the hook useCoachManagerAccess.
const coachAccess = (u) =>
  !!(u && (u.isEnvAdmin || u.isAdmin || (Array.isArray(u.roles) && u.roles.some((r) => r.role === "valmennuspaallikko"))));

// Valmennus-app access (the external coaching app): any coach — head or regular —
// plus admins. Matches the valmennus gate (vastuuvalmentaja/valmentaja OR admin).
const valmennusAccess = (u) =>
  !!(u && (u.isEnvAdmin || u.isAdmin || (Array.isArray(u.roles) && u.roles.some((r) => r.role === "vastuuvalmentaja" || r.role === "valmentaja"))));

// Game-registration audit (/gamecheck): everyone who runs a game day. The kiosk staff were
// the ones who spotted the missing bookings in the first place, and a team's own officials
// (joukkueenjohtaja, valmentajat) are who fix their team's rows.
const GAMECHECK_ROLES = ["valmennuspaallikko", "kioski", "toimihenkilo", "vastuuvalmentaja", "valmentaja"];
const gameCheckAccess = (u) =>
  !!(u && (u.isEnvAdmin || u.isAdmin || (Array.isArray(u.roles) && u.roles.some((r) => GAMECHECK_ROLES.includes(r.role)))));

export const NavDrawer = ({ open, onClose }) => {
  // Admins get an extra "Admin" row; admins + coaching managers also get the
  // enrolment-report row. Seed from the cached user for an instant paint, then
  // refresh via /api/me on open (self-heals if roles changed).
  const [isAdmin, setIsAdmin] = useState(() => !!(getCachedUser() || {}).isAdmin);
  const [canCoach, setCanCoach] = useState(() => coachAccess(getCachedUser()));
  const [isCoach, setIsCoach] = useState(() => valmennusAccess(getCachedUser()));
  const [canCheck, setCanCheck] = useState(() => gameCheckAccess(getCachedUser()));
  useEffect(() => {
    if (!open) return;
    const cached = getCachedUser();
    setIsAdmin(!!(cached || {}).isAdmin);
    setCanCoach(coachAccess(cached));
    setIsCoach(valmennusAccess(cached));
    setCanCheck(gameCheckAccess(cached));
    getMe().then((u) => { setIsAdmin(!!(u && u.isAdmin)); setCanCoach(coachAccess(u)); setIsCoach(valmennusAccess(u)); setCanCheck(gameCheckAccess(u)); }).catch(() => {});
  }, [open]);

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
          <div className="ui-drawer-wordmark">
            <img className="ui-drawer-wordmark-img" src="/ahma_gamezone_logo.webp" alt="Ahma Gamezone" />
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
          {isCoach && (
            <div className="ui-drawer-section">
              {renderRow({ href: VALMENNUS_URL, label: "Valmennus", Icon: LuDumbbell, external: true })}
            </div>
          )}
          {/* Reports for whoever runs the week. The two have different audiences: the
              enrolment report is the coaching manager's, the audit belongs to everyone who
              has to act on it — kiosk staff, team officials, coaches. */}
          {(canCoach || canCheck) && (
            <div className="ui-drawer-section">
              {canCoach && renderRow({ to: "/coaching", label: "Jääilmoittautumiset", Icon: LuClipboardList })}
              {canCheck && renderRow({ to: "/gamecheck", label: "Ottelujen tarkistus", Icon: LuListChecks })}
            </div>
          )}
          {isAdmin && (
            <div className="ui-drawer-section">
              {renderRow({ to: "/admin", label: "Admin", Icon: LuShieldCheck })}
            </div>
          )}
        </nav>
      </aside>
    </div>
  );
};
