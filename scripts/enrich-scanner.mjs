#!/usr/bin/env node
/**
 * Coin Enrichment Scanner v2
 * 
 * 改进逻辑：
 * 1. 从官网 HTML 提取 Twitter 链接（meta tags: twitter:creator, twitter:site, og:twitter）
 * 2. 验证 Twitter 账号是否为官方（而非个人账号）
 * 3. 优先级：官网提取的社交链接 > CoinGecko API
 */

import https from 'node:https';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==================== 工具函数 ====================

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

async function fetchHtml(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    };
    
    const req = https.get(url, options, res => {
      // 处理重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
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

// ==================== CoinGecko API ====================

const cgIdCache = new Map();

async function fetchJsonRetry(url, timeoutMs = 10000, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchJson(url, timeoutMs);
      if (result?.status?.error_code === 403 || result?.status?.error_code === 429) {
        throw new Error('rate_limited');
      }
      return result;
    } catch (err) {
      if (attempt < maxRetries && (err.message === 'rate_limited' || err.message?.includes('Throttled'))) {
        const waitSec = 30 * attempt;
        console.log(`      ⏳ Rate limited, waiting ${waitSec}s (retry ${attempt}/${maxRetries})...`);
        await sleep(waitSec * 1000);
      } else {
        throw err;
      }
    }
  }
}

async function getCoinGeckoId(symbol) {
  if (cgIdCache.has(symbol)) {
    return cgIdCache.get(symbol);
  }
  
  try {
    await sleep(6000); // CoinGecko 限速
    const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`;
    const result = await fetchJsonRetry(searchUrl, 10000);
    const coin = result?.coins?.find(c => c.symbol?.toUpperCase() === symbol.toUpperCase());
    const id = coin?.id || null;
    cgIdCache.set(symbol, id);
    return id;
  } catch (err) {
    console.log(`      ⚠️  CoinGecko search failed: ${err.message}`);
    cgIdCache.set(symbol, null);
    return null;
  }
}

async function getCoinGeckoInfo(symbol) {
  try {
    const id = await getCoinGeckoId(symbol);
    if (!id) return { homepage: null, twitter: null };
    
    await sleep(6000);
    const cg = await fetchJsonRetry(`https://api.coingecko.com/api/v3/coins/${id}`, 10000);
    return {
      homepage: cg?.links?.homepage?.[0] || null,
      twitter: cg?.links?.twitter_screen_name || null,
    };
  } catch {
    return { homepage: null, twitter: null };
  }
}

// ==================== 官网提取 Twitter ====================

/**
 * 从官网 HTML 提取 Twitter 链接
 * 查找 meta tags: twitter:creator, twitter:site, og:twitter
 * 以及页面中的 Twitter 社交链接
 */
function extractTwitterFromHtml(html, homepage) {
  const handles = new Set();
  
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    // 1. Meta tags（优先级最高）
    const metaTags = [
      'twitter:creator',
      'twitter:site',
      'twitter:creator:id',
      'twitter:site:id',
    ];
    
    for (const name of metaTags) {
      const meta = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      const content = meta?.getAttribute('content');
      if (content) {
        const handle = content.replace(/^@/, '').trim();
        if (handle && !handle.includes(' ')) {
          handles.add(handle);
        }
      }
    }
    
    // 2. OG tags
    const ogTwitter = doc.querySelector('meta[property="og:twitter"]');
    if (ogTwitter) {
      const content = ogTwitter.getAttribute('content');
      const handle = content?.replace(/^@/, '').trim();
      if (handle && !handle.includes(' ')) {
        handles.add(handle);
      }
    }
    
    // 3. 页面中的 Twitter 链接
    const links = doc.querySelectorAll('a[href*="twitter.com"], a[href*="x.com"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      const match = href?.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
      if (match && match[1]) {
        const handle = match[1];
        // 过滤掉常见的非账号路径
        if (!['home', 'explore', 'notifications', 'messages', 'i', 'intent', 'share'].includes(handle.toLowerCase())) {
          handles.add(handle);
        }
      }
    }
    
    // 4. JSON-LD 结构化数据
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const sameAs = data?.sameAs || data?.['@graph']?.[0]?.sameAs || [];
        for (const url of sameAs) {
          if (typeof url === 'string') {
            const match = url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
            if (match && match[1]) {
              handles.add(match[1]);
            }
          }
        }
      } catch {}
    }
    
  } catch (err) {
    console.log(`      ⚠️  HTML parsing error: ${err.message}`);
  }
  
  return Array.from(handles);
}

