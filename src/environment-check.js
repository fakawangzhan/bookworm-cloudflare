import { AI_ROLES } from './ai-registry.js';
import { selectGlobal } from './global-config.js';

export const ENVIRONMENT_PROTOCOL = 'bookworm-environment-v1';
const SUCCESS_TTL = 5 * 60_000;
const FAILURE_TTL = 20_000;
const LEASE_TTL = 75_000;
export const SERVICE_ROLES = { planner: '剧情规划', drafter: '章节起草', polisher: '润色校对 / 质量审查与修订' };
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(v => v.toString(16).padStart(2, '0')).join('');

// All adapters read the authoritative database. No credentials, saved probe
// responses or provider error bodies are exposed by this diagnostic endpoint.
export async function environmentApi(request, { user, isAdmin, registry, env, settings, database, services, cache, probe, runtime }) {
  if (!user) return json({ error: '请先登录。', code: 'AUTH_REQUIRED' }, 401);
  const path = new URL(request.url).pathname;
  if (!(request.method === 'GET' && path === '/api/environment' || request.method === 'POST' && path === '/api/environment/ai-check')) return json({ error: '检测接口不支持此操作。' }, 405);
  const config = await settings(), record = await registry.seed(env);
  const verified = record.profiles.filter(p => p.verified);
  const roles = Object.fromEntries(AI_ROLES.map(role => [role, record.roles[role] || verified[0]?.id || '']));
  const roleReady = AI_ROLES.every(role => verified.some(p => p.id === roles[role]));
  let valid = false;
  try { selectGlobal(config.settings, { strict: true }); valid = config.version > 0; } catch { /* Report invalid stored values without replacing them. */ }
  const adminReady = valid && config.settings.globalAssist?.adminConfirmed === true && config.settings.adminSettings?.maintenanceMode !== true;
  const globalReady = valid && config.settings.globalAssist?.programmerConfirmed === true && roleReady;
  if (request.method === 'GET') {
    await database();
    return json({ protocol: ENVIRONMENT_PROTOCOL, database: true, configVersion: config.version, aiVersion: record.version, roles, serviceRuntimeReady: !runtime || Boolean(runtime.acceptsRequests || runtime.sourceCurrent),
      checks: {
        admin: { ok: adminReady, message: adminReady ? '权限配置已保存，当前允许提供服务。' : config.settings.adminSettings?.maintenanceMode ? '系统维护中，请管理员关闭维护模式后重新检测。' : '请管理员保存并确认超级管理员配置。' },
        global: { ok: globalReady, message: globalReady ? '全局配置与创作角色绑定可用。' : '请管理员确认全局辅助配置及三个创作角色的内置 AI。' }
      },
      ...(isAdmin ? { services, runtime, profiles: verified.map(({ id, label, model, endpoint }) => ({ id, label, model, endpoint })) } : { profileIds: verified.map(p => p.id) })
    });
  }
  if (!adminReady || !globalReady) return json({ ok: false, error: '系统配置尚未就绪，请管理员完成配置后重新检测。' }, 409);
  const input = await request.json();
  // The caller can select only an existing verified built-in. Endpoint, key,
  // prompt, output budget and thinking policy always come from the server.
  const profile = verified.find(p => p.id === input.profileId);
  if (!profile) return json({ ok: false, error: '该内置 AI 尚未配置完成，请联系管理员。' }, 400);
  const signature = await digest([profile, config.version, config.settings.programmerSettings?.deepThinking]);
  const key = 'environment.ai.' + profile.id;
  const previous = await cache.read(key), current = Date.now();
  if (previous?.signature === signature && previous.expiresAt > current) {
    if (previous.pending) return json({ ok: false, pending: true, retryAfter: 2 }, 202);
    return json({ ...previous.result, cached: true });
  }
  const token = crypto.randomUUID();
  if (!await cache.claim(key, { signature, token, pending: true, expiresAt: current + LEASE_TTL }, current)) return json({ ok: false, pending: true, retryAfter: 2 }, 202);
  const start = Date.now();
  let result;
  try {
    const candidate = await registry.candidate({ id: profile.id }, record);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
    const response = await probe({ ...candidate, profileId: candidate.id, custom: true, prompt: '连接检测，请只回复 OK。', maxTokens: 512, timeout: 55, stream: true,
      thinking: config.settings.programmerSettings?.deepThinking ? 'enabled' : 'disabled' }, signal);
    const data = await response.json();
    result = { ok: response.ok && typeof data.content === 'string' && Boolean(data.content.trim()), httpStatus: response.status };
  } catch { result = { ok: false }; }
  result = { ...result, profileId: profile.id, checkedAt: new Date().toISOString(), elapsedMs: Date.now() - start,
    message: result.ok ? '模型已返回有效内容。' : '模型通信未通过，请稍后重试或联系管理员检查额度、接口及模型。' };
  await cache.finish(key, token, { signature, result, expiresAt: Date.now() + (result.ok ? SUCCESS_TTL : FAILURE_TTL) });
  return json({ ...result, cached: false });
}
