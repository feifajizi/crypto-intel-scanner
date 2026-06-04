// Vercel Serverless Function
// Real-time stock / TradFi equity perpetual funding rates across CEX and DEX venues.

const GATE_CONTRACTS = 'https://api.gateio.ws/api/v4/futures/usdt/contracts';
const BYBIT_TICKERS = 'https://api.bybit.com/v5/market/tickers?category=linear';
const BYBIT_INSTRUMENTS = 'https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000';
const BINANCE_PREMIUM = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const BINANCE_EXCHANGE_INFO = 'https://fapi.binance.com/fapi/v1/exchangeInfo';
const OKX_INSTRUMENTS = 'https://www.okx.com/api/v5/public/instruments?instType=SWAP';
const OKX_TICKERS = 'https://www.okx.com/api/v5/market/tickers?instType=SWAP';
const BITGET_CONTRACTS = 'https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES';
const BITGET_TICKERS = 'https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES';
const HYPERLIQUID_INFO = 'https://api.hyperliquid.xyz/info';
const ASTER_PREMIUM = 'https://fapi.asterdex.com/fapi/v1/premiumIndex';
const ASTER_EXCHANGE_INFO = 'https://fapi.asterdex.com/fapi/v1/exchangeInfo';
const LIGHTER_MARKETS = 'https://mainnet.zklighter.elliot.ai/api/v1/orderBookDetails';
const LIGHTER_FUNDING = 'https://mainnet.zklighter.elliot.ai/api/v1/funding-rates';
const GRVT_INSTRUMENTS = 'https://market-data.grvt.io/lite/v1/all_instruments';
const GRVT_FUNDING = 'https://market-data.grvt.io/lite/v1/funding';
const VARIATIONAL_STATS = 'https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats';

const STOCK_BASES = new Set([
  'AAPL', 'AMD', 'AMZN', 'AVGO', 'BABA', 'COIN', 'CRCL', 'GOOGL', 'GOOG', 'HOOD',
  'INTC', 'IWM', 'JPM', 'META', 'MSFT', 'MSTR', 'NFLX', 'NVDA', 'PDD', 'PLTR',
  'QQQ', 'SOXX', 'SPY', 'TSLA', 'TSM', 'UBER', 'WMT', 'XOM',
]);

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function annualizedPct(rate, intervalHours) {
  const r = toNum(rate);
  const h = toNum(intervalHours);
  if (r === null || !h) return null;
  return r * (24 / h) * 365 * 100;
}

