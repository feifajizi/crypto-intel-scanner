# Twitter 监控集成文档

## 概述

crypto-dashboard 已集成推特监控功能，实时展示 DeFi 领域的重要推文。

## 架构

### 数据流
```
twitter_list_monitor_dashboard.py (cron)
    ↓ 
api/twitter_tweets.json (静态JSON)
    ↓
TwitterMonitor.tsx (前端组件)
```

### 文件说明

1. **数据采集脚本**
   - 路径: `/Users/clawdtbot/.openclaw/workspace/twitter_list_monitor_dashboard.py`
   - 功能: 抓取推特List推文 → 关键词过滤 → 输出JSON
   - 运行: `python3 twitter_list_monitor_dashboard.py`
   - 输出: `crypto-dashboard/api/twitter_tweets.json`

2. **前端组件**
   - 路径: `src/components/TwitterMonitor.tsx`
   - 功能: 读取JSON并展示推文卡片
   - 特性: 自动刷新、时间格式化、图片展示

3. **数据文件**
   - 路径: `api/twitter_tweets.json`
   - 格式:
     ```json
     {
       "last_update": "2026-02-25T22:00:00+08:00",
       "count": 50,
       "tweets": [
         {
           "id": "tweet_id",
           "screen_name": "username",
           "name": "Display Name",
           "text": "推文内容",
           "created_at": "Wed Feb 25 13:20:15 +0000 2026",
           "url": "https://twitter.com/...",
           "media_urls": ["image_url"],
           "is_rt": false,
           "rt_source": ""
         }
       ]
     }
     ```

## 部署配置

### 方式1: Vercel Cron (推荐)

在 Vercel 项目设置中添加 Cron Job：

1. 在项目根目录创建 `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/update-twitter",
       "schedule": "*/10 * * * *"
     }]
   }
   ```

2. 创建 API endpoint `api/update-twitter.js`:
   ```javascript
   import { exec } from 'child_process';
   import { promisify } from 'util';
   
   const execAsync = promisify(exec);
   
   export default async function handler(req, res) {
     try {
       await execAsync('python3 /path/to/twitter_list_monitor_dashboard.py');
       res.json({ success: true });
     } catch (err) {
       res.status(500).json({ error: err.message });
     }
   }
   ```

### 方式2: 本地Cron (当前方案)

添加到 crontab:
```bash
*/10 * * * * cd /Users/clawdtbot/.openclaw/workspace && python3 twitter_list_monitor_dashboard.py
```

## 关键词配置

脚本使用以下关键词过滤 DeFi 相关推文：

- **英文**: rewards, farm, staking, apr, apy, lp, defi, airdrop, tge, etc.
- **中文**: 质押, 奖励, 空投, 挖矿, 羊毛, etc.
- **高价值**: 命中即保留，不受排除词影响
- **排除词**: gm, gn, follow me, etc. (避免噪音)

编辑脚本中的 `DEFI_KEYWORDS_EN/CN` 来调整过滤规则。

## 监控数据

- **保留推文数**: 最近50条
- **更新频率**: 建议10分钟
- **数据源**: Twitter List ID `2023466099745190225`

## 验证步骤

1. 手动运行脚本:
   ```bash
   cd /Users/clawdtbot/.openclaw/workspace
   python3 twitter_list_monitor_dashboard.py
   ```

2. 检查输出文件:
   ```bash
   cat crypto-dashboard/api/twitter_tweets.json | jq '.count'
   ```

3. 本地测试前端:
   ```bash
   cd crypto-dashboard
   npm run dev
   # 访问 http://localhost:5173/#twitter
   ```

4. 构建部署:
   ```bash
   npm run build
   vercel --prod
   ```

## 故障排查

### 推文不显示
- 检查 `api/twitter_tweets.json` 是否存在
- 检查文件权限和内容格式
- 查看浏览器控制台错误

### 脚本失败
- 检查环境变量 `XAPI_KEY`
- 检查 Python 依赖: `requests`
- 查看 `twitter_monitor_state.json` 状态

### Rate Limit
- 脚本已内置重试机制
- API 限制: 75 req/15min
- 脚本每次调用2次API (search + details)

## 未来优化

- [ ] 添加 AI 精筛层（过滤噪音）
- [ ] 添加情感分析标签
- [ ] 支持多个 Twitter List
- [ ] 添加关键词高亮
- [ ] 移动端优化
- [ ] 实时推送通知

## 环境变量

需要在部署环境设置:
```
XAPI_KEY=sk-d0d3900c7dab474a22c3645fb25415b6b28cd3109e1dbfb5
```

---

**最后更新**: 2026-02-25
**版本**: 1.0