/**
 * 验证 Twitter 账号是否为官方账号
 * 策略：
 * 1. 检查 handle 是否包含项目名称（去除常见后缀）
 * 2. 过滤个人名字模式（FirstLast, first_last）
 * 3. 如果有多个候选，选择最匹配项目名的
 */
function verifyOfficialTwitter(handles, symbol, name) {
  if (handles.length === 0) return null;
  
  // 标准化项目名（去除后缀）
  const projectName = name.toLowerCase()
    .replace(/\s+(network|protocol|finance|token|coin|labs|foundation)$/i, '')
    .replace(/[^a-z0-9]/g, '');
  
  const symbolLower = symbol.toLowerCase();
  
  // 个人账号特征：firstName_lastName, FirstLast
  const personalPattern = /^[a-z]+_?[a-z]+$/i;
  
  const scored = handles.map(handle => {
    const handleLower = handle.toLowerCase();
    let score = 0;
    let isPersonal = false;
    
    // 个人账号特征检测
    if (personalPattern.test(handle) && handle.length < 15) {
      // 检查是否是真实姓名模式（两个大写字母开头）
      if (/^[A-Z][a-z]+[A-Z][a-z]+$/.test(handle) || /^[a-z]+_[a-z]+$/.test(handle)) {
        isPersonal = true;
        score -= 100; // 严重扣分
      }
    }
    
    // 完全匹配 symbol
    if (handleLower === symbolLower) {
      score += 50;
    }
    
    // 包含 symbol
    if (handleLower.includes(symbolLower)) {
      score += 30;
    }
    
    // 包含 projectName
    if (handleLower.includes(projectName)) {
      score += 40;
    }
    
    // 官方后缀加分
    if (/official|hq|team|labs|network|protocol$/i.test(handle)) {
      score += 20;
    }
    
    // 长度合理（官方账号通常较长）
    if (handle.length >= 6) {
      score += 10;
    }
    
    return { handle, score, isPersonal };
  });
  
  // 排序：分数高的优先，排除个人账号
  scored.sort((a, b) => b.score - a.score);
  
  // 返回最高分且非个人账号
  const best = scored.find(s => !s.isPersonal);
  
  if (best && best.score > 0) {
    return best.handle;
  }
  
  // 如果都是负分，但有候选，返回第一个非个人账号
  return scored.find(s => !s.isPersonal)?.handle || null;
}

// ==================== 主扫描逻辑 ====================

async function enrichCoin(coin) {
  const { symbol, name } = coin;
  
  console.log(`  ${symbol} (${name})...`);
  
  // Step 1: 获取 CoinGecko 信息（作为 fallback）
  const cgInfo = await getCoinGeckoInfo(symbol);
  console.log(`    CoinGecko: ${cgInfo.homepage || 'N/A'} | @${cgInfo.twitter || 'N/A'}`);
  
  if (!cgInfo.homepage) {
    console.log(`    ❌ No homepage found`);
    return {
      ...coin,
      homepage: null,
      twitter_screen_name: cgInfo.twitter || null,
      source: 'coingecko',
      last_scanned: new Date().toISOString(),
    };
  }
  
  // Step 2: 从官网提取 Twitter
  let officialTwitter = null;
  try {
    console.log(`    Fetching homepage...`);
    const html = await fetchHtml(cgInfo.homepage, 8000);
    const handles = extractTwitterFromHtml(html, cgInfo.homepage);
    
    console.log(`    Found ${handles.length} Twitter handle(s): ${handles.join(', ')}`);
    
    if (handles.length > 0) {
      officialTwitter = verifyOfficialTwitter(handles, symbol, name);
      console.log(`    Selected: @${officialTwitter || 'NONE'}`);
    }
  } catch (err) {
    console.log(`    ⚠️  Homepage fetch failed: ${err.message}`);
  }
  
  // Step 3: 决策逻辑
  let finalTwitter = null;
  let source = 'none';
  
  if (officialTwitter) {
    finalTwitter = officialTwitter;
    source = 'homepage';
    console.log(`    ✅ Using homepage: @${finalTwitter}`);
  } else if (cgInfo.twitter) {
    // 验证 CoinGecko 返回的是否是个人账号
    const cgHandles = [cgInfo.twitter];
    const verified = verifyOfficialTwitter(cgHandles, symbol, name);
    if (verified) {
      finalTwitter = cgInfo.twitter;
      source = 'coingecko';
      console.log(`    ✅ Using CoinGecko (verified): @${finalTwitter}`);
    } else {
      console.log(`    ⚠️  CoinGecko Twitter looks personal, skipping`);
    }
  } else {
    console.log(`    ❌ No Twitter found`);
  }
  
  return {
    ...coin,
    homepage: cgInfo.homepage,
    twitter_screen_name: finalTwitter,
    source,
    last_scanned: new Date().toISOString(),
  };
}

