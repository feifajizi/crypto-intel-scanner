# Twitter 链接质量修复总结

## 任务目标

修复 crypto-dashboard 中 Twitter 链接质量问题，将个人账号替换为官方账号。

## 问题案例

| 币种 | 错误链接（个人） | 正确链接（官方） | 状态 |
|------|-----------------|-----------------|------|
| ESP | @benafisch | @espressoFNDN | ✅ 已修复 |
| AZTEC | @zac_aztec | @aztecnetwork | ✅ 已修复 |
| USD1 | @ZachWitkoff | @worldlibertyfi | ✅ 已修复 |

## 实施方案

### 1. 新建 Twitter 提取脚本

创建 `scripts/enrich-scanner.mjs`，实现以下功能：

#### 从官网 HTML 提取 Twitter 链接
- 解析 meta tags: `twitter:creator`, `twitter:site`, `og:twitter`
- 提取页面中的 Twitter/X.com 链接
- 解析 JSON-LD 结构化数据中的社交链接

#### 验证 Twitter 账号真实性
```javascript
function verifyOfficialTwitter(handles, symbol, name) {
  // 过滤个人账号特征
  // - FirstnameLastname 模式
  // - firstname_lastname 模式
  
  // 官方账号评分标准
  // + 完全匹配 symbol
  // + 包含 symbol
  // + 包含项目名称
  // + 官方后缀（official, hq, team, labs, network, protocol）
  // + 合理长度（>= 6字符）
}
```

#### 数据优先级
```
官网提取的社交链接 > CoinGecko API
```

### 2. 针对性修复脚本

创建 `scripts/fix-twitter-links.mjs` 和 `scripts/fix-usd1.mjs`：
- 直接修复问题案例
- 更新 `api/coin_enrichment.json`
- 标记数据来源为 `homepage`

### 3. API 集成

`api/gate-latest.js` 已有逻辑读取 `coin_enrichment.json`：

```javascript
// Step 0: Check coin_enrichment.json first (from offline scanner)
const ce = coinEnrichment[coin.symbol];
if (ce && (ce.homepage || ce.twitter_screen_name)) {
  enriched.push({
    ...coin,
    homepage: ce.homepage || coin.homepage,
    twitter_screen_name: ce.twitter_screen_name || coin.twitter_screen_name,
    staking: ce.staking || undefined,
  });
  continue;
}
```

## 修复结果

### 本地验证

```json
{
  "ESP": {
    "twitter_screen_name": "espressoFNDN",
    "source": "homepage",
    "homepage": "https://www.espresso.foundation/"
  },
  "AZTEC": {
    "twitter_screen_name": "aztecnetwork",
    "source": "homepage",
    "homepage": "https://aztec.network/"
  },
  "USD1": {
    "twitter_screen_name": "worldlibertyfi",
    "source": "homepage",
    "homepage": "https://worldlibertyfinancial.com/usd1"
  }
}
```

### 部署状态

- ✅ 代码已提交到 Git
- ✅ 已推送到 GitHub
- 🔄 Vercel 自动部署中
- ⚠️  部署后需要验证 API 返回数据

## 已知问题

### Vercel 部署问题
- `coin_enrichment.json` 在 Vercel serverless function 中可能未正确加载
- 添加了调试日志以诊断问题
- 可能需要调整部署配置或文件结构

### 其他币种的个人账号问题
发现其他币种也可能存在类似问题：
- RNBW → @christianbaroni（个人）
- BIRB → @spencer（个人）
- ZAMA → @randhindi（个人）
- INX → @kaiynne（个人）

建议：运行 `scripts/enrich-scanner.mjs` 对所有 top 100 币种进行全量扫描。

## 文件清单

### 新建文件
- `scripts/enrich-scanner.mjs` - 主扫描脚本（支持 top 100）
- `scripts/fix-twitter-links.mjs` - 问题案例修复脚本
- `scripts/fix-usd1.mjs` - USD1 单独修复脚本
- `api/coin_enrichment.json` - 扫描结果数据

### 修改文件
- `api/gate-latest.js` - 添加调试日志

## 后续建议

1. **监控 Vercel 部署**
   - 检查部署日志
   - 验证 API 返回数据是否正确

2. **全量扫描**
   ```bash
   node scripts/enrich-scanner.mjs
   ```
   - 需要 15-20 分钟（CoinGecko API 限速）
   - 更新所有 top 100 币种数据

3. **定期更新**
   - 建议每周运行一次扫描
   - 新上线币种的链接质量检查
   - 可以配置 GitHub Actions 自动化

4. **数据验证**
   ```bash
   # 测试 API
   curl "https://crypto-intel-scanner.vercel.app/api/gate-latest?enrich=1&limit=50"
   
   # 检查特定币种
   curl "https://crypto-intel-scanner.vercel.app/api/gate-latest?enrich=1" | jq '.data[] | select(.symbol == "ESP")'
   ```

## 技术细节

### HTML 解析策略
- 使用 JSDOM 解析 HTML
- 优先查找 meta tags（最可靠）
- 次级查找页面链接
- 最后查找结构化数据

### 个人账号识别算法
```javascript
// 特征检测
const personalPattern = /^[a-z]+_?[a-z]+$/i;
if (/^[A-Z][a-z]+[A-Z][a-z]+$/.test(handle)) {
  isPersonal = true; // FirstLast 模式
}
if (/^[a-z]+_[a-z]+$/.test(handle)) {
  isPersonal = true; // first_last 模式
}
```

### 评分系统
- 完全匹配 symbol: +50
- 包含 symbol: +30
- 包含项目名称: +40
- 官方后缀: +20
- 合理长度: +10
- 个人账号特征: -100

## 参考链接

- ESP 官网: https://www.espresso.foundation/
- AZTEC 官网: https://aztec.network/
- USD1 官网: https://worldlibertyfinancial.com/usd1
- CoinGecko API: https://www.coingecko.com/api/documentation

---

**修复完成时间**: 2026-02-25 21:30 (GMT+8)
**修复人员**: OpenClaw Agent
