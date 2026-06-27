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

// Derive the relying-party id + origin from the request's Origin header so
// WebAuthn works on whatever domain the app is actually served from
// (gamezone.kiekko-ahma.fi, the Azure default URL, localhost, …) instead of a
// single hardcoded value. Falls back to env if there's no Origin header.
function rpFromRequest(request) {
  const origin = String(request.headers.get('origin') || '').trim() || rpOrigin();
  let id;
  try {
    id = new URL(origin).hostname;
  } catch {
    id = rpID();
  }
  return { origin, rpID: id };
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
  RP_NAME,
  toB64u,
  fromB64u,
};
