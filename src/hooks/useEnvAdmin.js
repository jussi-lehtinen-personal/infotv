import { useState, useEffect } from "react";
import { getCachedUser, getMe } from "../auth/authClient";

// True ONLY for users in the ADMIN_USER_IDS env allowlist (NOT data-admin-role
// admins). Used to gate not-yet-public previews (e.g. Ahmaliiga) to the root
// operator alone. Returns null while loading, then true/false.
export function useEnvAdmin() {
  const [v, setV] = useState(() => {
    const u = getCachedUser();
    return u && "isEnvAdmin" in u ? !!u.isEnvAdmin : null;
  });
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => { if (!cancelled) setV(!!(u && u.isEnvAdmin)); })
      .catch(() => { if (!cancelled) setV(false); });
    return () => { cancelled = true; };
  }, []);
  return v;
}
