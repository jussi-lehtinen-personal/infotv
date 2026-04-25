import React from "react";
import { Outlet } from "react-router-dom";
import { BottomNav } from "./ui/BottomNav";

// Layout wrapper for Gamezone-flow pages (matches list, schedule, teams).
// Renders the persistent bottom nav alongside the matched child route's
// element via <Outlet />. InfoTV pages and the home menu sit OUTSIDE this
// layout in App.js, so they never see the nav.
export const GamezoneLayout = () => (
  <>
    <Outlet />
    <BottomNav />
  </>
);
