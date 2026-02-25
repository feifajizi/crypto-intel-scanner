# 翻译功能测试指南

## 🧪 快速测试步骤

### 1. 环境准备
```bash
cd /Users/clawdtbot/.openclaw/workspace/crypto-dashboard

# 确保已设置 OpenAI API Key
export OPENAI_API_KEY=sk-xxxxxxxxxxxxx

# 或在 .env 文件中
echo "OPENAI_API_KEY=sk-xxxxxxxxxxxxx" > .env
```

### 2. 启动开发服务器
```bash
npm run dev
```

### 3. 浏览器测试

#### 打开应用
```
http://localhost:5173
```

#### 检查点

**✅ 英文推文自动翻译**
- 查找包含英文的推文
- 应该看到：
  ```
  原文（灰色小字）
  Hello, this is a test tweet about crypto markets
  
  译文（白色正常）
  你好，这是一条关于加密货币市场的测试推文
  ```

**✅ 中文推文不翻译**
- 查找纯中文推文
- 应该只显示原文，没有翻译

**✅ 翻译加载状态**
- 刷新页面
- 首次加载时应该看到 `⏳ 翻译中...` 提示

**✅ 缓存生效**
- 再次刷新页面
- 翻译结果应该立即显示（不重新请求）

### 4. 控制台检查

打开浏览器开发者工具（F12）：

**检查 localStorage**
```javascript
// 在 Console 中执行
localStorage.getItem('tweet_translations')
// 应该看到缓存的翻译结果
```

**检查网络请求**
```
Network > Filter: translate
// 首次加载会看到多个 /api/translate.js 请求
// 再次刷新应该没有新请求（使用缓存）
```

---

## 🔍 API 独立测试

### 测试翻译 API
```bash
# 测试英文翻译
curl "http://localhost:5173/api/translate.js?text=Hello%20World"

# 预期输出
{
  "translation": "你好世界",
  "source": "openai",
  "original": "Hello World"
}
```

### 测试错误处理
```bash
# 移除 API Key
unset OPENAI_API_KEY

# 重启服务器
npm run dev

# 测试 fallback
curl "http://localhost:5173/api/translate.js?text=Hello"

# 预期输出（原文返回）
{
  "translation": "Hello",
  "source": "fallback",
  "message": "Translation API not configured"
}
```

---

## 📊 性能测试

### 缓存命中率
```javascript
// 在浏览器 Console 中
let cache = JSON.parse(localStorage.getItem('tweet_translations') || '{}');
console.log(`缓存条目: ${Object.keys(cache).length}`);

// 清除缓存重新测试
localStorage.removeItem('tweet_translations');
location.reload();
```

### 翻译速度
```javascript
// 测量翻译时间
console.time('translation');
fetch('/api/translate.js?text=This is a test')
  .then(r => r.json())
  .then(data => {
    console.timeEnd('translation');
    console.log(data);
  });
```

---

## 🐛 故障排查

### 问题：翻译不显示

**检查清单**：
1. ✅ OPENAI_API_KEY 是否设置？
2. ✅ 推文是否为英文（>50% 英文字符）？
3. ✅ 打开 Network 面板，是否有 API 请求？
4. ✅ API 请求是否成功（状态码 200）？

**查看错误日志**：
```bash
# 服务器终端
# 应该显示任何 API 错误
```

### 问题：缓存不工作

**清除缓存重试**：
```javascript
localStorage.removeItem('tweet_translations');
location.reload();
```

### 问题：所有推文都在翻译

**检查语言检测**：
```javascript
// 在 Console 中测试
const isEnglish = (text) => {
  const englishChars = text.match(/[a-zA-Z]/g)?.length || 0;
  const totalChars = text.replace(/\s/g, '').length;
  return totalChars > 0 && (englishChars / totalChars) > 0.5;
};

// 测试中文
console.log(isEnglish('这是中文'));  // false

// 测试英文
console.log(isEnglish('This is English'));  // true

// 测试混合（偏英文）
console.log(isEnglish('Bitcoin 价格上涨'));  // false
console.log(isEnglish('The Bitcoin 价格'));  // true
```

---

## ✨ 预期效果截图说明

### 英文推文（已翻译）
```
┌───────────────────────────────────────────────┐
│ 🐦 @CryptoAnalyst • 2小时前              🔗  │
├───────────────────────────────────────────────┤
│ Breaking: Bitcoin surges to new ATH           │  ← 小字灰色
│ as institutional adoption grows               │
│                                               │
│ 突发：随着机构采用增长，                      │  ← 正常白色
│ 比特币飙升至新高                              │
│                                               │
│ [图片]                                        │
└───────────────────────────────────────────────┘
```

### 中文推文（无翻译）
```
┌───────────────────────────────────────────────┐
│ 🐦 @加密分析师 • 1小时前                 🔗  │
├───────────────────────────────────────────────┤
│ 今日市场分析：BTC 突破关键阻力位              │  ← 正常白色
│                                               │
│ [图片]                                        │
└───────────────────────────────────────────────┘
```

### 翻译中状态
```
┌───────────────────────────────────────────────┐
│ Market update: ETH showing strength           │
│                                               │
│ ⏳ 翻译中...                                  │  ← 紫色加载提示
└───────────────────────────────────────────────┘
```

---

## 📈 成功标准

### ✅ 功能验证
- [ ] 英文推文自动翻译
- [ ] 中文推文不翻译
- [ ] 中英文对照清晰显示
- [ ] 翻译缓存正常工作
- [ ] 加载状态显示正确

### ✅ 性能验证
- [ ] 首次翻译 < 2秒
- [ ] 缓存命中率 > 90%（刷新后）
- [ ] 无重复 API 请求

### ✅ 错误处理
- [ ] API 失败时显示原文
- [ ] 无错误提示打断用户

---

**测试完成后，可以部署到生产环境 🚀**
