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

async function getLatestCoins(limit = 50) {
  // Use the existing gate-latest API (without enrich, just to get symbols)
  const url = `http://localhost:5173/api/gate-latest?limit=${limit}&enrich=0`;
  const resp = await fetch(url);
  const j = await resp.json();
  return j?.data || [];
}

async function getGatePageLinks(symbol) {
  // This will be replaced with actual browser automation
  // For now, return mock data
  console.log(`[BROWSER] Opening gate.io/trade/${symbol}_USDT...`);
  
  // TODO: Use OpenClaw browser tool to:
  // 1. Open https://gate.io/trade/{symbol}_USDT
  // 2. Find "基本信息" section
  // 3. Extract 官网/Twitter/Discord links
  
  return {
    homepage: null,
    twitter: null,
    discord: null,
  };
}

async function scanStake(homepage) {
  if (!homepage) return null;
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
  console.log('Step 1: Fetching latest coins from Gate API...');
  const coins = await getLatestCoins(50);
  console.log(`Got ${coins.length} coins.`);
  
  console.log('\nStep 2: Browser scraping Gate coin pages for official links...');
  const enriched = [];
  for (let i = 0; i < Math.min(coins.length, 10); i++) {
    const c = coins[i];
    console.log(`[${i + 1}/10] ${c.symbol}...`);
    
    const links = await getGatePageLinks(c.symbol);
    enriched.push({
      ...c,
      ...links,
    });
    
    await sleep(2000);
  }
  
  const withHomepage = enriched.filter(c => c.homepage);
  console.log(`\nStep 3: Found ${withHomepage.length} coins with homepage. Scanning for staking...`);
  
  const results = [];
  for (let i = 0; i < withHomepage.length; i++) {
    const c = withHomepage[i];
    console.log(`[${i + 1}/${withHomepage.length}] Scanning ${c.symbol} (${c.homepage})...`);
    
    const scanRes = await scanStake(c.homepage);
    if (scanRes?.found) {
      results.push({
        symbol: c.symbol,
        name: c.name,
        homepage: c.homepage,
        twitter: c.twitter,
        listed_at: c.listed_at,
        current_price: c.current_price,
        total_volume: c.total_volume,
        evidence_url: scanRes.evidence?.url,
        evidence_keywords: scanRes.evidence?.hits?.slice(0, 5),
      });
      console.log(`  ✅ FOUND staking signal!`);
    } else {
      console.log(`  ❌ not found`);
    }
    
    await sleep(2000);
  }
  
  console.log(`\n=== Gate Staking Opportunities (${results.length}) ===`);
  console.log(JSON.stringify(results, null, 2));
  
  const outPath = new URL('../src/data/gate_stake_opportunities.json', import.meta.url).pathname;
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    source: 'Gate.io latest coins (browser scraped)',
    total_scanned: withHomepage.length,
    found_count: results.length,
    results,
  }, null, 2), 'utf-8');
  
  console.log(`\nWrote: ${outPath}`);
  console.log('\nNOTE: Browser scraping not yet implemented. Need to integrate OpenClaw browser tool.');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
