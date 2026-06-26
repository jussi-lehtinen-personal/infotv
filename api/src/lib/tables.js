const { TableClient } = require('@azure/data-tables');

// Azure Table Storage access for the passkey auth backend.
// Connection string from TABLES_CONNECTION_STRING (cloud) or
// "UseDevelopmentStorage=true" (Azurite, local). allowInsecureConnection lets
// the SDK talk to Azurite over http; it's a no-op for the cloud https endpoint.
const CONN = process.env.TABLES_CONNECTION_STRING;

const TABLE_NAMES = ['Users', 'Credentials', 'GoogleIndex'];
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

async function listByPartition(table, partitionKey) {
  const out = [];
  const iter = client(table).listEntities({
    queryOptions: { filter: `PartitionKey eq '${partitionKey.replace(/'/g, "''")}'` },
  });
  for await (const e of iter) out.push(e);
  return out;
}

module.exports = { ensureTables, getEntity, upsertEntity, listByPartition };
