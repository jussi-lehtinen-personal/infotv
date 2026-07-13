import React from "react";
import { Outlet, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { LuChevronLeft, LuInfo, LuHome, LuShieldCheck, LuStore, LuGoal, LuMedal } from "react-icons/lu";
import { useEnvAdmin } from "../hooks/useEnvAdmin";

// Ahmaliiga runs as its own "mode" inside Gamezone: own bottom bar, own top bar
// with a "‹ Gamezone" exit and a rules (ⓘ) shortcut. The whole section is a
// preview gated to the ADMIN_USER_IDS env allowlist (the root operator only) —
// NOT data-admin-role admins — via useEnvAdmin. See memory: project_ahmaliiga_plan.

const TABS = [
  { to: "/ahmaliiga", label: "Etusivu", Icon: LuHome, end: true },
  { to: "/ahmaliiga/joukkue", label: "Joukkue", Icon: LuShieldCheck },
  { to: "/ahmaliiga/markkina", label: "Markkina", Icon: LuStore },
  { to: "/ahmaliiga/veikkaus", label: "Veikkaus", Icon: LuGoal },
  { to: "/ahmaliiga/ranking", label: "Ranking", Icon: LuMedal },
];

const FullScreenSpinner = () => (
  <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", bgcolor: "var(--color-bg)" }}>
    <CircularProgress sx={{ color: "primary.main" }} />
  </Box>
);

// Gate: render children only for env-allowlist admins; others bounce to home;
// null (still loading) shows a spinner so a legit admin isn't redirected early.
const Gate = ({ children }) => {
  const allowed = useEnvAdmin();
  if (allowed === false) return <Navigate to="/" replace />;
  if (allowed === null) return <FullScreenSpinner />;
  return children;
};

// For standalone Ahmaliiga routes that don't use the layout chrome (e.g. rules).
export const RequireEnvAdmin = ({ children }) => <Gate>{children}</Gate>;

export const AhmaliigaLayout = () => {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const onIndex = pathname === "/ahmaliiga";

  return (
    <Gate>
      <Box sx={{ minHeight: "100dvh", bgcolor: "var(--color-bg)", color: "text.primary",
            pb: "calc(84px + env(safe-area-inset-bottom))" }}>
        {/* top bar */}
        <Box sx={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 1,
              px: 1, pt: "calc(env(safe-area-inset-top) + 10px)", pb: 1.25,
              bgcolor: "rgba(17,17,17,0.92)", backdropFilter: "blur(10px)",
              borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <Box role="button" tabIndex={0}
               onClick={() => (onIndex ? nav("/") : nav(-1))}
               sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, cursor: "pointer",
                     color: "text.secondary", fontSize: 13, fontWeight: 700, px: 0.75, py: 0.5,
                     borderRadius: "var(--radius-small)", "&:hover": { color: "text.primary" } }}>
            <LuChevronLeft size={18} />
            {onIndex ? "Gamezone" : "Takaisin"}
          </Box>
          <Box sx={{ flex: 1, textAlign: "center" }}>
            <Box component="span" sx={{ fontFamily: "var(--font-family-display)",
                  letterSpacing: "var(--font-display-tracking)", fontSize: 24, lineHeight: 1,
                  color: "text.primary" }}>
              AHMA<Box component="span" sx={{ color: "primary.main" }}>LIIGA</Box>
            </Box>
          </Box>
          <Box component={Link} to="/ahmaliiga/saannot" aria-label="Säännöt"
               sx={{ display: "inline-flex", color: "text.secondary", p: 0.75,
                     "&:hover": { color: "primary.main" } }}>
            <LuInfo size={20} />
          </Box>
        </Box>

        <Outlet />

        {/* bottom nav */}
        <nav className="ui-bottom-nav" aria-label="Ahmaliiga-navigaatio">
          {TABS.map((t) => {
            const active = t.end ? pathname === t.to : pathname.startsWith(t.to);
            const Icon = t.Icon;
            return (
              <Link key={t.to} to={t.to}
                    className={`ui-bottom-nav-btn ${active ? "ui-bottom-nav-btn--active" : ""}`}>
                <Icon className="ui-bottom-nav-icon" aria-hidden="true" />
                <span className="ui-bottom-nav-label">{t.label}</span>
              </Link>
            );
          })}
        </nav>
      </Box>
    </Gate>
  );
};
