import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { FAVOURITE_TEAMS_STORAGE_KEY } from "../Util";

// Client side of the passkey auth flow. Talks to the SWA Functions RP
// (api/src/functions/authPasskey*) and stores the app session JWT in
// localStorage. Identity anchor = userId on the server; this just carries the
// bearer token.
const TOKEN_KEY = "ahma.authToken";
const USER_KEY = "ahma.authUser";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  // Favourites are account-bound (login required) → drop the local mirror on
  // logout so a signed-out user has no favourites at all.
  try { localStorage.removeItem(FAVOURITE_TEAMS_STORAGE_KEY); } catch { /* ignore */ }
};

// Mirror the account's favourites into the shared localStorage key so readers
// (Util.loadFavouriteTeams → gamezone filter + Minä feed) stay in sync.
const mirrorFavourites = (favourites) => {
  try {
    if (Array.isArray(favourites)) {
      localStorage.setItem(FAVOURITE_TEAMS_STORAGE_KEY, JSON.stringify(favourites));
    }
  } catch { /* ignore */ }
};

// Optimistic profile cache — lets the account page show "logged in" instantly
// on revisit while /api/me revalidates in the background.
const setCachedUser = (u) => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
};
export const getCachedUser = () => {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
};

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  return data;
}

// Map browser WebAuthn errors to friendly Finnish messages.
function mapError(e) {
  const name = e && e.name;
  if (name === "NotAllowedError") return "Peruutettu tai aikakatkaistu.";
  if (name === "InvalidStateError")
    return "Tällä laitteella on jo passkey tälle tilille.";
  // Android Credential Manager occasionally hiccups ("couldn't communicate
  // with the credentials manager") — usually transient.
  const msg = (e && e.message) || "";
  if (name === "UnknownError" || /credential/i.test(msg))
    return "Avainhallinta ei vastannut. Yritä hetken kuluttua uudelleen.";
  return msg || "Passkey-toiminto epäonnistui.";
}

