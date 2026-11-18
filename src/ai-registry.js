import { managedAiProfiles } from './managed-ai.js';
import { sealAiCredential, openAiCredential } from './ai-credentials.js';

export const AI_REGISTRY_KEY = 'ai.registry.v1';
export const AI_ROLES = ['planner', 'drafter', 'polisher'];
const fail = (message, code = 'AI_CONFIG_INPUT', status = 400) => Object.assign(new Error(message), { code, status });
const empty = () => ({ version: 0, profiles: [], roles: {} });
const publicProfile = ({ credential, apiKey, ...p }) => ({ ...p, custom: true, serverManaged: true, serverVerified: p.verified === true });
const publicRecord = r => ({ version: r.version, roles: r.roles, profiles: r.profiles.map(publicProfile) });

// The adapters keep this record in SQLite / D1. Browser snapshots and public
// settings contain only metadata; encrypted credentials never leave the server.
export class AiRegistry {
  constructor({ read, write, secret, validateEndpoint = () => {} }) { Object.assign(this, { read, write, secret, validateEndpoint }); }
  async record() { return await this.read() || empty(); }
  async seed(env) {
    const configured = managedAiProfiles({ ...env, NF_MANAGED_AI_PROFILES: undefined });
    for (let attempt = 0; attempt < 3; attempt++) {
      const record = await this.record(), missing = configured.filter(p => !record.profiles.some(old => old.id === p.id));
      if (!missing.length) return record;
      const profiles = await Promise.all(missing.map(async ({ apiKey, ...p }) => ({ ...p, credential: await sealAiCredential(this.secret, apiKey) })));
      const next = { ...record, version: record.version + 1, profiles: [...record.profiles, ...profiles], updatedAt: new Date().toISOString() };
      if (await this.write(record.version, next)) return next;
    }
    throw fail('AI 配置正在更新，请稍后重试。', 'AI_CONFIG_CONFLICT', 409);
  }
  async list(env) { return publicRecord(await this.seed(env)); }
  async environment(env) {
    const record = await this.seed(env);
    const profiles = await Promise.all(record.profiles.map(async p => ({ ...p, apiKey: await openAiCredential(this.secret, p.credential) })));
    const official = profiles.find(p => p.id === 'deepseek');
    return { ...env, NF_MANAGED_AI_PROFILES: profiles,
      ...(official ? { DEEPSEEK_API_KEY: official.apiKey, DEEPSEEK_BASE_URL: official.endpoint, DEEPSEEK_MODEL: official.model } : {}) };
  }
  async candidate(input, record = null) {
    record ||= await this.record();
    const old = record.profiles.find(p => p.id === input?.id);
    if (!input || !/^[\w.-]{1,128}$/.test(input.id || '')) throw fail('AI 档案编号无效。');
    const endpoint = String(input.endpoint || old?.endpoint || '').trim().replace(/\/+$/, '');
    let url; try { url = new URL(endpoint); } catch { throw fail('AI 接口地址无效。'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'https:' || local && url.protocol === 'http:') || url.username || url.password || url.search || url.hash) throw fail('AI 接口须使用 HTTPS 或本机接口。');
    this.validateEndpoint(endpoint);
    const model = String(input.model || old?.model || '').trim(), label = String(input.label || old?.label || input.id).trim();
    if (!model || model.length > 300 || !label || label.length > 200 || endpoint.length > 2000) throw fail('AI 模型或名称无效。');
    const apiKey = typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : old ? await openAiCredential(this.secret, old.credential) : '';
    if ((!apiKey && !local) || apiKey.length > 10000) throw fail('请提供当前档案的访问凭据。');
    return { id: input.id, label, endpoint, model, apiKey };
  }
  async save(input, env) {
    const record = await this.seed(env);
    if (input.version !== record.version) throw fail('AI 配置已在其他管理页面更新，请重新载入；当前配置保留。', 'AI_CONFIG_CONFLICT', 409);
    if (!Array.isArray(input.profiles || []) || (input.profiles || []).length > 100) throw fail('AI 档案数量无效。');
    const profiles = [...record.profiles];
    for (const item of input.profiles || []) {
      const p = await this.candidate(item, record), old = profiles.find(v => v.id === p.id);
      const same = old && old.endpoint === p.endpoint && old.model === p.model && await openAiCredential(this.secret, old.credential) === p.apiKey;
      const { apiKey, ...metadata } = p;
      const saved = { ...metadata, verified: item.verified === true || Boolean(same && old.verified), credential: same ? old.credential : await sealAiCredential(this.secret, apiKey) };
      const index = profiles.findIndex(v => v.id === p.id);
      if (index < 0) profiles.push(saved); else profiles[index] = saved;
    }
    const roles = { ...record.roles };
    for (const [role, profileId] of Object.entries(input.roles || {})) {
      if (!AI_ROLES.includes(role) || !profiles.some(p => p.id === profileId && p.verified)) throw fail('角色必须绑定已通过验证的 AI 档案。');
      roles[role] = profileId;
    }
    if (JSON.stringify(profiles) === JSON.stringify(record.profiles) && JSON.stringify(roles) === JSON.stringify(record.roles)) return publicRecord(record);
    const next = { ...record, profiles, roles, version: record.version + 1, updatedAt: new Date().toISOString() };
    if (!await this.write(record.version, next)) throw fail('AI 配置已更新，请重新载入。', 'AI_CONFIG_CONFLICT', 409);
    return publicRecord(next);
  }
}
