import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = 3001;
const CMC_API_KEY = 'c27e300eac7d4abcb513b028a217e2d5';

app.use(cors());

// CoinMarketCap 代理端点
app.get('/api/cmc/latest', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=${limit}&sort=date_added&sort_dir=desc`;
    
    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching from CoinMarketCap:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 代理服务器运行在 http://localhost:${PORT}`);
});
