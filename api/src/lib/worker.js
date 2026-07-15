// Thin client for the Cloudflare Worker (tulospalvelu durable cache). Same pattern
// as api/src/functions/getGames.js — the Worker URL is public (not a secret); an
// optional shared key (TP_PROXY_KEY) is sent when set.
const PROXY_URL = process.env.TP_PROXY_URL || 'https://gamezone.zapmies.workers.dev';
const PROXY_KEY = process.env.TP_PROXY_KEY;

async function workerGet(pathAndQuery) {
  const res = await fetch(`${PROXY_URL}${pathAndQuery}`, {
    headers: PROXY_KEY ? { 'x-proxy-key': PROXY_KEY } : {},
  });
  if (!res.ok) throw new Error(`worker ${pathAndQuery} -> HTTP ${res.status}`);
  return res.json();
}

module.exports = { workerGet };
