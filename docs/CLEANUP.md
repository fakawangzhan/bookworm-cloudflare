# 源码清理说明

## 保留范围

Cloudflare 独立仓库保留完整前端、Worker API、D1 迁移、Workflows 和共享任务执行器，补回部署包遗漏的 `index.html`、`public/` 静态文件与源码构建能力。业务界面及写作逻辑保持原有实现。

Docker/VPS 部署包及旧发布压缩包不属于此 Cloudflare 源码仓库，未纳入 GitHub 提交。原文件在本机工作区保留，未删除远程资源或业务数据。

## 清理与修复

- 移除旧边缘代理入口 `src/edge-worker.js`，当前 Worker 不依赖该文件。
- 删除本地 `.wrangler` 调试数据库和缓存，将 `dist/`、嵌入的 `src/cloudflare-source.js` 改为构建生成。
- 移除不存在的本地服务、打包及浏览器测试 npm 命令，去掉未使用的 `lucide`、直接声明的 `undici` 和发布用 `playwright-core` 依赖（Wrangler 的间接依赖仍按锁文件保留），保留版本锁文件。
- 去除原 Cloudflare 账号 ID、D1 ID、个人第三方 AI 地址与“已验证”标记，使用通用配置模板。实际部署配置写入 `wrangler.local.jsonc`，不进入版本控制。
- Linux/macOS 与 Windows 入口共用 Node 部署流程，使用 `npm ci`，通过 D1 迁移历史避免每次发布重复执行 SQL。
- AI 配置同步只读取本目录 `.dev.vars` 或显式传入的文件，禁止自动读取其他项目凭据。
- 源码备份采用可移植打包逻辑，包含重新构建所需入口、静态资源、文档、迁移和部署脚本，排除本地凭据与账号配置。
- 增加中文文档、Git 忽略规则及只检查不部署的 GitHub Actions。

`schema.sql` 保留为历史基础脚本，正式建库和升级使用 `migrations/`。补充 `0009_book_parts_lookup.sql`，让纯迁移建库补齐旧基础脚本中的作品分块索引。

## 原始备份

清理前已将原 Cloudflare 目录完整归档到本机工作区之外的 `novel-forge/source-backups/bookworm-cloudflare-before-cleanup-20261118.tar.gz`。该归档包含历史配置和本地状态，不应上传 GitHub。它属于本机历史备份，不是新版本部署依赖。

## 验证

2026-11-18 已执行：

- `npm ci` 使用整理后的锁文件成功安装 80 个依赖包。
- `npm run check` 检查 94 个 JavaScript 文件；`npm test` 的 3 项部署/归档/凭据来源测试通过。
- 前端生产构建和 `wrangler deploy --dry-run` 通过；保留现有大于 500 kB 的前端分块提示，未扩展为性能重构。
- Wrangler 在本地 D1 应用全部 9 个迁移，再次应用无待执行迁移；内存 SQLite 重放验证历史数据和取消累计配额后的计量行为保留。
- 实际启动本地 Worker，静态首页、健康、初始化状态与长任务能力接口返回成功。
- Chromium 检查 1440 px 和 390 px 视口的初始化页面，无横向溢出，Tab 可聚焦表单，短密码显示校验反馈；完成本地管理员初始化并验证登录会话。
- 源码归档通过独立 tar 读取验证；提交清单排除凭据、账号配置、依赖、构建产物和数据库。

未执行 Cloudflare 生产部署或真实 AI 付费请求；Windows 入口已统一到 Node 流程，但未在 Windows 实机执行。

GitHub Actions 会执行 `npm ci`、`npm run check`、`npm test` 与 `npm run deploy:dry`。该流程不持有 Cloudflare 生产凭据，也不会自动部署。
