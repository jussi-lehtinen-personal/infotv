const { TableClient } = require('@azure/data-tables');

// Azure Table Storage access for the passkey auth backend.
// Connection string from TABLES_CONNECTION_STRING (cloud) or
// "UseDevelopmentStorage=true" (Azurite, local). allowInsecureConnection lets
// the SDK talk to Azurite over http; it's a no-op for the cloud https endpoint.
const CONN = process.env.TABLES_CONNECTION_STRING;

const TABLE_NAMES = ['Users', 'Credentials', 'GoogleIndex', 'Usernames'];
const clients = {};
let ensured = false;

function client(name) {
  if (!clients[name]) {
    clients[name] = TableClient.fromConnectionString(CONN, name, {
      allowInsecureConnection: true,
    });
  }
  return clients[name];
}

// Idempotently create the tables on first use. createTable throws 409 if the
// table already exists — that's fine, swallow it.
async function ensureTables() {
  if (ensured) return;
  await Promise.all(
    TABLE_NAMES.map(async (t) => {
      try {
        await client(t).createTable();
      } catch (e) {
        if (e.statusCode !== 409) throw e;
      }
    })
  );
  ensured = true;
}

async function getEntity(table, partitionKey, rowKey) {
  try {
    return await client(table).getEntity(partitionKey, rowKey);
  } catch (e) {
    if (e.statusCode === 404) return null;
    throw e;
  }
}

async function upsertEntity(table, entity) {
  return client(table).upsertEntity(entity, 'Replace');
}

// Atomic insert: returns true if created, false if the key already exists (409).
// Used to reserve unique usernames without a race.
async function insertEntity(table, entity) {
  try {
    await client(table).createEntity(entity);
    return true;
  } catch (e) {
    if (e.statusCode === 409) return false;
    throw e;
  }
}

async function deleteEntity(table, partitionKey, rowKey) {
  try {
    await client(table).deleteEntity(partitionKey, rowKey);
  } catch (e) {
    if (e.statusCode !== 404) throw e;
  }
}

async function listByPartition(table, partitionKey) {
  const out = [];
  const iter = client(table).listEntities({
    queryOptions: { filter: `PartitionKey eq '${partitionKey.replace(/'/g, "''")}'` },
  });
  for await (const e of iter) out.push(e);
  return out;
}

// Full-table scan, optionally filtered. Table Storage has no COUNT, so admin
// stats iterate the whole table — fine at small scale. `filter` is an OData
// expression (e.g. "RowKey eq 'profile'") or omitted for everything.
async function listEntities(table, filter) {
  const out = [];
  const iter = client(table).listEntities(
    filter ? { queryOptions: { filter } } : undefined
  );
  for await (const e of iter) out.push(e);
  return out;
}

module.exports = { ensureTables, getEntity, upsertEntity, insertEntity, deleteEntity, listByPartition, listEntities };
