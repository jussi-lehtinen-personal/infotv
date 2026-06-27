import React, { useEffect, useState } from "react";

// Slim bar shown when a new app version is installed and waiting. Tapping
// "Päivitä" tells the waiting service worker to take over (SKIP_WAITING),
// which fires controllerchange in serviceWorkerRegistration and reloads.
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

  if (!reg) return null;

  const doUpdate = () => {
    setUpdating(true);
    const waiting = reg.waiting;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
      // Fallback reload in case controllerchange doesn't fire.
      setTimeout(() => window.location.reload(), 2500);
    } else {
      window.location.reload();
    }
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
