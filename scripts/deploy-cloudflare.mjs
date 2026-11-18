import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, wrangler, localConfig, templateConfig } from './cloudflare-cli.mjs';
import { syncCloudflareAi } from './sync-cloudflare-ai.mjs';

export function databaseId(record) {
  return record?.uuid || record?.database_id || record?.result?.uuid || record?.result?.database_id;
}

export async function deploy() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 12 || major === 23) {
    throw new Error('请使用 Node.js 22.12+（22 LTS）或 24+。');
  }
  try { await access(localConfig); }
  catch { await writeFile(localConfig, await readFile(templateConfig)); }
  const config = JSON.parse(await readFile(localConfig, 'utf8'));

  // Validate/build before making any remote changes.
  const build = spawnSync(process.execPath, [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: ROOT, stdio: 'inherit'
  });
  if (build.status !== 0) throw new Error('前端构建失败，部署已停止。');

  if (process.env.CLOUDFLARE_API_TOKEN) {
    wrangler(['whoami'], { config: localConfig });
  } else {
    // whoami may exit successfully while logged out; check its actual output.
    let identity = '';
    try { identity = wrangler(['whoami'], { capture: true, config: localConfig }); } catch {}
    if (!/You are logged in/i.test(identity)) {
      console.log('即将打开 Cloudflare 浏览器授权。');
      wrangler(['login'], { config: localConfig });
    }
    wrangler(['whoami'], { config: localConfig });
  }

  const db = config.d1_databases?.find(item => item.binding === 'DB');
  if (!db) throw new Error('wrangler.local.jsonc 缺少 DB 绑定。');
  if (!db.database_id || db.database_id === 'REPLACE_WITH_D1_DATABASE_ID') {
    const listed = JSON.parse(wrangler(['d1', 'list', '--json'], { capture: true, config: localConfig }));
    const databases = Array.isArray(listed) ? listed : listed.result || [];
    const existing = databases.find(item => item.name === db.database_name);
    let selected = existing;
    if (!selected) {
      // d1 create prints a configuration snippet, not JSON. Look up the new
      // resource through d1 list, whose --json interface is supported.
      wrangler(['d1', 'create', db.database_name, '--no-update-config'], { config: localConfig });
      const refreshed = JSON.parse(wrangler(['d1', 'list', '--json'], { capture: true, config: localConfig }));
      selected = (Array.isArray(refreshed) ? refreshed : refreshed.result || [])
        .find(item => item.name === db.database_name);
    }
    db.database_id = databaseId(selected);
    if (!db.database_id) throw new Error('无法解析 D1 数据库 ID，请在 wrangler.local.jsonc 中填写。');
    await writeFile(localConfig, JSON.stringify(config, null, 2) + '\n');
    console.log(`D1 ${db.database_name}：${existing ? '复用已有数据库' : '已创建'}。`);
  }

  // All historical migrations are additive/idempotent, including on databases
  // created by the old installer which did not keep a migration history.
  wrangler(['d1', 'migrations', 'apply', 'DB', '--remote'], { config: localConfig });
  await syncCloudflareAi({ target: ROOT, configPath: localConfig });
  const { buildCloudflareSource } = await import('./build-cloudflare-source.mjs');
  await buildCloudflareSource(ROOT);
  wrangler(['deploy', '--keep-vars'], { config: localConfig });
  console.log('部署完成。首次访问请立即初始化系统管理员，并在网页中配置、验证 AI 档案。');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
}
