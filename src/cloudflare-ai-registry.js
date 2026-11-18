import { AiRegistry, AI_REGISTRY_KEY } from './ai-registry.js';
export function cloudAiRegistry(env) {
  return new AiRegistry({ secret: env.TASK_CREDENTIAL_KEY,
    validateEndpoint: endpoint => { const u=new URL(endpoint);if(u.protocol!=='https:'||/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname))throw Object.assign(new Error('云端 AI 需要可公网访问的 HTTPS 接口。'),{code:'AI_CONFIG_INPUT',status:400}); },
    read: async () => { const r = await env.DB.prepare('SELECT value FROM bw_settings WHERE key=?').bind(AI_REGISTRY_KEY).first(); return r ? JSON.parse(r.value) : null; },
    write: async (version, record) => Boolean((await env.DB.prepare("INSERT INTO bw_settings VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE json_extract(bw_settings.value,'$.version')=?").bind(AI_REGISTRY_KEY, JSON.stringify(record), record.updatedAt, version).run()).meta.changes)
  });
}