async function getLatest100() {
  console.log(`[1/2] 获取 Gate 最新上线的 100 个币...`);
  
  const spot = await fetchJson('https://api.gateio.ws/api/v4/spot/currency_pairs');
  
  let futuresSet = new Set();
  try {
    const futures = await fetchJson('https://api.gateio.ws/api/v4/futures/usdt/contracts');
    futuresSet = new Set(futures.filter(c => !c.in_delisting).map(c => c.name.replace(/_USDT$/, '')));
  } catch {}
  
  let deliverySet = new Set();
  try {
    const delivery = await fetchJson('https://api.gateio.ws/api/v4/delivery/usdt/contracts');
    deliverySet = new Set(delivery.map(c => c.name.replace(/_USDT_\d+$/, '')));
  } catch {}
  
  const usdtPairs = spot
    .filter(p => p.quote === 'USDT' && p.trade_status === 'tradable')
    .sort((a, b) => (b.buy_start || 0) - (a.buy_start || 0));
  
  const leverageRe = /\d+[LS]$/;
  const normal = usdtPairs.filter(p => !leverageRe.test(p.base));
  
  const seen = new Set();
  const deduped = [];
  for (const p of normal) {
    if (!seen.has(p.base)) {
      seen.add(p.base);
      deduped.push(p);
    }
  }
  
  const top100 = deduped.slice(0, 100);
  const spotSet = new Set(spot.filter(p => p.trade_status === 'tradable').map(p => p.base));
  
  const enriched = top100.map(p => {
    const markets = [];
    if (spotSet.has(p.base)) markets.push('spot');
    if (futuresSet.has(p.base)) markets.push('futures');
    if (deliverySet.has(p.base)) markets.push('delivery');
    
    const listedAt = p.buy_start ? new Date(p.buy_start * 1000).toISOString().slice(0, 16).replace('T', ' ') : null;
    
    return {
      symbol: p.base,
      name: p.base_name || p.base,
      listed_at: listedAt,
      markets: markets.length > 0 ? markets : ['spot'],
    };
  });
  
  console.log(`  Found ${enriched.length} coins`);
  return enriched;
}

async function main() {
  console.log('=== Coin Enrichment Scanner v2 ===\n');
  
  const coins = await getLatest100();
  
  console.log(`\n[2/2] 扫描 ${coins.length} 个币种...\n`);
  
  const results = {};
  
  for (let i = 0; i < coins.length; i++) {
    const coin = coins[i];
    console.log(`[${i + 1}/${coins.length}]`);
    
    const enriched = await enrichCoin(coin);
    results[coin.symbol] = enriched;
    
    await sleep(3000); // 避免请求过快
  }
  
  // 写入文件
  const outPath = join(__dirname, '..', 'api', 'coin_enrichment.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  
  console.log(`\n✅ 完成！写入 ${outPath}`);
  
  // 统计
  const withHomepage = Object.values(results).filter(r => r.homepage).length;
  const withTwitter = Object.values(results).filter(r => r.twitter_screen_name).length;
  const fromHomepage = Object.values(results).filter(r => r.source === 'homepage').length;
  const fromCG = Object.values(results).filter(r => r.source === 'coingecko').length;
  
  console.log(`\n=== 统计 ===`);
  console.log(`总计: ${coins.length} 个币种`);
  console.log(`有官网: ${withHomepage} (${(withHomepage / coins.length * 100).toFixed(1)}%)`);
  console.log(`有 Twitter: ${withTwitter} (${(withTwitter / coins.length * 100).toFixed(1)}%)`);
  console.log(`来源分布:`);
  console.log(`  - Homepage: ${fromHomepage}`);
  console.log(`  - CoinGecko: ${fromCG}`);
  console.log(`  - None: ${coins.length - fromHomepage - fromCG}`);
  
  // 显示问题案例的修复情况
  console.log(`\n=== 问题案例检查 ===`);
  const testCases = ['ESP', 'USD1', 'AZTEC'];
  for (const symbol of testCases) {
    if (results[symbol]) {
      const r = results[symbol];
      console.log(`${symbol}: @${r.twitter_screen_name || 'N/A'} (${r.source})`);
    }
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
