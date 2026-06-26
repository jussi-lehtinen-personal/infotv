import React, { useEffect, useRef } from "react";

// Loads the Google Identity Services library once and renders Google's official
// "Sign in with Google" button. The callback receives the ID token (credential)
// which the backend verifies. Google's brand guidelines require the official
// button styling, so we render theirs rather than a custom one.
let gisPromise = null;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google-kirjasto ei latautunut."));
    document.head.appendChild(s);
  });
  return gisPromise;
}

export const GoogleButton = ({ clientId, onCredential, text = "continue_with" }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => onCredential(resp.credential),
        });
        ref.current.innerHTML = "";
        window.google.accounts.id.renderButton(ref.current, {
          theme: "filled_black",
          size: "large",
          shape: "pill",
          text,
          width: 240,
        });
      })
      .catch(() => {
        /* library failed to load — button just won't render */
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential, text]);

  return <div ref={ref} className="acc-google-btn" />;
};
