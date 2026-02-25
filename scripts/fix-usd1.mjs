#!/usr/bin/env node
import https from 'node:https';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
    
    const metaTags = ['twitter:creator', 'twitter:site'];
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

async function main() {
  const homepage = 'https://worldlibertyfinancial.com/usd1';
  
  console.log('=== 修复 USD1 ===\n');
  console.log(`Homepage: ${homepage}`);
  
  const html = await fetchHtml(homepage);
  const handles = extractTwitterFromHtml(html);
  
  console.log(`Found handles: ${handles.join(', ')}`);
  
  // 过滤个人账号
  const personalPattern = /^[A-Z][a-z]+[A-Z][a-z]+$/;
  const filtered = handles.filter(h => !personalPattern.test(h));
  
  console.log(`After filtering: ${filtered.join(', ')}`);
  
  const officialTwitter = filtered[0] || null;
  
  if (officialTwitter) {
    const enrichPath = join(__dirname, '..', 'api', 'coin_enrichment.json');
    const enrichment = JSON.parse(fs.readFileSync(enrichPath, 'utf8'));
    
    if (!enrichment['USD1']) {
      enrichment['USD1'] = {
        symbol: 'USD1',
        name: 'World Liberty Financial USD',
        homepage: homepage,
      };
    }
    
    enrichment['USD1'].homepage = homepage;
    enrichment['USD1'].twitter_screen_name = officialTwitter;
    enrichment['USD1'].source = 'homepage';
    enrichment['USD1'].last_scanned = new Date().toISOString();
    
    fs.writeFileSync(enrichPath, JSON.stringify(enrichment, null, 2));
    console.log(`\n✅ Updated: @${officialTwitter}`);
  } else {
    console.log('\n⚠️  No valid Twitter found');
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
