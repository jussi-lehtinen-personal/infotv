// Microsoft Graph client (app-only / client-credentials) for the Wareena office
// room calendar. The GameZone facility-reservation feature treats that ONE room as
// Graph-backed (see reservationsM365.js): its bookings live in the room mailbox's
// 365 calendar, which is the single source of truth shared by both the app and
// Outlook — so "two-way" needs no mirror/delta/webhooks.
//
// Auth: an Entra ID app registration with the *application* permission
// Calendars.ReadWrite, scoped to the room mailbox by an Exchange Application Access
// Policy. Secrets come from SWA app settings (never the repo):
//   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, TOIMISTO_ROOM_UPN
//
// No SDK dependency — raw fetch against the token + Graph REST endpoints keeps this
// in line with the rest of the API (thin passthroughs, no heavy deps). Node 18+ on
// Azure Functions provides a global fetch.

const GRAPH = 'https://graph.microsoft.com/v1.0';

// Stable GUID namespace for the custom single-value extended property that carries
// GameZone metadata (owner/team) on events we create. MUST stay constant — changing
// it orphans the metadata on already-created events. Read it back with an $expand.
const META_GUID = 'f5e9c2a7-3b4d-4e1a-9c8f-2d6b7a1e0c34';
const META_PROP_ID = `String {${META_GUID}} Name gamezoneMeta`;

function graphConfig() {
  return {
    tenantId: process.env.GRAPH_TENANT_ID || '',
    clientId: process.env.GRAPH_CLIENT_ID || '',
    clientSecret: process.env.GRAPH_CLIENT_SECRET || '',
  };
}

// True when the four Graph settings are present (so callers can 501 cleanly before
// the M365 side is wired up rather than throwing an opaque error).
function graphConfigured() {
  const c = graphConfig();
  return !!(c.tenantId && c.clientId && c.clientSecret && process.env.TOIMISTO_ROOM_UPN);
}

// --- token cache (app-only tokens live ~1 h; refresh a minute early) ---
let cachedToken = null;
let cachedExp = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExp - 60_000) return cachedToken;
  const { tenantId, clientId, clientSecret } = graphConfig();
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Graph ei ole konfiguroitu (GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET puuttuu).');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Graph token virhe (${res.status}): ${data.error_description || data.error || 'tuntematon'}`);
  }
  cachedToken = data.access_token;
  cachedExp = now + (Number(data.expires_in || 3600) * 1000);
  return cachedToken;
}

// Low-level Graph call. `path` is relative to /v1.0 (e.g. `/users/x/events`).
// Returns parsed JSON (or null for 204). Throws with the Graph error text on !ok,
// with one retry on 429/503 honouring Retry-After.
async function graphFetch(path, opts = {}, _retried = false) {
  const token = await getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers || {}),
  };
  const res = await fetch(`${GRAPH}${path}`, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if ((res.status === 429 || res.status === 503) && !_retried) {
    const wait = Math.min(5, Number(res.headers.get('Retry-After')) || 2) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return graphFetch(path, opts, true);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && (data.error.message || data.error.code)) || `HTTP ${res.status}`;
    const err = new Error(`Graph: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const enc = encodeURIComponent;

// Events overlapping [startLocalISO, endLocalISO) in the room mailbox, returned in
// Europe/Helsinki wall-clock (the Prefer header makes start/end.dateTime carry NO
// offset → callers read the wall-clock components directly). Expands our metadata
// property. `startLocalISO`/`endLocalISO` are naive local ISO, e.g.
// "2026-08-12T00:00:00".
async function listCalendarView(mailbox, startLocalISO, endLocalISO) {
  const q =
    `startDateTime=${enc(startLocalISO)}&endDateTime=${enc(endLocalISO)}` +
    `&$top=200&$orderby=start/dateTime` +
    `&$select=id,subject,start,end,isAllDay,organizer` +
    `&$expand=singleValueExtendedProperties($filter=id eq '${enc(META_PROP_ID)}')`;
  const data = await graphFetch(`/users/${enc(mailbox)}/calendarView?${q}`, {
    headers: { Prefer: 'outlook.timezone="Europe/Helsinki"' },
  });
  return (data && data.value) || [];
}

async function createEvent(mailbox, event) {
  return graphFetch(`/users/${enc(mailbox)}/events`, { method: 'POST', body: event });
}

async function deleteEvent(mailbox, eventId) {
  return graphFetch(`/users/${enc(mailbox)}/events/${enc(eventId)}`, { method: 'DELETE' });
}

async function patchEvent(mailbox, eventId, patch) {
  return graphFetch(`/users/${enc(mailbox)}/events/${enc(eventId)}`, { method: 'PATCH', body: patch });
}

// Build the singleValueExtendedProperties entry for a metadata object.
function metaProperty(meta) {
  return { id: META_PROP_ID, value: JSON.stringify(meta || {}) };
}

// Read our metadata back off an expanded event (null if absent / not ours).
function readMeta(ev) {
  const p = (ev && ev.singleValueExtendedProperties) || [];
  const hit = p.find((x) => x.id === META_PROP_ID);
  if (!hit || !hit.value) return null;
  try { return JSON.parse(hit.value); } catch { return null; }
}

module.exports = {
  graphConfigured,
  getToken,
  listCalendarView,
  createEvent,
  deleteEvent,
  patchEvent,
  metaProperty,
  readMeta,
};
