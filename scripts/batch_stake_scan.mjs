import handler from '../api/gate-latest.js';
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

async function getLatestCoins(limit = 200) {
  const req = { method: 'GET', query: { limit: String(limit), enrich: '1' } };
  const res = makeRes();
  await handler(req, res);
  const r = res._get();
  if (r.statusCode !== 200) throw new Error(`gate-latest failed: ${r.statusCode}`);
  return r.body?.data || [];
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
  console.log('Fetching latest 200 coins from Gate...');
  const coins = await getLatestCoins(200);
  console.log(`Got ${coins.length} coins. Filtering for homepage...`);

  const withHomepage = coins.filter(c => c.homepage);
  console.log(`${withHomepage.length} coins have homepage. Starting scan (rate-limited)...`);

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
        twitter_screen_name: c.twitter_screen_name,
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

    // Rate-limit: 2s between scans
    if (i < withHomepage.length - 1) {
      await sleep(2000);
    }
  }

  console.log(`\n=== Staking Opportunities (${results.length}) ===`);
  console.log(JSON.stringify(results, null, 2));

  const outPath = new URL('../src/data/stake_opportunities.json', import.meta.url).pathname;
  const fs = await import('node:fs');
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    total_scanned: withHomepage.length,
    found_count: results.length,
    results,
  }, null, 2), 'utf-8');

  console.log(`\nWrote: ${outPath}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
