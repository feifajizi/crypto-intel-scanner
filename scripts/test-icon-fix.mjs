#!/usr/bin/env node
/**
 * 快速测试：验证 CoinGecko 图标获取
 */

import https from 'node:https';

async function fetchJson(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCoin(symbol, name) {
  console.log(`\n🔍 Testing ${symbol} (${name})...`);
  
  try {
    // Step 1: Search
    const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`;
    const result = await fetchJson(searchUrl);
    const coin = result?.coins?.find(c => c.symbol?.toUpperCase() === symbol.toUpperCase());
    
    if (!coin) {
      console.log(`  ❌ Not found in CoinGecko search`);
      return;
    }
    
    console.log(`  ✅ Found: ${coin.id}`);
    
    // Step 2: Get details
    await sleep(2000); // Rate limit
    const detailUrl = `https://api.coingecko.com/api/v3/coins/${coin.id}`;
    const detail = await fetchJson(detailUrl);
    
    const image = detail?.image?.small || detail?.image?.thumb || detail?.image?.large;
    const homepage = detail?.links?.homepage?.[0];
    const twitter = detail?.links?.twitter_screen_name;
    
    console.log(`  📸 Image: ${image || 'N/A'}`);
    console.log(`  🌐 Homepage: ${homepage || 'N/A'}`);
    console.log(`  🐦 Twitter: @${twitter || 'N/A'}`);
    
    if (image) {
      console.log(`  ✅ Icon available!`);
    } else {
      console.log(`  ⚠️  No icon found`);
    }
    
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
  }
}

async function main() {
  console.log('=== Icon Fix Test ===\n');
  
  const testCases = [
    { symbol: 'CRYPTOBURG', name: 'Cryptoburger' },
    { symbol: 'ESP', name: 'Espresso' },
    { symbol: 'AZTEC', name: 'Aztec' },
    { symbol: 'USD1', name: 'USD1' },
  ];
  
  for (const tc of testCases) {
    await testCoin(tc.symbol, tc.name);
    await sleep(2000);
  }
  
  console.log('\n✅ Test complete!');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
