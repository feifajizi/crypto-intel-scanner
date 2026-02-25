#!/usr/bin/env node
/**
 * Gate 最新上币质押扫描 v3（终极版）
 * 
 * Step 1: 获取最新100个币（公告爬取 + API补充，包含现货+合约）
 * Step 2: 严格过滤（Meme/RWA/稳定币/包装币）
 * Step 3: Gate Earn 验证
 * Step 4: 官网质押验证（APY + 按钮）
 * Step 5: 输出结构化结果
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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

async function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== Step 1: 获取最新上币 ====================

async function scrapeGateAnnouncements(pages = 3) {
  console.log(`[1/5] 爬取 Gate 公告（前 ${pages} 页）...`);
  
  const listings = [];
  
  for (let page = 1; page <= pages; page++) {
    const url = `https://www.gate.io/zh/article/news?page=${page}`;
    console.log(`  Page ${page}...`);
    
    try {
      const html = await fetchHtml(url);
      const dom = new JSDOM(html);
      const doc = dom.window.document;
      
      const articles = doc.querySelectorAll('.article-item, .news-item, a[href*="/article/"]');
      
      for (const article of articles) {
        const titleEl = article.querySelector('.article-title, .title') || article;
        const timeEl = article.querySelector('.article-time, .time');
        
        if (!titleEl) continue;
        
        const title = titleEl.textContent.trim();
        const time = timeEl ? timeEl.textContent.trim() : null;
        
        // 匹配上线公告
        const patterns = [
          /([A-Z0-9]{2,10})\s*(?:\([^)]+\))?\s*(?:将)?上线/i,
          /上线\s*([A-Z0-9]{2,10})/i,
          /list(?:ing)?\s+([A-Z0-9]{2,10})/i,
        ];
        
        for (const pattern of patterns) {
          const match = title.match(pattern);
          if (match) {
            const symbol = match[1].toUpperCase();
            
            // 过滤非币种词
            if (!['GATE', 'GATEIO', 'IO', 'USD', 'CNY'].includes(symbol) && symbol.length >= 2) {
              listings.push({
                symbol,
                announced_at: time,
                announcement: title,
              });
            }
            break;
          }
        }
      }
      
      await sleep(1500);
    } catch (err) {
      console.log(`  ⚠️  Page ${page} error: ${err.message}`);
    }
  }
  
  // 去重
  const uniqueMap = new Map();
  for (const item of listings) {
    if (!uniqueMap.has(item.symbol)) {
      uniqueMap.set(item.symbol, item);
    }
  }
  
  const unique = Array.from(uniqueMap.values());
  console.log(`  Found ${unique.length} from announcements`);
  
  return unique;
}

async function getMarketsData() {
  console.log(`[1/5] 获取 Gate API 数据（现货+合约）...`);
  
  // 现货
  const spot = await fetchJson('https://api.gateio.ws/api/v4/spot/currency_pairs');
  const spotCoins = new Set(spot.filter(p => p.trade_status === 'tradable').map(p => p.base));
  
  // 永续
  let futuresCoins = new Set();
  try {
    const futures = await fetchJson('https://api.gateio.ws/api/v4/futures/usdt/contracts');
    futuresCoins = new Set(futures.filter(c => !c.in_delisting).map(c => c.name.replace(/_USDT$/, '')));
  } catch {}
  
  // 交割
  let deliveryCoins = new Set();
  try {
    const delivery = await fetchJson('https://api.gateio.ws/api/v4/delivery/usdt/contracts');
    deliveryCoins = new Set(delivery.map(c => c.name.replace(/_USDT_\d+$/, '')));
  } catch {}
  
  console.log(`  Spot: ${spotCoins.size} | Futures: ${futuresCoins.size} | Delivery: ${deliveryCoins.size}`);
  
  return { spotCoins, futuresCoins, deliveryCoins };
}

async function getLatest100() {
  console.log(`[1/4] 获取 Gate 最新上线的 100 个币...`);
  
  // 获取全部现货交易对
  const spot = await fetchJson('https://api.gateio.ws/api/v4/spot/currency_pairs');
  
  // 获取合约列表
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
  
  // 筛选 USDT + 可交易 + 按 buy_start 倒序（真正上线时间）
  const usdtPairs = spot
    .filter(p => p.quote === 'USDT' && p.trade_status === 'tradable')
    .sort((a, b) => (b.buy_start || 0) - (a.buy_start || 0));
  
  // 过滤杠杆代币（3L/3S/5L/5S）
  const leverageRe = /\d+[LS]$/;
  const normal = usdtPairs.filter(p => !leverageRe.test(p.base));
  
  // 同币去重（现货+合约只保留一个，优先保留现货记录）
  const seen = new Set();
  const deduped = [];
  for (const p of normal) {
    if (!seen.has(p.base)) {
      seen.add(p.base);
      deduped.push(p);
    }
  }
  
  // 取最新 100 个
  const top100 = deduped.slice(0, 10);
  
  // 补充市场类型
  const spotSet = new Set(spot.filter(p => p.trade_status === 'tradable').map(p => p.base));
  const enriched = top100.map(p => {
    const markets = [];
    if (spotSet.has(p.base)) markets.push('spot');
    if (futuresSet.has(p.base)) markets.push('futures');
    if (deliverySet.has(p.base)) markets.push('delivery');
    
    const listedAt = p.buy_start ? new Date(p.buy_start * 1000).toISOString().slice(0, 16).replace('T', ' ') : null;
    
    return {
      symbol: p.base,
      name: p.base_name,
      listed_at: listedAt,
      buy_start: p.buy_start || 0,
      markets: markets.length > 0 ? markets : ['spot'],
    };
  });
  
  const newest = enriched[0];
  const oldest = enriched[enriched.length - 1];
  console.log(`  Total: ${usdtPairs.length} USDT pairs → ${deduped.length} unique coins`);
  console.log(`  Top 100: ${newest?.symbol} (${newest?.listed_at}) → ${oldest?.symbol} (${oldest?.listed_at})`);
  
  return enriched;
}

// ==================== Step 2: 严格过滤 ====================

function strictFilter(coins) {
  console.log(`[2/5] 严格过滤...`);
  
  const MEME_WORDS = ['inu', 'doge', 'pepe', 'shib', 'wif', 'bonk', 'meme', 'elon', 'floki', 'shiba', 'degen', 'cat', 'dog', 'frog', 'moon', 'mars', 'wojak', 'neiro', 'baby', 'safe', 'cum'];
  const RWA_WORDS = ['rwa', 'stock', 'share', 'gold', 'silver', 'treasury', 'bond', 'vix', 'index', 'paxg', 'xaut'];
  const STABLES = ['usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdp', 'gusd', 'usdd', 'frax', 'lusd', 'susd', 'ust', 'mim'];
  const WRAPPED = ['wbtc', 'weth', 'wbnb', 'steth', 'reth', 'cbeth', 'renbtc', 'hbtc', 'tbtc'];
  
  const isMeme = (text) => MEME_WORDS.some(w => new RegExp(`\\b${w}\\b|${w}(?=[A-Z0-9])|(?<=[a-z])${w}`, 'i').test(text));
  const isRWA = (text) => RWA_WORDS.some(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
  const isStable = (sym) => STABLES.includes(sym.toLowerCase());
  const isWrapped = (sym) => WRAPPED.includes(sym.toLowerCase());
  const isLeveraged = (sym) => /[35][LS]$/i.test(sym);
  
  const filtered = coins.filter(c => {
    const text = `${c.symbol} ${c.announcement || ''}`.toLowerCase();
    const sym = c.symbol.toLowerCase();
    
    return !isMeme(text) && !isRWA(text) && !isStable(sym) && !isWrapped(sym) && !isLeveraged(c.symbol);
  });
  
  console.log(`  Kept ${filtered.length} / ${coins.length}`);
  return filtered;
}

// ==================== Step 3: Gate Earn ====================

async function checkGateEarn(coins) {
  console.log(`[3/5] 检查 Gate Earn...`);
  
  try {
    const earn = await fetchJson('https://api.gateio.ws/api/v4/earn/uni/currencies');
    const earnSet = new Set(earn.map(e => e.currency?.toUpperCase()));
    
    const withEarn = coins.map(c => ({ ...c, gate_earn: earnSet.has(c.symbol) }));
    const count = withEarn.filter(c => c.gate_earn).length;
    console.log(`  ${count} / ${coins.length} support Gate Earn`);
    
    return withEarn;
  } catch {
    console.log(`  ⚠️  Gate Earn API failed`);
    return coins.map(c => ({ ...c, gate_earn: false }));
  }
}

// ==================== Step 4: 官网 + Twitter 质押验证 ====================

// CoinGecko symbol → ID 缓存
const cgIdCache = new Map();

async function fetchJsonRetry(url, timeoutMs = 10000, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fetchJson(url, timeoutMs);
      // 检查是否被限流（CoinGecko 返回 403 或 Throttled）
      if (result?.status?.error_code === 403 || result?.status?.error_code === 429) {
        throw new Error('rate_limited');
      }
      return result;
    } catch (err) {
      if (attempt < maxRetries && (err.message === 'rate_limited' || err.message?.includes('Throttled'))) {
        const waitSec = 30 * attempt; // 30s, 60s, 90s
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
    // 限速：每次请求间隔 6 秒（CoinGecko 免费 API ~10次/分钟）
    await sleep(6000);
    
    // 用 search API 查找币种 ID
    const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`;
    const result = await fetchJsonRetry(searchUrl, 10000);
    
    // 找最匹配的（symbol 完全一致的）
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

async function getCoinInfo(symbol) {
  try {
    const id = await getCoinGeckoId(symbol);
    if (!id) return { homepage: null, twitter: null };
    
    await sleep(6000); // 限速
    const cg = await fetchJsonRetry(`https://api.coingecko.com/api/v3/coins/${id}`, 10000);
    return {
      homepage: cg?.links?.homepage?.[0] || null,
      twitter: cg?.links?.twitter_screen_name || null,
    };
  } catch {
    return { homepage: null, twitter: null };
  }
}

async function verifyHomepage(homepage) {
  if (!homepage) return { found: false };
  
  try {
    const res = await new Promise((resolve, reject) => {
      const req = https.get(homepage, { timeout: 8000 }, res => {
        if (res.statusCode !== 200) return resolve(null);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
    
    if (!res) return { found: false };
    
    const text = res.toLowerCase();
    const hasStaking = /\b(stake|staking|validator)\b/.test(text);
    const hasReward = /\b(apy|apr|reward|yield|earn)\b/.test(text);
    
    if (!hasStaking && !hasReward) return { found: false };
    
    const apyMatch = text.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:apy|apr)/i);
    const apy = apyMatch ? apyMatch[1] + '%' : null;
    
    const hasButton = /(stake\s+now|start\s+staking)/i.test(text);
    const stakingUrlMatch = res.match(/href=["']([^"']*(?:staking|stake|earn)[^"']*)["']/i);
    
    let stakingUrl = homepage;
    if (stakingUrlMatch) {
      try {
        stakingUrl = new URL(stakingUrlMatch[1], homepage).href;
      } catch {}
    }
    
    const evidence = [];
    if (hasStaking) evidence.push('staking');
    if (apy) evidence.push(`APY:${apy}`);
    if (hasButton) evidence.push('button');
    if (stakingUrlMatch) evidence.push('page');
    
    return {
      found: true,
      staking_url: stakingUrl,
      apy,
      evidence: evidence.join(', '),
    };
  } catch {
    return { found: false };
  }
}

async function verifyTwitter(twitterHandle) {
  if (!twitterHandle) return { found: false };
  
  try {
    // 搜索 Twitter 最近推文（用 nitter.net 镜像站，无需登录）
    const searchUrl = `https://nitter.net/${twitterHandle}/search?f=tweets&q=stake+OR+staking+OR+APY+OR+APR+OR+validator+OR+earn`;
    
    const res = await new Promise((resolve, reject) => {
      const req = https.get(searchUrl, { timeout: 8000 }, res => {
        if (res.statusCode !== 200) return resolve(null);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
    
    if (!res) return { found: false };
    
    const text = res.toLowerCase();
    
    // 检查是否有相关推文
    const hasStakingTweet = /\b(stake|staking|validator)\b/.test(text);
    const hasRewardTweet = /\b(apy|apr|yield|earn)\b/.test(text);
    
    if (!hasStakingTweet && !hasRewardTweet) return { found: false };
    
    // 尝试提取 APY
    const apyMatch = text.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:apy|apr)/i);
    const apy = apyMatch ? apyMatch[1] + '%' : null;
    
    const evidence = [];
    if (hasStakingTweet) evidence.push('staking tweet');
    if (apy) evidence.push(`APY:${apy}`);
    
    return {
      found: true,
      apy,
      evidence: evidence.join(', '),
    };
  } catch {
    return { found: false };
  }
}

async function verifyStaking(homepage, twitter) {
  // 同时检查官网和 Twitter
  const [homepageResult, twitterResult] = await Promise.all([
    verifyHomepage(homepage),
    verifyTwitter(twitter),
  ]);
  
  // 如果都没找到，返回 null
  if (!homepageResult.found && !twitterResult.found) {
    return null;
  }
  
  // 合并证据
  const allEvidence = [];
  let combinedApy = null;
  let stakingUrl = homepage;
  
  if (homepageResult.found) {
    allEvidence.push(`homepage: ${homepageResult.evidence}`);
    if (homepageResult.apy) combinedApy = homepageResult.apy;
    if (homepageResult.staking_url) stakingUrl = homepageResult.staking_url;
  }
  
  if (twitterResult.found) {
    allEvidence.push(`twitter: ${twitterResult.evidence}`);
    if (!combinedApy && twitterResult.apy) combinedApy = twitterResult.apy;
  }
  
  // 置信度：官网+Twitter = high，单一来源 = medium/low
  const evidenceCount = (homepageResult.found ? 1 : 0) + (twitterResult.found ? 1 : 0);
  const hasAPY = !!combinedApy;
  const hasButton = homepageResult.evidence?.includes('button');
  
  let confidence = 'low';
  if (evidenceCount === 2 && hasAPY) confidence = 'high';
  else if (evidenceCount === 2 || (evidenceCount === 1 && hasAPY && hasButton)) confidence = 'medium';
  
  return {
    found: true,
    staking_url: stakingUrl,
    apy: combinedApy,
    confidence,
    evidence: allEvidence.join(' | '),
  };
}

async function scanStaking(coins) {
  
  const results = [];
  
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    console.log(`  [${i + 1}/${coins.length}] ${c.symbol}...`);
    
    const { homepage, twitter } = await getCoinInfo(c.symbol);
    if (!homepage && !twitter) {
      console.log(`    ❌ No homepage or Twitter`);
      continue;
    }
    
    console.log(`    Homepage: ${homepage || 'N/A'}`);
    console.log(`    Twitter: ${twitter ? '@' + twitter : 'N/A'}`);
    
    const staking = await verifyStaking(homepage, twitter);
    if (!staking?.found) {
      console.log(`    ❌ No staking`);
      continue;
    }
    
    console.log(`    ✅ Staking (${staking.confidence}): ${staking.evidence}`);
    
    results.push({ ...c, homepage, twitter, staking });
    
    await sleep(3000);
  }
  
  return results;
}

// ==================== Step 5: 输出 ====================

async function main() {
  console.log('=== Gate 最新上币质押扫描 v3 ===\n');
  
  const latest100 = await getLatest100();
  const filtered = strictFilter(latest100);
  
  console.log(`\n[3/4] 扫描质押（${filtered.length} coins）...`);
  const results = await scanStaking(filtered);
  
  const outPath = join(__dirname, '..', 'src', 'data', 'gate_stake_v3.json');
  const output = {
    generated_at: new Date().toISOString(),
    source: 'Gate latest 100 coins by buy_start (real listing date)',
    total_scanned: filtered.length,
    found_count: results.length,
    results: results.map(r => ({
      symbol: r.symbol,
      name: r.name,
      listed_at: r.listed_at,
      markets: r.markets,
      homepage: r.homepage,
      twitter: r.twitter ? `@${r.twitter}` : null,
      staking: {
        url: r.staking.staking_url,
        apy: r.staking.apy,
        confidence: r.staking.confidence,
        evidence: r.staking.evidence,
      },
    })),
  };
  
  fs.mkdirSync(join(__dirname, '..', 'src', 'data'), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  
  console.log(`\n=== 结果 (${results.length}) ===`);
  results.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.symbol} (${r.name})`);
    console.log(`   Listed: ${r.listed_at}`);
    console.log(`   Markets: ${r.markets.join(', ')}`);
    if (r.homepage) console.log(`   Homepage: ${r.homepage}`);
    if (r.twitter) console.log(`   Twitter: @${r.twitter}`);
    console.log(`   Staking: ${r.staking.staking_url}`);
    if (r.staking.apy) console.log(`   APY: ${r.staking.apy}`);
    console.log(`   Confidence: ${r.staking.confidence}`);
    console.log(`   Evidence: ${r.staking.evidence}`);
  });
  
  console.log(`\n✅ ${outPath}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
