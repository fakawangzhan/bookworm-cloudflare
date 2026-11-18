import aiWorker from './worker.js';
import { managedAiProfiles } from './managed-ai.js';
import { hash } from '../scripts/task-utils.mjs';
import { cloudAiRegistry } from './cloudflare-ai-registry.js';
import { thinkingMode } from './ai-thinking.js';
export async function cloudAiFetch(params,env,{signal,beforeDispatch}={}){
 if(!env.NF_MANAGED_AI_PROFILES)env=await cloudAiRegistry(env).environment(env);
 const managed=managedAiProfiles(env).find(p=>p.id===params.profileId),key=managed?.apiKey||params.apiKey||env.DEEPSEEK_API_KEY||'',endpoint=managed?.endpoint||params.endpoint||env.DEEPSEEK_BASE_URL||'https://api.deepseek.com';
 const account=hash([endpoint,key]),record=await env.DB.prepare("SELECT value FROM bw_settings WHERE key='parameters.global.v1'").first();
 const configured=record?JSON.parse(record.value).settings?.programmerSettings?.maxConcurrent:4,limit=Math.min(8,Math.max(1,Number(configured)||4));
 const id=crypto.randomUUID(),started=Date.now();let acquired=false;
 while(!acquired){
  signal?.throwIfAborted();
  await env.DB.prepare('DELETE FROM bw_ai_leases WHERE account_key=? AND expires_at<?').bind(account,Date.now()).run();
  const r=await env.DB.prepare('INSERT INTO bw_ai_leases(id,account_key,expires_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM bw_ai_leases WHERE account_key=? AND expires_at>?)<?').bind(id,account,Date.now()+360000,account,Date.now(),limit).run();acquired=!!r.meta.changes;
  if(!acquired){if(Date.now()-started>240000)throw Object.assign(new Error('AI 服务并发队列繁忙，请稍后继续，当前未调用模型。'),{code:'DISPATCH_BUSY',status:429});await new Promise(resolve=>setTimeout(resolve,1000));}
 }
 try{
  await beforeDispatch?.();
  const capabilityKey='parameters.capability.'+hash([String(endpoint).replace(/\/+$/,''),params.model||managed?.model||'deepseek-chat',hash(key),thinkingMode(params.thinking)]);
  const saved=await env.DB.prepare('SELECT value FROM bw_settings WHERE key=?').bind(capabilityKey).first();
  const capacity=saved?JSON.parse(saved.value):{};
  const dispatch={...params,...(capacity.outputTokenLimit?{outputTokenLimit:capacity.outputTokenLimit}:{}),...(capacity.outputTokenMinimum?{outputTokenMinimum:capacity.outputTokenMinimum}:{})};
  const response=await aiWorker.fetch(new Request('https://bookworm.internal/api/generate',{method:'POST',headers:{'content-type':'application/json'},signal,body:JSON.stringify(dispatch)}),env);
  if(response.ok){
   const body=await response.clone().json();
   const observed={};for(const name of ['outputTokenLimit','outputTokenMinimum'])if(Number.isSafeInteger(body[name])&&body[name]>0)observed[name]=body[name];
   if(Object.keys(observed).length){
    const at=new Date().toISOString();
    // Observations shape a single dispatch; saved author settings stay intact.
    await env.DB.prepare('INSERT INTO bw_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
      .bind(capabilityKey,JSON.stringify({...capacity,...observed,observedAt:at}),at).run();
   }
  }
  return response;
 }
 finally{await env.DB.prepare('DELETE FROM bw_ai_leases WHERE id=?').bind(id).run();}
}
