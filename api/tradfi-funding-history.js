// Vercel Serverless Function
// Historical funding rates for TradFi equity perpetuals.

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function iso(msOrSec) {
  const n = toNum(msOrSec);
  if (!n) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function annualizedPct(rate, intervalHours) {
  const r = toNum(rate);
  const h = toNum(intervalHours) || 8;
  return r === null ? null : r * (24 / h) * 365 * 100;
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

function normalize(rows, intervalHours) {
  return rows
    .map((r) => {
      const rate = toNum(r.rate);
      const ann = annualizedPct(rate, intervalHours);
      return {
        time: r.time,
        fundingRate: rate,
        fundingRatePct: rate === null ? null : rate * 100,
        annualizedPct: ann,
        earnSide: ann === null ? '未知' : ann > 0 ? '做空收' : ann < 0 ? '做多收' : '中性',
        markPrice: toNum(r.markPrice),
      };
    })
    .filter((r) => r.time && r.fundingRate !== null)
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

async function gateHistory(symbol, limit) {
  const url = `https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=${encodeURIComponent(symbol)}&limit=${limit}`;
  const rows = await fetchJson(url);
  return (Array.isArray(rows) ? rows : []).map((x) => ({ time: iso(x.t), rate: x.r, markPrice: null }));
}

async function bybitHistory(symbol, limit) {
  const url = `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  const json = await fetchJson(url);
  return (json?.result?.list || []).map((x) => ({ time: iso(x.fundingRateTimestamp), rate: x.fundingRate, markPrice: null }));
}

async function binanceHistory(symbol, limit) {
  const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  const rows = await fetchJson(url);
  return (Array.isArray(rows) ? rows : []).map((x) => ({ time: iso(x.fundingTime), rate: x.fundingRate, markPrice: x.markPrice }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const exchange = String(req.query?.exchange || '').trim().toLowerCase();
    const symbol = String(req.query?.symbol || '').trim().toUpperCase();
    const limit = Math.min(Math.max(toNum(req.query?.limit) || 60, 1), 100);
    const intervalHours = toNum(req.query?.intervalHours) || 8;

    if (!exchange || !symbol) return res.status(400).json({ error: 'exchange and symbol are required' });

    let raw = [];
    if (exchange === 'gate') raw = await gateHistory(symbol, limit);
    else if (exchange === 'bybit') raw = await bybitHistory(symbol, limit);
    else if (exchange === 'binance') raw = await binanceHistory(symbol, limit);
    else return res.status(400).json({ error: 'unsupported exchange' });

    const data = normalize(raw, intervalHours).slice(0, limit);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ exchange, symbol, intervalHours, count: data.length, data });
  } catch (error) {
    return res.status(502).json({ error: error?.message || 'Unknown error' });
  }
}
