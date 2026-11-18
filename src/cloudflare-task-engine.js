import { completeStructuredResponse } from './ai-recovery.js';
import { BookAudit } from '../scripts/book-audit-engine.mjs';
import { LargeTextTasks } from '../scripts/large-text-engine.mjs';
import { ChapterTasks } from '../scripts/chapter-task-engine.mjs';
import { ResultReuse } from '../scripts/large-text-reuse.mjs';
import { hash, now } from '../scripts/task-utils.mjs';
import { CloudTaskStore, loadCloudJob, putTaskBlob, taskBlob, budgetFor } from './cloudflare-task-storage.js';
import { cloudGenerate } from './cloudflare-ai.js';
import { parseJSON } from './workflow.js';
import { BOOK_AUDIT_PROTOCOL, AUDIT_INPUT_LIMIT } from './book-audit-contract.js';
const error = (message,code) => Object.assign(new Error(message),{code});
const stepOptions={retries:{limit:0,delay:'1 second'},timeout:'12 minutes'};
const transient=e=>e.retryable!==false&&(e.status===429||e.status>=500||['UPSTREAM_NETWORK','UPSTREAM_TIMEOUT'].includes(e.code));
export class CloudTaskEngine {
  constructor(env,step,job,store,generation){Object.assign(this,{env,step,job,store,generation});this.signal=new AbortController().signal;this.checkpointOrdinal=0;this.pendingMessage='';}
  check(job,signal){signal?.throwIfAborted();}
  message(job,value){this.pendingMessage=value;}
  async active(){const row=await this.env.DB.prepare('SELECT t.status,s.generation FROM bw_long_tasks t JOIN bw_task_state s ON s.task_id=t.id WHERE t.id=?').bind(this.job.id).first();if(!row||row.status!=='running'||row.generation!==this.generation)throw error('任务已暂停或取消，进度已保留。','TASK_STOPPED');}
  async pool(job,values,fn,signal){const result=new Array(values.length);let cursor=0,stopped;await Promise.all(Array.from({length:Math.min(job.config.concurrency,values.length)},async()=>{while(!stopped&&cursor<values.length){const i=cursor++;try{signal?.throwIfAborted();result[i]=await fn(values[i],i);}catch(e){stopped=e;}}}));if(stopped)throw stopped;return result;}
  async flushCheckpoint(){
    // The engine's checkpoint contains no credentials and is chunked in D1.
    const ordinal=this.checkpointOrdinal++;
    await this.step.do('checkpoint:'+ordinal,stepOptions,async()=>{await this.store.flush();return true;});
  }
  async raw(job,key,prompt,tokens,{force=false}={}){
    await this.active();await this.store.flush();
    if(this.pendingMessage)await this.env.DB.prepare('UPDATE bw_long_tasks SET message=?,updated_at=? WHERE id=?').bind(this.pendingMessage,now(),job.id).run();
    const promptHash=hash(prompt),name='response:'+hash([key,promptHash]);
    const prior=await taskBlob(this.env,job.id,name);if(prior&&!force)return prior;
    const attempts=await this.env.DB.prepare('SELECT COUNT(*) count FROM bw_task_requests WHERE task_id=? AND node_key=?').bind(job.id,key).first();
    try{await this.env.DB.prepare("INSERT INTO bw_task_requests VALUES(?,?,?,?, 'running',?,NULL,'',?)").bind(job.id,key,attempts.count+1,promptHash,new TextEncoder().encode(prompt).length+tokens,now()).run();}
    catch(e){throw e;}
    const attempt=attempts.count+1;
    try{
      const response=await cloudGenerate(this.env,job.config.profiles[0],{prompt,maxTokens:tokens,timeout:job.config.timeout,thinking:job.config.thinking||'disabled',responseFormat:'json_object'},()=>this.active());
      await putTaskBlob(this.env,job.id,'response-attempt:'+hash([key,attempt]),response);
      await putTaskBlob(this.env,job.id,name,response);
      await this.env.DB.prepare("UPDATE bw_task_requests SET status='received',usage=?,updated_at=? WHERE task_id=? AND node_key=? AND attempt=?").bind(JSON.stringify(response.usage||null),now(),job.id,key,attempt).run();
      return response;
    }catch(e){if(e.response)await putTaskBlob(this.env,job.id,'error:'+hash([key,attempt]),e.response);await this.env.DB.prepare("UPDATE bw_task_requests SET status='failed',error=?,usage=?,updated_at=? WHERE task_id=? AND node_key=? AND attempt=?").bind(String(e.message).slice(0,1500),JSON.stringify(e.usage||e.response?.usage||null),now(),job.id,key,attempt).run();throw e;}
  }
  async durableRawRequest(job,key,prompt,tokens){
    // Persist before validation: malformed or interrupted output is replayable
    // without another paid request. Workflow retries never call the model again.
    const name='response:'+hash([key,hash(prompt)]);
    const outcome=await this.step.do('raw:'+hash([key,prompt]),stepOptions,async()=>{
      try{await this.raw(job,key,prompt,tokens);return {ok:true};}
      catch(e){return {error:e.message,code:e.code||'',status:e.status||0};}
    });
    if(!outcome.ok)throw Object.assign(new Error(outcome.error),outcome);
    this.store.budget=await budgetFor(this.env,job.id);
    return taskBlob(this.env,job.id,name);
  }
  async durableRequest(job,key,type,data,prompt,validate,options={}){
    const {tokens=3200,reuseInput=prompt,reuseType=type,replayPrompts=[],pilot=false}=options;
    this.store.putNode(job.id,key,type,data);
    const reuse=new ResultReuse(this.store,job),cacheKey=reuse.key(reuseType,reuseInput),cacheScope=reuse.scope();
    const resultName='checked:'+hash([key,prompt]);
    const outcome=await this.step.do('node:'+hash([key,prompt]),stepOptions,async()=>{
      try{
        await this.active();
        let response=await taskBlob(this.env,job.id,'response:'+hash([key,hash(prompt)])),fromCache=null;
        for(const old of replayPrompts){if(response)break;response=await taskBlob(this.env,job.id,'response:'+hash([key,hash(old)]));}
        if(!response){const cached=await this.env.DB.prepare('SELECT task_id,blob_name FROM bw_task_cache WHERE scope=? AND cache_key=?').bind(cacheScope,cacheKey).first();if(cached){response=await taskBlob(this.env,cached.task_id,cached.blob_name);fromCache={jobId:cached.task_id};}}
        this.store.nodeState(job.id,key,'running');
        if(!response){try{response=await this.raw(job,key,prompt,tokens);}catch(e){if(pilot||!transient(e))throw e;response=await this.raw(job,key,prompt,tokens);}}
        if(response.finishReason==='length'&&options.splitOnLength)throw error('当前片段将自动拆小处理，已保存原回复。','OUTPUT_LENGTH');
        response=await completeStructuredResponse(response,prompt,(text,prefix)=>this.raw(job,key+':continuation:'+hash(prefix),text,tokens),{check:()=>this.check(job,this.signal)});
        if(response.finishReason!=='stop')throw error('模型输出未完整结束，响应已保存。',response.finishReason==='length'?'OUTPUT_LENGTH':'AUDIT_FORMAT');
        // Save the completed body before checking references; a continuation
        // must also be repairable without asking for the review again.
        if(!fromCache)await putTaskBlob(this.env,job.id,'response:'+hash([key,hash(prompt)]),response);
        const raw=parseJSON(response.content);
        let value;try{value=validate(type==='audit'&&fromCache?{...raw,batchId:data.id}:raw);}catch(e){e.code||='AUDIT_FORMAT';throw e;}
        const result={value,source:{id:job.config.profiles[0].id,provider:job.config.profiles[0].label,model:job.config.profiles[0].model},...(fromCache?{reuse:fromCache}:{})};
        await putTaskBlob(this.env,job.id,resultName,result);
        // Cache only schema-checked response bodies, scoped to owner/book/model.
        const responseName=(options.reuseRaw?'reusable:':'response:')+hash([key,hash(prompt)]);
        if(!fromCache){await putTaskBlob(this.env,job.id,responseName,options.reuseRaw?{...response,content:JSON.stringify(options.reuseRaw(raw))}:response);await this.env.DB.prepare('INSERT INTO bw_task_cache VALUES(?,?,?,?) ON CONFLICT(scope,cache_key) DO UPDATE SET task_id=excluded.task_id,blob_name=excluded.blob_name').bind(cacheScope,cacheKey,job.id,responseName).run();}
        this.store.nodeState(job.id,key,'done',result);await this.store.flush();
        await this.env.DB.prepare("UPDATE bw_task_requests SET status='done' WHERE task_id=? AND node_key=? AND prompt_hash=? AND status='received'").bind(job.id,key,hash(prompt)).run();
        return {ok:true};
      }catch(e){this.store.nodeState(job.id,key,'failed',null,String(e.message));await this.store.flush();return {error:e.message,code:e.code||'AUDIT_FORMAT',field:e.field||'',status:e.status||0};}
    });
    this.store.budget=await budgetFor(this.env,job.id);
    if(!outcome.ok){
      const e=Object.assign(new Error(outcome.error),outcome);
      const saved=await taskBlob(this.env,job.id,'response:'+hash([key,hash(prompt)]));
      if(saved?.finishReason==='stop'){
        const raw=parseJSON(saved.content),repair=e.field?options.repairSaved?.(raw,e,prompt):null;
        if(repair)return this.durableRequest(job,key,type,data,repair.prompt,repair.validate,{...options,pilot:true,repairSaved:null,reuseRaw:repair.reuseRaw});
      }
      throw e;
    }
    const result=await taskBlob(this.env,job.id,resultName);this.store.nodeState(job.id,key,'done',result);return result;
  }
}
export async function runCloudTask(env,event,step){
  const {taskId,generation}=event.payload;
  const accepted=await step.do('claim',stepOptions,async()=>{
    const current=await env.DB.prepare('SELECT t.status,s.generation FROM bw_long_tasks t JOIN bw_task_state s ON s.task_id=t.id WHERE t.id=?').bind(taskId).first();
    if(!current||current.generation!==generation||!['queued','running'].includes(current.status))return false;
    await env.DB.prepare("UPDATE bw_long_tasks SET status='running',started_at=COALESCE(started_at,?),updated_at=? WHERE id=?").bind(now(),now(),taskId).run();return true;
  });if(!accepted)return;
  let engine;
  try{
    // Immutable D1 input is loaded directly; multi-megabyte manuscripts never
    // enter a Workflow step return value or the instance parameters.
    const job=await loadCloudJob(env,taskId),parents=[];
    if(job.config.reviewTaskId)parents.push(await loadCloudJob(env,job.config.reviewTaskId,true));
    const store=new CloudTaskStore(env,job,parents);await store.hydrate();engine=new CloudTaskEngine(env,step,job,store,generation);
    const signal=engine.signal;
    let result;
    if(job.kind==='quality')result=await new BookAudit(engine,job,signal).run();
    else if(job.kind==='graph')result=await new LargeTextTasks(engine,job,signal).graph();
    else if(job.kind==='chapter-batch')result=await new LargeTextTasks(engine,job,signal).chapters();
    else if(job.kind==='chapter-quality')result=await new ChapterTasks(engine,job,signal).review();
    else if(job.kind==='chapter-revision')result=await new ChapterTasks(engine,job,signal).revise();
    else throw new Error('不支持的任务类型。');
    await step.do('complete',stepOptions,async()=>{
      await engine.active();await store.flush();await putTaskBlob(env,taskId,'result',result);await putTaskBlob(env,taskId,'facts',[...store.facts.values()].flat());
      await env.DB.prepare("UPDATE bw_long_tasks SET status='completed',error='',message='任务已完成',completed_at=?,updated_at=? WHERE id=?").bind(now(),now(),taskId).run();return true;
    });
    return {taskId,status:'completed'};
  }catch(e){
    await step.do('record failure',stepOptions,async()=>{
      await engine?.store.flush();
      await env.DB.prepare("UPDATE bw_long_tasks SET status='paused',error=?,message='任务已暂停，已保存分段及模型响应',updated_at=? WHERE id=? AND status IN ('queued','running') AND EXISTS(SELECT 1 FROM bw_task_state WHERE task_id=? AND generation=?)").bind(String(e.message).slice(0,1500),now(),taskId,taskId,generation).run();return true;
    });return {taskId,status:'paused'};
  }
}
