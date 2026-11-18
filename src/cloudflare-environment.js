import { environmentApi } from './environment-check.js';
import { cloudAiRegistry } from './cloudflare-ai-registry.js';
import { cloudSettings, authorizeCloudAi } from './cloudflare-config.js';
import { cloudAiFetch } from './cloudflare-dispatch.js';

export function cloudEnvironment(request, env, user, isAdmin) {
  return environmentApi(request, { user, isAdmin, env, registry: cloudAiRegistry(env), settings: () => cloudSettings(env),
    database: async () => { await env.DB.prepare('SELECT book_id FROM bw_books LIMIT 1').all(); },
    services: [
      { name: '数据库', path: 'D1 / DB / bookworm-db', port: '平台绑定', route: '/api/novels/session' },
      { name: '超级管理员配置', path: 'D1 / bw_settings / parameters.global.v1', port: '443', route: '/api/system-config' },
      { name: '全局 AI 配置', path: 'D1 / bw_settings / ai.registry.v1（凭据加密）', port: '443', route: '/api/environment/ai-check' },
      { name: '前端与程序接口', path: 'Workers / ASSETS', port: '443', route: '/api/health' },
      { name: '长任务与质量检查', path: 'Workers / LONG_TASK_WORKFLOW', port: '平台绑定', route: '/api/long-tasks/health' },
      { name: '词库与关系辅助', path: 'D1 / bw_keywords', port: '443', route: '/api/keywords/stats' }
    ],
    cache: {
      read: async key => { const row = await env.DB.prepare('SELECT value FROM bw_settings WHERE key=?').bind(key).first(); return row ? JSON.parse(row.value) : null; },
      claim: async (key, value, now) => Boolean((await env.DB.prepare("INSERT INTO bw_settings VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE json_extract(bw_settings.value,'$.expiresAt')<=? OR (json_extract(bw_settings.value,'$.signature')<>json_extract(excluded.value,'$.signature') AND COALESCE(json_extract(bw_settings.value,'$.pending'),0)=0)").bind(key, JSON.stringify(value), new Date().toISOString(), now).run()).meta.changes),
      finish: async (key, token, value) => env.DB.prepare("UPDATE bw_settings SET value=?,updated_at=? WHERE key=? AND json_extract(value,'$.token')=?").bind(JSON.stringify(value), new Date().toISOString(), key, token).run()
    },
    probe: async (params, signal) => cloudAiFetch(await authorizeCloudAi(env, params, { configure: true }), env, { signal })
  });
}
