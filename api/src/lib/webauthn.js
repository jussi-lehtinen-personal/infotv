const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// Relying-party config from env. RP_ID = bare domain (no scheme/port),
// RP_ORIGIN = full origin. Differs between dev (localhost) and prod.
const rpID = () => process.env.RP_ID;
const rpOrigin = () => process.env.RP_ORIGIN;
const RP_NAME = 'Kiekko-Ahma Gamezone';

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
  RP_NAME,
  toB64u,
  fromB64u,
};
