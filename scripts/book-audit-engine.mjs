import { completeStructuredResponse } from '../src/ai-recovery.js';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';
import { parseJSON } from '../src/workflow.js';
import { hash } from './task-utils.mjs';
import { BOOK_AUDIT_PROTOCOL, AUDIT_OUTPUT_TOKENS, AUDIT_INPUT_LIMIT, planBookAudit, auditCoverageComplete,
  auditBatchPrompt, validateAuditBatch, auditSummaryPrompt, validateAuditSummary, combineAuditReport } from '../src/book-audit-contract.js';
import { auditReferenceRepair } from '../src/audit-reference-repair.js';
import { ResultReuse, blockIdentity, auditPlanForJob } from './large-text-reuse.mjs';

export const retiredAuditError = () => Object.assign(new Error('旧版全本审查方案已淘汰，历史结果保留；请点击 AI 全本质量审查提交新版任务。'), {code:'AUDIT_RETIRED'});
const failure = (message,code) => Object.assign(new Error(message),{code});
const terminal = e => [400,401,402,403,404,409,413,422].includes(e.status) || /余额|balance|credit/i.test(e.message)
  || ['CONFIG_CHANGED','OUTPUT_LENGTH','UPSTREAM_TOO_LARGE','UPSTREAM_FORMAT','UPSTREAM_REASONING_ONLY','AUDIT_THINKING','AUDIT_FORMAT','AUDIT_BUDGET','AUDIT_STEP_LIMIT','AUDIT_INPUT'].includes(e.code);
export const abortOthers = e => [400,401,402,403,404,409,413,422].includes(e.status) || /余额|balance|credit/i.test(e.message)
  || ['CONFIG_CHANGED','AUDIT_THINKING','UPSTREAM_REASONING_ONLY'].includes(e.code);

export function prepareBookAudit(snapshot, context, suppliedPlan) {
  const plan = suppliedPlan || planBookAudit(snapshot);
  // Conservative byte-based reservation, not claimed as actual provider usage.
  // Every attempt reserves input plus maximum output before it is dispatched.
  plan.tokenLimit = plan.requestLimit * (AUDIT_INPUT_LIMIT * 4 + AUDIT_OUTPUT_TOKENS);
  return plan;
}

function summaryResponse(value,records) {
  // Some providers omit empty placeholders. Batch findings are merged by the
  // existing contract; add only an absent placeholder, never remove findings
  // or replace an explicitly malformed field. Keep the raw response intact.
  const items=Array.isArray(value?.items)?value.items.map(item=>item&&typeof item==='object'&&!Object.hasOwn(item,'issues')?{...item,issues:[]}:item):value?.items;
  return validateAuditSummary({...value,items},records);
}

