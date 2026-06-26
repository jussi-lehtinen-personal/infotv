import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

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

export async function registerPasskey(nickname) {
  const { options, challengeToken } = await postJson(
    "/api/auth/passkey/register/options",
    { nickname }
  );
  let response;
  try {
    response = await startRegistration(options);
  } catch (e) {
    throw new Error(mapError(e));
  }
  const { token, user } = await postJson(
    "/api/auth/passkey/register/verify",
    { response, challengeToken }
  );
  setToken(token);
  setCachedUser(user);
  return user;
}

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
  if (res.status === 401) {
    clearToken();
    return null;
  }
  if (!res.ok) throw new Error("Profiilin haku epäonnistui.");
  const user = await res.json();
  setCachedUser(user);
  return user;
}

export function logout() {
  clearToken();
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
