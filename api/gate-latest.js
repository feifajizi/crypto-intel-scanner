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

function loadCoinEnrichment() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const p = path.join(__dirname, 'coin_enrichment.json');
    console.log(`[loadCoinEnrichment] Trying to load from: ${p}`);
    const raw = fs.readFileSync(p, 'utf-8');
    const data = JSON.parse(raw) || {};
    console.log(`[loadCoinEnrichment] Loaded ${Object.keys(data).length} coins`);
    return data;
  } catch (err) {
    console.error(`[loadCoinEnrichment] Error: ${err.message}`);
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

  const image = detail?.image?.small || detail?.image?.thumb || '';

  return {
    homepage: homepage || undefined,
    twitter_screen_name: twitter || undefined,
    image: image || undefined,
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

    // Filter leveraged tokens (3L/5L/3S/5S endings)
    const LEVERAGED_RE = /(?:3|5)[LS]$/i;

    // === COMPREHENSIVE STOCK / RWA / INDEX / COMMODITY / FOREX BLACKLIST ===
    const STOCK_BLACKLIST = new Set([
      // US Stocks
      'AAPL','MSFT','TSLA','NVDA','AMD','AMZN','GOOGL','GOOG','META','NFLX',
      'AVGO','INTC','CSCO','IBM','ORCL','CRM','ADBE','PYPL','SQ','SHOP',
      'ARM','MRVL','LLY','UNH','JNJ','PFE','MRK','ABBV','TMO','ABT',
      'JPM','BAC','GS','MS','WFC','C','BLK','SCHW','AXP','V','MA',
      'KO','PEP','MCD','SBUX','NKE','DIS','CMCSA','T','VZ','TMUS',
      'PG','WMT','HD','LOW','COST','TGT','AMGN','GILD','BIDU',
      'BABA','JD','PDD','NIO','XPEV','LI','BILI','TME','NTES','MOMO',
      'ACN','GE','CAT','BA','RTX','LMT','HON','MMM','DE','UPS',
      'XOM','CVX','COP','SLB','EOG','MPC','PSX','OXY',
      'ASML','TSM','QCOM','TXN','MU','AMAT','LRCX','KLAC','SNPS','CDNS',
      'COHR','LIN','APD','SHW','ECL','FCX','NEM','COIN','MSTR','HOOD',
      'PLTR','SNOW','NET','DDOG','ZS','CRWD','PANW','OKTA','RBLX',
      'SPOT','SNAP','PINS','UBER','LYFT','ABNB','DASH','ROKU',
      'RIVN','LCID','F','GM','STLA','HMC','TM','RACE',
      'LITE','AGG','TLT','IEFA','IAU','SPY','QQQ','IWM','DIA','EFA',
      'VTI','VOO','VEA','VWO','BND','HYG','LQD','TIP','SHY','IEF',
      'GLD','SLV','USO','UNG','ARKK','ARKG','XLF','XLE','XLK','XLV',
      // Indices & Forex & Commodities on Gate
      'SPX500','SPX','NAS100','NDX','US30','DJI','US2000','UK100','FTSE',
      'JPN225','HK50','AUS200','TW88','DAX','CAC40','STOXX50',
      'VIX','EVIX','BVIX','UVXY','VXX',
      'EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD',
      'EURGBP','EURJPY','GBPJPY','AUDJPY','CADJPY','CHFJPY',
      'HSCHKD','USDCNH','USDHKD','USDSGD','USDMXN','USDZAR',
      'XAU','XAG','XPT','XPD','XCU','XAL','XNI','XPB','XBR','XTI',
      'GOLD','SILVER','OIL','GAS','NATGAS','BRENT','WTI','COPPER',
      'CORN','WHEAT','SOYBEAN','COTTON','SUGAR','COFFEE','COCOA',
      // Ondo tokenized stocks
      'AMDON','PGON','LMTON','SLVON','IEFAON','AGGON','IAUON','TLTON',
      'RDDTON','FUTUON','JDON','BTGOON','AVOON',
      // xStock tokens
      'PLTRX','ORCLX','TQQQX',
      // Misc known non-crypto
      '3KDS','EQTY',
    ]);

    // Pattern-based filters for stock-like symbols
    const STOCK_PATTERNS = [
      /^[A-Z]{2,5}USD$/i,      // Forex pairs like EURUSD, GBPUSD
      /^USD[A-Z]{3}$/i,        // USDJPY, USDCAD (but not USDT/USDC)
      /^X[A-Z]{2}$/i,          // XAU, XAG, XPT, XPD, XCU, XAL, XNI, XPB, XBR, XTI
      /^\d+KDS$/i,             // 3KDS etc
      /^[A-Z]{2,5}ON$/i,       // Ondo tokenized stocks: AMDON, PGON, LMTON, SLVON, IEFAON, AGGON, IAUON, TLTON, RDDTON, FUTUON, JDON
      /^[A-Z]{2,5}X$/i,       // xStock tokens: PLTRX, ORCLX, TQQQX
    ];

    // Whitelist to protect legit crypto that might match patterns
    const CRYPTO_WHITELIST = new Set([
      'BTC','ETH','BNB','SOL','ADA','DOT','AVAX','MATIC','ATOM','NEAR',
      'FTM','ARB','OP','APT','SUI','SEI','TIA','PYTH','JTO','JUP',
      'LINK','UNI','AAVE','MKR','SNX','CRV','COMP','SUSHI','YFI','BAL',
      'FIL','AR','RENDER','AKT','THETA','RNDR','HNT','IOTX','JASMY',
      'DYDX','GMX','PERP','INJ','STX','RUNE','OSMO','KAVA','CKB',
      'FET','OCEAN','AGIX','TAO','WLD','ARKM','ONDO','PENDLE','ENA',
      'TRX','XRP','LTC','BCH','ETC','XLM','ALGO','HBAR','VET','EGLD',
      'TON','KAS','ORDI','SATS','RATS','1000SATS','MINA','ZEC','DASH',
      'XMR','IOTA','NEO','QTUM','ZIL','ONE','ICX','ZRX','BAT','ENJ',
      'MANA','SAND','AXS','GALA','IMX','FLOW','APE','BLUR','MAGIC',
      'ILV','YGG','PRIME','PIXEL','PORTAL','ACE','XAI','STRK','METIS',
      'CELO','RSR','GRT','LDO','RPL','SSV','ETHFI','ALT','MANTA',
      'DYM','BOME','WIF','PEPE','FLOKI','BONK','MEW','POPCAT','TURBO',
      'USDT','USDC','DAI','FRAX','TUSD','BUSD','FDUSD','USDD',
      'WBTC','WETH','STETH','CBETH','RETH','LIDO','EIGEN',
      'USD1','PAXG', // PAXG is gold-backed but trades as crypto
      // Protect from ON/X suffix patterns
      'MON','NEON','BISON','PION','IRON','ICON','RADON','TRON','MASON',
      'PYTHON','ORION','PHOTON','NEUTRON','PROTON','HELION','PARTON',
      'NEIRO','COMMON','ELIZAOS','UNION',
      'ONYX','LYNX','FLUX','APEX','HELIX',
      'AVAX','STMX','INX','FLX','MIX',
      'BOX','FOX','WAX','HEX','REX','ALEX','BEAMX','XRDX',
      'MVRX','CONVEX','VERTEX','VORTEX',
      // Other legit
      'TRAC','GHO','SBTC','CC','AT','ON','FUN','LIT',
    ]);

    // Name-based patterns to catch stock tokens by company name
    const STOCK_NAME_PATTERNS = [
      /\b(tesla|apple|microsoft|nvidia|amazon|alphabet|google|netflix|berkshire)\b/i,
      /\b(jpmorgan|goldman|morgan stanley|bank of america|citigroup|wells fargo)\b/i,
      /\b(coca.?cola|pepsi|mcdonalds|starbucks|nike|disney|comcast)\b/i,
      /\b(exxon|chevron|shell|bp|total)\b/i,
      /\b(pfizer|moderna|johnson|merck|abbvie|eli lilly)\b/i,
      /\b(s&p|nasdaq|dow jones|russell|ftse|nikkei|hang seng)\b/i,
      /\bondo tokenized\b/i,
      /\bxstock\b/i,
      /\bishares\b/i,
      /\betf\b/i,
      /\bprocter\s*&?\s*gamble\b/i,
      /\blockheed\b/i,
      /\bbitgo holdings\b/i,
    ];

    const isStockToken = (c) => {
      const sym = c.symbol.toUpperCase();
      // Whitelist always passes
      if (CRYPTO_WHITELIST.has(sym)) return false;
      // Blacklist
      if (STOCK_BLACKLIST.has(sym)) return true;
      // Pattern match on symbol
      if (STOCK_PATTERNS.some(p => p.test(sym))) return true;
      // Name match
      const name = c.name || '';
      if (STOCK_NAME_PATTERNS.some(p => p.test(name))) return true;
      return false;
    };

    const filtered = Array.from(merged.values()).filter(c => !LEVERAGED_RE.test(c.symbol) && !isStockToken(c));

    const coins = filtered
      .sort((a, b) => (toInt(b.listedTs) - toInt(a.listedTs)) || (b.total_volume - a.total_volume))
      .slice(0, limit)
      .map((c) => ({
        id: c.symbol.toLowerCase(),
        symbol: c.symbol,
        name: c.name,
        image: `https://www.gate.com/images/coin_icon/64/${c.symbol.toLowerCase()}.png`,
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
    const coinEnrichment = loadCoinEnrichment();

    // Enrichment priority:
    // 0) coin_enrichment.json (from offline scanner - most complete)
    // 1) Manual overrides by (network:address)
    // 2) Gate -> contract address -> GeckoTerminal -> coingecko_coin_id -> CoinGecko links (precise)
    // 3) Fallback conservative CoinGecko search (symbol+name unique exact match)
    //
    // Hard cap to avoid blowing up serverless runtime.
    const MAX_ENRICH = 30;
    const enriched = [];

    for (let i = 0; i < coins.length; i++) {
      const coin = coins[i];
      
      // Step 0: Check coin_enrichment.json first (from offline scanner)
      const ce = coinEnrichment[coin.symbol];
      if (ce && (ce.homepage || ce.twitter_screen_name || ce.image)) {
        enriched.push({
          ...coin,
          homepage: ce.homepage || coin.homepage,
          twitter_screen_name: ce.twitter_screen_name || coin.twitter_screen_name,
          image: ce.image || coin.image,
          staking: ce.staking || undefined,
        });
        continue;
      }
      
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
              // Prefer CoinGecko image > GeckoTerminal image > Gate icon
              image: links?.image || gt?.image_url || out.image,
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
