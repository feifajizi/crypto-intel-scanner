#!/usr/bin/env node
/**
 * Gate 新上币质押扫描（Puppeteer 浏览器版）
 * - 拉取 Gate 最近 100 个新上币
 * - 去掉 Meme 和 RWA/股票代币
 * - 用 Puppeteer 抓取 Gate 页面官网链接
 * - 扫描官网是否有 staking/earn
 * - 输出可质押币种列表
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

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
    /3[LS]$/i, // 3L/3S suffix
    /5[LS]$/i, // 5L/5S suffix
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

async function scrapeGateHomepage(page, symbol) {
  try {
    const url = `https://www.gate.io/zh/trade/${symbol}_USDT`;
    console.log(`    Opening ${url}...`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000); // Wait for dynamic content
    
    // Click "币种信息" tab - use more robust selector
    const clicked = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('*'));
      const coinInfoTab = tabs.find(el => {
        const text = el.textContent || '';
        const role = el.getAttribute('role');
        return role === 'tab' && text.includes('币种信息');
      });
      if (coinInfoTab) {
        coinInfoTab.click();
        return true;
      }
      return false;
    });
    
    if (clicked) {
      await sleep(2000); // Wait for tab content to load
    }
    
    // Extract homepage link
    const homepage = await page.evaluate(() => {
      // Look for "官网" button/link
      const links = Array.from(document.querySelectorAll('a'));
      const homepageLink = links.find(a => {
        const text = a.textContent || '';
        return text.includes('官网') && a.href && !a.href.includes('gate.io');
      });
      return homepageLink?.href || null;
    });
    
    // Filter out fake/placeholder homepages
    const FAKE_HOMEPAGES = [
      'bitcoin.org',
      'ethereum.org',
      'example.com',
      'tether.to',
    ];
    
    const isFake = homepage && FAKE_HOMEPAGES.some(fake => homepage.includes(fake));
    const validHomepage = isFake ? null : homepage;
    
    if (validHomepage) {
      console.log(`    ✅ Found: ${validHomepage}`);
    } else if (isFake) {
      console.log(`    ⚠️  Fake homepage (${homepage}), ignored`);
    } else {
      console.log(`    ❌ No homepage`);
    }
    
    return validHomepage;
  } catch (err) {
    console.log(`    ⚠️  Error: ${err.message}`);
    return null;
  }
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
  console.log('=== Gate Staking Scanner (Puppeteer Edition) ===\n');
  
  // Step 1: Get latest coins
  const coins = await getLatestCoins(100);
  
  // Step 2: Filter
  const filtered = filterMemeAndRwa(coins);
  
  // Step 3: Launch browser
  console.log(`[3/5] Launching Puppeteer browser...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log(`[3/5] Scraping homepages from Gate pages (${filtered.length} coins, ~5-10 min)...`);
  const enriched = [];
  
  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    console.log(`  [${i + 1}/${filtered.length}] ${c.symbol}...`);
    
    const homepage = await scrapeGateHomepage(page, c.symbol);
    enriched.push({
      ...c,
      homepage,
    });
    
    // Rate limit: 2s between scrapes
    await sleep(2000);
  }
  
  await browser.close();
  
  const withHomepage = enriched.filter(c => c.homepage);
  console.log(`\n[4/5] Found ${withHomepage.length} coins with homepage. Scanning for staking...`);
  
  // Step 4: Scan staking
  const results = [];
  for (let i = 0; i < withHomepage.length; i++) {
    const c = withHomepage[i];
    console.log(`  [${i + 1}/${withHomepage.length}] Scanning ${c.symbol} (${c.homepage})...`);
    
    const scanRes = await scanStake(c.homepage);
    if (scanRes?.found) {
      // Use evidence_url (the actual staking page) instead of homepage
      const stakingUrl = scanRes.evidence?.url || c.homepage;
      results.push({
        symbol: c.symbol,
        name: c.name,
        homepage: c.homepage,
        staking_url: stakingUrl, // This is the actual staking page
        listed_at: c.listed_at,
        current_price: c.current_price,
        total_volume: c.total_volume,
        evidence_keywords: scanRes.evidence?.hits?.slice(0, 5),
      });
      console.log(`    ✅ FOUND staking at: ${stakingUrl}`);
    } else {
      console.log(`    ❌ not found`);
    }
    
    // Rate limit: 2s between scans
    await sleep(2000);
  }
  
  // Step 5: Output
  console.log(`\n[5/5] Writing results...`);
  
  const outPath = join(__dirname, '..', 'src', 'data', 'gate_stake_auto.json');
  const output = {
    generated_at: new Date().toISOString(),
    source: 'Gate.io latest 100 (filtered: no meme/rwa, Puppeteer-scraped)',
    total_scanned: withHomepage.length,
    found_count: results.length,
    results,
  };
  
  fs.mkdirSync(join(__dirname, '..', 'src', 'data'), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  
  console.log(`\n=== Gate Staking Opportunities (${results.length}) ===`);
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.symbol} (${r.name})`);
    console.log(`   Staking URL: ${r.staking_url}`);
    console.log(`   Homepage: ${r.homepage}`);
  });
  
  console.log(`\nWrote: ${outPath}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
