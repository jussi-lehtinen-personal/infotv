import React, { useEffect, useState } from "react";

// Slim bar shown when a new app version is installed and waiting. Tapping
// "Päivitä" tells the waiting service worker to take over (SKIP_WAITING),
// which fires controllerchange in serviceWorkerRegistration and reloads.
// Signage screens (/infotv/*) run unattended on a lobby TV — nobody can tap "Päivitä",
// so the bar would sit there forever. On those routes we apply the update automatically.
const isSignage = () => typeof window !== "undefined" && window.location.pathname.startsWith("/infotv");

const applyUpdate = (reg) => {
  const waiting = reg && reg.waiting;
  if (waiting) {
    waiting.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => window.location.reload(), 2500); // fallback if controllerchange doesn't fire
  } else {
    window.location.reload();
  }
};

export const UpdatePrompt = () => {
  const [reg, setReg] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const onUpdate = () => setReg(window.__ahmaSwReg || null);
    window.addEventListener("ahma:sw-update", onUpdate);
    // The event may have fired before this component mounted.
    if (window.__ahmaSwReg) setReg(window.__ahmaSwReg);
    return () => window.removeEventListener("ahma:sw-update", onUpdate);
  }, []);

  // Signage: auto-apply silently (no bar, no tap needed).
  useEffect(() => { if (reg && isSignage()) applyUpdate(reg); }, [reg]);

  if (!reg || isSignage()) return null;

  const doUpdate = () => {
    setUpdating(true);
    applyUpdate(reg);
  };

  return (
    <div className="ui-update-bar" role="status">
      <span className="ui-update-bar-text">Uusi versio saatavilla</span>
      <button className="ui-update-bar-btn" onClick={doUpdate} disabled={updating}>
        {updating ? "Päivitetään…" : "Päivitä"}
      </button>
    </div>
  );
};
