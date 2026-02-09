import scanHandler from '../api/stake-scan.js';

function makeRes() {
  const headers = {};
  let statusCode = 200;
  let body;
  return {
    setHeader(k, v) { headers[k] = v; },
    status(code) { statusCode = code; return this; },
    json(obj) { body = obj; this._done = true; return this; },
    end() { this._done = true; return this; },
    _get() { return { statusCode, headers, body }; }
  };
}

async function fetchJson(url) {
  const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return await resp.json();
}

async function getRecentCoins(limit = 100) {
  // CoinGecko: recently added coins with platforms (contract addresses)
  const url = `https://api.coingecko.com/api/v3/coins/list?include_platform=true`;
  const list = await fetchJson(url);
  
  // Get detailed info for recent coins (we need homepage/socials)
  // CoinGecko doesn't have a "sort by date_added" in the free API, so we take the last N from the list
  // and then fetch their full details
  const recent = list.slice(-limit);
  
  console.log(`Fetched ${list.length} coins, taking last ${recent.length} as "recent"`);
  
  const coins = [];
  for (let i = 0; i < Math.min(recent.length, 50); i++) {
    const c = recent[i];
    const detailUrl = `https://api.coingecko.com/api/v3/coins/${c.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
    
    try {
      const detail = await fetchJson(detailUrl);
      const homepage = Array.isArray(detail?.links?.homepage) ? detail.links.homepage.find(Boolean) : '';
      const twitter = detail?.links?.twitter_screen_name || '';
      
      if (homepage) {
        coins.push({
          id: detail.id,
          symbol: detail.symbol?.toUpperCase(),
          name: detail.name,
          homepage,
          twitter_screen_name: twitter,
          market_cap: detail.market_data?.market_cap?.usd || 0,
          current_price: detail.market_data?.current_price?.usd || 0,
        });
      }
      
      // Rate limit: 10-15 calls/min for free tier, so ~6s between calls
      if (i < recent.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 6000));
      }
    } catch (e) {
      console.error(`Failed to fetch ${c.id}:`, e.message);
    }
  }
  
  return coins;
}

async function scanStake(homepage) {
  const req = { method: 'GET', query: { homepage, maxPages: '8' } };
  const res = makeRes();
  await scanHandler(req, res);
  const r = res._get();
  if (r.statusCode !== 200) return null;
  return r.body;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Fetching recently added coins from CoinGecko (this will take a few minutes due to rate limits)...');
  const coins = await getRecentCoins(100);
  
  console.log(`Got ${coins.length} recent coins with homepage. Starting stake scan...`);
  
  const results = [];
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    console.log(`[${i + 1}/${coins.length}] Scanning ${c.symbol} (${c.homepage})...`);
    
    const scanRes = await scanStake(c.homepage);
    if (scanRes?.found) {
      results.push({
        symbol: c.symbol,
        name: c.name,
        homepage: c.homepage,
        twitter_screen_name: c.twitter_screen_name,
        market_cap: c.market_cap,
        current_price: c.current_price,
        evidence_url: scanRes.evidence?.url,
        evidence_keywords: scanRes.evidence?.hits?.slice(0, 5),
      });
      console.log(`  ✅ FOUND staking signal!`);
    } else {
      console.log(`  ❌ not found`);
    }
    
    // Rate-limit: 2s between scans
    if (i < coins.length - 1) {
      await sleep(2000);
    }
  }
  
  console.log(`\n=== Staking Opportunities (${results.length}) ===`);
  console.log(JSON.stringify(results, null, 2));
  
  const outPath = new URL('../src/data/coingecko_stake_opportunities.json', import.meta.url).pathname;
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    source: 'CoinGecko recent coins',
    total_scanned: coins.length,
    found_count: results.length,
    results,
  }, null, 2), 'utf-8');
  
  console.log(`\nWrote: ${outPath}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
