import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = 3001;

app.use(cors());

// Gate 代理端点（本地开发用）
app.get('/api/gate/latest', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit ?? 100) || 100, 1), 200);

    const spotPairsUrl = 'https://api.gateio.ws/api/v4/spot/currency_pairs';
    const spotTickersUrl = 'https://api.gateio.ws/api/v4/spot/tickers';
    const futContractsUrl = 'https://api.gateio.ws/api/v4/futures/usdt/contracts';

    const [spotPairs, spotTickers, futContracts] = await Promise.all([
      fetch(spotPairsUrl).then(r => r.json()),
      fetch(spotTickersUrl).then(r => r.json()),
      fetch(futContractsUrl).then(r => r.json()),
    ]);

    const tickerByPair = new Map();
    for (const t of Array.isArray(spotTickers) ? spotTickers : []) {
      if (t?.currency_pair) tickerByPair.set(t.currency_pair, t);
    }

    const toInt = (x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };

    const normalizeSymbol = (s) => String(s || '').trim().toUpperCase();

    const merged = new Map();

    for (const p of Array.isArray(spotPairs) ? spotPairs : []) {
      if (String(p?.quote || '').toUpperCase() !== 'USDT') continue;
      const sym = normalizeSymbol(p?.base);
      if (!sym) continue;

      const listedTs = Math.max(toInt(p?.sell_start), toInt(p?.buy_start));
      const pairId = p?.id;
      const name = p?.base_name ? String(p.base_name) : sym;

      const t = pairId ? tickerByPair.get(pairId) : null;
      const last = t?.last ? Number(t.last) : 0;
      const quoteVol = t?.quote_volume ? Number(t.quote_volume) : 0;
      const changePct = t?.change_percentage ? Number(t.change_percentage) : 0;

      const prev = merged.get(sym);
      const next = {
        symbol: sym,
        name,
        listedTs: Math.max(listedTs, prev?.listedTs || 0),
        current_price: last || prev?.current_price || 0,
        total_volume: quoteVol || prev?.total_volume || 0,
        price_change_percentage_24h: Number.isFinite(changePct) ? changePct : (prev?.price_change_percentage_24h || 0),
      };
      merged.set(sym, next);
    }

    for (const c of Array.isArray(futContracts) ? futContracts : []) {
      const name = String(c?.name || '').toUpperCase();
      const sym = normalizeSymbol(name.split('_')[0]);
      if (!sym) continue;

      const prev = merged.get(sym) || { symbol: sym, name: sym, listedTs: 0 };
      merged.set(sym, { ...prev, listedTs: Math.max(prev.listedTs || 0, toInt(c?.create_time)) });
    }

    const formatDate = (tsSec) => {
      if (!tsSec) return undefined;
      const d = new Date(tsSec * 1000);
      if (Number.isNaN(d.getTime())) return undefined;
      return d.toISOString().slice(0, 10);
    };

    const coins = Array.from(merged.values())
      .sort((a, b) => (toInt(b.listedTs) - toInt(a.listedTs)) || ((b.total_volume || 0) - (a.total_volume || 0)))
      .slice(0, limit)
      .map((c) => ({
        id: c.symbol.toLowerCase(),
        symbol: c.symbol,
        name: c.name,
        current_price: c.current_price || 0,
        market_cap: 0,
        total_volume: c.total_volume || 0,
        price_change_percentage_24h: c.price_change_percentage_24h || 0,
        listed_at: formatDate(c.listedTs),
        tags: [],
      }));

    res.json({ data: coins });
  } catch (error) {
    console.error('Error fetching from Gate:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Dev API server: http://localhost:${PORT}`);
});
