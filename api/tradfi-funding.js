// Vercel Serverless Function
// Real-time stock / TradFi equity perpetual funding rates across Gate, Bybit, and Binance.

const GATE_CONTRACTS = 'https://api.gateio.ws/api/v4/futures/usdt/contracts';
const BYBIT_TICKERS = 'https://api.bybit.com/v5/market/tickers?category=linear';
const BYBIT_INSTRUMENTS = 'https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000';
const BINANCE_PREMIUM = 'https://fapi.binance.com/fapi/v1/premiumIndex';
const BINANCE_EXCHANGE_INFO = 'https://fapi.binance.com/fapi/v1/exchangeInfo';

function toNum(v) {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const requested = String(req.query?.exchanges || 'gate,bybit,binance')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const jobs = [];
    if (requested.includes('gate')) jobs.push(gateRows().then((rows) => ({ exchange: 'Gate', rows })).catch((e) => ({ exchange: 'Gate', error: e.message, rows: [] })));
    if (requested.includes('bybit')) jobs.push(bybitRows().then((rows) => ({ exchange: 'Bybit', rows })).catch((e) => ({ exchange: 'Bybit', error: e.message, rows: [] })));
    if (requested.includes('binance')) jobs.push(binanceRows().then((rows) => ({ exchange: 'Binance', rows })).catch((e) => ({ exchange: 'Binance', error: e.message, rows: [] })));

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
