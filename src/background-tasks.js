import { CHAPTER_TASK_PROTOCOL } from './chapter-task-contract.js';
import { BOOK_AUDIT_PROTOCOL, AUDIT_CONCURRENCY } from './book-audit-contract.js';
import { LARGE_TEXT_PROTOCOL } from './large-text-contract.js';
const KEY = 'novelforge-local-task-capability-v1';
export function auditResumeBlocked(status) {
  // Historical quota exhaustion never prevents resuming the same task.
  return false;
}
function capability() {
  let token = localStorage.getItem(KEY);
  if (!token) { token = [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join(''); localStorage.setItem(KEY, token); }
  return token;
}
export function createBackgroundTasks(aiOptions) {
  async function api(path, method = 'GET', payload) {
    let response;
    try { response = await fetch(`/api/long-tasks${path}`, { method, headers: { 'content-type': 'application/json', 'x-nf-task-scope': capability() },
      signal: AbortSignal.timeout(60000), ...(payload ? { body: JSON.stringify(payload) } : {}) }); }
    catch { throw new Error('后台任务服务暂时无法连接，已保存任务不会被删除。请检查网络和服务状态。'); }
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || `后台任务请求失败（HTTP ${response.status}）`);
    return value;
  }
  const query = ref => `?${new URLSearchParams({ bookId: ref.bookId, ownerId: ref.ownerId })}`;
  return {
    health: () => api('/health'),
    start: async (kind, snapshot, signature, context, profileId, options = {}) => {
      if (kind === 'quality') {
        const health = await api('/health');
        if (health.auditProtocol !== BOOK_AUDIT_PROTOCOL) throw new Error('请先重启本地服务以加载新版全本审查；旧方案已停用，本次尚未提交。');
        if (health.cloudflare ? !health.available : (!(health.runtime?.acceptsRequests || health.runtime?.sourceCurrent) || !health.runtime?.instanceId)) throw new Error('后台长任务服务尚未就绪，请检查服务启动状态。');
      }
      if (kind==='graph'||kind==='chapter-batch') {
        const health=await api('/health');
        if(health.largeTextProtocol!==LARGE_TEXT_PROTOCOL||(health.cloudflare ? !health.available : !(health.runtime?.acceptsRequests||health.runtime?.sourceCurrent)))throw new Error('本地长文本服务协议不匹配或尚未就绪，请检查服务启动状态。');
      }
      if (kind.startsWith('chapter-')&&kind!=='chapter-batch') {
        const health = await api('/health');
        if (health.chapterProtocol !== CHAPTER_TASK_PROTOCOL) throw new Error('本地章节任务服务尚未加载新版，请重启本地长篇任务服务后重试。原稿和已保存的任务保留。');
      }
      const base = aiOptions(kind === 'graph' ? 'planner' : 'polisher', profileId, { strict:['quality','graph','chapter-batch'].includes(kind) });
      const record = await api('', 'POST', { kind, snapshot, signature, context, ...base, ...(kind==='graph'&&options.profiles?{profiles:options.profiles}:{}), config: { ...base.config, ...(kind==='quality'?{auditConcurrency:AUDIT_CONCURRENCY}:{}), ...(options.config || {}) } });
      if (kind !== 'quality') return record;
      const profile=base.profiles[0];
      return {...record,submittedProfile:{id:profile.id,label:profile.label,model:profile.model}};
    },
    status: ref => api(`/${ref.id}${query(ref)}`),
    list: ref => api(query(ref)),
    result: ref => api(`/${ref.id}/result${query(ref)}`),
    control: (ref, action) => api(`/${ref.id}/${action}${query(ref)}`, 'POST', action==='resume'?{thinking:aiOptions(ref.kind==='graph'?'planner':'polisher').config?.thinking || 'disabled'}:undefined),
    facts: (ref, offset = 0) => api(`/${ref.id}/facts${query(ref)}&offset=${offset}`),
    evidence: (ref, chapterId, start = 0) => api(`/${ref.id}/evidence${query(ref)}&chapterId=${chapterId}&start=${start}`)
  };
}

// Shared by automatic creation: all book audits use the same durable budget.
export async function runBudgetBookAudit({backend,snapshot,signature,context,ref,onRef,check,progress,signal}) {
  if (!backend) throw new Error('全本审查需要本地任务服务，请启动新版服务。');
  check();
  if (!(ref?.revision===BOOK_AUDIT_PROTOCOL && ref.bookId===snapshot.bookId && ref.ownerId===snapshot.ownerId && ref.signature===signature)) ref=null;
  try {
    // Submission deduplicates an unchanged snapshot/model on the server. A
    // changed role binding must not resume the old task's immutable profile.
    ref=await backend.start('quality',snapshot,signature,context);
    onRef(ref); check();
    if (['paused','cancelled'].includes(ref.status)) {
      ref={...ref,...await backend.control(ref,'resume')};onRef(ref);
    }
    while (['queued','running'].includes(ref.status)) {
      check();progress(`${ref.message||'全本审查'} · 已请求 ${ref.budget?.used||0} 次`);
      await new Promise((resolve,reject)=>{
        signal?.throwIfAborted();
        const abort=()=>{clearTimeout(timer);reject(signal.reason||new DOMException('已暂停','AbortError'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},2000);
        signal?.addEventListener('abort',abort,{once:true});
      });
      check();ref=await backend.status(ref);onRef(ref);
    }
    check();if(ref.status!=='completed')throw new Error(ref.error||'全本审查未完成，已保存进度。');
    const result=await backend.result(ref);check();
    if(result.scanProtocol!==BOOK_AUDIT_PROTOCOL||result.signature!==signature||result.bookId!==snapshot.bookId||result.ownerId!==snapshot.ownerId)
      throw new Error('全本审查结果与当前作品版本不一致。');
    return result;
  } catch(e) {
    if(ref?.revision===BOOK_AUDIT_PROTOCOL && ['queued','running'].includes(ref.status)) await backend.control(ref,'pause').catch(()=>{});
    throw e;
  }
}
