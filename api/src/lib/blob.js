const { BlobServiceClient } = require('@azure/storage-blob');

// Profile avatars live in Blob Storage (same gamezonestore account as the
// tables). Container is private; avatars are served via the /api/avatar/{userId}
// proxy so we don't need to enable public blob access. The blob name is just
// the userId (overwritten on each upload); cache-busting is via an avatarV
// timestamp stored on the user profile.
const CONN = process.env.TABLES_CONNECTION_STRING;
const CONTAINER = 'avatars';

let svc;
let ensured = false;

function service() {
  if (!svc) {
    svc = BlobServiceClient.fromConnectionString(CONN, { allowInsecureConnection: true });
  }
  return svc;
}

async function container() {
  const c = service().getContainerClient(CONTAINER);
  if (!ensured) {
    try {
      await c.createIfNotExists();
    } catch {
      /* race / already exists */
    }
    ensured = true;
  }
  return c;
}

async function putAvatar(userId, buffer, contentType) {
  const c = await container();
  const blob = c.getBlockBlobClient(String(userId));
  await blob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType || 'image/webp' },
  });
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (d) => chunks.push(d instanceof Buffer ? d : Buffer.from(d)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function getAvatar(userId) {
  const c = await container();
  const blob = c.getBlockBlobClient(String(userId));
  try {
    const dl = await blob.download();
    const buffer = await streamToBuffer(dl.readableStreamBody);
    return { buffer, contentType: dl.contentType || 'image/webp' };
  } catch (e) {
    if (e.statusCode === 404) return null;
    throw e;
  }
}

async function deleteAvatar(userId) {
  const c = await container();
  try {
    await c.getBlockBlobClient(String(userId)).deleteIfExists();
  } catch {
    /* ignore */
  }
}

// Cache-busted proxy URL for a profile's avatar, or null if none.
const avatarUrl = (userId, profile) =>
  profile && profile.avatarV ? `/api/avatar/${userId}?v=${profile.avatarV}` : null;

module.exports = { putAvatar, getAvatar, deleteAvatar, avatarUrl };
