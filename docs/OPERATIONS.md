# 维护、备份与恢复

## 升级发布

升级前让作品保存完成，停止需要暂停的长任务并完成备份。保留 `wrangler.local.jsonc` 和凭据加密密钥；它们不会随 Git 更新。

```bash
git pull --ff-only
npm ci
npm run check
npm test
npm run deploy:dry
npm run deploy
```

更新后的通用模板不会自动覆盖已有本地配置。新增绑定、路由或普通变量时，对照 `wrangler.jsonc` 手动更新 `wrangler.local.jsonc`。数据库结构更新应增加新迁移，不能只修改 `schema.sql`。

部署会应用新的 D1 迁移，不能通过代码回滚撤销数据库变更。需要回滚代码时，在独立工作目录检出此前的可用提交，复用正确的本地配置与 Secret，验证其兼容当前数据库后发布。

## 系统备份

系统管理员可在网页中执行系统备份。源码分块与业务表数据由同源接口读取，浏览器生成 ZIP，其中包括：

- `source.tar.gz`：该版本源码、静态产物、文档、通用配置及部署工具。
- `database.sql`：`bw_*` 业务表结构与数据，排除诊断日志 `bw_service_logs` 和临时并发租约 `bw_ai_leases`。
- `.dev.vars`：部署所需 AI 凭据及 `TASK_CREDENTIAL_KEY`。
- `README.txt`：恢复提示。

业务数据变化可能使一致性校验失败。备份前停止任务写入并完成保存，失败后重新备份。系统备份没有包含所有自定义 Cloudflare 环境配置、域名、账号 ID、DNS 或迁移历史；实际资源配置另行保管。

`TASK_CREDENTIAL_KEY` 用于解密已存储的 AI 访问凭据与自定义任务凭据。数据库和该密钥必须成对保存。更换密钥会使旧加密数据无法读取；不要通过删除 Secret 来修复部署问题。

系统备份包含 AI 密钥、会话和密码哈希等敏感数据，仅授权管理员保管。普通 GitHub 源码不应包含这些文件。

## 单独导出 D1

```bash
# 此命令导出线上数据库，输出文件应放到工作区外安全位置
npm run cf -- d1 export DB --remote --output ../bookworm-d1-backup.sql
```

D1 SQL 导出不包含 Workers Secrets。Cloudflare 的 Secret 列表只显示名称，不返回值。需要完整恢复时，优先使用网页系统备份并另外保管实际部署配置。

## 从系统备份恢复

恢复目标使用**新的空 D1 数据库**。不要把 SQL 导入已有业务库；导入不是合并或自动回滚操作。

1. 解压 ZIP，再将 `source.tar.gz` 解压到独立目录。把备份中的 `.dev.vars` 放入源码根目录，确认保留原 `TASK_CREDENTIAL_KEY`。
2. 安装依赖并创建本地配置：

```bash
npm ci
cp wrangler.jsonc wrangler.local.jsonc
# Windows PowerShell 使用 Copy-Item
npm run cf -- login
npm run cf -- d1 create bookworm-restored-db --no-update-config
```

3. 编辑 `wrangler.local.jsonc`：填写目标账号 `account_id`、新的数据库名及返回的 `database_id`，并选择恢复后的 Worker、Workflow 名称和路由。需要并行验证时使用独立名称。
4. 将备份数据库导入新库，再运行完整部署：

```bash
npm run cf -- d1 execute DB --remote --file /path/to/database.sql
npm run deploy
```

部署应用幂等增量迁移，补回索引、触发器、日志和租约表，建立迁移历史，并从 `.dev.vars` 恢复 Secret。目标 Worker 如果已有不同的 `TASK_CREDENTIAL_KEY`，自动同步会保留它，不能用于这份数据库：请先核实并通过下列命令在隐藏输入中填入备份的原值。

```bash
npm run cf -- secret put TASK_CREDENTIAL_KEY
```

5. 使用原账号密码登录恢复站点，验证作品列表、正文、AI 配置和一个小任务。旧任务可能引用旧账号下的 Workflow 实例；保留结果和正文快照，遇到实例不存在时重新提交任务。
6. 确认恢复成功后再调整正式域名和访问入口。

## 日志与健康检查

```bash
npm run cf -- tail
```

`/api/health` 检查服务与能力；登录后 `/api/long-tasks/health` 检查任务绑定及数据表。AI 连通性需要网页环境检查或实际模型请求验证。排查时不要将含密钥、正文或系统备份的数据粘贴到公开 Issue。

Cloudflare 额度与费用分别查看 Workers、D1、Workflows 控制台，模型费用查看对应服务商账单。参考：[D1 导入导出](https://developers.cloudflare.com/d1/best-practices/import-export-data/)、[Workflows 限制](https://developers.cloudflare.com/workflows/platform/limits/)。
