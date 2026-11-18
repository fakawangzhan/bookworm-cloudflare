# 部署与本地开发

## 环境与资源

- Node.js 22.12+（22 LTS）或 24+，npm；建议使用 `.nvmrc` 指定的 22 LTS。
- Cloudflare 账号可创建 Workers、D1 和 Workflows。允许浏览器打开 Wrangler OAuth 授权页。
- AI 服务需提供云端可访问的公网 HTTPS 接口。Cloudflare 无法调用浏览器所在电脑的 localhost、Ollama 或内网地址。

使用 `npm ci` 安装锁文件中的依赖。安装需要开发依赖，不要使用 `--omit=dev`。`wrangler.jsonc` 是纯 JSON 写法的 JSONC 文件，部署工具通过 `JSON.parse` 读取，请不要手动添加注释或尾逗号。

## 全新部署

```bash
npm ci
npm run deploy
```

部署工具执行：

1. 首次复制 `wrangler.jsonc` 为 `wrangler.local.jsonc`，构建静态前端。
2. 检查 Cloudflare 登录，必要时打开 OAuth 页面；已设置 `CLOUDFLARE_API_TOKEN` 时使用该凭据。
3. 数据库 ID 为占位符时，查找并复用当前账号中同名的 D1，找不到才创建。
4. 执行 `d1 migrations apply DB --remote`，只应用未记录的增量迁移。
5. 同步本目录 `.dev.vars` 中可选的托管 AI 配置。首次自动生成 `TASK_CREDENTIAL_KEY` Secret，已有密钥保留。
6. 打包可恢复源码，发布 Worker、静态资源与 Workflow 绑定。

同名数据库可能属于已有实例。需要全新隔离部署时，先复制并修改本地配置中的资源名称，使用独立数据库名称。

```bash
cp wrangler.jsonc wrangler.local.jsonc
# Windows PowerShell: Copy-Item wrangler.jsonc wrangler.local.jsonc
```

在本地文件中设置 `name`（Worker）、`d1_databases[0].database_name`、`workflows[0].name`，然后部署。绑定名 `DB`、`ASSETS`、`LONG_TASK_WORKFLOW` 和 `class_name` 应保持现有值。

完成后立即打开发布地址并初始化管理员。首次访问时创建管理员密码，不存在可直接使用的默认密码。后续完成 AI 配置，见[使用指南](USAGE.md)。

## 接续已有 Cloudflare 实例

先备份现有数据库和 `TASK_CREDENTIAL_KEY`。复制模板生成本地配置，填回原 Worker 名、账号 `account_id`、D1 名称及 `database_id`、Workflow 名称和自定义域名路由；如有其他环境变量，一并迁移到本地配置或保留在控制台。

不要用模板的占位符替换实际部署配置。源码清理不需要删除或重建远程资源。

旧安装器曾逐个执行 SQL，不维护 D1 迁移历史。现有迁移设计为可重复执行，会保留作品、用户和设置；首次使用新部署工具时迁移可能重新应用一次。以后由 Wrangler 的 `d1_migrations` 表记录已应用版本。不要改写已发布的迁移文件，新结构修改增加新的编号文件。

```bash
npm ci
npm run check
npm test
npm run deploy:dry
npm run deploy
```

部署使用 `--keep-vars` 保留远程普通变量；本地配置中的同名变量仍会更新远程值。AI 档案在 D1 中已存在时，D1 配置为准；修改 `.dev.vars` 的旧同名档案不会覆盖网页中保存的档案。

## AI 与 Secret

推荐先部署，再由管理员在网页中添加和验证档案。也可从本目录 `.dev.vars.example` 复制 `.dev.vars`，填写自己的参数后部署。脚本不会从父目录或其他项目寻找凭据。

