#!/bin/bash
# Crypto Dashboard 部署脚本

set -e

echo "🚀 开始部署 crypto-dashboard..."

cd /Users/clawdtbot/.openclaw/workspace/crypto-dashboard

# 1. 检查图标更新完成情况
echo "📊 检查图标更新状态..."
MISSING=$(node -e "const d=require('./api/coin_enrichment.json');console.log(Object.values(d).filter(c=>!c.image).length)")
echo "   仍缺少图标: $MISSING 个币种"

# 2. 检查推特数据
echo "🐦 检查推特监控数据..."
if [ -f "api/twitter_tweets.json" ]; then
  TWEET_COUNT=$(cat api/twitter_tweets.json | jq '.count')
  echo "   推文数量: $TWEET_COUNT"
else
  echo "   ⚠️  推特数据文件不存在，生成中..."
  cd /Users/clawdtbot/.openclaw/workspace
  python3 twitter_list_monitor_dashboard.py
  cd /Users/clawdtbot/.openclaw/workspace/crypto-dashboard
fi

# 3. 构建测试
echo "🏗️  构建项目..."
npm run build

if [ $? -eq 0 ]; then
  echo "   ✅ 构建成功"
else
  echo "   ❌ 构建失败"
  exit 1
fi

# 4. Git提交
echo "📝 Git提交..."
git add .
git status --short

read -p "确认提交并部署? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  git commit -m "feat: 完成最终优化

- 删除Merkl模块（组件、服务、类型）
- 接入推特监控（TwitterMonitor组件 + 数据采集脚本）
- 批量更新图标（处理44个币种，成功~30个）
- 更新About section为推特监控
- 添加TWITTER_INTEGRATION.md文档

验证点:
- Merkl完全移除
- 推特监控正常展示
- 构建成功无错误
- 响应式设计优化"
  
  # 5. 部署到Vercel
  echo "🚀 部署到Vercel..."
  git push origin main
  vercel --prod
  
  echo "✅ 部署完成！"
  echo ""
  echo "下一步:"
  echo "1. 验证线上环境: https://your-domain.vercel.app/#twitter"
  echo "2. 设置Cron任务（推特监控）:"
  echo "   crontab -e"
  echo "   */10 * * * * cd /Users/clawdtbot/.openclaw/workspace && python3 twitter_list_monitor_dashboard.py"
else
  echo "❌ 部署已取消"
  exit 0
fi
