const BASE = 'https://api.geckoterminal.com/api/v2';
const cache = new Map();
const TTL_MS = 90_000;

function normalizePath(req) {
  const raw = req.query?.path || '/';
  const path = String(raw).startsWith('/') ? String(raw) : `/${raw}`;
  return path;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const path = normalizePath(req);
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) {
    res.setHeader('x-rh-gecko-cache', 'HIT');
    res.setHeader('content-type', 'application/json');
    return res.status(hit.status).end(hit.body);
  }

  let status = 502;
  let body = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const upstream = await fetch(`${BASE}${path}`, {
        headers: {
          accept: 'application/json',
          'user-agent': 'crypto-dashboard-rh-lp/1.0',
        },
      });
      status = upstream.status;
      body = await upstream.text();
      if (status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      break;
    } catch (error) {
      status = 502;
      body = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
      if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }

  if (status === 200) cache.set(path, { status, body, exp: Date.now() + TTL_MS });

  res.setHeader('x-rh-gecko-cache', 'MISS');
  res.setHeader('content-type', 'application/json');
  return res.status(status).end(body);
}
