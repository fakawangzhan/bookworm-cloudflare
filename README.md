# BookWorm · Cloudflare 网文创作工作台

BookWorm 是中文 AI 网文创作工具，支持作品管理、故事设定、章节起草与修订、质量检查、关系图谱和投稿材料导出。前端、登录认证及 API 部署在同一个 Cloudflare Worker，数据存放在 D1，持久长任务由 Workflows 执行。

本仓库为 Cloudflare 独立源码版，可从源码构建，无需 Docker、VPS 或本机后台服务。仅使用 Workers、静态资源、D1 和 Workflows；AI 接口由你自行配置。

## 快速部署

准备 Node.js **22.12+（22 LTS）或 24+**、npm，以及已启用 Workers、D1 和 Workflows 的 Cloudflare 账号。

```bash
# 克隆源码
git clone https://github.com/fakawangzhan/bookworm-cloudflare.git
cd bookworm-cloudflare
npm ci
npm run deploy
```

也可在 Linux/macOS 执行 `bash install.sh`，或在 Windows 执行 `install.cmd`。脚本安装锁定依赖后运行相同部署流程。

首次部署打开 Cloudflare 授权页，创建或复用 `bookworm-db`，应用数据库迁移，配置凭据加密密钥，再发布 Worker。真实资源 ID 保存在被 Git 忽略的 `wrangler.local.jsonc`。已有部署迁移请先阅读[部署文档](docs/DEPLOYMENT.md)，填写原 Worker 名称、数据库 ID 和账号，避免连接到新数据库。

部署后立即访问输出的 HTTPS 地址，初始化系统管理员；在网页 AI 配置中添加接口地址、模型和 API Key，验证后分配剧情规划、章节起草、润色校对角色。

## 文档

- [部署与本地开发](docs/DEPLOYMENT.md)：首次部署、已有实例迁移、配置项、命令与排障。
- [使用指南](docs/USAGE.md)：初始化、AI 配置、作品与章节、质量检查、账号权限。
- [维护、备份与恢复](docs/OPERATIONS.md)：升级、导出、加密密钥与恢复流程。
- [源码清理说明](docs/CLEANUP.md)：保留范围、排除文件与验证记录。

## 源码结构

```text
src/          前端、同源 API、Workflows 与共享写作逻辑
public/       图标及登录插画等静态资源
scripts/      部署、源码打包与共享任务执行器
migrations/   D1 增量迁移（部署使用此目录）
schema.sql    历史基础建表脚本；不能替代完整增量迁移
tests/        部署与备份关键路径测试
docs/         中文部署、使用和运维文档
wrangler.jsonc          可提交的通用配置模板
wrangler.local.jsonc    自动生成的实际部署配置，不提交
```

## 开发与检查

```bash
npm ci
npm run check
npm test
npm run deploy:dry
```

`deploy:dry` 构建前端与源码备份，再由 Wrangler 检查 Worker 打包，不发布到 Cloudflare。完整本地开发方法见部署文档。

Git 忽略依赖、构建结果、本地数据库、日志、备份、`.dev.vars` 和账号配置。不要将含真实凭据的文件或系统备份加入版本库。

## 容量

Cloudflare 免费计划仍受 CPU、D1、Workflows 和每日用量限制；外部模型费用由 AI 提供商收取。源码允许单任务最多 1000 章、正文最多 12 Mi 字符、单章最多 50 万字符，但这不代表所有此类任务均可在免费配额内完成。大作品建议按卷处理，并在 Cloudflare 控制台观察实际用量。
