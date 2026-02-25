#!/usr/bin/env node
/**
 * 修复已知问题案例的 Twitter 链接
 * 针对性修复：ESP, AZTEC, USD1
 */

import https from 'node:https';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ==================== 工具函数 ====================

async function fetchHtml(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    };
    
    const req = https.get(url, options, res => {
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

function extractTwitterFromHtml(html) {
  const handles = new Set();
  
  try {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    // Meta tags
    const metaTags = ['twitter:creator', 'twitter:site', 'twitter:creator:id', 'twitter:site:id'];
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
    
    // OG tags
    const ogTwitter = doc.querySelector('meta[property="og:twitter"]');
    if (ogTwitter) {
      const content = ogTwitter.getAttribute('content');
      const handle = content?.replace(/^@/, '').trim();
      if (handle && !handle.includes(' ')) {
        handles.add(handle);
      }
    }
    
    // Links
    const links = doc.querySelectorAll('a[href*="twitter.com"], a[href*="x.com"]');
    for (const link of links) {
      const href = link.getAttribute('href');
      const match = href?.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
      if (match && match[1]) {
        const handle = match[1];
        if (!['home', 'explore', 'notifications', 'messages', 'i', 'intent', 'share'].includes(handle.toLowerCase())) {
          handles.add(handle);
        }
      }
    }
    
    // JSON-LD
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
    console.log(`  ⚠️  HTML parsing error: ${err.message}`);
  }
  
  return Array.from(handles);
}

function verifyOfficialTwitter(handles, symbol, name) {
  if (handles.length === 0) return null;
  
  const projectName = name.toLowerCase()
    .replace(/\s+(network|protocol|finance|token|coin|labs|foundation)$/i, '')
    .replace(/[^a-z0-9]/g, '');
  
  const symbolLower = symbol.toLowerCase();
  const personalPattern = /^[a-z]+_?[a-z]+$/i;
  
  const scored = handles.map(handle => {
    const handleLower = handle.toLowerCase();
    let score = 0;
    let isPersonal = false;
    
    // 个人账号检测
    if (personalPattern.test(handle) && handle.length < 15) {
      if (/^[A-Z][a-z]+[A-Z][a-z]+$/.test(handle) || /^[a-z]+_[a-z]+$/.test(handle)) {
        isPersonal = true;
        score -= 100;
      }
    }
    
    if (handleLower === symbolLower) score += 50;
    if (handleLower.includes(symbolLower)) score += 30;
    if (handleLower.includes(projectName)) score += 40;
    if (/official|hq|team|labs|network|protocol$/i.test(handle)) score += 20;
    if (handle.length >= 6) score += 10;
    
    return { handle, score, isPersonal };
  });
  
  scored.sort((a, b) => b.score - a.score);
  const best = scored.find(s => !s.isPersonal);
  
  if (best && best.score > 0) {
    return best.handle;
  }
  
  return scored.find(s => !s.isPersonal)?.handle || null;
}

// ==================== 主逻辑 ====================

async function fixCoin(symbol, name, homepage) {
  console.log(`\n${symbol} (${name})`);
  console.log(`  Homepage: ${homepage}`);
  
  try {
    const html = await fetchHtml(homepage, 10000);
    const handles = extractTwitterFromHtml(html);
    
    console.log(`  Found handles: ${handles.join(', ') || 'NONE'}`);
    
    if (handles.length > 0) {
      const official = verifyOfficialTwitter(handles, symbol, name);
      console.log(`  Selected: @${official || 'NONE'}`);
      return official;
    }
    
    return null;
  } catch (err) {
    console.log(`  ⚠️  Error: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('=== 修复 Twitter 链接（问题案例）===\n');
  
  // 读取现有数据
  const enrichPath = join(__dirname, '..', 'api', 'coin_enrichment.json');
  let enrichment = {};
  try {
    enrichment = JSON.parse(fs.readFileSync(enrichPath, 'utf8'));
  } catch (err) {
    console.log('⚠️  coin_enrichment.json not found, starting fresh');
  }
  
  // 问题案例
  const fixes = [
    { symbol: 'ESP', name: 'Espresso', homepage: 'https://www.espresso.foundation/' },
    { symbol: 'AZTEC', name: 'Aztec', homepage: 'https://aztec.network/' },
    { symbol: 'USD1', name: 'USD1', homepage: 'https://usd1.io/' },
  ];
  
  for (const fix of fixes) {
    const newTwitter = await fixCoin(fix.symbol, fix.name, fix.homepage);
    
    // 更新数据
    if (!enrichment[fix.symbol]) {
      enrichment[fix.symbol] = {
        symbol: fix.symbol,
        name: fix.name,
        homepage: fix.homepage,
      };
    }
    
    if (newTwitter) {
      enrichment[fix.symbol].twitter_screen_name = newTwitter;
      enrichment[fix.symbol].source = 'homepage';
      console.log(`  ✅ Updated: @${newTwitter}`);
    } else {
      console.log(`  ⚠️  No valid Twitter found`);
    }
    
    enrichment[fix.symbol].last_scanned = new Date().toISOString();
  }
  
  // 写入文件
  fs.writeFileSync(enrichPath, JSON.stringify(enrichment, null, 2));
  console.log(`\n✅ 已更新 ${enrichPath}`);
  
  // 显示结果
  console.log('\n=== 修复结果 ===');
  for (const fix of fixes) {
    const coin = enrichment[fix.symbol];
    console.log(`${fix.symbol}: @${coin.twitter_screen_name || 'N/A'} (${coin.source || 'N/A'})`);
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
