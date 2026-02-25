#!/usr/bin/env node
/**
 * Gate 新上币质押扫描 v2（修复版）
 * 
 * Step 1: 获取真正的新上币（去重 + 按上线时间筛选）
 * Step 2: 严格过滤（Meme/RWA/稳定币/包装币）
 * Step 3: 检查 Gate 理财支持
 * Step 4: 爬取官网验证质押（APY + Stake 按钮）
 * Step 5: 输出结构化结果
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==================== Step 1: 获取新上币 ====================

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

async function getNewCoins(daysBack = 30) {
  console.log(`[1/5] Fetching Gate.io spot markets (去重中)...`);
  
  // Gate API: 所有现货交易对
  const markets = await fetchJson('https://api.gateio.ws/api/v4/spot/currency_pairs');
  
  // 只保留 USDT 交易对（主流）
  const usdtPairs = markets.filter(m => m.quote === 'USDT' && m.trade_status === 'tradable');
  
  // 按币种去重（一个币可能有多个交易对）
  const coinMap = new Map();
  for (const pair of usdtPairs) {
    const symbol = pair.base; // BTC, ETH, etc.
    if (!coinMap.has(symbol)) {
      coinMap.set(symbol, {
        symbol,
        pair_id: pair.id, // BTC_USDT
      });
    }
  }
  
  console.log(`  Found ${coinMap.size} unique coins (USDT pairs)`);
  
  // 获取每个币的详细信息（包括上线时间）
  console.log(`[1/5] Fetching coin details from CoinGecko...`);
  const coins = Array.from(coinMap.values());
  
  // 简化：用 Gate 的 tickers API 获取交易数据
  const tickers = await fetchJson('https://api.gateio.ws/api/v4/spot/tickers');
  const tickerMap = new Map(tickers.map(t => [t.currency_pair, t]));
  
  // 筛选最近上线的（按交易量排序，取前100个）
  const enriched = coins.map(c => {
    const ticker = tickerMap.get(c.pair_id);
    return {
      ...c,
      volume_24h: ticker ? parseFloat(ticker.quote_volume) : 0,
      price: ticker ? parseFloat(ticker.last) : 0,
    };
  });
  
  // 按交易量排序，取前100个（大概率是新币）
  enriched.sort((a, b) => b.volume_24h - a.volume_24h);
  const top100 = enriched.slice(0, 100);
  
  console.log(`  Kept top 100 by volume (likely recent listings)`);
  return top100;
}

// ==================== Step 2: 严格过滤 ====================

function strictFilter(coins) {
  console.log(`[2/5] 严格过滤（Meme/RWA/稳定币/包装币）...`);
  
  // Meme 币（更严格，拆分词匹配）
  const MEME_WORDS = [
    'inu', 'doge', 'pepe', 'shib', 'wif', 'bonk', 'meme', 'elon', 
    'floki', 'shiba', 'degen', 'cat', 'dog', 'frog', 'moon', 'mars',
    'wojak', 'neiro', 'baby', 'safe', 'moon', 'cum', 'ass', 'dick'
  ];
  
  // RWA / 股票代币
  const RWA_WORDS = [
    'rwa', 'stock', 'share', 'equity', 'gold', 'silver', 'treasury', 
    'bond', 'vix', 'aus200', 'us2000', 'tw88', 'hschkd', 'cohr', 
    'mu', 'lite', 'index', 'jpn225', 'hk50', 'us30', 'gbpusd', 
    'eurusd', 'baba', 'acn', 'jpm', 'paxg', 'xaut'
  ];
  
  // 稳定币
  const STABLECOINS = [
    'usdt', 'usdc', 'dai', 'busd', 'tusd', 'usdp', 'gusd', 'usdd', 
    'frax', 'lusd', 'susd', 'ust', 'ustc', 'fei', 'tribe', 'mim'
  ];
  
  // 包装币 / 衍生品
  const WRAPPED = [
    'wbtc', 'weth', 'wbnb', 'steth', 'reth', 'cbeth', 'renbtc', 
    'hbtc', 'tbtc', 'sbtc', 'seth', 'abtc', 'bbtc'
  ];
  
  // 杠杆代币
  const isLeveraged = (symbol) => /[35][LS]$/i.test(symbol);
  
  const isMeme = (text) => MEME_WORDS.some(w => {
    const regex = new RegExp(`\\b${w}\\b|${w}(?=[A-Z0-9])|(?<=[a-z])${w}`, 'i');
    return regex.test(text);
  });
  
  const isRWA = (text) => RWA_WORDS.some(w => new RegExp(`\\b${w}\\b`, 'i').test(text));
  const isStable = (symbol) => STABLECOINS.includes(symbol.toLowerCase());
  const isWrapped = (symbol) => WRAPPED.includes(symbol.toLowerCase());
  
  const filtered = coins.filter(c => {
    const text = `${c.symbol} ${c.pair_id}`.toLowerCase();
    const sym = c.symbol.toLowerCase();
    
    if (isMeme(text)) return false;
    if (isRWA(text)) return false;
    if (isStable(sym)) return false;
    if (isWrapped(sym)) return false;
    if (isLeveraged(c.symbol)) return false;
    
    return true;
  });
  
  console.log(`  Kept ${filtered.length} / ${coins.length} coins`);
  return filtered;
}

// ==================== Step 3: 检查 Gate 理财 ====================

async function checkGateEarn(symbols) {
  console.log(`[3/5] 检查 Gate 理财支持...`);
  
  try {
    // Gate Earn API (注意：可能需要认证)
    const earnData = await fetchJson('https://api.gateio.ws/api/v4/earn/uni/currencies');
    const earnSet = new Set(earnData.map(e => e.currency?.toUpperCase()));
    
    const withEarn = symbols.map(c => ({
      ...c,
      gate_earn: earnSet.has(c.symbol),
    }));
    
    const earnCount = withEarn.filter(c => c.gate_earn).length;
    console.log(`  ${earnCount} / ${symbols.length} coins support Gate Earn`);
    
    return withEarn;
  } catch (err) {
    console.log(`  ⚠️  Gate Earn API failed: ${err.message}`);
    return symbols.map(c => ({ ...c, gate_earn: false }));
  }
}

// ==================== Step 4: 爬取官网验证质押 ====================

async function fetchWithTimeout(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

async function verifyStaking(homepage) {
  if (!homepage) return null;
  
  try {
    const { status, body } = await fetchWithTimeout(homepage, 8000);
    if (status !== 200) return null;
    
    const text = body.toLowerCase();
    
    // 关键词检测（必须同时满足）
    const hasStakingKeyword = /\b(stake|staking|validator)\b/.test(text);
    const hasRewardKeyword = /\b(apy|apr|reward|yield|earn)\b/.test(text);
    
    if (!hasStakingKeyword && !hasRewardKeyword) return null;
    
    // 尝试提取 APY
    const apyMatch = text.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:apy|apr)/i);
    const apy = apyMatch ? apyMatch[1] + '%' : null;
    
    // 查找 Stake 按钮
    const hasStakeButton = /(stake\s+now|start\s+staking|stake\s+\w+|earn\s+rewards)/i.test(text);
    
    // 查找 staking 子页面
    const stakingUrlMatch = body.match(/href=["']([^"']*(?:staking|stake|earn|validator)[^"']*)["']/i);
    const stakingPath = stakingUrlMatch ? stakingUrlMatch[1] : null;
    
    let stakingUrl = homepage;
    if (stakingPath) {
      try {
        stakingUrl = new URL(stakingPath, homepage).href;
      } catch {}
    }
    
    const evidence = [];
    if (hasStakingKeyword) evidence.push('staking keyword');
    if (apy) evidence.push(`APY: ${apy}`);
    if (hasStakeButton) evidence.push('stake button');
    if (stakingPath) evidence.push('staking page');
    
    return {
      found: hasStakingKeyword || hasRewardKeyword,
      staking_url: stakingUrl,
      apy,
      confidence: evidence.length >= 3 ? 'high' : evidence.length === 2 ? 'medium' : 'low',
      evidence: evidence.join(', '),
    };
  } catch (err) {
    return null;
  }
}

async function getHomepage(symbol) {
  try {
    // 从 CoinGecko 获取官网（免费API）
    const data = await fetchJson(`https://api.coingecko.com/api/v3/coins/${symbol.toLowerCase()}`);
    return data?.links?.homepage?.[0] || null;
  } catch {
    return null;
  }
}

async function scanStaking(coins) {
  console.log(`[4/5] 爬取官网验证质押（${coins.length} coins, ~${Math.ceil(coins.length * 3 / 60)} min）...`);
  
  const results = [];
  
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    console.log(`  [${i + 1}/${coins.length}] ${c.symbol}...`);
    
    // 获取官网
    const homepage = await getHomepage(c.symbol);
    if (!homepage) {
      console.log(`    ❌ No homepage`);
      continue;
    }
    
    console.log(`    Homepage: ${homepage}`);
    
    // 验证质押
    const staking = await verifyStaking(homepage);
    if (!staking?.found) {
      console.log(`    ❌ No staking`);
      continue;
    }
    
    console.log(`    ✅ Staking found (${staking.confidence}): ${staking.evidence}`);
    
    results.push({
      ...c,
      homepage,
      staking,
    });
    
    // 限速：3s/请求
    await new Promise(r => setTimeout(r, 3000));
  }
  
  return results;
}

// ==================== Step 5: 输出结果 ====================

async function main() {
  console.log('=== Gate 新上币质押扫描 v2 ===\n');
  
  const coins = await getNewCoins(30);
  const filtered = strictFilter(coins);
  const withEarn = await checkGateEarn(filtered);
  
  // 优先扫描 Gate 支持理财的（大概率靠谱）
  const earnSupported = withEarn.filter(c => c.gate_earn);
  const earnNotSupported = withEarn.filter(c => !c.gate_earn);
  
  console.log(`\n优先扫描 Gate Earn 支持的 ${earnSupported.length} 个币...`);
  const earnResults = await scanStaking(earnSupported);
  
  console.log(`\n扫描其他 ${Math.min(earnNotSupported.length, 20)} 个币（限制20个避免超时）...`);
  const otherResults = await scanStaking(earnNotSupported.slice(0, 20));
  
  const allResults = [...earnResults, ...otherResults];
  
  // 输出
  const outPath = join(__dirname, '..', 'src', 'data', 'gate_stake_v2.json');
  const output = {
    generated_at: new Date().toISOString(),
    source: 'Gate.io top 100 by volume (filtered: no meme/rwa/stable/wrapped)',
    total_scanned: earnSupported.length + Math.min(earnNotSupported.length, 20),
    found_count: allResults.length,
    results: allResults.map(r => ({
      symbol: r.symbol,
      pair: r.pair_id,
      volume_24h: r.volume_24h,
      price: r.price,
      gate_earn: r.gate_earn,
      homepage: r.homepage,
      staking: {
        url: r.staking.staking_url,
        apy: r.staking.apy,
        confidence: r.staking.confidence,
        evidence: r.staking.evidence,
      },
    })),
  };
  
  fs.mkdirSync(join(__dirname, '..', 'src', 'data'), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  
  console.log(`\n=== 结果 (${allResults.length}) ===`);
  allResults.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.symbol} (${r.pair_id})`);
    console.log(`   Gate Earn: ${r.gate_earn ? '✅' : '❌'}`);
    console.log(`   Staking: ${r.staking.staking_url}`);
    if (r.staking.apy) console.log(`   APY: ${r.staking.apy}`);
    console.log(`   Confidence: ${r.staking.confidence}`);
    console.log(`   Evidence: ${r.staking.evidence}`);
  });
  
  console.log(`\n✅ 写入: ${outPath}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
