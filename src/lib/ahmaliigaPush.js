// Client for Ahmaliiga web push (B8). Handles permission + subscribe/unsubscribe against
// the service worker's PushManager and the /api/ahmaliiga/push endpoint. Free stack (VAPID).
import { getToken } from "../auth/authClient";

const authHeaders = () => {
  const t = getToken();
  return { "Content-Type": "application/json", ...(t ? { "X-Ahma-Auth": t } : {}) };
};

// VAPID public key (base64url) → Uint8Array for applicationServerKey.
const urlB64ToUint8 = (base64) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const pushSupported = () =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator &&
  typeof window !== "undefined" && "PushManager" in window && "Notification" in window;

// iOS Safari only allows web push when the PWA is installed to the home screen.
export const isIosNotInstalled = () => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  const standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone && !window.navigator.standalone;
};

export async function getPushState() {
  if (!pushSupported()) return { supported: false, permission: "unsupported", subscribed: false };
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.ready;
    subscribed = !!(await reg.pushManager.getSubscription());
  } catch (e) { /* ignore */ }
  return { supported: true, permission: Notification.permission, subscribed };
}

async function vapidKey() {
  const r = await fetch("/api/ahmaliiga/push");
  const d = await r.json().catch(() => ({}));
  return (d && d.vapidPublicKey) || "";
}

// Must be called from a user gesture (permission prompt).
export async function enablePush() {
  if (!pushSupported()) throw new Error("Selaimesi ei tue ilmoituksia.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Ilmoitukset on estetty. Salli ne selaimen asetuksista.");
  const key = await vapidKey();
  if (!key) throw new Error("Push ei ole vielä käytössä palvelimella.");
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
  const r = await fetch("/api/ahmaliiga/push", {
    method: "POST", headers: authHeaders(),
    body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON ? sub.toJSON() : sub }),
  });
  if (!r.ok) throw new Error("Tilaus epäonnistui.");
  return true;
}

export async function disablePush() {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/ahmaliiga/push", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch (e) { /* ignore */ }
}
