import { authorizeCloudAi } from './cloudflare-config.js';
import { BOOK_AUDIT_PROTOCOL } from './book-audit-contract.js';
import { LONG_TASK_PROTOCOL, LONG_TASK_REVISION } from './long-task-contract.js';
import { CHAPTER_TASK_PROTOCOL } from './chapter-task-contract.js';
import { LARGE_TEXT_PROTOCOL, GRAPH_BLOCK_PROTOCOL, CHAPTER_BATCH_PROTOCOL, stableBlockPlan } from './large-text-contract.js';
import { prepareBookAudit } from '../scripts/book-audit-engine.mjs';
import { chapterOptions } from '../scripts/chapter-task-engine.mjs';
import { modelIdentity } from '../scripts/large-text-reuse.mjs';
import { hash, now } from '../scripts/task-utils.mjs';
import { cloudProfile } from './cloudflare-ai.js';
import { budgetFor, loadCloudJob, putTaskBlob, taskBlob } from './cloudflare-task-storage.js';
export { availableCloudProfiles } from './cloudflare-ai.js';
import { cloudAiRegistry } from './cloudflare-ai-registry.js';
export const CF_LONG_TASK_PROTOCOL='cloudflare-long-book-v2';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
const kinds=['quality','graph','chapter-batch','chapter-quality','chapter-revision'];
export async function cloudTaskHealth(env){
  let database=false;try{database=!!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bw_task_state'").first();}catch{}
  const available=database&&typeof env.LONG_TASK_WORKFLOW?.create==='function';
  return {ok:available,cloudflare:true,available,protocol:LONG_TASK_PROTOCOL,revision:LONG_TASK_REVISION,cloudProtocol:CF_LONG_TASK_PROTOCOL,
    auditProtocol:BOOK_AUDIT_PROTOCOL,chapterProtocol:CHAPTER_TASK_PROTOCOL,
    largeTextProtocol:LARGE_TEXT_PROTOCOL,graphProtocol:GRAPH_BLOCK_PROTOCOL,batchProtocol:CHAPTER_BATCH_PROTOCOL,
    capabilities:Object.fromEntries(['longTasks',...kinds,'pause','resume','cancel'].map(k=>[k,available])),storage:'d1+workflows',
    runtime:{acceptsRequests:available,sourceCurrent:true,instanceId:CF_LONG_TASK_PROTOCOL},...(available?{}:{message:'云端数据库迁移或 Workflow 绑定尚未就绪，请运行 Cloudflare 部署脚本。'})};
}
async function statusFor(env,id){
 const row=await env.DB.prepare('SELECT t.*,s.chapter_id,s.total_characters,s.revision,s.quality_root,s.root_limit,s.root_used FROM bw_long_tasks t LEFT JOIN bw_task_state s ON s.task_id=t.id WHERE t.id=?').bind(id).first();if(!row)return null;
 // Platform termination (CPU quota, expired instance, unexpected runtime
 // failure) must not leave the UI polling a permanently running DB row.
 if(row.workflow_id&&['queued','running'].includes(row.status)&&Date.now()-Date.parse(row.updated_at)>30000){
  try{const instance=await env.LONG_TASK_WORKFLOW.get(row.workflow_id),runtime=await instance.status();
   if(['errored','terminated'].includes(runtime.status)){
    const message='云端执行实例已停止，已保存进度和用量记录；请检查资源配额后继续。';
    const changed=await env.DB.prepare("UPDATE bw_long_tasks SET status='paused',error=?,message=?,updated_at=? WHERE id=? AND status IN ('queued','running') RETURNING id").bind(message,message,now(),id).first();
    if(changed){row.status='paused';row.error=message;row.message=message;}
   }
  }catch{/* A transient status lookup never changes business state. */}
 }
 const parts=await env.DB.prepare('SELECT value,status FROM bw_long_task_parts WHERE task_id=?').bind(id).all();
 const nodes=parts.results.map(r=>({...JSON.parse(r.value),status:r.status}));
 const labels={'audit':'全文分片审查','audit-report':'全本五维汇总','graph-block':'图谱抽取','chapter-batch':'章节五维审查','chapter-join':'长章衔接核对','chapter-local-patch':'局部修订','chapter-local-verify':'修订复核'};
 const stages=Object.entries(labels).map(([type,label])=>{const list=nodes.filter(n=>n.type===type&&n.status!=='split');return {type,label,total:list.length,completed:list.filter(n=>n.status==='done').length,failed:list.filter(n=>n.status==='failed').length,running:list.filter(n=>n.status==='running').length};}).filter(s=>s.total);
 const progressTypes=row.kind==='quality'?['audit']:row.kind==='graph'?['graph-block','graph-history']:row.kind==='chapter-revision'?['chapter-local-patch','chapter-local-verify']:['chapter-batch','chapter-history'];
 const progress=nodes.filter(n=>progressTypes.includes(n.type)&&n.status!=='split');
 const done=progress.filter(n=>n.status==='done'),root=row.quality_root?await env.DB.prepare('SELECT root_limit,root_used FROM bw_task_state WHERE task_id=?').bind(row.quality_root).first():row;
 return {id:row.id,kind:row.kind,bookId:row.book_id,ownerId:row.owner_id,chapterId:row.chapter_id,signature:row.signature,revision:row.revision||'retired',retired:!row.revision,
  protocol:LONG_TASK_PROTOCOL,status:row.status,message:row.message,error:row.error,createdAt:row.created_at,updatedAt:row.updated_at,
  submittedProfile:{id:row.profile_id,label:row.profile_label,model:row.profile_model},completedParts:done.length,totalParts:progress.length,
  totalCharacters:row.total_characters||0,completedCharacters:row.status==='completed'?row.total_characters||0:done.reduce((n,r)=>n+(r.characters||0),0),stages,
  errors:nodes.filter(n=>n.error).map(n=>({stage:n.type,message:n.error})),budget:await budgetFor(env,id),qualityBudget:root?.root_limit?{limit:root.root_limit,used:root.root_used}:null};
}
async function launch(env,id,generation){
 const workflowId=`task-${id}-${generation}`;
 await env.DB.prepare('UPDATE bw_long_tasks SET workflow_id=?,updated_at=? WHERE id=?').bind(workflowId,now(),id).run();
 try{await env.LONG_TASK_WORKFLOW.create({id:workflowId,params:{taskId:id,generation}});}
 catch(e){await env.DB.prepare("UPDATE bw_long_tasks SET status='paused',error=?,updated_at=? WHERE id=? AND status='queued'").bind('Workflow 启动失败，请稍后继续任务。',now(),id).run();throw e;}
}
async function createTask(request,env,user,isAdmin){
 env=await cloudAiRegistry(env).environment(env);
 const input=await request.json(),s=input.snapshot;
 if(!kinds.includes(input.kind)||!s||typeof s.bookId!=='string'||!s.bookId||typeof input.signature!=='string'||!input.signature||!Array.isArray(s.chapters)||!s.chapters.length)throw new Error('作品快照或任务类型无效。');
 const owner=isAdmin?String(s.ownerId||user.id):user.id;
 if(!isAdmin&&s.ownerId&&s.ownerId!==user.id)return json({error:'无权提交其他用户的任务。'},403);
 const book=await env.DB.prepare('SELECT 1 FROM bw_books WHERE owner_id=? AND book_id=? AND deleted_at IS NULL').bind(owner,s.bookId).first();
 if(!book)throw new Error('请先将作品保存到数据库后再提交长任务。');
 const ids=new Set();let characters=0;
 for(const c of s.chapters){if(!Number.isSafeInteger(c.chapterId)||c.chapterId<1||ids.has(c.chapterId)||typeof c.title!=='string'||typeof c.content!=='string'||!c.content.trim())throw new Error('章节编号、标题或正文无效。');ids.add(c.chapterId);characters+=c.content.length;}
 const context=String(input.context||'');
 if(!Array.isArray(input.profiles)||!input.profiles.length)throw new Error('请先配置可用 AI。');
 await authorizeCloudAi(env,input.profiles[0]);
 const p=await cloudProfile(env,input.profiles[0]);
 const global=await env.DB.prepare("SELECT value FROM bw_settings WHERE key='parameters.global.v1'").first();
 const settings=global?JSON.parse(global.value).settings:null,programmer=settings?.programmerSettings;
 if(programmer?.aiEnabled===false)throw new Error('管理员已关闭 AI 辅助。');
 const opts={...input.config,...(programmer?{maxConcurrent:programmer.maxConcurrent,requestTimeout:programmer.requestTimeout,thinking:programmer.deepThinking?'enabled':'disabled'}:{})};
 const snapshot={bookId:s.bookId,ownerId:owner,title:s.title||'',graphSignature:s.graphSignature||'',chapters:s.chapters.map(c=>({chapterId:c.chapterId,title:c.title,synopsis:c.synopsis||'',plan:c.plan||{},tags:Array.isArray(c.tags)?c.tags:[],...(c.volumeId!==undefined?{volumeId:String(c.volumeId)}:{}),content:c.content}))};
 const config={context,profiles:[p],thinking:opts.thinking==='enabled'?'enabled':'disabled',timeout:Math.min(300,Math.max(90,Number(opts.requestTimeout)||180)),concurrency:Math.min(20,Math.max(1,Number(opts.maxConcurrent)||2)),failover:false,responseFormat:'json_object'};
 const parents=new Map();
 if(opts.reviewTaskId){const parent=await loadCloudJob(env,String(opts.reviewTaskId),true);if(parent)parents.set(parent.id,parent);}
 if(input.kind==='chapter-quality'||input.kind==='chapter-revision')Object.assign(config,chapterOptions({get:id=>parents.get(id)},owner,{...input,snapshot,config:opts}));
 const batch=input.kind==='chapter-batch';
 const plan=stableBlockPlan(snapshot,[],{maxChapters:batch?3:Infinity});config.blockGroups=plan.groups;
 if(input.kind==='quality')Object.assign(config,{auditProtocol:BOOK_AUDIT_PROTOCOL,concurrency:Math.min(20,Number(opts.auditConcurrency)||20)});
 if(input.kind==='graph'||batch)Object.assign(config,{largeTextProtocol:LARGE_TEXT_PROTOCOL,...(batch?{batchProtocol:CHAPTER_BATCH_PROTOCOL}:{graphProtocol:GRAPH_BLOCK_PROTOCOL})});
 if(opts.qualityRoot){const root=parents.get(opts.qualityRoot)||await loadCloudJob(env,String(opts.qualityRoot),true);if(!root||root.kind!=='chapter-batch'||root.status!=='completed'||root.owner!==owner||root.book!==s.bookId||hash(modelIdentity(root.config.profiles))!==hash(modelIdentity(config.profiles))||!['quality','chapter-revision'].includes(input.kind))throw new Error('质量检查预算不属于当前作品或模型。');config.qualityRoot=root.id;}
 const identity=hash([CF_LONG_TASK_PROTOCOL,input.kind,snapshot,input.signature,context,modelIdentity([p]),input.kind.startsWith('chapter-')&&!batch?{reviewTaskId:config.reviewTaskId,lockedItems:config.lockedItems,revisionAttempts:config.revisionAttempts,previousTail:config.previousTail,directions:config.directions}:null]);
 const existing=await env.DB.prepare('SELECT task_id FROM bw_task_state WHERE identity=?').bind(identity).first();if(existing)return json(await statusFor(env,existing.task_id),202);
 const id=crypto.randomUUID(),revision=input.kind==='quality'?BOOK_AUDIT_PROTOCOL:config.graphProtocol||config.batchProtocol||CHAPTER_TASK_PROTOCOL;
 const audit=input.kind==='quality'?prepareBookAudit(snapshot,context,plan):null;
 await putTaskBlob(env,id,'input',{snapshot,config});
 try{await env.DB.batch([
  env.DB.prepare('INSERT INTO bw_long_tasks(id,kind,owner_id,book_id,signature,context,profile_id,profile_label,profile_model,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,input.kind,owner,s.bookId,input.signature,context,p.id,p.label,p.model,'queued',now(),now()),
  env.DB.prepare('INSERT INTO bw_task_state(task_id,identity,chapter_id,total_characters,revision,quality_root,planned,budget_limit,token_limit,root_limit) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,identity,s.chapters[0].chapterId,characters,revision,config.qualityRoot||null,audit?.plannedRequests??null,audit?.requestLimit??null,audit?.tokenLimit??null,batch?plan.batches.length+stableBlockPlan(snapshot).batches.length+51:null)
 ]);}catch(e){const duplicate=await env.DB.prepare('SELECT task_id FROM bw_task_state WHERE identity=?').bind(identity).first();if(duplicate)return json(await statusFor(env,duplicate.task_id),202);throw e;}
 await launch(env,id,0);return json(await statusFor(env,id),202);
}
export async function longTaskApi(request,env,path,user,isAdmin){
 try{
 if(path==='/api/long-tasks/health'&&request.method==='GET'){const h=await cloudTaskHealth(env);return json(h,h.available?200:503);}
 if(!user)return json({error:'请先登录。',code:'AUTH_REQUIRED'},401);
 const url=new URL(request.url),m=path.match(/^\/api\/long-tasks(?:\/([\w-]+)(?:\/(result|pause|resume|cancel|facts|evidence))?)?$/);if(!m)return json({error:'长任务接口不存在。'},404);
 if(!m[1]&&request.method==='POST')return await createTask(request,env,user,isAdmin);
 if(!m[1]&&request.method==='GET'){const owner=isAdmin?url.searchParams.get('ownerId')||user.id:user.id,book=url.searchParams.get('bookId');const rows=book?await env.DB.prepare('SELECT id FROM bw_long_tasks WHERE owner_id=? AND book_id=? ORDER BY created_at DESC LIMIT 30').bind(owner,book).all():await env.DB.prepare('SELECT id FROM bw_long_tasks WHERE owner_id=? ORDER BY created_at DESC LIMIT 30').bind(owner).all();return json({tasks:await Promise.all(rows.results.map(r=>statusFor(env,r.id)))});}
 const task=await env.DB.prepare('SELECT * FROM bw_long_tasks WHERE id=?').bind(m[1]).first();
 if(!task||!isAdmin&&task.owner_id!==user.id||url.searchParams.has('bookId')&&url.searchParams.get('bookId')!==task.book_id||url.searchParams.has('ownerId')&&url.searchParams.get('ownerId')!==task.owner_id)return json({error:'任务不存在或不属于当前作品。'},404);
 if(request.method==='GET'&&!m[2])return json(await statusFor(env,task.id));
 if(request.method==='GET'&&m[2]==='result'){if(task.status!=='completed')return json({error:'任务尚未完成。'},409);let result=await taskBlob(env,task.id,'result');if(!result){const old=await env.DB.prepare('SELECT value FROM bw_long_task_results WHERE task_id=?').bind(task.id).first();result=old?JSON.parse(old.value):null;}return result?json(result):json({error:'任务结果不存在。'},404);}
 if(request.method==='GET'&&m[2]==='facts'){const facts=await taskBlob(env,task.id,'facts')||[],offset=Math.max(0,Number(url.searchParams.get('offset'))||0);return json({facts:facts.slice(offset,offset+100),offset});}
 if(request.method==='GET'&&m[2]==='evidence'){const job=await loadCloudJob(env,task.id),chapter=job.snapshot.chapters.find(c=>c.chapterId===Number(url.searchParams.get('chapterId'))),start=Math.max(0,Number(url.searchParams.get('start'))||0);return chapter?json({chapterId:chapter.chapterId,title:chapter.title,start,end:Math.min(chapter.content.length,start+6000),content:chapter.content.slice(start,start+6000)}):json({error:'章节不存在。'},404);}
 if(request.method==='POST'&&['pause','cancel','resume'].includes(m[2])){
  if(m[2]==='resume'&&['paused','cancelled','failed'].includes(task.status)){
    // Ensure the prior execution has stopped before a new generation claims
    // the same budget and checkpoints. Completed response bodies are reused.
    const pending=await env.DB.prepare("SELECT 1 FROM bw_task_requests WHERE task_id=? AND status='running' AND updated_at>? LIMIT 1").bind(task.id,new Date(Date.now()-360000).toISOString()).first();
    if(pending)return json({error:'已有模型请求正在收尾并保存响应，请稍后继续，避免重复计费。'},409);
    if(task.workflow_id){const instance=await env.LONG_TASK_WORKFLOW.get(task.workflow_id),state=await instance.status();if(!['complete','errored','terminated'].includes(state.status)){await instance.terminate();const stopped=await instance.status();if(!['complete','errored','terminated'].includes(stopped.status))return json({error:'上一次任务正在停止，请稍后继续。'},409);}}
    const claimed=await env.DB.prepare("UPDATE bw_long_tasks SET status='queued',error='',updated_at=? WHERE id=? AND status IN ('paused','cancelled','failed') RETURNING id").bind(now(),task.id).first();
    if(claimed){const state=await env.DB.prepare('UPDATE bw_task_state SET generation=generation+1 WHERE task_id=? RETURNING generation').bind(task.id).first();if(!state)throw new Error('旧协议任务不可续跑，请重新提交。');await launch(env,task.id,state.generation);}
  }else if(m[2]!=='resume'&&!['completed','cancelled'].includes(task.status)){
    await env.DB.prepare("UPDATE bw_long_tasks SET status=?,updated_at=? WHERE id=? AND status!='completed'").bind(m[2]==='cancel'?'cancelled':'paused',now(),task.id).run();
    // Cooperative pause lets an already-paid request save its response. No
    // new request may dispatch after active() observes the paused state.
  }
  return json(await statusFor(env,task.id));
 }
 return json({error:'请求方法不支持。'},405);
 }catch(e){return json({error:e.message||'长任务服务暂时不可用。',code:e.code||'TASK_ERROR'},400);}
}
