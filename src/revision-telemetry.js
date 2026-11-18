// Only diagnostic metadata crosses this boundary. Never accept prose, prompts,
// provider errors, URLs, credentials, or arbitrary nested objects into logs.
const events = new Set(['run_started','targets_planned','chapter_started','chapter_finished','chapter_reused','fragment_started','fragment_finished','fragment_failed','fragment_deferred','fragment_reused','response_reused','round_stalled','checkpoint_queued','storage_saved','storage_failed','candidate_ready','candidate_reused','adopted','run_failed','run_paused','heartbeat','page_exit','json_attempt','validation_passed','validation_failed','format_retry','network_retry','client_request_failed','request_started','request_finished']);
const numberFields = new Set(['sequence','chapterId','chapterIndex','totalChapters','completedChapters','issues','locatedIssues','staleIssues','patches','applied','dismissed','deferred','round','fragmentIndex','start','end','inputChars','outputChars','formatAttempt','networkAttempt','profileIndex','maxTokens','timeoutSeconds','temperature','durationMs','delayMs','httpStatus','storageSequence','promptTokens','completionTokens','cacheHitTokens','cacheMissTokens','reasoningTokens','patchCount','dismissedCount','missingBefore','missingAfter','missingIssueIds','invalidDismissals','completedFragments','totalFragments','requestLimit','requestsUsed','concurrency']);
const stringFields = new Set(['bookId','signature','stepId','requestId','eventId','model','finishReason','errorCode','phase','patchesType','dismissedType','storage','thinkingMode','responseFormat']);
numberFields.add('reasoningCharacters');
numberFields.add('normalizations');
events.add('response_normalized');
for(const event of ['round_started','round_finished','verification_finished','cycle_stopped'])events.add(event);
events.add('technical_repair_started');
events.add('issue_deferred');
events.add('targeted_batch_started');
events.add('targeted_batch_finished');
stringFields.add('issueId');
stringFields.add('failureKind');
for(const field of ['remaining','actionable','resolved','followupRequests','followupLimit','targetedBatch','batchRequests','batchLimit'])numberFields.add(field);
stringFields.add('stopReason');
export function validRevisionRunId(value) { return typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value); }
export function sanitizeRevisionEvent(value) {
  if (!validRevisionRunId(value?.runId) || !events.has(value.event)) return null;
  const result = {runId:value.runId,event:value.event};
  for (const [key, item] of Object.entries(value)) {
    if (numberFields.has(key) && typeof item === 'number' && Number.isFinite(item) && item >= 0) result[key] = item;
    if (stringFields.has(key) && typeof item === 'string' && /^[a-z0-9_.:/-]{1,120}$/i.test(item)) result[key] = item;
  }
  if (typeof value.at === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value.at)) result.at=value.at;
  return result;
}
export function revisionErrorCode(error) {
  const message=String(error?.message || error || '');
  if(['TARGETED_UNAVAILABLE','TARGETED_ATTEMPT_USED'].includes(error?.code))return error.code;
  if(['PATCH_UNIT_INVALID','PATCH_OUTSIDE_SCOPE','PATCH_NO_CHANGE','PATCH_FIELDS_OR_ISSUE_IDS'].includes(error?.code))return error.code;
  if(['REVISION_FOLLOWUP_BUDGET','REVISION_ITEM_ATTEMPTS','INVALID_REVISION_CHECK'].includes(error?.code))return error.code;
  if(['INVALID_JSON','PATCH_ARRAYS_REQUIRED','PATCH_ITEM_LIMIT','REVISION_RESPONSE_FORMAT'].includes(error?.code))return error.code;
  if(['THINKING_NOT_DISABLED','REVISION_BUDGET','REVISION_INPUT_LIMIT','REVISION_CONTEXT_CHANGED','CHECKPOINT_INVALID','INDEXEDDB_WRITE_FAILED','EMPTY_CHAPTER'].includes(error?.code))return error.code;
  if (error?.name==='AbortError') return 'CANCELLED';
  if (/patches and dismissed arrays/.test(message)) return 'PATCH_ARRAYS_REQUIRED';
  if (/unknown issue or missing source text/.test(message)) return 'PATCH_FIELDS_OR_ISSUE_IDS';
  if (/match exactly once/.test(message)) return 'PATCH_SOURCE_NOT_UNIQUE_OR_UNCHANGED';
  if (/Dismissed issue requires/.test(message)) return 'DISMISSAL_FIELDS_OR_ISSUE_ID';
  if (/patches overlap/i.test(message)) return 'PATCH_OVERLAP';
  if (/overlap its issue evidence/.test(message)) return 'PATCH_OUTSIDE_EVIDENCE';
  if (/no longer matches|位置已变化/.test(message)) return 'PATCH_SOURCE_CHANGED';
  if (/截断|结构化输出未完成/.test(message)) return 'OUTPUT_TRUNCATED';
  if (/JSON|json/.test(message)) return 'INVALID_JSON';
  if (/超时|timeout/i.test(message)) return 'TIMEOUT';
  if (/源码已过期/.test(message)) return 'SOURCE_STALE';
  if (/正文、设定或审查模式已变化/.test(message)) return 'WORKSPACE_CHANGED';
  if (['UPSTREAM_HTTP','UPSTREAM_NETWORK','UPSTREAM_TIMEOUT','UPSTREAM_FORMAT','UPSTREAM_EMPTY','UPSTREAM_REASONING_ONLY','OUTPUT_LENGTH','SOURCE_STALE'].includes(error?.code)) return error.code;
  return 'REQUEST_OR_VALIDATION_FAILED';
}
export function revisionResponseShape(value) {
  const type=item=>Array.isArray(item)?'array':item===null?'null':typeof item;
  const patches=Array.isArray(value?.patches)?value.patches:[];
  const dismissed=Array.isArray(value?.dismissed)?value.dismissed:[];
  return {patchesType:type(value?.patches),dismissedType:type(value?.dismissed),patchCount:patches.length,dismissedCount:dismissed.length,
    missingBefore:patches.filter(p=>typeof p?.before!=='string'&&typeof p?.unitId!=='string').length,missingAfter:patches.filter(p=>typeof p?.after!=='string').length,
    missingIssueIds:patches.filter(p=>!Array.isArray(p?.issueIds)||!p.issueIds.length).length,
    invalidDismissals:dismissed.filter(p=>!p?.issueId||typeof p.reason!=='string').length};
}
export function revisionUsage(usage) {
  const result={};
  for(const [key,value] of Object.entries({promptTokens:usage?.prompt_tokens,completionTokens:usage?.completion_tokens,
    cacheHitTokens:usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens,
    cacheMissTokens:usage?.prompt_cache_miss_tokens,reasoningTokens:usage?.completion_tokens_details?.reasoning_tokens})) {
    if(typeof value==='number'&&Number.isFinite(value)&&value>=0)result[key]=value;
  }
  return result;
}

