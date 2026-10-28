const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// Relying-party config. RP_ID/RP_ORIGIN env vars are only a fallback now.
const rpID = () => process.env.RP_ID;
const rpOrigin = () => process.env.RP_ORIGIN;
const RP_NAME = 'Kiekko-Ahma Gamezone';

// The app answers on two hostnames off one build: gamezone.kiekko-ahma.fi (the
// PWA) and info.kiekko-ahma.fi (the TV screens). A passkey belongs to exactly
// ONE rpID, so deriving the rpID from the request host — as this did until
// 2026-10-28 — made a key created on one hostname invisible on the other: an
// empty key picker and no error to explain it. The rpID is therefore pinned to
// the canonical host, and WebAuthn Related Origin Requests makes that legal from
// the other one: the browser fetches https://<canonical>/.well-known/webauthn
// and allows the ceremony if the calling origin is listed there.
// `public/.well-known/webauthn` must list exactly RELATED_HOSTS.
const CANONICAL_RP_ID = 'gamezone.kiekko-ahma.fi';
const RELATED_HOSTS = [CANONICAL_RP_ID, 'info.kiekko-ahma.fi'];
// Passkeys made before the pinning are bound to whichever host they were created
// on, so the non-canonical namespace stays readable via `legacy` — reachable from
// either hostname, again thanks to related origins. Nothing new is written there.
const LEGACY_RP_ID = RELATED_HOSTS.find((h) => h !== CANONICAL_RP_ID) || null;

// Derive the relying-party id + origin for a request. `legacy` asks for the
// pre-pinning rpID, which is what a login retry uses when the first ceremony
// turned up no credential. A host outside RELATED_HOSTS (localhost, the Azure
// default URL) is not in the related-origins file, so there the rpID still has to
// BE the host. Falls back to env if there's no Origin header.
function rpFromRequest(request, { legacy = false } = {}) {
  const origin = String(request.headers.get('origin') || '').trim() || rpOrigin();
  let host;
  try {
    host = new URL(origin).hostname;
  } catch {
    host = rpID();
  }
  if (!RELATED_HOSTS.includes(host)) return { origin, rpID: host, legacyRpID: null };
  return {
    origin,
    rpID: legacy && LEGACY_RP_ID ? LEGACY_RP_ID : CANONICAL_RP_ID,
    legacyRpID: LEGACY_RP_ID,
  };
}

// Uint8Array <-> base64url for storing credentialID / publicKey in Table
// Storage (base64url chars are all safe as a RowKey).
const toB64u = (u8) => Buffer.from(u8).toString('base64url');
const fromB64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));

// Note on userId <-> userHandle: SimpleWebAuthn v9 puts our `userID` string
// into options.user.id verbatim, and the browser returns it unchanged as
// response.userHandle (base64url) at login. So the login handler uses
// response.userHandle directly as the userId — no decoding needed.

module.exports = {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  rpID,
  rpOrigin,
  rpFromRequest,
  CANONICAL_RP_ID,
  RELATED_HOSTS,
  RP_NAME,
  toB64u,
  fromB64u,
};