function iso(msOrSec) {
  const n = toNum(msOrSec);
  if (!n) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function baseFromSymbol(symbol, suffix = 'USDT') {
  return String(symbol || '').replace(new RegExp(`${suffix}$`), '');
}

function baseFromGate(name) {
  return String(name || '').replace(/_USDT$/, '').replace(/X$/, '');
}

function baseFromLinearSymbol(symbol) {
  return String(symbol || '')
    .replace(/^SHIELD/, '')
    .replace(/-USDT-SWAP$/, '')
    .replace(/_USDT_Perp$/, '')
    .replace(/USDT$/, '')
    .replace(/USD$/, '');
}

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

async function postJson(url, body, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

function row({ exchange, symbol, base, rate, intervalHours, nextFundingTime, markPrice, indexPrice, lastPrice, turnover24h, volume24h, openInterest, maxLeverage, url }) {
  const ann = annualizedPct(rate, intervalHours);
  return {
    exchange,
    symbol,
    base,
    fundingRate: toNum(rate),
    fundingRatePct: toNum(rate) === null ? null : toNum(rate) * 100,
    intervalHours: toNum(intervalHours),
    annualizedPct: ann,
    absAnnualizedPct: ann === null ? null : Math.abs(ann),
    earnSide: ann === null ? '未知' : ann > 0 ? '做空收' : ann < 0 ? '做多收' : '中性',
    nextFundingTime: iso(nextFundingTime),
    markPrice: toNum(markPrice),
    indexPrice: toNum(indexPrice),
    lastPrice: toNum(lastPrice),
    turnover24h: toNum(turnover24h),
    volume24h: toNum(volume24h),
    openInterest: toNum(openInterest),
    maxLeverage: maxLeverage ? String(maxLeverage) : null,
    url,
  };
}

async function gateRows() {
  const contracts = await fetchJson(GATE_CONTRACTS);
  if (!Array.isArray(contracts)) return [];

  return contracts
    .filter((c) => c?.status === 'trading' && c?.contract_type === 'stocks')
    .map((c) => row({
      exchange: 'Gate',
      symbol: c.name,
      base: baseFromGate(c.name),
      rate: c.funding_rate,
      intervalHours: toNum(c.funding_interval) ? toNum(c.funding_interval) / 3600 : null,
      nextFundingTime: c.funding_next_apply,
      markPrice: c.mark_price,
      indexPrice: c.index_price,
      lastPrice: c.last_price,
      volume24h: c.trade_size,
      openInterest: c.position_size,
      maxLeverage: c.leverage_max,
      url: `https://www.gate.com/zh/futures/USDT/${encodeURIComponent(c.name)}`,
    }));
}

async function bybitRows() {
  const [tickers, instruments] = await Promise.all([fetchJson(BYBIT_TICKERS), fetchJson(BYBIT_INSTRUMENTS)]);
  const tickerList = Array.isArray(tickers?.result?.list) ? tickers.result.list : [];
  const instrumentList = Array.isArray(instruments?.result?.list) ? instruments.result.list : [];
  const stockInstruments = instrumentList.filter((i) => i?.status === 'Trading' && i?.symbolType === 'stock');
  const tickerBySymbol = new Map(tickerList.map((t) => [t.symbol, t]));

  return stockInstruments.map((i) => {
    const t = tickerBySymbol.get(i.symbol) || {};
    const intervalHours = toNum(t.fundingIntervalHour) || (toNum(i.fundingInterval) ? toNum(i.fundingInterval) / 60 : null);
    return row({
      exchange: 'Bybit',
      symbol: i.symbol,
      base: String(i.baseCoin || baseFromSymbol(i.symbol)).replace(/STOCK$/, ''),
      rate: t.fundingRate,
      intervalHours,
      nextFundingTime: t.nextFundingTime,
      markPrice: t.markPrice,
      indexPrice: t.indexPrice,
      lastPrice: t.lastPrice,
      turnover24h: t.turnover24h,
      volume24h: t.volume24h,
      openInterest: t.openInterest,
      maxLeverage: i?.leverageFilter?.maxLeverage,
      url: `https://www.bybit.com/trade/usdt/${encodeURIComponent(i.symbol)}`,
    });
  });
}

async function binanceRows() {
  const [premium, info] = await Promise.all([fetchJson(BINANCE_PREMIUM), fetchJson(BINANCE_EXCHANGE_INFO)]);
  const premiumList = Array.isArray(premium) ? premium : [];
  const symbols = Array.isArray(info?.symbols) ? info.symbols : [];
  const equitySymbols = symbols.filter((s) => s?.status === 'TRADING' && s?.underlyingType === 'EQUITY');
  const premiumBySymbol = new Map(premiumList.map((p) => [p.symbol, p]));

  return equitySymbols.map((s) => {
    const p = premiumBySymbol.get(s.symbol) || {};
    return row({
      exchange: 'Binance',
      symbol: s.symbol,
      base: s.baseAsset || baseFromSymbol(s.symbol),
      rate: p.lastFundingRate,
      intervalHours: 8,
      nextFundingTime: p.nextFundingTime,
      markPrice: p.markPrice,
      indexPrice: p.indexPrice,
      lastPrice: p.markPrice,
      maxLeverage: null,
      url: `https://www.binance.com/en/futures/${encodeURIComponent(s.symbol)}`,
    });
  });
}

async function okxRows() {
  const [instruments, tickers] = await Promise.all([fetchJson(OKX_INSTRUMENTS), fetchJson(OKX_TICKERS)]);
  const instrumentList = Array.isArray(instruments?.data) ? instruments.data : [];
  const tickerByInstId = new Map((Array.isArray(tickers?.data) ? tickers.data : []).map((t) => [t.instId, t]));
  const stockInstruments = instrumentList.filter((i) => i?.state === 'live' && STOCK_BASES.has(baseFromLinearSymbol(i.instId)));

  const fundingList = await Promise.all(stockInstruments.map((i) => fetchJson(`https://www.okx.com/api/v5/public/funding-rate?instId=${encodeURIComponent(i.instId)}`)
    .then((json) => ({ instId: i.instId, data: Array.isArray(json?.data) ? json.data[0] : null }))
    .catch(() => ({ instId: i.instId, data: null }))));
  const fundingByInstId = new Map(fundingList.map((f) => [f.instId, f.data]));

  return stockInstruments.map((i) => {
    const t = tickerByInstId.get(i.instId) || {};
    const f = fundingByInstId.get(i.instId) || {};
    return row({
      exchange: 'OKX',
      symbol: i.instId,
      base: baseFromLinearSymbol(i.instId),
      rate: f.fundingRate,
      intervalHours: 8,
      nextFundingTime: f.fundingTime || f.nextFundingTime,
      markPrice: null,
      indexPrice: null,
      lastPrice: t.last,
      volume24h: t.vol24h,
      openInterest: null,
      maxLeverage: i.lever,
      url: `https://www.okx.com/trade-swap/${encodeURIComponent(i.instId)}`,
    });
  });
}

async function bitgetRows() {
  const [contracts, tickers] = await Promise.all([fetchJson(BITGET_CONTRACTS), fetchJson(BITGET_TICKERS)]);
  const contractList = Array.isArray(contracts?.data) ? contracts.data : [];
  const tickerBySymbol = new Map((Array.isArray(tickers?.data) ? tickers.data : []).map((t) => [t.symbol, t]));
  return contractList
    .filter((c) => c?.symbolStatus === 'normal' && STOCK_BASES.has(baseFromLinearSymbol(c.symbol)))
    .map((c) => {
      const t = tickerBySymbol.get(c.symbol) || {};
      return row({
        exchange: 'Bitget',
        symbol: c.symbol,
        base: c.baseCoin || baseFromLinearSymbol(c.symbol),
        rate: t.fundingRate,
        intervalHours: c.fundInterval,
        nextFundingTime: null,
        markPrice: t.markPrice,
        indexPrice: t.indexPrice,
        lastPrice: t.lastPr,
        turnover24h: t.usdtVolume || t.quoteVolume,
        volume24h: t.baseVolume,
        openInterest: t.holdingAmount,
        maxLeverage: c.maxLever,
        url: `https://www.bitget.com/futures/usdt/${encodeURIComponent(c.symbol)}`,
      });
    });
}

async function hyperliquidRows() {
  const json = await postJson(HYPERLIQUID_INFO, { type: 'metaAndAssetCtxs' });
  const universe = Array.isArray(json?.[0]?.universe) ? json[0].universe : [];
  const ctxs = Array.isArray(json?.[1]) ? json[1] : [];
  return universe
    .map((u, idx) => ({ u, ctx: ctxs[idx] || {} }))
    .filter(({ u }) => !u?.isDelisted && STOCK_BASES.has(String(u?.name || '')))
    .map(({ u, ctx }) => row({
      exchange: 'Hyperliquid',
      symbol: u.name,
      base: u.name,
      rate: ctx.funding,
      intervalHours: 1,
      nextFundingTime: null,
      markPrice: ctx.markPx,
      indexPrice: ctx.oraclePx,
      lastPrice: ctx.midPx,
      volume24h: ctx.dayNtlVlm,
      openInterest: ctx.openInterest,
      maxLeverage: u.maxLeverage,
      url: `https://app.hyperliquid.xyz/trade/${encodeURIComponent(u.name)}`,
    }));
}


function inferIntervalHoursFromFundingHistory(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const times = rows
    .map((x) => toNum(x?.fundingTime))
    .filter((x) => x !== null)
    .sort((a, b) => a - b);
  const diffs = [];
  for (let i = 1; i < times.length; i += 1) {
    const h = Math.round(((times[i] - times[i - 1]) / 3600000) * 100) / 100;
    if (h > 0 && h <= 24) diffs.push(h);
  }
  if (!diffs.length) return null;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

function inferCurrentIntervalHoursFromFundingHistory(rows, nextFundingTime) {
  const next = toNum(nextFundingTime);
  if (!Array.isArray(rows) || !next) return inferIntervalHoursFromFundingHistory(rows);
  const prev = rows
    .map((x) => toNum(x?.fundingTime))
    .filter((x) => x !== null && x < next)
    .sort((a, b) => b - a)[0];
  if (prev) {
    const h = Math.round(((next - prev) / 3600000) * 100) / 100;
    if (h > 0 && h <= 24) return h;
  }
  return inferIntervalHoursFromFundingHistory(rows);
}

async function asterRows() {
  const [premium, info] = await Promise.all([fetchJson(ASTER_PREMIUM), fetchJson(ASTER_EXCHANGE_INFO)]);
  const premiumBySymbol = new Map((Array.isArray(premium) ? premium : []).map((p) => [p.symbol, p]));
  const symbols = Array.isArray(info?.symbols) ? info.symbols : [];
  const stockSymbols = symbols.filter((s) => s?.status === 'TRADING' && STOCK_BASES.has(baseFromLinearSymbol(s.symbol)));
  const intervalList = await Promise.all(stockSymbols.map((s) => {
    const p = premiumBySymbol.get(s.symbol) || {};
    return fetchJson(`https://fapi.asterdex.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(s.symbol)}&limit=12`)
      .then((hist) => ({ symbol: s.symbol, intervalHours: inferCurrentIntervalHoursFromFundingHistory(hist, p.nextFundingTime) }))
      .catch(() => ({ symbol: s.symbol, intervalHours: null }));
  }));
  const intervalBySymbol = new Map(intervalList.map((x) => [x.symbol, x.intervalHours]));

  return stockSymbols.map((s) => {
    const p = premiumBySymbol.get(s.symbol) || {};
    return row({
      exchange: 'AsterDEX',
      symbol: s.symbol,
      base: s.baseAsset || baseFromLinearSymbol(s.symbol),
      rate: p.lastFundingRate,
      intervalHours: intervalBySymbol.get(s.symbol) || 8,
      nextFundingTime: p.nextFundingTime,
      markPrice: p.markPrice,
      indexPrice: p.indexPrice,
      lastPrice: p.markPrice,
      openInterest: null,
      maxLeverage: null,
      url: `https://www.asterdex.com/en/futures/${encodeURIComponent(s.symbol)}`,
    });
  });
}

async function lighterRows() {
  const [details, funding] = await Promise.all([fetchJson(LIGHTER_MARKETS), fetchJson(LIGHTER_FUNDING)]);
  const marketList = Array.isArray(details?.order_book_details) ? details.order_book_details : [];
  const fundingByMarketId = new Map((Array.isArray(funding?.funding_rates) ? funding.funding_rates : []).map((f) => [f.market_id, f]));
  return marketList
    .filter((m) => m?.status === 'active' && m?.market_type === 'perp' && STOCK_BASES.has(String(m.symbol || '')))
    .map((m) => {
      const f = fundingByMarketId.get(m.market_id) || {};
      return row({
        exchange: 'Lighter',
        symbol: m.symbol,
        base: m.symbol,
        rate: f.rate,
        intervalHours: 1,
        nextFundingTime: null,
        markPrice: m.last_trade_price,
        indexPrice: null,
        lastPrice: m.last_trade_price,
        turnover24h: m.daily_quote_token_volume,
        volume24h: m.daily_base_token_volume,
        openInterest: m.open_interest,
        maxLeverage: toNum(m.min_initial_margin_fraction) ? (10000 / toNum(m.min_initial_margin_fraction)).toFixed(0) : null,
        url: `https://app.lighter.xyz/trade/${encodeURIComponent(m.symbol)}`,
      });
    });
}

async function grvtRows() {
  const instruments = await postJson(GRVT_INSTRUMENTS, { ia: true });
  const instrumentList = Array.isArray(instruments?.r) ? instruments.r : [];
  const stockInstruments = instrumentList.filter((i) => i?.k === 'PERPETUAL' && STOCK_BASES.has(String(i?.b || '')));
  const fundingList = await Promise.all(stockInstruments.map((i) => postJson(GRVT_FUNDING, { i: i.i, l: 1 })
    .then((json) => ({ instrument: i.i, data: Array.isArray(json?.r) ? json.r[0] : null }))
    .catch(() => ({ instrument: i.i, data: null }))));
  const fundingByInstrument = new Map(fundingList.map((f) => [f.instrument, f.data]));

  return stockInstruments.map((i) => {
    const f = fundingByInstrument.get(i.i) || {};
    return row({
      exchange: 'GRVT',
      symbol: i.i,
      base: i.b,
      rate: toNum(f.fr) === null ? null : toNum(f.fr) / 100,
      intervalHours: f.fi || i.fi,
      nextFundingTime: null,
      markPrice: f.mp,
      indexPrice: null,
      lastPrice: f.mp,
      openInterest: null,
      maxLeverage: null,
      url: `https://app.grvt.io/trade/${encodeURIComponent(i.i)}`,
    });
  });
}

async function variationalRows() {
  const stats = await fetchJson(VARIATIONAL_STATS);
  const listings = Array.isArray(stats?.listings) ? stats.listings : [];
  return listings
    .filter((x) => STOCK_BASES.has(String(x?.ticker || '')))
    .map((x) => row({
      exchange: 'Variational',
      symbol: x.ticker,
      base: x.ticker,
      rate: x.funding_rate,
      intervalHours: toNum(x.funding_interval_s) ? toNum(x.funding_interval_s) / 3600 : null,
      nextFundingTime: null,
      markPrice: x.mark_price,
      indexPrice: null,
      lastPrice: x.mark_price,
      turnover24h: x.volume_24h,
      openInterest: toNum(x?.open_interest?.long_open_interest) !== null || toNum(x?.open_interest?.short_open_interest) !== null
        ? (toNum(x?.open_interest?.long_open_interest) || 0) + (toNum(x?.open_interest?.short_open_interest) || 0)
        : null,
      maxLeverage: null,
      url: `https://omni.variational.io/markets/${encodeURIComponent(x.ticker)}`,
    }));
}

const SOURCE_JOBS = {
  gate: ['Gate', gateRows],
  bybit: ['Bybit', bybitRows],
  binance: ['Binance', binanceRows],
  okx: ['OKX', okxRows],
  bitget: ['Bitget', bitgetRows],
  hyperliquid: ['Hyperliquid', hyperliquidRows],
  asterdex: ['AsterDEX', asterRows],
  aster: ['AsterDEX', asterRows],
  lighter: ['Lighter', lighterRows],
  variational: ['Variational', variationalRows],
  grvt: ['GRVT', grvtRows],
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const requested = String(req.query?.exchanges || 'gate,bybit,binance,okx,bitget,hyperliquid,asterdex,lighter,variational,grvt')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const seenSources = new Set();
    const jobs = requested.flatMap((key) => {
      const source = SOURCE_JOBS[key];
      if (!source) return [];
      const [exchange, fn] = source;
      if (seenSources.has(exchange)) return [];
      seenSources.add(exchange);
      return [fn().then((rows) => ({ exchange, rows })).catch((e) => ({ exchange, error: e.message, rows: [] }))];
    });

    const parts = await Promise.all(jobs);
    const errors = parts.filter((p) => p.error).map((p) => ({ exchange: p.exchange, error: p.error }));
    const rows = parts.flatMap((p) => p.rows)
      .filter((r) => r.fundingRate !== null)
      .sort((a, b) => (b.absAnnualizedPct || 0) - (a.absAnnualizedPct || 0));

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(errors.length === parts.length ? 502 : 200).json({
      updatedAt: new Date().toISOString(),
      count: rows.length,
      errors,
      data: rows,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Unknown error' });
  }
}
