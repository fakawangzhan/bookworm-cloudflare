import { cloudAiFetch } from './cloudflare-dispatch.js';
import { availableCloudProfiles } from './cloudflare-ai.js';
import { authorizeCloudAi } from './cloudflare-config.js';
import { putTaskBlob,taskBlob } from './cloudflare-task-storage.js';
import { hash,now } from '../scripts/task-utils.mjs';
import { officialModel,offPeakAt } from './performance-policy.js';
import { thinkingMode } from './ai-thinking.js';
import { cloudAiRegistry } from './cloudflare-ai-registry.js';
const fail=(message,code,status=409)=>Object.assign(new Error(message),{code,status});
const receipt=(r,cached)=>({id:r.id,attempt:r.attempt,cached,ownerId:r.owner,bookId:r.book});
export async function cloudCreation(input,env,user,isAdmin){
 const owner=isAdmin?input.ownerId||user.id:user.id,book=input.bookId,step=input.stepId;
 if(!book||input.ownerId&&input.ownerId!==user.id&&!isAdmin)throw fail('无权访问该创作任务。','AUTH_FORBIDDEN',403);
 if(input.action==='ack'){
  const row=await env.DB.prepare('SELECT * FROM bw_creation_requests WHERE id=? AND owner=? AND book=?').bind(input.requestId,owner,book).first();if(!row)throw fail('找不到当前作品的请求记录。','CREATION_NOT_FOUND',404);
  if(row.status==='received'||input.accepted&&['rejected','duplicate'].includes(row.status))await env.DB.prepare('UPDATE bw_creation_requests SET status=?,error=? WHERE id=?').bind(input.accepted?'accepted':'rejected',String(input.error||'').slice(0,500),row.id).run();return {ok:true};
 }
 if(input.action==='usage'){const rows=await env.DB.prepare('SELECT * FROM bw_creation_requests WHERE owner=? AND book=? ORDER BY started').bind(owner,book).all();return {requests:rows.results.map(r=>({...r,usage:r.usage?JSON.parse(r.usage):null}))};}
 if(input.action==='event'){
  if(!['adopted','discarded'].includes(input.event)||!Array.isArray(input.stepIds)||input.stepIds.length>100)throw fail('创作事件无效。','CREATION_INPUT',400);
  if(input.stepIds.length)await env.DB.batch(input.stepIds.map(s=>env.DB.prepare('INSERT OR IGNORE INTO bw_creation_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bw_creation_steps WHERE owner=? AND book=? AND step=?)').bind(owner,book,s,input.event,now(),owner,book,s)));return {ok:true};
 }
 await env.DB.prepare("UPDATE bw_creation_requests SET status='interrupted',error='连接中断，原请求用量已记录，可继续原步骤',finished=? WHERE owner=? AND book=? AND status='running' AND started<?").bind(now(),owner,book,new Date(Date.now()-360000).toISOString()).run();
 if(input.action==='resume')return {ok:true};
 if(input.action==='retry-transport'){
  const row=await env.DB.prepare('SELECT * FROM bw_creation_requests WHERE owner=? AND book=? ORDER BY started DESC LIMIT 1').bind(owner,book).first(),response=row?await taskBlob(env,'creation:'+row.id,'response'):null;
  if(row?.status!=='failed'||!(['UPSTREAM_NETWORK','UPSTREAM_TIMEOUT','UPSTREAM_INTERRUPTED'].includes(response?.code)||response?.code==='UPSTREAM_HTTP'&&response.retryable===true))throw fail('最近一次不是可重试的连接故障。','CREATION_RETRY_NOT_ALLOWED');
  return {ok:true,stepId:row.step,unlimited:true};
 }
 if(input.action==='candidate'&&!input.params)return {candidate:null};
 if(typeof step!=='string'||!step||step.length>240||!['balanced','economy','fast'].includes(input.policy))throw fail('创作步骤或运行策略无效。','CREATION_INPUT',400);
 if(input.offPeak&&!offPeakAt()&&input.action!=='candidate')throw fail('已保留任务，请在谷时继续。','CREATION_OFFPEAK');
 if(!env.NF_MANAGED_AI_PROFILES)env=await cloudAiRegistry(env).environment(env);
 const p=await authorizeCloudAi(env,input.params||{}),configured=input.modelSource==='configured';
 if(typeof p.prompt!=='string'||!p.prompt.trim())throw fail('创作内容不能为空。','CREATION_INPUT',400);
 if(!configured&&String(p.endpoint||'').replace(/\/$/,'')!=='https://api.deepseek.com')throw fail('官方策略只允许官方接口，请选择已配置档案。','CREATION_INPUT',400);
 const managed=availableCloudProfiles(env).find(m=>m.id===p.profileId),model=configured?p.model:officialModel(input.policy,input.purpose);
 const params={...p,model,maxTokens:Math.min(8000,Math.max(64,Number(p.maxTokens)||3000)),stream:true,thinking:thinkingMode(p.thinking)};
 const identity=hash([p.endpoint,model,p.responseFormat,p.temperature,params.maxTokens,hash(managed?.apiKey||p.apiKey||env.DEEPSEEK_API_KEY||''),input.policy]);
 const previous=await env.DB.prepare('SELECT * FROM bw_creation_steps WHERE owner=? AND book=? AND step=?').bind(owner,book,step).first();
 if(previous&&previous.identity!==identity)throw fail('该步骤的模型配置已变化，请开始新任务；旧候选保留。','CREATION_CONFIG_CHANGED');
 const last=await env.DB.prepare('SELECT * FROM bw_creation_requests WHERE owner=? AND book=? AND step=? ORDER BY attempt DESC LIMIT 1').bind(owner,book,step).first();
 const saved=last?await taskBlob(env,'creation:'+last.id,'response'):null;
 if(input.action==='candidate')return {candidate:saved?.content?{...saved,creationReceipt:receipt(last,true)}:null};
 if(saved?.content&&['received','accepted'].includes(last.status))return {...saved,creationReceipt:receipt(last,true)};
 if(last?.status==='running')throw fail('相同创作步骤正在执行，稍后继续可取回结果。','CREATION_RUNNING');
 await env.DB.prepare('INSERT OR IGNORE INTO bw_creation_steps(owner,book,step,identity) VALUES(?,?,?,?)').bind(owner,book,step,identity).run();
 const row={id:crypto.randomUUID(),owner,book,step,attempt:(previous?.attempts||0)+1};
 try{await env.DB.prepare("INSERT INTO bw_creation_requests(id,owner,book,step,attempt,status,model,prompt_hash,started) VALUES(?,?,?,?,?,'running',?,?,?)").bind(row.id,owner,book,step,row.attempt,model,hash(params.prompt),now()).run();}
 catch(e){throw fail('相同创作步骤正在执行，请稍后取回结果。','CREATION_RUNNING');}
 if(last?.status==='rejected')params.prompt+=`\n上次未通过的具体原因：${last.error}\n只修复上述错误，返回完整合法JSON；上次未采用候选：\n${String(saved?.content||'').slice(0,22000)}`;
 const started=Date.now();let received=false;
 try{
  const response=await cloudAiFetch(params,env),value=await response.json();
  const result={...value,model,provider:managed?.label||p.provider||'AI 服务',pricingSource:configured?'provider':'deepseek-official'};
  await putTaskBlob(env,'creation:'+row.id,'response',result);received=true;
  const duplicate=result.content&&await env.DB.prepare('SELECT 1 FROM bw_creation_requests WHERE owner=? AND book=? AND step=? AND response_hash=? AND id<>?').bind(owner,book,step,hash(result.content),row.id).first();
  await env.DB.prepare('UPDATE bw_creation_requests SET status=?,response_hash=?,error=?,finished=?,duration_ms=?,usage=? WHERE id=?').bind(duplicate?'duplicate':response.ok?'received':'failed',result.content?hash(result.content):null,duplicate?'模型重复返回同一候选。':String(result.error||''),now(),Date.now()-started,JSON.stringify(result.usage||null),row.id).run();
  if(duplicate)throw fail('模型重复返回同一候选，已保存并停止重复请求。','CREATION_DUPLICATE');
  if(!response.ok)throw fail(result.error||'模型请求失败。',result.code||'CREATION_UPSTREAM',response.status);
  return {...result,creationReceipt:receipt(row,false)};
 }catch(e){if(!received)await env.DB.prepare("UPDATE bw_creation_requests SET status='interrupted',error='连接中断，用量未知，请求用量已记录',finished=?,duration_ms=? WHERE id=?").bind(now(),Date.now()-started,row.id).run();throw e;}
}
