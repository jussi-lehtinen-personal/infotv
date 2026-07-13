import React from "react";
import { Outlet, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Box, Typography, IconButton, Button, CircularProgress, GlobalStyles } from "@mui/material";
import { LuArrowLeft, LuLogOut, LuInfo, LuHome, LuShieldCheck, LuStore, LuGoal, LuMedal } from "react-icons/lu";
import { useEnvAdmin } from "../hooks/useEnvAdmin";

// Ahmaliiga runs as its own "mode" inside Gamezone: own bottom bar, and a top bar
// styled like the box-score header (sticky, orange Bebas title, framed buttons)
// so it stays visually consistent with the rest of the app. The right-hand
// "Gamezone" button is the explicit exit back to the main app (same slot the box
// score uses for its "Tulospalvelu" button). The whole section is a preview gated
// to the ADMIN_USER_IDS env allowlist (root operator only) — NOT data-admin-role
// admins — via useEnvAdmin. See memory: project_ahmaliiga_plan.

const TABS = [
  { to: "/ahmaliiga", label: "Etusivu", Icon: LuHome },
  { to: "/ahmaliiga/joukkue", label: "Joukkue", Icon: LuShieldCheck },
  { to: "/ahmaliiga/markkina", label: "Markkina", Icon: LuStore },
  { to: "/ahmaliiga/veikkaus", label: "Veikkaus", Icon: LuGoal },
  { to: "/ahmaliiga/ranking", label: "Ranking", Icon: LuMedal },
];

// Framed square icon button + labelled pill button — copied from the box-score
// header (game.js) so the chrome matches exactly.
const topBtnSx = {
  width: 38, height: 38, borderRadius: 2.5, flexShrink: 0,
  bgcolor: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.10)",
  color: "var(--gz-text-secondary)", "&:hover": { bgcolor: "rgba(255,255,255,0.09)" },
};
const exitBtnSx = {
  flexShrink: 0, px: 1.25, py: 0.75, borderRadius: 2, fontSize: 12.5, fontWeight: 700,
  textTransform: "none", bgcolor: "var(--color-surface)", border: "1px solid rgba(255,255,255,0.10)",
  "&, &:hover, &:focus": { color: "var(--gz-text-secondary)" }, "&:hover": { bgcolor: "rgba(255,255,255,0.09)" },
};

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
  // Show the back arrow only on drill-downs (not the 5 main tabs); the Gamezone
  // button is the constant exit and is always present.
  const showBack = !TABS.some((t) => t.to === pathname);

  return (
    <Gate>
      {/* Prevent the browser pull-to-refresh gesture from wiping in-progress
          squad edits while dragging the card list (only while in Ahmaliiga). */}
      <GlobalStyles styles={{ "html, body": { overscrollBehaviorY: "contain" } }} />
      <Box sx={{ minHeight: "100dvh", bgcolor: "var(--color-bg)", color: "text.primary",
            pb: "calc(84px + env(safe-area-inset-bottom))" }}>
        {/* top bar — matches the box-score header (game.js) */}
        <Box sx={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 1.25,
              px: 1.75, pt: "calc(env(safe-area-inset-top) + 12px)", pb: 1.5,
              bgcolor: "var(--color-bg)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {showBack && (
            <IconButton onClick={() => nav(-1)} aria-label="Takaisin" sx={topBtnSx}>
              <LuArrowLeft size={20} />
            </IconButton>
          )}
          <Typography sx={{ flex: 1, fontFamily: "var(--font-family-display)", fontSize: 22, fontWeight: 800,
                letterSpacing: "var(--font-display-tracking)", textTransform: "uppercase", lineHeight: 1,
                transform: "translateY(var(--font-display-shift))", color: "text.primary" }}>
            AHMA<Box component="span" sx={{ color: "primary.main" }}>LIIGA</Box>
          </Typography>
          <IconButton component={Link} to="/ahmaliiga/saannot" aria-label="Säännöt" sx={topBtnSx}>
            <LuInfo size={18} />
          </IconButton>
          <Button onClick={() => nav("/")} aria-label="Takaisin Gamezoneen"
                  startIcon={<LuLogOut size={16} />} sx={exitBtnSx}>
            Gamezone
          </Button>
        </Box>

        <Outlet />

        {/* bottom nav */}
        <nav className="ui-bottom-nav" aria-label="Ahmaliiga-navigaatio">
          {TABS.map((t) => {
            const active = t.to === "/ahmaliiga" ? pathname === t.to : pathname.startsWith(t.to);
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