export class BookAudit {
  constructor(engine, job, signal) { this.engine=engine; this.store=engine.store; this.job=job; this.signal=signal; this.reuse=new ResultReuse(engine.store,job); }
  async completeResponse(key,prompt,response,tokens,signal) {
    return completeStructuredResponse(response,prompt,async(text,prefix)=>{
      const continuationKey=key+':continuation:'+hash(prefix),promptHash=hash(text);
      const cached=this.store.auditResponse(this.job.id,continuationKey,promptHash);
      if(cached)return {content:cached.content,finishReason:cached.finish_reason,usage:cached.usage?JSON.parse(cached.usage):null};
      this.engine.check(this.job,signal);
      const attempt=this.store.reserveAuditRequest(this.job.id,continuationKey,Buffer.byteLength(text,'utf8')+tokens);
      let part;
      try {
        part=await this.engine.provider(this.job.config.profiles[0],{prompt:text,maxTokens:tokens,timeout:this.job.config.timeout,signal,stream:true,thinking:this.job.config.thinking||'disabled',responseFormat:'json_object'});
        this.store.saveAuditResponse(this.job.id,continuationKey,attempt,promptHash,part);
        this.store.finishAuditRequest(this.job.id,continuationKey,attempt,'received',part.usage);
        return part;
      }catch(e){this.store.finishAuditRequest(this.job.id,continuationKey,attempt,'failed',part?.usage||e.usage,e.message);throw e;}
    },{check:()=>this.engine.check(this.job,signal),progress:message=>this.engine.message(this.job,message)});
  }
  async request(key,type,data,prompt,validate,{pilot=false,signal=this.signal,replayPrompts=[],tokens=AUDIT_OUTPUT_TOKENS,reuseInput=prompt,reuseType=type,repairSaved,reuseRaw,splitOnLength=false}={}) {
    if (this.engine.durableRequest) return this.engine.durableRequest(this.job,key,type,data,prompt,validate,
      {pilot,signal,replayPrompts,tokens,reuseInput,reuseType,repairSaved,reuseRaw,splitOnLength});
    this.store.putNode(this.job.id,key,type,data);
    const saved=this.store.node(this.job.id,key);
    if(saved.status==='done') return saved.result;
    this.engine.check(this.job,signal);
    this.store.nodeState(this.job.id,key,'running');
    const profile=this.job.config.profiles[0];
    const source={id:profile.id,provider:profile.label,model:profile.model},promptHash=hash(prompt);
    const reuseKey=this.reuse.key(reuseType,reuseInput);
    const checked = content => {
      let raw;try {raw=parseJSON(content);}catch {throw failure('JSON 无法解析；原始响应已保存，当前切片未完成。','AUDIT_FORMAT');}
      try {return {value:validate(raw),source};}
      catch(e){if(!e.code)e.code='AUDIT_FORMAT';throw e;}
    };
    let cached=[prompt,...replayPrompts].map(p=>this.store.auditResponse(this.job.id,key,hash(p))).find(Boolean);
    if(cached?.finish_reason==='length'){
      if(splitOnLength)throw failure('当前片段将自动拆小处理，已保存原回复。','OUTPUT_LENGTH');
      const completed=await this.completeResponse(key,prompt,{content:cached.content,finishReason:cached.finish_reason,usage:cached.usage?JSON.parse(cached.usage):null},tokens,signal);
      cached={...cached,content:completed.content,finish_reason:completed.finishReason};
    }
    if(cached?.finish_reason==='stop') {
      try {
        const result=checked(cached.content);
        this.store.finishAuditRequest(this.job.id,key,cached.attempt,'done',cached.usage?JSON.parse(cached.usage):null);
        this.reuse.put(reuseKey,reuseRaw?reuseRaw(parseJSON(cached.content)):parseJSON(cached.content),result.source,{jobId:this.job.id,key});
        this.store.nodeState(this.job.id,key,'done',result);return result;
      } catch(e) {
        const repair = e.field ? repairSaved?.(parseJSON(cached.content), e, prompt) : null;
        if (repair) {
          this.engine.message(this.job,'正在定位已保存结果中的引用；保留评分、内容和有效证据。');
          return this.request(key,type,data,repair.prompt,repair.validate,
            {pilot:true,signal,tokens,reuseInput,reuseType,reuseRaw:repair.reuseRaw});
        }
        e.message+=' 已保存响应可供本地修复；本次未重复请求模型，可保留结果并跳过辅助步骤。';
        this.store.nodeState(this.job.id,key,'failed',null,e.message);throw e;
      }
    }
    const reused=this.reuse.get(reuseKey)||replayPrompts.map(p=>this.reuse.get(this.reuse.key(reuseType,p))).find(Boolean);
    if(reused) {
      try {
        const raw=type==='audit'?{...reused.raw,batchId:data.id}:reused.raw;
        const result={value:validate(raw),source:reused.source,reuse:reused.origin};
        this.store.nodeState(this.job.id,key,'done',result);return result;
      } catch(e) {
        e.code||='AUDIT_FORMAT';e.message+=' 历史响应已保留，未重复请求模型。';
        this.store.nodeState(this.job.id,key,'failed',null,e.message);throw e;
      }
    }
    let last;
    for(let runAttempt=0;runAttempt<(pilot?1:2);runAttempt++) {
      let attempt,usage=null,response;
      try {
        this.engine.check(this.job,signal);
        attempt=this.store.reserveAuditRequest(this.job.id,key,Buffer.byteLength(prompt,'utf8')+tokens);
        this.store.attempt(this.job.id,key);
        response=await this.engine.provider(profile,{prompt,maxTokens:tokens,timeout:this.job.config.timeout,signal,stream:true,thinking:this.job.config.thinking||'disabled',responseFormat:'json_object'});
        usage=response.usage;
        this.store.saveAuditResponse(this.job.id,key,attempt,promptHash,response);
        this.store.finishAuditRequest(this.job.id,key,attempt,'received',usage);
        if(response.finishReason==='length'&&splitOnLength)throw failure('当前片段将自动拆小处理，已保存原回复。','OUTPUT_LENGTH');
        response=await this.completeResponse(key,prompt,response,tokens,signal);
        this.engine.check(this.job,signal);
        if(response.finishReason!=='stop') throw failure('模型未完整输出审查结果，已停止；请检查模型输出能力。',response.finishReason==='length'?'OUTPUT_LENGTH':'AUDIT_FORMAT');
        const result=checked(response.content);
        this.reuse.put(reuseKey,reuseRaw?reuseRaw(parseJSON(response.content)):parseJSON(response.content),result.source,{jobId:this.job.id,key});
        this.store.finishAuditRequest(this.job.id,key,attempt,'done',usage);
        this.store.nodeState(this.job.id,key,'done',result);return result;
      }catch(e) {
        last=e;
        if(attempt) this.store.finishAuditRequest(this.job.id,key,attempt,signal.aborted?'interrupted':'failed',usage||e.usage,e.message);
        if(!signal.aborted&&['audit','audit-report'].includes(type)&&e.field&&response?.finishReason==='stop'){
          const repair=repairSaved?.(parseJSON(response.content),e,prompt);
          if(repair)return this.request(key,type,data,repair.prompt,repair.validate,{pilot:true,signal,tokens,reuseInput,reuseType,reuseRaw:repair.reuseRaw});
        }
        if(signal.aborted||pilot||terminal(e)||runAttempt===1)break;
        // Retry only transient transport failures. Reuse the exact prompt for
        // provider prefix caching; never repeat paid generation for schema errors.
        try {await delay(Math.min(30000,Math.max(this.engine.retryDelay,e.retryAfterMs||0)),undefined,{signal});}
        catch(e){last=e;break;}
      }
    }
    this.store.nodeState(this.job.id,key,signal.aborted?'pending':'failed',null,last.message);
    throw last;
  }
  async summarize(records,context,depth=0) {
    const prompt=auditSummaryPrompt(records,context);
    // Bound each summary request by grouping records, never by cutting prose
    // or discarding findings. Group reports are durable and their concerns are
    // all carried into the final report, even when higher layers omit them.
    const target=Math.max(60000,auditSummaryPrompt([],context).length+12000);
    if(prompt.length<=target||records.length===1){
      const key=depth===0?'audit:report':'audit:summary:'+hash(records.map(r=>r.batch.id));
      return this.request(key,'audit-report',{},prompt,v=>summaryResponse(v,records),
        {replayPrompts:[auditSummaryPrompt(records,context,{legacy:true})],repairSaved:(raw,e)=>auditReferenceRepair(raw,e,{records},v=>summaryResponse(v,records))});
    }
    const groups=[];let group=[];
    for(const record of records){
      if(group.length&&auditSummaryPrompt([...group,record],context).length>target){groups.push(group);group=[];}
      group.push(record);
    }
    if(group.length)groups.push(group);
    // A single unusually detailed record can exceed the packing target. Pair
    // it for summarization so each level still makes measurable progress.
    if(groups.length===records.length){groups.length=0;for(let n=0;n<records.length;n+=2)groups.push(records.slice(n,n+2));}
    const next=[],concerns=[];
    for(const entries of groups){
      const groupPrompt=auditSummaryPrompt(entries,context);
      const result=await this.request('audit:summary:'+hash(entries.map(r=>r.batch.id)),'audit-report',{},groupPrompt,v=>summaryResponse(v,entries),{repairSaved:(raw,e)=>auditReferenceRepair(raw,e,{records:entries},v=>summaryResponse(v,entries))});
      concerns.push(...result.value.concerns);
      const refs=[...new Map(result.value.concerns.flatMap(i=>i.evidence).map(e=>[e.partId,e])).values()];
      next.push({batch:{id:'summary:'+hash(entries.map(r=>r.batch.id)),end:entries.reduce((n,r)=>n+r.batch.end,0),parts:refs.map(e=>({...e,id:e.partId,content:e.quote}))},
        source:result.source,value:{summary:result.value.ledger,scores:result.value.items,moreIssues:entries.some(r=>r.value.moreIssues),states:[],issues:result.value.concerns}});
    }
    const result=await this.summarize(next,context,depth+1);
    return {...result,value:{...result.value,concerns:[...concerns,...result.value.concerns]}};
  }
  async run() {
    const {job,store,engine}=this;
    if(job.config.auditProtocol!==BOOK_AUDIT_PROTOCOL) throw retiredAuditError();
    const plan=prepareBookAudit(job.snapshot,job.config.context,auditPlanForJob(job));
    this.reuse.importAudit();
    store.auditBudget(job.id,plan);
    const records=new Array(plan.batches.length);
    const read=async(batch,options={})=>{
      engine.message(job,`并发审查 · 第 ${batch.index+1}/${plan.batches.length} 片 · 并发上限 ${job.config.concurrency}`);
      const result=await this.request(`audit:${batch.id}`,'audit',batch,auditBatchPrompt(batch,job.config.context),v=>validateAuditBatch(v,batch),
        {...options,reuseType:BOOK_AUDIT_PROTOCOL,reuseInput:blockIdentity(batch),repairSaved:(raw,e)=>auditReferenceRepair(raw,e,{batch},v=>validateAuditBatch(v,batch))});
      records[batch.index]={batch,...result};
    };
    // Gate all remaining requests behind the first real batch. No separate test call.
    let first=0;
    // Cached work is free; the first actual new request gates fan-out.
    for(;first<plan.batches.length;) {
      const used=store.auditBudget(job.id).used;
      await read(plan.batches[first++],{pilot:true});
      if(store.auditBudget(job.id).used>used)break;
    }
    const controller=new AbortController(),signal=AbortSignal.any([this.signal,controller.signal]);
    let cursor=first,stopped;
    const workers=Array.from({length:job.config.concurrency},async()=>{
      while(!stopped&&!signal.aborted&&cursor<plan.batches.length){
        const batch=plan.batches[cursor++];
        try{await read(batch,{signal});}
        catch(e){if(!stopped)stopped=e;if(abortOthers(e))controller.abort(e);return;}
      }
    });
    await Promise.all(workers);
    if(stopped)throw stopped;
    engine.check(job,this.signal);
    if(records.filter(Boolean).length!==plan.batches.length||!auditCoverageComplete(job.snapshot,records.map(r=>r.batch)))
      throw failure('正文覆盖未完成，不能生成全本完成报告。','AUDIT_COVERAGE');
    engine.message(job,'正在汇总全本五维结论与修改建议');
    const final=await this.summarize(records,job.config.context);
    const sources=[...new Map([...records,final].map(r=>[r.source.id,r.source])).values()];
    return {...combineAuditReport(job.snapshot,job.signature,records,final.value,sources),budget:store.auditBudget(job.id),
      reuse:{blocks:records.filter(r=>r.reuse).length,characters:records.filter(r=>r.reuse).reduce((n,r)=>n+r.batch.end,0),report:Boolean(final.reuse)}};
  }
}
