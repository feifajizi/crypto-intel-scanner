# 🚀 部署到 Vercel（完全免费）

## 步骤 1：准备 GitHub 仓库

1. 在 GitHub 上创建新仓库（public 或 private 都可以）
2. 上传这个项目：
   ```bash
   cd crypto-dashboard
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/你的用户名/仓库名.git
   git push -u origin main
   ```

## 步骤 2：部署到 Vercel

1. 访问 [vercel.com](https://vercel.com)
2. 用 GitHub 账号登录
3. 点击 "Add New" → "Project"
4. 选择你刚创建的 GitHub 仓库
5. 点击 "Deploy"（无需改任何配置）

完成！Vercel 会自动：
- 安装依赖
- 编译项目
- 部署到全球 CDN
- 分配一个 `.vercel.app` 域名

## 🔑 环境变量（可选）

如果想隐藏 API Key，在 Vercel 项目设置里添加：
- `CMC_API_KEY` = `c27e300eac7d4abcb513b028a217e2d5`

然后从 `vercel.json` 里删掉明文 API Key。

## 📊 维护

**基本不需要维护**：
- ✅ 数据自动更新
- ✅ 服务器自动运维
- ⚠️ 注意 CoinMarketCap 免费版限制：10,000 次/月

## 🔄 更新代码

每次推送到 GitHub，Vercel 会自动重新部署。

```bash
git add .
git commit -m "Update"
git push
```

---

**需要帮助？** 告诉 Koda！🦞
