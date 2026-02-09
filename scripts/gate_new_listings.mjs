#!/usr/bin/env node
/**
 * Gate 新上币列表（官网+Twitter）
 * - 拉取 Gate 最近 100 个新上币
 * - 去掉 Meme、RWA、杠杆代币
 * - 用 Puppeteer 抓官网 + Twitter
 * - 累积更新模式（新币追加，不删除旧币）
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_FILE = join(__dirname, '..', 'src', 'data', 'gate_new_listings.json');

async function getLatestCoins(limit = 100) {
  console.log(`[1/4] Fetching latest ${limit} coins from Gate API...`);
  
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

function filterCoins(coins) {
  console.log(`[2/4] Filtering out Meme, RWA/stock, and leveraged tokens...`);
  
  const MEME_PATTERNS = [
    /\b(inu|doge|pepe|shib|wif|bonk|meme|elon|floki|shiba|degen|cat|dog|frog|moon)\b/i,
  ];
  
  const RWA_PATTERNS = [
    /\b(rwa|stock|share|equity|gold|silver|treasury|bond|vix|aus200|us2000|tw88|hschkd|cohr|mu|lite|index|jpn225|hk50|us30|gbpusd|eurusd|baba|acn|jpm|paxg|agg|tlt|iefa|amd|lmt|ko|pg|iau|avgo|ge|pep|mcd|arm|unh|mrvl|lly|asml|intc|csco|ibm|msft|evix|bvix|xpb|xni|xcu|xal|xbr|xti)\b/i,
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

async function scrapeCoinInfo(page, symbol) {
  try {
    const url = `https://www.gate.io/zh/trade/${symbol}_USDT`;
    console.log(`    Opening ${url}...`);
    
    // Setup request interception to capture Twitter redirects
    const capturedUrls = { twitter: null };
    const handledRequests = new Set();
    
    const requestHandler = (request) => {
      const reqUrl = request.url();
      const reqId = request._requestId || reqUrl;
      
      // Prevent double-handling
      if (handledRequests.has(reqId)) {
        return;
      }
      handledRequests.add(reqId);
      
      // Capture Twitter/X.com requests
      if ((reqUrl.includes('twitter.com') || reqUrl.includes('x.com')) && 
          !reqUrl.includes('gate.io') &&
          !capturedUrls.twitter) {
        capturedUrls.twitter = reqUrl;
        console.log(`    🔍 Captured Twitter request: ${reqUrl}`);
      }
      
      request.continue().catch(() => {}); // Ignore already-handled errors
    };
    
    await page.setRequestInterception(true);
    page.on('request', requestHandler);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
    
    // Click "币种信息" tab
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
      await sleep(2000);
    }
    
    // Try to trigger Twitter link by hovering over Twitter button
    await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const twitterEl = allElements.find(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        return text === 'twitter' || text.includes('twitter');
      });
      if (twitterEl) {
        // Dispatch mouse events to trigger any lazy-loaded links
        ['mouseenter', 'mouseover', 'mousemove'].forEach(eventType => {
          twitterEl.dispatchEvent(new MouseEvent(eventType, { bubbles: true }));
        });
      }
    });
    
    await sleep(1000); // Wait for any lazy requests
    
    // Extract homepage + Twitter from DOM
    const info = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      
      // Homepage
      const homepageEl = allElements.find(el => {
        const text = el.textContent || '';
        const href = el.getAttribute('href') || '';
        return text.includes('官网') && href && !href.includes('gate.io') && (href.startsWith('http') || href.startsWith('https'));
      });
      const homepage = homepageEl?.getAttribute('href') || null;
      
      // Twitter - search all <a> tags first
      let twitter = null;
      const links = Array.from(document.querySelectorAll('a'));
      const twitterLink = links.find(a => {
        const href = a.href || '';
        const text = (a.textContent || '').toLowerCase();
        return (href.includes('twitter.com') || href.includes('x.com')) && 
               !href.includes('gate.io') &&
               (text.includes('twitter') || text.includes('𝕏') || href.match(/twitter\.com\/[^/]+$/));
      });
      if (twitterLink) twitter = twitterLink.href;
      
      return { homepage, twitter };
    });
    
    // Prefer captured request over DOM if available
    const twitter = capturedUrls.twitter || info.twitter;
    
    // Filter out fake homepages
    const FAKE_HOMEPAGES = ['bitcoin.org', 'ethereum.org', 'example.com', 'tether.to'];
    const isFake = info.homepage && FAKE_HOMEPAGES.some(fake => info.homepage.includes(fake));
    const validHomepage = isFake ? null : info.homepage;
    
    // Clean up
    page.removeListener('request', requestHandler);
    await page.setRequestInterception(false);
    
    if (validHomepage || twitter) {
      console.log(`    ✅ Homepage: ${validHomepage || 'N/A'}, Twitter: ${twitter || 'N/A'}`);
    } else {
      console.log(`    ❌ No info`);
    }
    
    return {
      homepage: validHomepage,
      twitter,
    };
  } catch (err) {
    console.log(`    ⚠️  Error: ${err.message}`);
    return { homepage: null, twitter: null };
  }
}

function loadExistingData() {
  if (fs.existsSync(OUTPUT_FILE)) {
    const raw = fs.readFileSync(OUTPUT_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return data.coins || [];
  }
  return [];
}

function mergeCoins(existing, newCoins) {
  const merged = [...existing];
  const existingSymbols = new Set(existing.map(c => c.symbol));
  
  for (const coin of newCoins) {
    if (!existingSymbols.has(coin.symbol)) {
      merged.push(coin);
    }
  }
  
  // Sort by listed_at (newest first)
  merged.sort((a, b) => {
    const dateA = new Date(a.listed_at || 0);
    const dateB = new Date(b.listed_at || 0);
    return dateB - dateA;
  });
  
  return merged;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Gate New Listings Scraper ===\n');
  
  // Step 1: Get latest coins
  const coins = await getLatestCoins(100);
  
  // Step 2: Filter
  const filtered = filterCoins(coins);
  
  // Step 3: Launch browser
  console.log(`[3/4] Launching Puppeteer browser...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  console.log(`[3/4] Scraping ${filtered.length} coins...`);
  const enriched = [];
  
  for (let i = 0; i < filtered.length; i++) {
    const c = filtered[i];
    console.log(`  [${i + 1}/${filtered.length}] ${c.symbol}...`);
    
    const info = await scrapeCoinInfo(page, c.symbol);
    enriched.push({
      symbol: c.symbol,
      name: c.name,
      homepage: info.homepage,
      twitter: info.twitter,
      listed_at: c.listed_at,
      current_price: c.current_price,
      total_volume: c.total_volume,
    });
    
    // Rate limit: 2s between scrapes
    await sleep(2000);
  }
  
  await browser.close();
  
  // Step 4: Merge with existing data
  console.log(`\n[4/4] Merging with existing data...`);
  const existingCoins = loadExistingData();
  const mergedCoins = mergeCoins(existingCoins, enriched);
  
  const output = {
    generated_at: new Date().toISOString(),
    total_coins: mergedCoins.length,
    new_coins_added: mergedCoins.length - existingCoins.length,
    coins: mergedCoins,
  };
  
  fs.mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  
  console.log(`\n=== Gate New Listings (${mergedCoins.length} total) ===`);
  console.log(`New coins added: ${output.new_coins_added}`);
  console.log(`With homepage: ${mergedCoins.filter(c => c.homepage).length}`);
  console.log(`With Twitter: ${mergedCoins.filter(c => c.twitter).length}`);
  console.log(`\nWrote: ${OUTPUT_FILE}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
