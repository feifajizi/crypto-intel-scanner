#!/usr/bin/env node
/**
 * Gate 最新上币扫描（真正的最新100个）
 * 
 * 数据源：Gate 公告页面 + API 补充
 * 包含：现货 + 合约（期货/永续）
 */

import https from 'node:https';
import { JSDOM } from 'jsdom';

// ==================== 工具函数 ====================

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ==================== 1. 爬取 Gate 公告获取最新上线 ====================

async function scrapeGateAnnouncements(pages = 5) {
  console.log(`[1/4] 爬取 Gate 公告页面（前 ${pages} 页）...`);
  
  const listings = [];
  
  for (let page = 1; page <= pages; page++) {
    const url = `https://www.gate.io/zh/article/news?page=${page}`;
    console.log(`  Page ${page}...`);
    
    try {
      const html = await fetchHtml(url);
      const dom = new JSDOM(html);
      const doc = dom.window.document;
      
      // 找所有文章标题
      const articles = doc.querySelectorAll('.article-item');
      
      for (const article of articles) {
        const titleEl = article.querySelector('.article-title');
        const timeEl = article.querySelector('.article-time');
        
        if (!titleEl || !timeEl) continue;
        
        const title = titleEl.textContent.trim();
        const time = timeEl.textContent.trim();
        
        // 匹配上线公告（多种格式）
        // 例如："BTC 上线 Gate.io"、"Gate.io 上线 ETH"、"XXX (YYY) 将上线"
        const patterns = [
          /([A-Z0-9]+)\s*(?:\([^)]+\))?\s*(?:将)?上线\s*Gate/i,
          /Gate(?:\.io)?\s*(?:将)?上线\s*([A-Z0-9]+)/i,
          /Gate(?:\.io)?\s*(?:will\s+)?list\s*([A-Z0-9]+)/i,
        ];
        
        for (const pattern of patterns) {
          const match = title.match(pattern);
          if (match) {
            const symbol = match[1].toUpperCase();
            
            // 过滤掉非币种词（如 "USDT"、"Gate"）
            if (!['GATE', 'GATEIO', 'IO'].includes(symbol)) {
              listings.push({
                symbol,
                announced_at: time,
                announcement: title,
                source: 'announcement',
              });
            }
            break;
          }
        }
      }
      
      await new Promise(r => setTimeout(r, 1000)); // 限速
    } catch (err) {
      console.log(`  ⚠️  Page ${page} failed: ${err.message}`);
    }
  }
  
  // 去重（同一个币可能有多个公告）
  const uniqueMap = new Map();
  for (const item of listings) {
    if (!uniqueMap.has(item.symbol)) {
      uniqueMap.set(item.symbol, item);
    }
  }
  
  const unique = Array.from(uniqueMap.values());
  console.log(`  Found ${unique.length} unique listings from announcements`);
  
  return unique;
}

// ==================== 2. API 获取现货 + 合约 ====================

async function getSpotAndFutures() {
  console.log(`[2/4] 获取 Gate API 数据（现货 + 合约）...`);
  
  // 现货
  const spotPairs = await fetchJson('https://api.gateio.ws/api/v4/spot/currency_pairs');
  const spotCoins = new Set(
    spotPairs
      .filter(p => p.trade_status === 'tradable')
      .map(p => p.base)
  );
  console.log(`  Spot: ${spotCoins.size} coins`);
  
  // 永续合约
  let futuresCoins = new Set();
  try {
    const futuresContracts = await fetchJson('https://api.gateio.ws/api/v4/futures/usdt/contracts');
    futuresCoins = new Set(
      futuresContracts
        .filter(c => c.in_delisting === false)
        .map(c => c.name.replace(/_USDT$/, ''))
    );
    console.log(`  Futures: ${futuresCoins.size} coins`);
  } catch (err) {
    console.log(`  ⚠️  Futures API failed: ${err.message}`);
  }
  
  // 交割合约
  let deliveryCoins = new Set();
  try {
    const deliveryContracts = await fetchJson('https://api.gateio.ws/api/v4/delivery/usdt/contracts');
    deliveryCoins = new Set(
      deliveryContracts.map(c => c.name.replace(/_USDT_\d+$/, ''))
    );
    console.log(`  Delivery: ${deliveryCoins.size} coins`);
  } catch (err) {
    console.log(`  ⚠️  Delivery API failed: ${err.message}`);
  }
  
  return { spotCoins, futuresCoins, deliveryCoins };
}

