// Vercel Serverless Function
// Scan a project's official website for staking/earn signals (best-effort, conservative)

const UA = 'Mozilla/5.0 (compatible; OpenClaw-Koda/1.0; +https://openclaw.ai)';

const KEYWORDS = [
  /\bstake\b/i,
  /\bstaking\b/i,
  /\bstaked\b/i,
  /\bliquid\s+staking\b/i,
  /\bre-?stake\b/i,
  /\bvalidator\b/i,
  /\bdelegate\b/i,
  /\bdelegation\b/i,
  /\bearn\b/i,
  /\byield\b/i,
  /\breward(s)?\b/i,
  /\bapr\b/i,
  /\bapy\b/i,
];

const COMMON_PATHS = [
  '',
  'staking',
  'stake',
  'earn',
  'rewards',
  'app',
  'app/stake',
  'app/staking',
  'docs',
  'docs/staking',
  'faq',
];

function normalizeHomepage(u) {
  if (!u) return null;
  let s = String(u).trim();
  if (!s) return null;
  // If someone passes twitter etc, refuse.
  if (/^https?:\/\/(twitter\.com|x\.com)\//i.test(s)) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const url = new URL(s);
    // only http(s)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // drop fragments
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function joinUrl(base, path) {
  const b = new URL(base);
  if (!path) return b.toString();
  const p = String(path).replace(/^\//, '');
  return new URL(p, b.toString().replace(/\/$/, '') + '/').toString();
}

async function fetchText(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const text = await resp.text().catch(() => '');

    if (!resp.ok) {
      return { ok: false, status: resp.status, error: `HTTP ${resp.status}`, ct, text: '' };
    }

    // refuse huge non-html blobs
    if (!ct.includes('text/html') && !ct.includes('application/xhtml') && text.length > 250_000) {
      return { ok: false, status: resp.status, error: `Non-HTML content-type: ${ct}`, ct, text: '' };
    }

    return { ok: true, status: resp.status, error: null, ct, text };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e), ct: '', text: '' };
  } finally {
    clearTimeout(t);
  }
}

function scan(html) {
  const hay = String(html || '').replace(/\s+/g, ' ');
  const hits = [];
  for (const re of KEYWORDS) {
    if (re.test(hay)) hits.push(re.source);
  }
  return hits;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const homepage = normalizeHomepage(req.query?.homepage);
  const maxPages = Math.min(Math.max(Number(req.query?.maxPages ?? 8) || 8, 1), 15);

  if (!homepage) {
    return res.status(400).json({ error: 'Missing/invalid homepage' });
  }

  const checked = [];
  let found = null;

  for (const p of COMMON_PATHS.slice(0, maxPages)) {
    const url = joinUrl(homepage, p);
    const r = await fetchText(url);

    if (!r.ok) {
      checked.push({ url, ok: false, error: r.error });
      continue;
    }

    const hits = scan(r.text);
    checked.push({ url, ok: true, hits: hits.slice(0, 10) });

    if (hits.length) {
      found = { url, hits: hits.slice(0, 10) };
      break;
    }
  }

  return res.status(200).json({
    homepage,
    scanned_at: new Date().toISOString(),
    maxPages,
    found: Boolean(found),
    evidence: found,
    checked,
  });
}
