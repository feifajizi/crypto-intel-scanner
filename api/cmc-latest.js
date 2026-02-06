// Vercel Serverless Function
export default async function handler(req, res) {
  // 允许跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { limit = 100 } = req.query;
  const CMC_API_KEY = process.env.CMC_API_KEY || 'c27e300eac7d4abcb513b028a217e2d5';

  try {
    const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=${limit}&sort=date_added&sort_dir=desc`;
    
    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`CoinMarketCap API error: ${response.status}`);
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching from CoinMarketCap:', error);
    res.status(500).json({ error: error.message });
  }
}
