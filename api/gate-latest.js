import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function loadOverrides() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const p = path.join(__dirname, 'overrides.json');
    const raw = fs.readFileSync(p, 'utf-8');
    const j = JSON.parse(raw);
    return j?.overrides || {};
  } catch {
    return {};
  }
}

// Vercel Serverless Function
// Latest coins listed on Gate (spot + futures), with optional conservative link enrichment via CoinGecko

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function uniqBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, item);
  }
  return Array.from(m.values());
}

function normalizeSymbol(s) {
  return String(s || '').trim().toUpperCase();
}

function normalizeName(s) {
  return String(s || '').trim();
}

async function fetchJson(url, opts = {}) {
  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`HTTP ${resp.status} for ${url}${text ? `: ${text.slice(0, 200)}` : ''}`);
    err.status = resp.status;
    throw err;
  }
  return await resp.json();
}

async function safeFetchJson(url, opts = {}) {
  try {
    return await fetchJson(url, opts);
  } catch {
    return null;
  }
}

function formatDate(tsSec) {
  if (!tsSec) return undefined;
  const d = new Date(tsSec * 1000);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

async function coingeckoConservativeLinks({ symbol, name }) {
  // Conservative policy (fallback):
  // - use CoinGecko /search
  // - accept only if exactly one match where both symbol and name match (case-insensitive)
  // - then fetch /coins/{id} to get links
  const q = encodeURIComponent(`${symbol} ${name}`.trim());
  const searchUrl = `https://api.coingecko.com/api/v3/search?query=${q}`;
  const s = await safeFetchJson(searchUrl);
  const coins = Array.isArray(s?.coins) ? s.coins : [];

  const sym = normalizeSymbol(symbol);
  const nm = normalizeName(name).toLowerCase();

  const exact = coins.filter((c) => {
    const cs = normalizeSymbol(c.symbol);
    const cn = normalizeName(c.name).toLowerCase();
    return cs === sym && cn === nm;
  });

  if (exact.length !== 1) return null;

  const id = exact[0]?.id;
  if (!id) return null;

  return await coingeckoLinksById(id);
}

async function coingeckoLinksById(id) {
  const coinUrl = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
  const detail = await safeFetchJson(coinUrl);
  const homepage = Array.isArray(detail?.links?.homepage) ? detail.links.homepage.find(Boolean) : '';
  const twitter = detail?.links?.twitter_screen_name ? String(detail.links.twitter_screen_name) : '';

  return {
    homepage: homepage || undefined,
    twitter_screen_name: twitter || undefined,
  };
}

function normalizeGateChainToGeckoNetwork(chainName) {
  const s = String(chainName || '').trim().toUpperCase();
  // Best-effort mapping. Add more as needed.
  const map = {
    ETH: 'eth',
    ERC20: 'eth',
    ETHEREUM: 'eth',
    BASE: 'base',
    BASEEVM: 'base',
    ARB: 'arbitrum',
    ARBITRUM: 'arbitrum',
    ARBONE: 'arbitrum',
    OP: 'optimism',
    OPTIMISM: 'optimism',
    OPEVM: 'optimism',
    BSC: 'bsc',
    BEP20: 'bsc',
    BNBCHAIN: 'bsc',
    POLYGON: 'polygon_pos',
    MATIC: 'polygon_pos',
    POLYGONPOS: 'polygon_pos',
    AVAX: 'avalanche',
    AVALANCHE: 'avalanche',
    AVAXC: 'avalanche',
    FTM: 'fantom',
    FANTOM: 'fantom',
    SOL: 'solana',
    SOLANA: 'solana',
  };
  return map[s] || null;
}

async function geckoterminalToCoingeckoId({ network, address }) {
  if (!network || !address) return null;
  const addr = String(address).trim();
  if (!addr) return null;
  const url = `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(addr)}`;
  const j = await safeFetchJson(url, { headers: { Accept: 'application/json' } });
  const attrs = j?.data?.attributes || {};
  return {
    coingecko_coin_id: attrs?.coingecko_coin_id || null,
    symbol: attrs?.symbol || null,
    name: attrs?.name || null,
    image_url: attrs?.image_url || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const limit = Math.min(Math.max(toInt(req.query?.limit ?? 100), 1), 200);
  const enrich = String(req.query?.enrich ?? '0') === '1';

  try {
    // Spot pairs
    const spotPairsUrl = 'https://api.gateio.ws/api/v4/spot/currency_pairs';
    const spotPairs = await fetchJson(spotPairsUrl, { headers: { Accept: 'application/json' } });

    // Spot tickers (for price/volume). This is a big payload; still OK for serverless, but keep only what we need.
    const spotTickersUrl = 'https://api.gateio.ws/api/v4/spot/tickers';
    const spotTickers = await fetchJson(spotTickersUrl, { headers: { Accept: 'application/json' } });
    const tickerByPair = new Map();
    for (const t of Array.isArray(spotTickers) ? spotTickers : []) {
      if (t?.currency_pair) tickerByPair.set(t.currency_pair, t);
    }

    // Futures contracts (USDT)
    const futContractsUrl = 'https://api.gateio.ws/api/v4/futures/usdt/contracts';
    const futTickersUrl = 'https://api.gateio.ws/api/v4/futures/usdt/tickers';
    const [futContracts, futTickers] = await Promise.all([
      fetchJson(futContractsUrl, { headers: { Accept: 'application/json' } }),
      fetchJson(futTickersUrl, { headers: { Accept: 'application/json' } }),
    ]);

    const futTickerByContract = new Map();
    for (const t of Array.isArray(futTickers) ? futTickers : []) {
      if (t?.contract) futTickerByContract.set(String(t.contract).toUpperCase(), t);
    }

    // Build coin candidates
    const coinRows = [];

    // From spot: derive listing time from max(sell_start, buy_start) when available
    for (const p of Array.isArray(spotPairs) ? spotPairs : []) {
      const base = normalizeSymbol(p?.base);
      if (!base) continue;
      const listedTs = Math.max(toInt(p?.sell_start), toInt(p?.buy_start));
      const pairId = p?.id;
      const name = p?.base_name ? String(p.base_name) : base;

      // Prefer USDT pairs for market data
      const isUsdt = String(p?.quote || '').toUpperCase() === 'USDT';
      if (!isUsdt) continue;

      const t = pairId ? tickerByPair.get(pairId) : null;
      const last = t?.last ? Number(t.last) : 0;
      const quoteVol = t?.quote_volume ? Number(t.quote_volume) : 0;
      const changePct = t?.change_percentage ? Number(t.change_percentage) : 0;

      coinRows.push({
        source: 'spot',
        symbol: base,
        name,
        pair: pairId,
        listedTs,
        current_price: Number.isFinite(last) ? last : 0,
        total_volume: Number.isFinite(quoteVol) ? quoteVol : 0,
        price_change_percentage_24h: Number.isFinite(changePct) ? changePct : 0,
      });
    }

    // From futures: use create_time as listing time, and use futures tickers for market stats when spot is absent
    for (const c of Array.isArray(futContracts) ? futContracts : []) {
      const name = String(c?.name || '').toUpperCase(); // e.g. BTC_USDT
      const base = normalizeSymbol(name.split('_')[0]);
      if (!base) continue;

      const t = futTickerByContract.get(name) || null;
      const last = t?.last ? Number(t.last) : 0;
      const vol = t?.volume_24h ? Number(t.volume_24h) : 0;
      const changePct = t?.change_percentage ? Number(t.change_percentage) : 0;

      coinRows.push({
        source: 'futures',
        symbol: base,
        name: base,
        pair: name,
        listedTs: toInt(c?.create_time),
        current_price: Number.isFinite(last) ? last : 0,
        total_volume: Number.isFinite(vol) ? vol : 0,
        price_change_percentage_24h: Number.isFinite(changePct) ? changePct : 0,
      });
    }

    // Merge by symbol: take max listedTs, and prefer spot market stats if available
    const merged = new Map();
    for (const r of coinRows) {
      const k = r.symbol;
      const prev = merged.get(k);
      if (!prev) {
        merged.set(k, r);
        continue;
      }
      const listedTs = Math.max(toInt(prev.listedTs), toInt(r.listedTs));
      const pickSpot = (prev.source !== 'spot' && r.source === 'spot');
      const next = pickSpot ? r : prev;
      merged.set(k, {
        ...next,
        listedTs,
        // keep best available market stats
        current_price: next.current_price || prev.current_price || 0,
        total_volume: next.total_volume || prev.total_volume || 0,
        price_change_percentage_24h: Number.isFinite(next.price_change_percentage_24h) ? next.price_change_percentage_24h : (prev.price_change_percentage_24h || 0),
      });
    }

    const coins = Array.from(merged.values())
      .sort((a, b) => (toInt(b.listedTs) - toInt(a.listedTs)) || (b.total_volume - a.total_volume))
      .slice(0, limit)
      .map((c) => ({
        id: c.symbol.toLowerCase(),
        symbol: c.symbol,
        name: c.name,
        image: undefined,
        current_price: c.current_price,
        market_cap: 0,
        total_volume: c.total_volume,
        price_change_percentage_24h: c.price_change_percentage_24h,
        listed_at: formatDate(c.listedTs),
        tags: [],
      }));

    if (!enrich || coins.length === 0) {
      return res.status(200).json({ data: coins });
    }

    const overrides = loadOverrides();

    // Enrichment priority:
    // 1) Manual overrides by (network:address)
    // 2) Gate -> contract address -> GeckoTerminal -> coingecko_coin_id -> CoinGecko links (precise)
    // 3) Fallback conservative CoinGecko search (symbol+name unique exact match)
    //
    // Hard cap to avoid blowing up serverless runtime.
    const MAX_ENRICH = 20;
    const enriched = [];

    for (let i = 0; i < coins.length; i++) {
      const coin = coins[i];
      if (i >= MAX_ENRICH) {
        enriched.push(coin);
        continue;
      }

      let out = { ...coin };

      // --- Step 1: Gate currency info (addresses) ---
      const gateInfo = await safeFetchJson(`https://api.gateio.ws/api/v4/spot/currencies/${encodeURIComponent(coin.symbol)}`, {
        headers: { Accept: 'application/json' },
      });

      const chains = Array.isArray(gateInfo?.chains) ? gateInfo.chains : [];

      // Try overrides first
      let applied = false;
      const isValidAddr = (network, addrRaw) => {
        const a = String(addrRaw || '').trim();
        if (!a) return false;
        if (network === 'solana') {
          // very loose base58 check
          return /^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(a);
        }
        // EVM-like
        return /^0x[0-9a-fA-F]{40}$/.test(a);
      };

      for (const ch of chains) {
        const network = normalizeGateChainToGeckoNetwork(ch?.name);
        const addrRaw = (ch?.addr || '').toString().trim();
        if (!network || !isValidAddr(network, addrRaw)) continue;

        const addr = addrRaw.toLowerCase();
        const key = `${network}:${addr}`;
        const ov = overrides[key];
        if (ov?.homepage || ov?.twitter_screen_name) {
          out = {
            ...out,
            homepage: ov.homepage || out.homepage,
            twitter_screen_name: ov.twitter_screen_name || out.twitter_screen_name,
          };
          applied = true;
          break;
        }
      }

      // --- Step 2: precise: address -> GeckoTerminal -> coingecko id -> CoinGecko links ---
      if (!applied && (!out.homepage || !out.twitter_screen_name)) {
        for (const ch of chains) {
          const network = normalizeGateChainToGeckoNetwork(ch?.name);
          const addrRaw = (ch?.addr || '').toString().trim();
          if (!network || !isValidAddr(network, addrRaw)) continue;

          const gt = await geckoterminalToCoingeckoId({ network, address: addrRaw });
          const cgId = gt?.coingecko_coin_id;

          // sanity check: symbol match (avoid edge-case wrong chain mapping)
          const gtSym = gt?.symbol ? normalizeSymbol(gt.symbol) : null;
          if (gtSym && gtSym !== normalizeSymbol(coin.symbol)) {
            continue;
          }

          if (cgId) {
            const links = await coingeckoLinksById(cgId);
            out = {
              ...out,
              ...(links || {}),
              // Optional: use image from GeckoTerminal if we don't have one
              image: out.image || gt?.image_url || out.image,
            };
            applied = true;
            break;
          }

          // If no coingecko id, still allow override by key (network:addr) to be applied later via manual edits.
          // Also, keep potential address info for future use.
          if (!out.token_address) {
            out.token_address = addrRaw.toLowerCase();
            out.token_network = network;
          }
        }
      }

      // --- Step 3: fallback conservative search ---
      if (!out.homepage && !out.twitter_screen_name) {
        const links = await coingeckoConservativeLinks({ symbol: coin.symbol, name: coin.name });
        out = { ...out, ...(links || {}) };
      }

      enriched.push(out);
    }

    return res.status(200).json({ data: enriched });
  } catch (error) {
    console.error('Error building Gate latest list:', error);
    res.status(500).json({ error: error?.message || 'Unknown error' });
  }
}
