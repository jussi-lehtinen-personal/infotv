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

// At registration we set userID = our userId string; SimpleWebAuthn encodes it
// into options.user.id, and the authenticator returns it as response.userHandle
// (base64url) at login → decode back to the userId string.
const userIdFromHandle = (handleB64u) =>
  Buffer.from(handleB64u, 'base64url').toString('utf8');

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
  userIdFromHandle,
};
