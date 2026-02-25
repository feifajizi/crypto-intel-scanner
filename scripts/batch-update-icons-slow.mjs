#!/usr/bin/env node
/**
 * 批量更新图标 - 慢速版本（避免 rate limit）
 * 使用 10 秒延迟，适合 CoinGecko 免费 API
 */

import https from 'node:https';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function fetchJson(url, timeoutMs = 15000) {
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
    
    console.log(`    Found: ${coin.id}`);
    
    // Get details with longer delay
    await sleep(8000);
    const detailUrl = `https://api.coingecko.com/api/v3/coins/${coin.id}`;
    const detail = await fetchJson(detailUrl);
    
    return detail?.image?.small || detail?.image?.thumb || detail?.image?.large || null;
  } catch (err) {
    console.log(`    ⚠️  ${symbol}: ${err.message}`);
    return null;
  }
}

async function main() {
  const MAX_COINS = parseInt(process.argv[2]) || 20; // 默认处理 20 个
  
  console.log(`=== Batch Update Icons (Slow) ===`);
  console.log(`Max coins: ${MAX_COINS}\n`);
  
  const enrichmentPath = join(__dirname, '..', 'api', 'coin_enrichment.json');
  const data = JSON.parse(fs.readFileSync(enrichmentPath, 'utf-8'));
  
  // 只处理没有图标的币种
  const symbolsWithoutImage = Object.entries(data)
    .filter(([_, coin]) => !coin.image)
    .map(([symbol]) => symbol);
  
  console.log(`Found ${symbolsWithoutImage.length} coins without image`);
  console.log(`Will process ${Math.min(MAX_COINS, symbolsWithoutImage.length)} coins\n`);
  
  const toProcess = symbolsWithoutImage.slice(0, MAX_COINS);
  
  let updated = 0;
  let failed = 0;
  
  for (let i = 0; i < toProcess.length; i++) {
    const symbol = toProcess[i];
    
    console.log(`[${i + 1}/${toProcess.length}] ${symbol}...`);
    
    // Get image from CoinGecko
    const image = await getCoinGeckoImage(symbol);
    
    if (image) {
      data[symbol].image = image;
      console.log(`  ✅ Added: ${image.substring(0, 60)}...`);
      updated++;
      
      // 每 5 个币种保存一次
      if ((i + 1) % 5 === 0) {
        fs.writeFileSync(enrichmentPath, JSON.stringify(data, null, 2));
        console.log(`  💾 Saved checkpoint\n`);
      }
    } else {
      console.log(`  ❌ Not found`);
      failed++;
    }
    
    // 长延迟避免 rate limit
    await sleep(10000);
  }
  
  // Final save
  fs.writeFileSync(enrichmentPath, JSON.stringify(data, null, 2));
  
  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${toProcess.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`\n✅ Saved to ${enrichmentPath}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
