#!/bin/bash
# Crypto Dashboard 验证脚本

echo "🔍 验证 crypto-dashboard 优化完成情况..."
echo ""

cd /Users/clawdtbot/.openclaw/workspace/crypto-dashboard

# 1. 检查Merkl残留
echo "1️⃣  检查Merkl模块清理..."
MERKL_REFS=$(grep -r "MerklReward\|merklService\|MerklRewards" src/ 2>/dev/null | wc -l)
if [ "$MERKL_REFS" -eq "0" ]; then
  echo "   ✅ Merkl模块已完全移除"
else
  echo "   ❌ 发现Merkl残留引用:"
  grep -r "MerklReward\|merklService\|MerklRewards" src/
fi

# 2. 检查图标更新
echo ""
echo "2️⃣  检查图标更新情况..."
MISSING=$(node -e "const d=require('./api/coin_enrichment.json');const m=Object.entries(d).filter(([_,c])=>!c.image);console.log(m.length);if(m.length>0)console.log('Missing:',m.map(([s])=>s).join(', '))")
echo "   缺少图标: $MISSING"

# 3. 检查推特监控
echo ""
echo "3️⃣  检查推特监控集成..."
if [ -f "src/components/TwitterMonitor.tsx" ]; then
  echo "   ✅ TwitterMonitor.tsx 存在"
else
  echo "   ❌ TwitterMonitor.tsx 不存在"
fi

if [ -f "api/twitter_tweets.json" ]; then
  TWEET_COUNT=$(cat api/twitter_tweets.json | jq -r '.count // 0')
  LAST_UPDATE=$(cat api/twitter_tweets.json | jq -r '.last_update // "N/A"')
  echo "   ✅ twitter_tweets.json 存在"
  echo "      - 推文数: $TWEET_COUNT"
  echo "      - 最后更新: $LAST_UPDATE"
else
  echo "   ❌ twitter_tweets.json 不存在"
fi

APP_HAS_TWITTER=$(grep -c "TwitterMonitor" src/App.tsx)
if [ "$APP_HAS_TWITTER" -gt "0" ]; then
  echo "   ✅ App.tsx 已集成TwitterMonitor"
else
  echo "   ❌ App.tsx 未集成TwitterMonitor"
fi

# 4. 构建测试
echo ""
echo "4️⃣  构建测试..."
npm run build > /tmp/build.log 2>&1
if [ $? -eq 0 ]; then
  echo "   ✅ 构建成功"
  tail -5 /tmp/build.log
else
  echo "   ❌ 构建失败"
  tail -20 /tmp/build.log
fi

# 5. 文件检查
echo ""
echo "5️⃣  关键文件检查..."
FILES=(
  "TWITTER_INTEGRATION.md"
  "FINAL_OPTIMIZATION_SUMMARY.md"
  "deploy.sh"
  "src/components/TwitterMonitor.tsx"
  "api/twitter_tweets.json"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "   ✅ $file"
  else
    echo "   ❌ $file (不存在)"
  fi
done

echo ""
echo "✅ 验证完成！"
