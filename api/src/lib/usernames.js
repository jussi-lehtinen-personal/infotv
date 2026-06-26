const crypto = require('crypto');
const { getEntity, insertEntity, deleteEntity } = require('./tables');

// Username uniqueness is enforced case-insensitively. The Table Storage key is
// a hash of the normalized (trim + lowercase) name so any characters are safe
// as a key. The Usernames table maps that key -> { userId, username }.
const usernameKey = (name) =>
  crypto.createHash('sha256').update(String(name).trim().toLowerCase()).digest('hex');

async function isUsernameFree(name) {
  const k = usernameKey(name);
  const existing = await getEntity('Usernames', k, k);
  return !existing;
}

// Atomically reserve a username for userId. Returns true if reserved, false if
// it was already taken (race-safe via createEntity).
async function reserveUsername(name, userId) {
  const k = usernameKey(name);
  return insertEntity('Usernames', {
    partitionKey: k,
    rowKey: k,
    userId,
    username: String(name).trim(),
  });
}

// For Google-created accounts: reserve the desired name, appending a short
// suffix on collision so Google sign-up never fails on a name clash. Returns
// the name actually reserved.
async function reserveUniqueUsername(base, userId) {
  const clean = (String(base).trim() || 'Käyttäjä').slice(0, 36);
  if (await reserveUsername(clean, userId)) return clean;
  for (let i = 0; i < 5; i += 1) {
    const cand = `${clean} ${crypto.randomBytes(2).toString('hex')}`;
    if (await reserveUsername(cand, userId)) return cand;
  }
  const fallback = `${clean} ${userId.slice(0, 6)}`;
  await reserveUsername(fallback, userId);
  return fallback;
}

async function releaseUsername(name) {
  if (!name) return;
  const k = usernameKey(name);
  await deleteEntity('Usernames', k, k);
}

module.exports = {
  usernameKey,
  isUsernameFree,
  reserveUsername,
  reserveUniqueUsername,
  releaseUsername,
};