| 参数 | 用途 |
| --- | --- |
| `TASK_CREDENTIAL_KEY` | 加密 D1 AI 凭据及用户自定义长任务凭据；云端首次自动生成，恢复时使用原值 |
| `DEEPSEEK_API_KEY` | 可选，初始化官方 DeepSeek 托管档案 |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | 可选，官方档案地址和模型，默认 `https://api.deepseek.com` / `deepseek-chat` |
| `LOCAL_AI_NEWAPI_*` 等 | 可选兼容档案；完整前缀见 `.dev.vars.example` 与 `src/managed-ai.js` |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | 仅部署终端使用的 Cloudflare 管理凭据，不应提供给网页 |

`.dev.vars` 只供本地开发和部署读取，不自动变成线上普通变量。`npm run secrets:sync` 同步配置到选中的 Worker（需先生成本地配置），`npm run secrets:sync -- --dry-run` 仅展示参数名称，不连接远程服务。

不要给 API Key 加 `VITE_` 前缀，Vite 会将此类变量嵌入公开前端。线上 Secret 名称可通过 `npm run cf -- secret list` 查看；该命令不能取回 Secret 的值。

## 本地完整服务

```bash
npm ci
cp .dev.vars.example .dev.vars
# 生成一段随机密钥，把输出写入本地 .dev.vars 的 TASK_CREDENTIAL_KEY
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
npm run db:init:local
npm run dev
```

访问终端显示的 `http://localhost:8787`。首次本地启动同样需要初始化管理员。本地数据库保存在 `.wrangler/state`，与远程 D1 隔离；配置没有启用 `remote: true`。本地执行不消耗线上 D1 数据。

`npm run dev` 会先构建静态资源。需要前端热更新时，保持 Wrangler 运行，在另一终端运行 `npm run dev:web` 并访问其地址，Vite 将 `/api` 代理到 8787。单独运行 Vite 或 `npm run preview` 不能提供登录、D1 和长任务 API。

本地 Workflows 行为仍应在 Cloudflare 测试实例做一次实际任务验证，尤其是长耗时模型调用和恢复流程。

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 前端构建及系统备份源码打包 |
| `npm run check` / `npm test` | 语法、锁文件和部署关键路径检查 |
| `npm run deploy:dry` | 构建并验证 Worker 打包，不发布 |
| `npm run deploy` | 授权、数据库迁移、配置同步及部署 |
| `npm run db:init:local` | 应用本地 D1 迁移 |
| `npm run db:migrate` | 应用远程迁移，会修改线上数据库结构 |
| `npm run cf -- tail` | 查看当前 Worker 日志 |
| `npm run cf -- whoami` | 查看 Cloudflare 授权状态 |

`npm run cf -- ...` 自动选择 `wrangler.local.jsonc`；本地配置不存在时使用模板。直接执行 `npx wrangler ...` 不会自动选择本地配置，需手动附加 `--config wrangler.local.jsonc`。

## 常见问题

- **资源不存在或权限不足**：检查登录账号、本地 `account_id`、D1 ID 与 Workflow 名称是否属于当前账号；API Token 需具备对应资源的编辑权限。
- **`no such table`**：运行对应环境的迁移命令，确认没有误连新数据库。只执行 `schema.sql` 不足以完成全部升级。
- **健康检查成功但模型失败**：访问 `/api/health` 查看基础服务，登录后访问 `/api/long-tasks/health` 查看任务能力。模型还需通过网页实际验证；公网地址、API Key 和模型名称都应有效。
- **凭据解密失败**：检查 `TASK_CREDENTIAL_KEY` 是否与该数据库原值一致，不要重新生成或覆盖原密钥。
- **大任务失败或平台配额不足**：检查任务错误与 Cloudflare 用量，先停止重复提交，按卷拆分作品再执行。
- **域名或 HTTPS 问题**：先用发布返回的 workers.dev 地址排查，再在 Cloudflare 中配置自定义域名；会话依赖同源 API 与安全 Cookie。

参考：[Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)、[D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)、[Workflows](https://developers.cloudflare.com/workflows/)、[Workers Secret](https://developers.cloudflare.com/workers/configuration/secrets/)。
