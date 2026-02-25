#!/usr/bin/env node
/**
 * Gate 新上币质押扫描（API + HTTP 版，无 Puppeteer）
 * - 拉取 Gate 最近 100 个新上币
 * - 去掉 Meme 和 RWA/股票代币
 * - 用 Gate API 获取官网链接（快速，无浏览器）
 * - 扫描官网是否有 staking/earn
 * - 输出可质押币种列表
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getLatestCoins(limit = 100) {
  console.log(`[1/5] Fetching latest ${limit} coins from Gate API...`);
  
  const apiDir = join(__dirname, '..', 'api');
  const handlerPath = join(apiDir, 'gate-latest.js');
  const { default: handler } = await import(handlerPath);
  
  const makeRes = () => {
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
  };
  
  const req = { method: 'GET', query: { limit: String(limit), enrich: '0' } };
  const res = makeRes();
  await handler(req, res);
  const r = res._get();
  
  if (r.statusCode !== 200) throw new Error(`gate-latest failed: ${r.statusCode}`);
  return r.body?.data || [];
}

function filterMemeAndRwa(coins) {
  console.log(`[2/5] Filtering out Meme, RWA/stock, and leveraged tokens...`);
  
  const MEME_PATTERNS = [
    /\b(inu|doge|pepe|shib|wif|bonk|meme|elon|floki|shiba|degen|cat|dog|frog|moon)\b/i,
  ];
  
  const RWA_PATTERNS = [
    /\b(rwa|stock|share|equity|gold|silver|treasury|bond|vix|aus200|us2000|tw88|hschkd|cohr|mu|lite|index|jpn225|hk50|us30|gbpusd|eurusd|baba|acn|jpm|paxg)\b/i,
  ];
  
  const LEVERAGED_PATTERNS = [
    /3[LS]$/i,
    /5[LS]$/i,
  ];
  
  const filtered = coins.filter(c => {
    const text = `${c.symbol} ${c.name}`.toLowerCase();
    const isMeme = MEME_PATTERNS.some(p => p.test(text));
    const isRwa = RWA_PATTERNS.some(p => p.test(text));
    const isLeveraged = LEVERAGED_PATTERNS.some(p => p.test(c.symbol));
    return !isMeme && !isRwa && !isLeveraged;
  });
  
  console.log(`  Kept ${filtered.length} / ${coins.length} coins`);
  return filtered;
}

const FAKE_HOMEPAGES = ['bitcoin.org', 'ethereum.org', 'example.com', 'tether.to'];

async function fetchJson(url, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      if (i < retries - 1) await sleep(2000);
    }
  }
  return null;
}

async function getHomepageViaAPI(symbol) {
  // Step 1: Get gate_id from symbol
  const seoData = await fetchJson(
    `https://www.gate.com/api-price/api/global/price/getGlobalSeoPath?short_name=${symbol}`
  );
  const gateId = seoData?.data?.[0]?.gate_id;
  if (!gateId) return { homepage: null, twitter: null };

  // Step 2: Get coin report which contains homepage in HTML
  const reportData = await fetchJson(
    `https://www.gate.com/api-price/api/inner/v3/detail/getCoinReport?seo_path=${gateId}&lang=zh`
  );
  const report = reportData?.data?.report;
  if (!report) return { homepage: null, twitter: null };

  // Extract 官网 URL from HTML report
  const match = report.match(/官网[：:]\s*(?:<\/span>)?<a href="([^"]+)"/);
  let homepage = match?.[1] || null;
  if (homepage && FAKE_HOMEPAGES.some(fake => homepage.includes(fake))) homepage = null;

  // Extract Twitter from report
  const twMatch = report.match(/twitter\.com\/([a-zA-Z0-9_]+)|x\.com\/([a-zA-Z0-9_]+)/i);
  const twitter = twMatch ? (twMatch[1] || twMatch[2]) : null;

  return { homepage, twitter };
}

async function scanStake(homepage) {
  if (!homepage) return null;
  
  const apiDir = join(__dirname, '..', 'api');
  const handlerPath = join(apiDir, 'stake-scan.js');
  const { default: handler } = await import(handlerPath);
  
  const makeRes = () => {
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
  };
  
  const req = { method: 'GET', query: { homepage, maxPages: '8' } };
  const res = makeRes();
  await handler(req, res);
  const r = res._get();
  
  if (r.statusCode !== 200) return null;
  return r.body;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Gate Staking Scanner (API Edition) ===\n');
  const startTime = Date.now();
  
  // Step 1: Get latest coins
  const coins = await getLatestCoins(100);
  
  // Step 2: Filter
  const filtered = filterMemeAndRwa(coins);
  
  // Step 3: Get homepages via Gate API (fast, no browser needed)
  console.log(`[3/5] Fetching homepages via Gate API (${filtered.length} coins)...`);
  const enriched = [];
  
  // Collect enrichment data for coin_enrichment.json
  const enrichmentData = {};

  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    const { homepage, twitter } = await getHomepageViaAPI(c.symbol);
    
    if (homepage) {
      console.log(`  [${i + 1}/${filtered.length}] ${c.symbol} ✅ ${homepage}${twitter ? ` (@${twitter})` : ''}`);
      // Collect enrichment for ALL coins with homepage (not just staking)
      enrichmentData[c.symbol] = { homepage, ...(twitter ? { twitter_screen_name: twitter } : {}) };
    } else {
      console.log(`  [${i + 1}/${filtered.length}] ${c.symbol} ❌`);
    }
    
    enriched.push({ ...c, homepage });
    
    // Light rate limit
    await sleep(300);
  }
  
  const withHomepage = enriched.filter(c => c.homepage);
  console.log(`\n[4/5] Found ${withHomepage.length} coins with homepage. Scanning for staking...`);
  
  // Step 4: Scan staking
  const results = [];
  for (let i = 0; i < withHomepage.length; i++) {
    const c = withHomepage[i];
    console.log(`  [${i + 1}/${withHomepage.length}] Scanning ${c.symbol} (${c.homepage})...`);
    
    const scanRes = await scanStake(c.homepage);
    if (scanRes?.found) {
      const stakingUrl = scanRes.evidence?.url || c.homepage;
      results.push({
        symbol: c.symbol,
        name: c.name,
        homepage: c.homepage,
        staking_url: stakingUrl,
        listed_at: c.listed_at,
        current_price: c.current_price,
        total_volume: c.total_volume,
        evidence_keywords: scanRes.evidence?.hits?.slice(0, 5),
      });
      console.log(`    ✅ FOUND staking at: ${stakingUrl}`);
    } else {
      console.log(`    ❌ not found`);
    }
    
    await sleep(1000);
  }
  
  // Step 5: Output
  console.log(`\n[5/5] Writing results...`);
  
  const outPath = join(__dirname, '..', 'src', 'data', 'gate_stake_auto.json');
  
  // Cumulative merge: keep old results, add/update new ones
  let existingResults = [];
  try {
    const existing = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    existingResults = existing.results || [];
  } catch {}
  
  const merged = new Map();
  for (const r of existingResults) merged.set(r.symbol, r);
  for (const r of results) merged.set(r.symbol, r);
  const mergedResults = Array.from(merged.values());
  
  const output = {
    generated_at: new Date().toISOString(),
    source: 'Gate.io latest 100 (filtered: no meme/rwa, API-based)',
    total_scanned: withHomepage.length,
    found_count: mergedResults.length,
    results: mergedResults,
  };
  
  fs.mkdirSync(join(__dirname, '..', 'src', 'data'), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  
  // === Write coin_enrichment.json (cumulative merge) ===
  const enrichmentPath = join(__dirname, '..', 'api', 'coin_enrichment.json');
  let existingEnrichment = {};
  try {
    existingEnrichment = JSON.parse(fs.readFileSync(enrichmentPath, 'utf-8'));
  } catch {}
  
  // Merge: old data + new data (new overwrites old per symbol)
  for (const [symbol, data] of Object.entries(enrichmentData)) {
    existingEnrichment[symbol] = {
      ...(existingEnrichment[symbol] || {}),
      ...data,
      last_scanned: new Date().toISOString(),
    };
  }
  
  fs.mkdirSync(join(__dirname, '..', 'api'), { recursive: true });
  fs.writeFileSync(enrichmentPath, JSON.stringify(existingEnrichment, null, 2), 'utf-8');
  console.log(`Wrote: ${enrichmentPath} (${Object.keys(existingEnrichment).length} coins)`);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n=== Gate Staking Opportunities (${results.length} new, ${mergedResults.length} total) ===`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.symbol} (${r.name})`);
    console.log(`   Staking URL: ${r.staking_url}`);
    console.log(`   Homepage: ${r.homepage}`);
  });
  
  console.log(`\nWrote: ${outPath}`);
  console.log(`Total time: ${elapsed}s`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
