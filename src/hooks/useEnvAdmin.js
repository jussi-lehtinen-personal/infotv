import { useState, useEffect } from "react";
import { getCachedUser, getMe } from "../auth/authClient";

// Read a boolean off the /me profile, seeded optimistically from the cached user
// so a legit admin isn't redirected on the first frame. null = still loading.
function useMeFlag(pick) {
  const [v, setV] = useState(() => {
    const u = getCachedUser();
    return u ? !!pick(u) : null;
  });
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => { if (!cancelled) setV(!!(u && pick(u))); })
      .catch(() => { if (!cancelled) setV(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

// True ONLY for users in the ADMIN_USER_IDS env allowlist (the root operator).
// Use for the most sensitive controls (e.g. the Ahmaliiga sim admin panel).
export function useEnvAdmin() {
  return useMeFlag((u) => u.isEnvAdmin);
}

// True for ANY admin — the env allowlist OR a data-admin role. Use to gate
// not-yet-public previews to the club's admins.
export function useAdminAccess() {
  return useMeFlag((u) => u.isEnvAdmin || u.isAdmin);
}

// True for any signed-in user with an account (passkey or Google), plus admins.
// The Ahmaliiga beta is open to everyone who has created a user → this is the gate.
export function useHasAccount() {
  return useMeFlag((u) => u.hasPasskey || u.googleLinked || u.isEnvAdmin || u.isAdmin);
}
