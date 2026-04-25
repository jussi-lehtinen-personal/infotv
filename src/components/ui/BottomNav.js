import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LuHome, LuTrophy, LuCalendarDays, LuUsers } from "react-icons/lu";

// "Ottelut" includes both /gamezone and /gamezone/<date>, but NOT
// /gamezone/schedule (that's its own button).
const isMatchesPath = (p) =>
  p === "/gamezone" ||
  (p.startsWith("/gamezone/") && p !== "/gamezone/schedule");

// Lucide outline icons (via react-icons/lu) — pixel-consistent SVGs with
// identical stroke width across the set, so tapping between tabs doesn't
// nudge the perceived icon size the way Material Symbols glyphs do.
const NAV_ITEMS = [
  { to: "/", label: "Etusivu", Icon: LuHome, isActive: (p) => p === "/" },
  // Match the home Navbar's link to /gamezone — same query params so the
  // page opens with home+away games and the filter row visible.
  { to: "/gamezone?includeAway=1&options=1", label: "Ottelut", Icon: LuTrophy, isActive: isMatchesPath },
  { to: "/gamezone/schedule", label: "Jäävuorot", Icon: LuCalendarDays, isActive: (p) => p === "/gamezone/schedule" },
  { to: "/teams", label: "Joukkueet", Icon: LuUsers, isActive: (p) => p === "/teams" },
];

export const BottomNav = () => {
  const { pathname } = useLocation();

  return (
    <nav className="ui-bottom-nav" aria-label="Päänavigaatio">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        const Icon = item.Icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`ui-bottom-nav-btn ${active ? "ui-bottom-nav-btn--active" : ""}`}
          >
            <Icon className="ui-bottom-nav-icon" aria-hidden="true" />
            <span className="ui-bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
