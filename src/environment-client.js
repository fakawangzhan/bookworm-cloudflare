import { ENVIRONMENT_PROTOCOL, SERVICE_ROLES } from './environment-check.js';
import { qualityBackendReady } from './quality-check.js';
import { GRAPH_BLOCK_PROTOCOL, CHAPTER_BATCH_PROTOCOL } from './large-text-contract.js';
import { NOVEL_STORAGE_PROTOCOL } from './novel-storage-contract.js';

export function initialEnvironment(admin = false) {
  const labels = admin ? [['database','数据库连接'],['admin','超级管理员配置与通信'],['global','全局辅助配置与通信'],['services','前后端接口与服务'],['ai','AI 通信与模型响应']] :
    [['database','数据库连接检测'],['ai','内置 AI 通信检测'],['services','程序服务接口检测'],['quality','质量检查协同检测']];
  return { admin, running: true, passed: false, checks: labels.map(([id, label]) => ({ id, label, status: 'pending', message: '等待检测' })), probes: [], snapshot: null, routes: {} };
}

export async function checkEnvironment({ admin, onUpdate = () => {}, request = fetch, signal, report = initialEnvironment(admin) }) {
  const update = (id, ok, message) => { const check = report.checks.find(c => c.id === id); if (check) Object.assign(check, { status: ok ? 'passed' : 'failed', message }); onUpdate(report); };
  const api = async (path, input, timeout = 15000) => {
    const response = await request(path, { method: input ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
      headers: { 'content-type': 'application/json', ...(path === '/api/novels/session' ? { 'x-nf-novel-request': '1' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.message || `接口暂不可用（HTTP ${response.status}）。`);
    return data;
  };
  report.running = true;
  report.checks.forEach(c => Object.assign(c, { status: 'running', message: '正在检测…' })); onUpdate(report);
  const results = await Promise.allSettled([
    api('/api/environment'), api('/api/novels/session'), api('/api/health'), api('/api/long-tasks/health'), api('/api/keywords/stats')
  ]);
  const [snapshot, session, health, tasks, keywords] = results.map(r => r.status === 'fulfilled' ? r.value : null);
  report.snapshot = snapshot;
  const valid = snapshot?.protocol === ENVIRONMENT_PROTOCOL;
  update('database', valid && snapshot.database === true && session?.protocol === NOVEL_STORAGE_PROTOCOL && Boolean(session.token), '数据库及当前账户作品接口' + (valid && snapshot.database && session?.protocol === NOVEL_STORAGE_PROTOCOL && session?.token ? '已连接。' : '未就绪，请检查服务与数据库。'));
  update('admin', valid && snapshot.checks?.admin?.ok, snapshot?.checks?.admin?.message || '管理配置接口不可用。');
  update('global', valid && snapshot.checks?.global?.ok, snapshot?.checks?.global?.message || '全局配置接口不可用。');
  const taskReady = tasks?.ok && (tasks.cloudflare ? tasks.available : tasks.runtime?.acceptsRequests || tasks.runtime?.sourceCurrent);
  const quality = taskReady && qualityBackendReady(tasks) && tasks.graphProtocol === GRAPH_BLOCK_PROTOCOL && tasks.batchProtocol === CHAPTER_BATCH_PROTOCOL;
  report.routes = { '/api/novels/session': report.checks[0].status === 'passed', '/api/system-config': Boolean(valid && snapshot.checks?.admin?.ok), '/api/health': health?.ok === true,
    '/api/long-tasks/health': Boolean(quality), '/api/keywords/stats': keywords?.protocol === 'local-keywords-v1' && Array.isArray(keywords.categories) };
  const services = valid && snapshot.serviceRuntimeReady !== false && health?.ok === true && taskReady && report.routes['/api/keywords/stats'];
  const configured = valid && snapshot.checks?.admin?.ok && snapshot.checks?.global?.ok;
  update('services', services && configured && (!admin || quality), services && configured && (!admin || quality) ? '前端、账户配置、程序接口、长任务及词库通信正常。' : !configured ? '系统配置尚未就绪，请管理员检查全局辅助。' : '程序接口、长任务或词库不可用，请检查服务状态。');
  update('quality', quality && configured, quality && configured ? '审查、修订、长文本与图谱协议一致。' : '质量协同服务或协议尚未就绪，请管理员检查。');
  if (configured) {
    const ids = [...new Set(Object.values(snapshot.roles || {}))].filter(Boolean);
    const probes = await Promise.allSettled(ids.map(async profileId => {
      const deadline = Date.now() + 90_000;
      for (;;) {
        const result = await api('/api/environment/ai-check', { profileId }, 70000);
        if (!result.pending) return result;
        if (Date.now() >= deadline) throw new Error('AI 检测等待超时，请重试。');
        await new Promise(resolve => setTimeout(resolve, 2000)); signal?.throwIfAborted();
      }
    }));
    report.probes = probes.map((r, i) => r.status === 'fulfilled' ? r.value : { profileId: ids[i], ok: false, message: 'AI 通信未完成，请稍后重试。' });
    const ok = ids.length > 0 && report.probes.every(p => p.ok === true);
    report.routes['/api/environment/ai-check'] = ok;
    update('ai', ok, ok ? (report.probes.every(p => p.cached) ? '当前配置已通过近期真实响应检测。' : '创作及审校角色使用的模型已返回有效内容。') : '内置 AI 未全部响应成功，请稍后重试或联系管理员。');
  } else update('ai', false, '等待管理员完成全局配置与角色绑定后检测。');
  report.running = false; report.passed = report.checks.every(c => c.status === 'passed'); report.checkedAt = new Date().toISOString(); onUpdate(report);
  return report;
}

export function environmentDetails(report, h) {
  if (!report.admin || !report.snapshot) return '';
  const s = report.snapshot, profiles = s.profiles || [];
  return `<details class="environment-details"><summary>查看当前服务、内置模型与配置来源</summary><div class="environment-table-wrap"><table><thead><tr><th>辅助功能</th><th>AI 服务商 / 档案</th><th>模型</th><th>响应</th></tr></thead><tbody>${Object.entries(SERVICE_ROLES).map(([role, label]) => {
    const p = profiles.find(p => p.id === s.roles?.[role]), result = report.probes.find(r => r.profileId === p?.id);
    return `<tr><td>${h(label)}</td><td>${h(p?.label || '未配置')}<small>${h(p?.endpoint || '')}</small></td><td>${h(p?.model || '未配置')}</td><td>${result?.ok ? `${result.elapsedMs} ms${result.cached ? ' · 近期结果' : ''}` : result ? '未通过' : '待检测'}${result?.checkedAt ? `<small>${h(new Date(result.checkedAt).toLocaleString('zh-CN'))}</small>` : ''}</td></tr>`;
  }).join('')}</tbody></table><table><thead><tr><th>服务</th><th>配置来源 / 接口</th><th>响应端口</th><th>状态</th></tr></thead><tbody><tr><td>浏览器前端</td><td>${h(globalThis.location?.origin || '同源页面')}</td><td>${h(globalThis.location?.port || (globalThis.location?.protocol === 'https:' ? '443' : '80'))}</td><td>已加载</td></tr>${(s.services || []).map(service => `<tr><td>${h(service.name)}</td><td>${h(service.path)}<small>${h(service.route)}</small></td><td>${h(service.port)}</td><td>${report.routes[service.route] ? '正常' : '未通过'}</td></tr>`).join('')}</tbody></table></div><p>检测反映当前及近期响应状态；后续任务继续沿用数据库配置，检测不会修改小说或自动切换模型。</p></details>`;
}

export function environmentView(report, h, repair = '') {
  return `<main class="environment-shell"><section class="panel environment-card"><span class="panel-kicker">BookWorm · ${report.admin ? '系统服务检测' : '创作环境检测'}</span><h1>${report.running ? '正在检查创作环境' : report.passed ? '创作环境已就绪' : '请先完成环境检测'}</h1><p>检测通过后进入写作方式选择；后续使用已保存的系统配置。</p><ol class="environment-checks" aria-live="polite">${report.checks.map(c => `<li data-environment-check="${c.id}" data-status="${c.status}"><span class="environment-indicator">${c.status === 'passed' ? '✓' : c.status === 'failed' ? '!' : '…'}</span><div><b>${h(c.label)}</b><p>${h(c.message)}</p></div><small>${({pending:'待检测',running:'检测中',passed:'正常',failed:'未通过'})[c.status]}</small></li>`).join('')}</ol>${environmentDetails(report, h)}<div class="environment-actions"><button class="button primary" data-environment-retry ${report.running ? 'disabled' : ''}>重新检测</button>${report.admin ? `<button class="button secondary" data-environment-repair ${report.running ? 'disabled' : ''}>${repair ? '收起配置' : '检查与修复配置'}</button>` : ''}<button class="button secondary" data-auth-logout>退出登录</button></div>${!report.running && !report.passed ? '<p class="environment-help">当前页面保留。可重试失败项；系统配置问题请由管理员处理。</p>' : ''}</section>${repair ? `<section class="environment-repair">${repair}</section>` : ''}</main>`;
}
