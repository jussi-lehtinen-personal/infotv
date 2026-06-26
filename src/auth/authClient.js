import { startRegistration, startAuthentication } from "@simplewebauthn/browser";

// Client side of the passkey auth flow. Talks to the SWA Functions RP
// (api/src/functions/authPasskey*) and stores the app session JWT in
// localStorage. Identity anchor = userId on the server; this just carries the
// bearer token.
const TOKEN_KEY = "ahma.authToken";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

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
  return (e && e.message) || "Passkey-toiminto epäonnistui.";
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
  return user;
}

export async function getMe() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch("/api/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    clearToken();
    return null;
  }
  if (!res.ok) throw new Error("Profiilin haku epäonnistui.");
  return res.json();
}

export function logout() {
  clearToken();
}
