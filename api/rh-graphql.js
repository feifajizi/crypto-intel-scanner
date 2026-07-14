const UPSTREAM = 'https://interface.gateway.uniswap.org/v1/graphql';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  if (typeof req.body === 'string') return req.body;
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = await readBody(req);
    let lastStatus = 502;
    let text = '';

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const upstream = await fetch(UPSTREAM, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://app.uniswap.org',
            referer: 'https://app.uniswap.org/',
            'user-agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          body,
        });
        text = await upstream.text();
        lastStatus = upstream.status;
        if ((upstream.status >= 500 || upstream.status === 429) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }
        break;
      } catch (error) {
        text = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
        lastStatus = 502;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }

    res.status(lastStatus).setHeader('content-type', 'application/json');
    return res.end(text);
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