export function createRevisionTransport({send, onUnavailable=()=>{}, schedule=setTimeout}={}) {
  const pending=[]; let timer, inflight, sequence=0;
  const later=delay=>{if(!timer){timer=schedule(()=>{timer=null;void flush();},delay);timer?.unref?.();}};
  async function flush() {
    if(inflight)return inflight;
    if(!pending.length)return;
    const batch=pending.slice(0,20);
    inflight=Promise.resolve().then(async()=>{
      try {
        const response=await (send || (events=>fetch('/api/revision-log',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events}),signal:AbortSignal.timeout(4000),keepalive:true})))(batch);
        if(!response?.ok)throw new Error('LOG_UNAVAILABLE');
        pending.splice(0,batch.length);
      } catch { onUnavailable(); }
      finally {inflight=null;if(pending.length)later(2500);}
    });
    return inflight;
  }
  function emit(event) {
    const safe=sanitizeRevisionEvent({...event,eventId:crypto.randomUUID(),sequence:++sequence,at:new Date().toISOString()});
    if(!safe)return;
    if(pending.length>=1000){onUnavailable();return;}
    pending.push(safe);later(150);
  }
  function beacon(){
    if(!pending.length||!globalThis.navigator?.sendBeacon)return;
    const batch=pending.slice(0,20);
    try{if(navigator.sendBeacon('/api/revision-log',new Blob([JSON.stringify({events:batch})],{type:'application/json'})))pending.splice(0,batch.length);}catch{}
  }
  return {emit,flush,beacon,get pendingCount(){return pending.length;}};
}
let warned=false;
const transport=createRevisionTransport({onUnavailable:()=>{
  if(!warned&&typeof globalThis.dispatchEvent==='function'){
    warned=true;globalThis.dispatchEvent(new CustomEvent('revision-log-unavailable'));
  }
}});
export const emitRevisionEvent=(runId,event,fields={})=>transport.emit({...fields,runId,event});
export const completedRevisionChapters=record=>record?.completed?.filter(c=>c.complete!==false).length||0;
export function createRevisionLogger({bookId,signature}) {
  const runId=crypto.randomUUID(); let context={};
  const emit=(event,fields={})=>emitRevisionEvent(runId,event,{bookId,signature,...(event==='heartbeat'||event==='page_exit'?context:{}),...fields});
  const heartbeat=setInterval(()=>emit('heartbeat'),15000);heartbeat.unref?.();
  const onExit=()=>{emit('page_exit');transport.beacon();};globalThis.addEventListener?.('pagehide',onExit);
  return {runId,emit,get context(){return {...context};},setContext(fields){context={...fields};},async close(){clearInterval(heartbeat);globalThis.removeEventListener?.('pagehide',onExit);await transport.flush();}};
}
