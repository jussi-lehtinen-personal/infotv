import React, { useEffect, useState, useCallback } from "react";
import { browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Box, Typography, Button, Stack, Divider, CircularProgress } from "@mui/material";
import { GoogleButton } from "../auth/GoogleButton";
import {
  getMe, getAuthConfig, loginPasskey, loginGoogle, issueAppCode,
} from "../auth/authClient";

// /authorize — the sign-in HANDOVER page (see valmennus/AUTH.md). Another club app
// (e.g. valmennus) can't have its own sign-in because every passkey is bound to
// THIS origin. So it sends the user here with ?app=<id>&redirect=<url>; once the
// user is signed in on Gamezone we mint a single-use code and bounce back to
// `${redirect}#code=<code>`, which the other app trades for the identity
// server-to-server. This page adds NO new auth — it reuses the passkey/Google
// flows the account page already uses.
//
// SECURITY: this page validates nothing about `redirect` itself. issueAppCode on
// the server checks `app` + `redirect` against the allowlist and 400s an unknown
// app or a non-allowlisted origin. We only ever navigate to `redirect` AFTER a
// successful mint, so the server's exact-origin check is the sole boundary.

const authBtnSx = { width: 280, maxWidth: "100%", py: 1.25, borderRadius: 999, fontWeight: 700, textTransform: "none", color: "text.primary", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", "&:hover": { bgcolor: "var(--color-surface-divider)" } };

const ErrorBox = ({ children }) => (
  <Box sx={{ px: 1.5, py: 1.25, borderRadius: 2, textAlign: "center", fontSize: 14, color: "#fca5a5", bgcolor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>{children}</Box>
);

// App ids shown with a friendly name; falls back to the raw id.
const APP_LABELS = { valmennus: "Valmennus" };

export default function Authorize() {
  const params = new URLSearchParams(window.location.search);
  const appId = params.get("app") || "";
  const redirect = params.get("redirect") || "";
  const appLabel = APP_LABELS[appId] || appId || "sovellukseen";

  const [phase, setPhase] = useState("checking"); // checking | signin | handover | error
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const supported = browserSupportsWebAuthn();

  // Mint a code for the signed-in user and hand control back to the other app.
  // replace() (not assign) keeps this page out of the back-history.
  const handover = useCallback(async () => {
    setPhase("handover");
    setError("");
    try {
      const code = await issueAppCode(appId, redirect);
      window.location.replace(`${redirect}#code=${encodeURIComponent(code)}`);
    } catch (e) {
      setError(e.message || "Valtuutus epäonnistui.");
      setPhase("error");
    }
  }, [appId, redirect]);

  // On load: missing params → error; else if already signed in → hand over
  // immediately; otherwise show the sign-in options.
  useEffect(() => {
    if (!appId || !redirect) {
      setError("Puuttuva app- tai redirect-parametri.");
      setPhase("error");
      return;
    }
    getAuthConfig().then((c) => setClientId(c.googleClientId || "")).catch(() => {});
    let cancelled = false;
    (async () => {
      try {
        const user = await getMe();
        if (cancelled) return;
        if (user) handover();
        else setPhase("signin");
      } catch {
        if (!cancelled) setPhase("signin");
      }
    })();
    return () => { cancelled = true; };
  }, [appId, redirect, handover]);

  const afterSignIn = useCallback(async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await handover();
    } catch (e) {
      setError(e.message || "Kirjautuminen epäonnistui.");
      setBusy(false);
    }
  }, [handover]);

  const onPasskey = () => afterSignIn(() => loginPasskey());
  const onGoogle = (credential) => afterSignIn(() => loginGoogle(credential));

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
      <Box sx={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <Box component="img" src="/ahma_gamezone_logo.webp" alt="Gamezone" sx={{ height: 40, mb: 3, opacity: 0.95 }} />

        {(phase === "checking" || phase === "handover") && (
          <Stack spacing={2} alignItems="center" sx={{ py: 4 }}>
            <CircularProgress color="primary" />
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {phase === "handover" ? `Kirjaudutaan ${appLabel}…` : "Tarkistetaan kirjautumista…"}
            </Typography>
          </Stack>
        )}

        {phase === "signin" && (
          <>
            <Typography sx={{ fontWeight: 800, fontSize: 18 }}>Kirjaudu jatkaaksesi</Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, mb: 2 }}>
              {appLabel} käyttää Gamezone-tunnustasi. Kirjaudu sisään, niin sinut ohjataan takaisin.
            </Typography>

            {!supported && <Box sx={{ mb: 2 }}><ErrorBox>Laitteesi tai selaimesi ei tue passkey-kirjautumista.</ErrorBox></Box>}

            {clientId && <Box sx={{ display: "flex", justifyContent: "center", mb: 1.25 }}><GoogleButton clientId={clientId} onCredential={onGoogle} text="signin_with" /></Box>}
            <Button onClick={onPasskey} disabled={busy || !supported} sx={authBtnSx}>Kirjaudu passkeyllä</Button>

            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ color: "text.secondary", fontSize: 12, my: 2 }}>
              <Divider sx={{ flex: 1, borderColor: "var(--color-surface-divider)" }} /><span>Gamezone</span><Divider sx={{ flex: 1, borderColor: "var(--color-surface-divider)" }} />
            </Stack>
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              Eikö sinulla ole vielä tiliä? Luo se ensin Gamezonessa.
            </Typography>

            {error && <Box sx={{ mt: 2 }}><ErrorBox>{error}</ErrorBox></Box>}
          </>
        )}

        {phase === "error" && (
          <Stack spacing={2} sx={{ py: 2 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 18 }}>Valtuutus ei onnistunut</Typography>
            <ErrorBox>{error}</ErrorBox>
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              Sulje tämä välilehti ja yritä uudelleen {appLabel}-sovelluksesta.
            </Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
