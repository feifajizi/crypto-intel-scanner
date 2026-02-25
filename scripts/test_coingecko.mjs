#!/usr/bin/env node
import https from 'node:https';

async function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CryptoScanner/1.0)',
      },
    };
    
    const req = https.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

async function getCoinGeckoId(symbol) {
  try {
    const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`;
    console.log(`Searching: ${searchUrl}`);
    
    const result = await fetchJson(searchUrl, 10000);
    console.log(`  Result:`, JSON.stringify(result).substring(0, 200));
    
    const coin = result?.coins?.find(c => c.symbol?.toUpperCase() === symbol.toUpperCase());
    
    if (coin) {
      console.log(`✅ ${symbol} → ${coin.id} (${coin.name})`);
      return coin.id;
    } else {
      console.log(`❌ ${symbol} → Not found`);
      return null;
    }
  } catch (err) {
    console.log(`❌ ${symbol} → Error: ${err.message}`);
    return null;
  }
}

async function getCoinInfo(id) {
  if (!id) return null;
  
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}`;
    console.log(`  Fetching info: ${url}`);
    
    const cg = await fetchJson(url, 10000);
    console.log(`  Homepage: ${cg?.links?.homepage?.[0] || 'N/A'}`);
    console.log(`  Twitter: ${cg?.links?.twitter_screen_name ? '@' + cg.links.twitter_screen_name : 'N/A'}`);
    
    return {
      homepage: cg?.links?.homepage?.[0] || null,
      twitter: cg?.links?.twitter_screen_name || null,
    };
  } catch (err) {
    console.log(`  Error: ${err.message}`);
    return null;
  }
}

async function test() {
  const testSymbols = ['BTC', 'ETH', 'SOL', 'AAVE', 'LINK'];
  
  for (const symbol of testSymbols) {
    console.log(`\n[${symbol}]`);
    const id = await getCoinGeckoId(symbol);
    if (id) {
      await getCoinInfo(id);
    }
    
    // 限速
    await new Promise(r => setTimeout(r, 2000));
  }
}

test().catch(console.error);