// Shared POST that optionally attaches the session token (authed register =
// add a passkey to the current account).
async function postAuthed(url, body, authed) {
  const headers = { "Content-Type": "application/json" };
  if (authed) {
    const t = getToken();
    if (t) headers["X-Ahma-Auth"] = t;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  return data;
}

async function doRegister(body, authed) {
  const { options, challengeToken } = await postAuthed(
    "/api/auth/passkey/register/options",
    body,
    authed
  );
  let response;
  try {
    response = await startRegistration(options);
  } catch (e) {
    throw new Error(mapError(e));
  }
  const { token, user } = await postAuthed(
    "/api/auth/passkey/register/verify",
    { response, challengeToken },
    authed
  );
  if (token) setToken(token);
  setCachedUser(user);
  return user;
}

// New account from a nickname.
export const registerPasskey = (nickname) => doRegister({ nickname }, false);

// Add a passkey to the currently signed-in account (e.g. Google-only user).
export const addPasskey = () => doRegister({}, true);

export async function loginPasskey() {
  const { options, challengeToken } = await postJson(
    "/api/auth/passkey/login/options",
    {}
  );
  let response;
  try {
    response = await startAuthentication(options);
  } catch (e) {
    throw new Error(mapError(e));
  }
  const { token, user } = await postJson(
    "/api/auth/passkey/login/verify",
    { response, challengeToken }
  );
  setToken(token);
  setCachedUser(user);
  return user;
}

export async function getMe() {
  const token = getToken();
  if (!token) return null;
  // Custom header (not Authorization) — SWA forwards custom headers to managed
  // functions untouched, avoiding any platform handling of Authorization.
  const res = await fetch("/api/me", {
    headers: { "X-Ahma-Auth": token },
  });
  // 401 = bad/expired token, 404 = account deleted → log out and clear the
  // stale token (otherwise the app stays stuck "logged in" to a gone account).
  if (res.status === 401 || res.status === 404) {
    clearToken();
    return null;
  }
  if (!res.ok) throw new Error("Profiilin haku epäonnistui.");
  const user = await res.json();
  setCachedUser(user);
  mirrorFavourites(user.favourites);
  return user;
}

export function logout() {
  clearToken();
}

// Persist favourite teams to the account (login required) + mirror locally.
export async function saveFavourites(favourites) {
  const token = getToken();
  if (!token) throw new Error("Kirjautuminen vaaditaan.");
  const res = await fetch("/api/me/favourites", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Ahma-Auth": token },
    body: JSON.stringify({ favourites }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  mirrorFavourites(data.favourites);
  const cached = getCachedUser();
  if (cached) setCachedUser({ ...cached, favourites: data.favourites });
  return data.favourites;
}

// --- Google account linking (V2, multi-device) ---

// Link the Google account to the currently-signed-in (passkey) user.
export async function linkGoogle(credential) {
  const token = getToken();
  const res = await fetch("/api/auth/google/link", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ahma-Auth": token },
    body: JSON.stringify({ credential }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  setCachedUser(data.user);
  return data.user;
}

// Permanently delete the signed-in account (profile + passkeys + Google link).
export async function deleteAccount() {
  const token = getToken();
  const res = await fetch("/api/auth/account/delete", {
    method: "POST",
    headers: { "X-Ahma-Auth": token },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  clearToken();
  return true;
}

// Change the nickname (unique). Returns the updated user.
export async function renameNickname(nickname) {
  const token = getToken();
  const res = await fetch("/api/me/nickname", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Ahma-Auth": token },
    body: JSON.stringify({ nickname }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  setCachedUser(data.user);
  return data.user;
}

// Upload a (client-resized) avatar image blob. Returns the new avatar URL.
export async function uploadAvatar(blob) {
  const token = getToken();
  const res = await fetch("/api/avatar", {
    method: "POST",
    headers: { "X-Ahma-Auth": token, "Content-Type": blob.type || "image/webp" },
    body: blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  const cached = getCachedUser();
  if (cached) setCachedUser({ ...cached, avatar: data.avatar });
  return data.avatar;
}

// Remove the Google link from the signed-in account (passkey stays primary).
export async function unlinkGoogle() {
  const token = getToken();
  const res = await fetch("/api/auth/google/unlink", {
    method: "POST",
    headers: { "X-Ahma-Auth": token },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  setCachedUser(data.user);
  return data.user;
}

// Sign in on a new device with a Google account already linked elsewhere.
export async function loginGoogle(credential) {
  const data = await postJson("/api/auth/google/login", { credential });
  setToken(data.token);
  setCachedUser(data.user);
  return data.user;
}

// Admin-only registered-user stats. Returns { status, data }: status 'ok',
// 'forbidden' (with youAre = your userId, to add to ADMIN_USER_IDS), or
// 'unauthorized'.
export async function getStats() {
  const token = getToken();
  if (!token) return { status: "unauthorized" };
  const res = await fetch("/api/stats", { headers: { "X-Ahma-Auth": token } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 403) return { status: "forbidden", youAre: data.youAre };
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  return { status: "ok", data };
}

// Admin-only registered-user list (with roles). Same status shape as getStats:
// 'ok' | 'forbidden' (youAre = your userId) | 'unauthorized'.
export async function getAdminUsers() {
  const token = getToken();
  if (!token) return { status: "unauthorized" };
  const res = await fetch("/api/admin/users", { headers: { "X-Ahma-Auth": token } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) return { status: "unauthorized" };
  if (res.status === 403) return { status: "forbidden", youAre: data.youAre };
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  return { status: "ok", data };
}

// Add / remove a role tag on a user (admin only). `team` (teamKey) is required
// for team-scoped roles (valmentaja). Returns { userId, roles }.
export async function setUserRole({ userId, role, team, action }) {
  const token = getToken();
  if (!token) throw new Error("Kirjautuminen vaaditaan.");
  const res = await fetch("/api/admin/userRoles", {
    method: "POST",
    headers: { "X-Ahma-Auth": token, "Content-Type": "application/json" },
    body: JSON.stringify({ userId, role, team, action }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  return data;
}

let configCache = null;
export async function getAuthConfig() {
  if (configCache) return configCache;
  try {
    const res = await fetch("/api/authConfig");
    configCache = res.ok ? await res.json() : { googleClientId: "" };
  } catch {
    configCache = { googleClientId: "" };
  }
  return configCache;
}