// ==================== 3. 合并 + 补充 ====================

async function enrichListings(announcements, apiData) {
  console.log(`[3/4] 合并数据 + 补充信息...`);
  
  const { spotCoins, futuresCoins, deliveryCoins } = apiData;
  
  // 补充公告里的币的上线类型
  const enriched = announcements.map(item => {
    const markets = [];
    if (spotCoins.has(item.symbol)) markets.push('spot');
    if (futuresCoins.has(item.symbol)) markets.push('futures');
    if (deliveryCoins.has(item.symbol)) markets.push('delivery');
    
    return {
      ...item,
      markets: markets.length > 0 ? markets : ['unknown'],
    };
  });
  
  // 补充：API 里有但公告里没有的币（可能是老币，或公告爬取遗漏）
  const announcedSymbols = new Set(announcements.map(a => a.symbol));
  
  const allApiCoins = new Set([
    ...spotCoins,
    ...futuresCoins,
    ...deliveryCoins,
  ]);
  
  const missingCoins = Array.from(allApiCoins).filter(s => !announcedSymbols.has(s));
  
  for (const symbol of missingCoins.slice(0, 50)) { // 只补充前50个，避免太多老币
    const markets = [];
    if (spotCoins.has(symbol)) markets.push('spot');
    if (futuresCoins.has(symbol)) markets.push('futures');
    if (deliveryCoins.has(symbol)) markets.push('delivery');
    
    enriched.push({
      symbol,
      announced_at: null,
      announcement: null,
      source: 'api',
      markets,
    });
  }
  
  console.log(`  Total: ${enriched.length} coins (${announcements.length} from announcements + ${missingCoins.slice(0, 50).length} from API)`);
  
  // 排序：有公告时间的在前，按时间倒序
  enriched.sort((a, b) => {
    if (a.announced_at && !b.announced_at) return -1;
    if (!a.announced_at && b.announced_at) return 1;
    if (a.announced_at && b.announced_at) {
      return new Date(b.announced_at) - new Date(a.announced_at);
    }
    return 0;
  });
  
  return enriched.slice(0, 100); // 取前100个
}

// ==================== 主流程 ====================

async function main() {
  console.log('=== Gate 最新上币扫描（真正的最新100个）===\n');
  
  const announcements = await scrapeGateAnnouncements(5);
  const apiData = await getSpotAndFutures();
  const latest100 = await enrichListings(announcements, apiData);
  
  console.log(`\n[4/4] 输出结果...`);
  console.log(`\n=== 最新 ${latest100.length} 个币 ===\n`);
  
  latest100.forEach((coin, i) => {
    console.log(`${i + 1}. ${coin.symbol}`);
    console.log(`   Markets: ${coin.markets.join(', ')}`);
    if (coin.announced_at) console.log(`   Announced: ${coin.announced_at}`);
    if (coin.announcement) console.log(`   Title: ${coin.announcement}`);
    console.log();
  });
  
  // 输出 JSON
  const outPath = new URL('../src/data/gate_latest_100.json', import.meta.url).pathname;
  const fs = await import('node:fs');
  
  fs.mkdirSync(new URL('../src/data', import.meta.url).pathname, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    source: 'Gate announcements + API (spot + futures + delivery)',
    total: latest100.length,
    coins: latest100,
  }, null, 2));
  
  console.log(`✅ 写入: ${outPath}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
