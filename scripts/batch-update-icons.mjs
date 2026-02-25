#!/usr/bin/env node
/**
 * 批量更新 coin_enrichment.json 中的图标
 */

import https from 'node:https';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function getCoinGeckoImage(symbol) {
  try {
    // Search
    const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`;
    const result = await fetchJson(searchUrl);
    const coin = result?.coins?.find(c => c.symbol?.toUpperCase() === symbol.toUpperCase());
    
    if (!coin) {
      return null;
    }
    
    // Get details
    await sleep(2000);
    const detailUrl = `https://api.coingecko.com/api/v3/coins/${coin.id}`;
    const detail = await fetchJson(detailUrl);
    
    return detail?.image?.small || detail?.image?.thumb || detail?.image?.large || null;
  } catch (err) {
    console.log(`    ⚠️  ${symbol}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Batch Update Icons ===\n');
  
  const enrichmentPath = join(__dirname, '..', 'api', 'coin_enrichment.json');
  const data = JSON.parse(fs.readFileSync(enrichmentPath, 'utf-8'));
  
  const symbols = Object.keys(data);
  console.log(`Found ${symbols.length} coins\n`);
  
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const coin = data[symbol];
    
    console.log(`[${i + 1}/${symbols.length}] ${symbol}...`);
    
    // Skip if already has image
    if (coin.image) {
      console.log(`  ✅ Already has image`);
      skipped++;
      continue;
    }
    
    // Get image from CoinGecko
    const image = await getCoinGeckoImage(symbol);
    
    if (image) {
      data[symbol].image = image;
      console.log(`  ✅ Added: ${image}`);
      updated++;
    } else {
      console.log(`  ❌ Not found`);
      failed++;
    }
    
    // Rate limit
    await sleep(3000);
  }
  
  // Save
  fs.writeFileSync(enrichmentPath, JSON.stringify(data, null, 2));
  
  console.log(`\n=== Summary ===`);
  console.log(`Total: ${symbols.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already has): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`\n✅ Saved to ${enrichmentPath}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
