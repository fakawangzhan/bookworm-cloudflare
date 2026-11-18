import { cloudBackup } from './cloudflare-backup.js';
import { cloudUser,roleIds,updateCloudUser } from './cloudflare-users.js';
import { cloudAiFetch } from './cloudflare-dispatch.js';
import { cloudCreation } from './cloudflare-creation.js';
import { cloudNovels } from './cloudflare-novels.js';
import { cloudConfigApi, authorizeCloudAi } from './cloudflare-config.js';
import aiWorker from './worker.js';
import { cloudKeywords } from './cloudflare-keywords.js';
import { cloudAiRegistry } from './cloudflare-ai-registry.js';
import { aiConfigApi } from './ai-config-api.js';
import { cloudEnvironment } from './cloudflare-environment.js';
import { longTaskApi, availableCloudProfiles, cloudTaskHealth } from './cloudflare-long-task.js';
export { BookwormLongTaskWorkflow } from './cloudflare-workflow.js';

const SESSION_DAYS = 30;
const cookie = (token, maxAge = SESSION_DAYS * 86400) => `bw_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'cache-control': 'no-store', ...headers } });
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const bytes = value => new TextEncoder().encode(String(value));
async function digest(value) { const hash = await crypto.subtle.digest('SHA-256', bytes(value)); return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join(''); }
// Cloudflare Workers Web Crypto currently accepts at most 100,000 PBKDF2
// iterations. Keep the same salted format while using the supported ceiling.
async function passwordHash(password, salt = crypto.randomUUID()) { if(typeof password!=='string'||password.length<8||password.length>256)throw new Error('密码长度需为 8–256 位。');const key = await crypto.subtle.importKey('raw', bytes(password), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(salt), iterations: 100000, hash: 'SHA-256' }, key, 256); return `${salt}$${await digest(String.fromCharCode(...new Uint8Array(bits)))}`; }
async function verifyPassword(password, encoded) { const [salt, expected] = String(encoded || '').split('$'); return Boolean(salt && expected && (await passwordHash(password, salt)).split('$')[1] === expected); }
function parseCookies(request) { return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(part => part.length === 2)); }
async function body(request, max = 128 * 1024 * 1024) { const length = Number(request.headers.get('content-length') || 0); if (length > max) throw Error('请求数据过大。'); return await request.json(); }
async function userFor(request, env) { const token = parseCookies(request).bw_session; if (!token) return null; const row = await env.DB.prepare('SELECT u.id,u.username,u.display_name,u.group_name,u.status FROM bw_users u JOIN bw_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND u.status="active"').bind(await digest(token), now()).first(); return cloudUser(env,row); }
function admin(user) { return user?.group === 'system_admin'; }
async function auth(request, env, path) {
  const method = request.method;
  if (method === 'GET' && path === '/api/auth/status') { const user = await userFor(request, env); const setting = await env.DB.prepare('SELECT value FROM bw_settings WHERE key=?').bind('auth.bootstrap_completed').first(); return json({ ok: true, bootstrapRequired: setting?.value !== '1', authenticated: Boolean(user), user }); }
  if (method === 'POST' && ['/api/auth/bootstrap', '/api/auth/register', '/api/auth/login'].includes(path)) {
    const input = await body(request, 1024 * 1024); const setting = await env.DB.prepare('SELECT value FROM bw_settings WHERE key=?').bind('auth.bootstrap_completed').first();
    if (path.endsWith('/bootstrap')) { if (setting?.value === '1') return json({ error: '系统管理员已经初始化。' }, 409); const username = String(input.username || 'admin').trim().toLowerCase(); const hash = await passwordHash(input.password); await env.DB.prepare('UPDATE bw_users SET username=?,display_name=?,password_hash=?,group_name="system_admin" WHERE id="user-system-admin"').bind(username, String(input.name || '系统管理员').slice(0, 100), hash).run(); await env.DB.prepare('INSERT OR REPLACE INTO bw_settings(key,value,updated_at) VALUES(?,?,?)').bind('auth.bootstrap_completed', '1', now()).run(); }
    else if (path.endsWith('/register')) { if (setting?.value !== '1') return json({ error: '请先初始化系统管理员。' }, 409); const username = String(input.username || '').trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9_.@-]{2,127}$/.test(username)) return json({ error: '用户名格式无效。' }, 400); const hash = await passwordHash(input.password); try { const userId = `user-${id()}`; await env.DB.prepare('INSERT INTO bw_users(id,username,display_name,password_hash,group_name,status,created_at,updated_at) VALUES(?,?,?,?,"user","active",?,?)').bind(userId, username, String(input.name || username).slice(0, 100), hash, now(), now()).run(); } catch { return json({ error: '用户名已存在。' }, 409); } }
    const row = await env.DB.prepare('SELECT * FROM bw_users WHERE username=?').bind(String(input.username || '').trim().toLowerCase()).first(); if (!row || row.status!=='active' || !(await verifyPassword(input.password, row.password_hash))) return json({ error: '用户名或密码不正确。' }, 401); const token = `${id()}${id().replaceAll('-', '')}`; await env.DB.prepare('INSERT INTO bw_sessions(id,token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?,?)').bind(id(), await digest(token), row.id, now(), new Date(Date.now() + SESSION_DAYS * 86400000).toISOString()).run(); return json({ ok: true, user: await cloudUser(env,row) }, 200, { 'set-cookie': cookie(token) });
  }
  if (method === 'POST' && path === '/api/auth/logout') { const token = parseCookies(request).bw_session; if (token) await env.DB.prepare('UPDATE bw_sessions SET revoked_at=? WHERE token_hash=?').bind(now(), await digest(token)).run(); return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) }); }
  const user = await userFor(request, env); if (!user) return json({ error: '请先登录。', code: 'AUTH_REQUIRED' }, 401);
  if (method === 'GET' && path === '/api/auth/me') return json({ ok: true, user });
  if (method === 'GET' && path === '/api/auth/users' && admin(user)) { const rows = await env.DB.prepare('SELECT id,username,display_name name,group_name groupName,status,created_at createdAt FROM bw_users ORDER BY created_at').all(); return json({ users: await Promise.all(rows.results.map(row=>cloudUser(env,{...row,display_name:row.name,group_name:row.groupName}))) }); }
  if (method === 'POST' && path === '/api/auth/users' && admin(user)) { const input = await body(request, 1024 * 1024); const roles=roleIds(input.roles||['lead_author']); const username = String(input.username || '').trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9_.@-]{2,127}$/.test(username)) return json({ error: '用户名格式无效。' }, 400); try { const userId = `user-${id()}`; await env.DB.prepare('INSERT INTO bw_users(id,username,display_name,password_hash,group_name,status,created_at,updated_at) VALUES(?,?,?,?,"user","active",?,?)').bind(userId, username, String(input.name || username).slice(0, 100), await passwordHash(input.password), now(), now()).run(); return json({ok:true,user:await updateCloudUser(env,user,userId,{roles},passwordHash)},201); } catch { return json({ error: '用户名已存在。' }, 409); } }
  const match=path.match(/^\/api\/auth\/users\/([\w-]+)$/);
  if(match&&method==='PATCH') {if(!admin(user))return json({error:'需要系统管理员权限。'},403);return json({ok:true,user:await updateCloudUser(env,user,match[1],await request.json(),passwordHash)});}
  return json({ error: '认证接口不存在。' }, 404);
}
export default { async fetch(request, env, ctx) {
  try {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith('/api/auth') && path.startsWith('/api/') && request.headers.get('x-nf-account-id') && request.headers.get('x-nf-account-id') !== (await userFor(request,env))?.id) return json({error:'账户会话已切换，请重新打开当前账户工作区。',code:'ACCOUNT_CHANGED'},409,{'x-nf-account-changed':'1'});
    if (path === '/api/health') { const tasks=await cloudTaskHealth(env),ai=await cloudAiRegistry(env).list(env);return json({ok:tasks.available,service:'bookworm-cloudflare',storage:'d1+workflows',envConfigured:ai.profiles.some(p=>p.id==='deepseek'),managedAiConfigured:ai.profiles.length>0,capabilities:tasks.capabilities}); }
    if (path.startsWith('/api/') && !['GET','HEAD','OPTIONS'].includes(request.method) && request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({error:'请求来源不匹配。'},403);
    if (path === '/api/environment' || path === '/api/environment/ai-check') {
      const user = await userFor(request, env);
      return await cloudEnvironment(request, env, user, admin(user));
    }
    if (path === '/api/local-ai-profiles' || path.startsWith('/api/ai-config')) {
      const user=await userFor(request,env);
      return await aiConfigApi(request,cloudAiRegistry(env),env,user,admin(user),async params => cloudAiFetch(await authorizeCloudAi(env,params,{configure:true}),env,{signal:request.signal}));
    }
    if (path.startsWith('/api/long-tasks')) { const user=await userFor(request,env);return await longTaskApi(request,env,path,user,admin(user)); }
    if (path.startsWith('/api/system-backup')) {const user=await userFor(request,env);return await cloudBackup(request,env,user,admin(user));}
    if (path.startsWith('/api/keywords')) { const user=await userFor(request,env);return await cloudKeywords(request,env,user,admin(user)); }
    if (path.startsWith('/api/auth')) return await auth(request,env,path);
    if (path === '/api/novels/creation') { const user=await userFor(request,env);if(!user)return json({error:'请先登录。'},401);const pending=cloudCreation(await request.json(),env,user,admin(user));ctx?.waitUntil(pending.catch(()=>{}));return json(await pending); }
    if (path.startsWith('/api/novels')) { const user=await userFor(request,env);return await cloudNovels(request,env,path,user,admin(user)); }
    if (path === '/api/generate' || path === '/api/models') {
      const user=await userFor(request,env);if(!user)return json({error:'请先登录。',code:'AUTH_REQUIRED'},401);
      env=await cloudAiRegistry(env).environment(env);
      const input=await authorizeCloudAi(env,await request.json());
      return path==='/api/generate' ? await cloudAiFetch(input,env,{signal:request.signal}) : await aiWorker.fetch(new Request(request.url,{method:request.method,headers:request.headers,body:JSON.stringify(input)}),env,ctx);
    }
    if (path.startsWith('/api/')) {const user=await userFor(request,env);return await cloudConfigApi(request,env,path,user,admin(user));}
    return env.ASSETS.fetch(request);
  } catch(error) { return json({error:error.message||'服务请求失败。',code:error.code},error.status||400); }
} };
