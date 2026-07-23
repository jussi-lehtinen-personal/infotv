import React, { useState, useEffect } from "react";
import { Box, Typography, Button, Stack } from "@mui/material";
import { LuBell } from "react-icons/lu";
import { IconCircle } from "./_shared";
import { pushSupported, getPushState, enablePush } from "../../lib/ahmaliigaPush";

// Soft opt-in for push notifications. The browser forbids silently enabling push — the
// permission prompt MUST come from a user gesture — so this is a dismissible dashboard
// nudge that shows only when push is supported, not yet asked, and not dismissed. Tapping
// "Salli" runs the real permission + subscribe flow.
const DISMISS_KEY = "ahma.pushPromptDismissed";

export default function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!pushSupported()) return;
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch (e) { /* ignore */ }
    getPushState()
      .then((s) => { if (!cancelled && s.supported && s.permission === "default" && !s.subscribed) setShow(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  const allow = async () => {
    setBusy(true);
    try { await enablePush(); } catch (e) { /* denied / failed → just hide */ }
    setBusy(false);
    setShow(false);
  };
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch (e) { /* ignore */ }
    setShow(false);
  };

  return (
    <Box sx={{ mb: 2, p: 1.75, borderRadius: "var(--radius-card)", bgcolor: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.35)" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <IconCircle icon={LuBell} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14.5, color: "text.primary", lineHeight: 1.3 }}>Salli ilmoitukset</Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>Saat muistutukset ennen lukitusta + tulokset suoraan puhelimeen.</Typography>
        </Box>
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
        <Button fullWidth variant="contained" onClick={allow} disabled={busy}
          sx={{ py: 0.9, borderRadius: "var(--radius-item)", fontWeight: 800, textTransform: "none" }}>
          {busy ? "Sallitaan…" : "Salli ilmoitukset"}
        </Button>
        <Button onClick={dismiss} disabled={busy}
          sx={{ flexShrink: 0, py: 0.9, borderRadius: "var(--radius-item)", fontWeight: 700, textTransform: "none", color: "text.secondary" }}>
          Ei nyt
        </Button>
      </Stack>
    </Box>
  );
}
