import {fingerprint} from './workflow.js';
import {validateRevisionPatches,applyRevisionPatches,rebaseRevisionFindings} from './book-quality.js';
import {parseRevisionResponse} from './revision-response.js';
import {revisionFailureKind,contentFailures} from './revision-failures.js';
import {revisionCounts,revisionResolved,revisionTarget,REVISION_CYCLE_PROTOCOL,REVISION_FOLLOWUP_LIMIT} from './revision-policy.js';
import {TARGETED_VERSION,TARGETED_BATCH_CALLS,planTargetedRevision,targetedAvailability,targetedPatchPrompt,targetedVerifyPrompt} from './revision-targets.js';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const localErrors=new Set(['INVALID_JSON','PATCH_ARRAYS_REQUIRED','PATCH_ITEM_LIMIT','INVALID_REVISION_CHECK','OUTPUT_LENGTH']);
function decode(raw){
  if(raw.finishReason==='length')throw fail('OUTPUT_LENGTH','回复被截断，保留原文，不重复请求。');
  if(raw.finishReason&&raw.finishReason!=='stop')throw fail('UPSTREAM_FORMAT','回复未正常完成，已保存。');
  return parseRevisionResponse(raw.content).value;
}
const rawResponse=value=>typeof value?.content==='string'?{content:value.content,finishReason:value.finishReason||null,usage:value.usage||null,reasoningCharacters:value.reasoningCharacters||0}:{content:JSON.stringify(value),finishReason:'stop'};

export async function reviseTargetedBatch({chapters,report,key,context='',directions='',resume,request,save,check=()=>{},progress=()=>{},observe=()=>{},validateChecks}){
  const identity=fingerprint([key,context,directions,report]);
  if(resume&&resume.key!==identity)throw fail('REVISION_CONTEXT_CHANGED','正文、报告或修订方向已变化，请恢复原设置后继续。');
  if(resume?.active&&!resume.active.targeted)throw fail('REVISION_CONTEXT_CHANGED','请先完成已保存的辅助修订。');
  const history=report.revisionRecord?.cycle;
  let cycle=resume?structuredClone(resume):null;
  if(!cycle){
    const plan=planTargetedRevision(report.revisionRecord,chapters);
    if(!plan.jobs.length)throw fail('TARGETED_UNAVAILABLE',plan.reason||'当前没有可定向处理的问题。');
    const targeted=structuredClone(history.targeted||{version:TARGETED_VERSION,batches:[],attemptedIds:[],stopped:false});
    const number=targeted.batches.length+1,issueIds=plan.jobs.flatMap(j=>j.issues.map(i=>i.id));
    const batch={number,issueIds,used:0,limit:TARGETED_BATCH_CALLS,before:revisionCounts(report.revisionRecord.issues).remaining,completed:false};
    targeted.batches.push(batch);targeted.attemptedIds=[...new Set([...targeted.attemptedIds,...issueIds])];
    cycle={...structuredClone(history),protocol:REVISION_CYCLE_PROTOCOL,key:identity,round:report.revisionRecord.round,target:revisionTarget(history.target),budget:{...history.budget,limit:REVISION_FOLLOWUP_LIMIT},
      chapters:structuredClone(chapters),issues:structuredClone(report.revisionRecord.issues),history:structuredClone(history.history||[]),responseArchive:structuredClone(history.responseArchive||[]),targeted,touched:[],completed:[],stopReason:null,
      active:{targeted:true,round:report.revisionRecord.round,number,jobs:plan.jobs.map(j=>({...j,id:fingerprint([TARGETED_VERSION,number,j.chapterId,j.start,j.end,j.briefs,j.source])}))}};
  }
  if(!Number.isInteger(cycle.budget?.used)||cycle.budget.used<0)throw fail('CHECKPOINT_INVALID','累计预算无效，已停止请求。');
  cycle.budget.unlimited=true;
  const batch=cycle.targeted?.batches?.at(-1);
  if(!batch||!Number.isInteger(batch.used)||batch.used<0)throw fail('CHECKPOINT_INVALID','定向批次预算无效。');
  const emit=(event,fields={})=>observe(event,{round:cycle.round,targetedBatch:batch.number,batchRequests:batch.used,batchLimit:TARGETED_BATCH_CALLS,followupRequests:cycle.budget.used,followupLimit:REVISION_FOLLOWUP_LIMIT,...fields});
  const persist=async()=>{check();emit('checkpoint_queued',{completedChapters:cycle.completed.filter(c=>c.complete).length,...(cycle.active?.jobs?{completedFragments:cycle.active.jobs.filter(j=>j.state==='done').length}:{})});try{await save(structuredClone(cycle));}catch(error){if(error.name==='AbortError')throw error;throw fail('INDEXEDDB_WRITE_FAILED','定向修订进度未保存，已停止请求。');}};
  const meta=()=>{const {chapters:_,completed,active,touched,...data}=cycle;return {...data,...revisionCounts(cycle.issues)};};
  const finish=async()=>{
    await persist();emit('cycle_stopped',{...revisionCounts(cycle.issues),requestsUsed:cycle.budget.used,requestLimit:REVISION_FOLLOWUP_LIMIT,stopReason:cycle.stopReason});
    return {updates:cycle.completed,cycle:meta(),summary:`句子定向修订第${batch.number}批完成：本批解决${batch.resolved||0}项，剩余${revisionCounts(cycle.issues).remaining}项；本批${batch.used}次请求，累计${cycle.budget.used}次。${cycle.stopReason==='targeted_ready'?'采纳后可手动处理下一批。':cycle.stopReason==='target'?'已达到剩余目标。':'本次已停止继续派发，未解决项保留。'}请检查候选后采用。`};
  };
  if(!cycle.active)return finish();
  if(cycle.targeted.version!==TARGETED_VERSION)throw fail('CHECKPOINT_INVALID','定向修订版本不兼容。');
  const jobs=cycle.active.jobs;
  if(jobs.flatMap(j=>j.issues).length>3||jobs.length>3)throw fail('CHECKPOINT_INVALID','保存的批次超过3项。');
  const fields=job=>({chapterId:job.chapterId,stepId:job.id,issues:job.issues.length,fragmentIndex:jobs.indexOf(job)+1,totalFragments:jobs.length});
  const mark=async(job,result)=>{
    job.result=result;job.state='done';
    // Build partial candidates from the same immutable base for pause/save.
    cycle.completed=updates();await persist();
    for(const item of result.deferred)emit('issue_deferred',{...fields(job),issueId:item.issueId,errorCode:item.errorCode||'MANUAL_REVIEW_REQUIRED',failureKind:item.failureKind||'unclassified'});
    emit('fragment_finished',{...fields(job),patches:result.patches.length,applied:new Set(result.patches.flatMap(p=>p.issueIds)).size,dismissed:result.dismissed.length,deferred:result.deferred.length,completedFragments:jobs.filter(j=>j.state==='done').length});
  };
  const defer=(job,reason,errorCode,failureKind='technical')=>({patches:[],dismissed:[],deferred:job.issues.map(i=>({issueId:i.id,reason,errorCode,failureKind})),diagnostics:[{errorCode}]});
  function updates(){
    return [...new Set(jobs.map(j=>j.chapterId))].map(chapterId=>{
      const chapter=cycle.chapters.find(c=>c.chapterId===chapterId),group=jobs.filter(j=>j.chapterId===chapterId),changes=[],states={};
      for(const job of group)if(job.result){
        for(const patch of job.result.patches){changes.push({...patch,start:patch.start+job.start,end:patch.end+job.start});for(const id of patch.issueIds)states[id]={status:'applied',reason:patch.reason};}
        for(const item of job.result.dismissed)states[item.issueId]={status:'dismissed',reason:item.reason};
        for(const item of job.result.deferred)states[item.issueId]={...item,status:'deferred'};
      }
      const content=applyRevisionPatches(chapter.content,changes);
      if(!content.trim())throw fail('EMPTY_CHAPTER','修改会删除整章，已保留原文。');
      return {chapterId,content,changes:changes.map(p=>p.reason).join('\n')||'保留原文。',revisionStates:states,complete:group.every(j=>j.state==='done')};
    });
  }
  async function obtain(job,phase,prompt,tokens){
    const slot=phase==='patch'?'raw':'verificationRaw';
    if(job[slot]){emit('response_reused',{...fields(job),phase});return job[slot];}
    job.attempts[phase]++;batch.used++;cycle.budget.used++;await persist();check();
    try{await request(prompt,async value=>{job[slot]=rawResponse(value);await persist();},tokens,{...fields(job),phase,round:cycle.round,targetedBatch:batch.number,attempt:job.attempts[phase],networkAttempt:job.attempts[phase]});}
    catch(error){error.revision={...fields(job),phase};throw error;}
    return job[slot]||null;
  }
  await persist();emit('targeted_batch_started',{issues:batch.issueIds.length,totalFragments:jobs.length,requestsUsed:cycle.budget.used,requestLimit:REVISION_FOLLOWUP_LIMIT});
  // At most three independent groups. Serial processing avoids coupling edits
  // in the same chapter and reserves a verification before the next patch.
  for(const job of jobs){
    check();if(job.state==='done'){emit('fragment_reused',fields(job));continue;}
    progress(`句子定向修订 · 第${batch.number}批 · ${jobs.indexOf(job)+1}/${jobs.length}组 · 本批${batch.used}次`);emit('fragment_started',{...fields(job),phase:'patch'});
    let result;
    try{
      const raw=await obtain(job,'patch',targetedPatchPrompt(job,context,directions),1800);
      if(!raw){await mark(job,defer(job,'此步骤已使用一次请求，未保存完整回复；不重复收费。','TARGETED_ATTEMPT_USED'));continue;}
      result=validateRevisionPatches(decode(raw),job.source,job.localIssues,{contextual:true,sentence:true});
      applyRevisionPatches(job.source,result.patches);
    }catch(error){
      if(!localErrors.has(error.code)&&error.code!=='REVISION_INPUT_LIMIT')throw error;
      emit('validation_failed',{...fields(job),phase:'patch',errorCode:error.code});await mark(job,defer(job,error.message,error.code));continue;
    }
    if(result.deferred.length){
      const known=new Map(result.deferred.map(i=>[i.issueId,i]));
      await mark(job,{...result,patches:[],dismissed:[],deferred:job.issues.map(i=>known.get(i.id)||{issueId:i.id,reason:'共用修改位置的问题未全部形成有效方案，保留原文。',failureKind:'unclassified',errorCode:'TARGETED_DEPENDENCY'})});continue;
    }
    const content=applyRevisionPatches(job.source,result.patches),ids=job.issues.map(i=>i.id);let decisions,error;
    try{
      const raw=await obtain(job,'verify',targetedVerifyPrompt(job,result,content,context,directions),1200);
      if(!raw)throw fail('TARGETED_ATTEMPT_USED','复核未保存完整回复或额度已用完；保留原文，不重复收费。');
      decisions=validateChecks(decode(raw),ids,content,{contextual:true});
    }catch(e){if(!localErrors.has(e.code)&&!['REVISION_INPUT_LIMIT','TARGETED_ATTEMPT_USED'].includes(e.code))throw e;error=e;}
    const accepted=!error&&ids.every(id=>decisions.get(id)?.status==='resolved');
    if(!accepted)result={patches:[],dismissed:[],diagnostics:[],deferred:ids.map(issueId=>({issueId,failureKind:error?'technical':decisions.get(issueId)?.status==='unresolved'?'content':'unclassified',errorCode:error?.code||'VERIFICATION_UNRESOLVED',reason:error?.message||decisions.get(issueId)?.reason||'关联修改未全部通过复核。'}))};
    emit('verification_finished',{...fields(job),phase:'verify',applied:accepted?new Set(result.patches.flatMap(p=>p.issueIds)).size:0,dismissed:result.dismissed.length,deferred:result.deferred.length,errorCode:error?.code||(accepted?'OK':'VERIFICATION_UNRESOLVED')});
    await mark(job,result);
  }
  const states=new Map(cycle.completed.flatMap(c=>Object.entries(c.revisionStates)));
  for(const issue of cycle.issues){
    const state=states.get(issue.id);if(!state)continue;
    const failures=contentFailures(issue);Object.assign(issue,state,{attempted:true});
    if(revisionResolved(issue)){issue.contentFailureStreak=0;delete issue.failureKind;delete issue.errorCode;}
    else{issue.failureKind=revisionFailureKind(issue);issue.contentFailureStreak=failures+(issue.failureKind==='content'?1:0);if(issue.failureKind==='technical')issue.technicalFailures=(issue.technicalFailures||0)+1;}
    issue.failureStreak=issue.contentFailureStreak;
  }
  for(const job of jobs)if(job.result.deferred.length)cycle.responseArchive.push({round:cycle.round,targetedBatch:batch.number,stepId:job.id,chapterId:job.chapterId,start:job.start,end:job.end,source:job.source,issueIds:job.issues.map(i=>i.id),briefs:job.briefs,raw:job.raw,verificationRaw:job.verificationRaw,result:job.result});
  const candidate=cycle.chapters.map(c=>({...c,content:cycle.completed.find(u=>u.chapterId===c.chapterId)?.content||c.content}));
  for(const ref of rebaseRevisionFindings(cycle.issues.filter(i=>!revisionResolved(i)),candidate)){const issue=cycle.issues.find(i=>i.id===ref.id);issue.evidence=ref.evidence;if(ref.stale)issue.status='stale';}
  batch.after=revisionCounts(cycle.issues).remaining;batch.resolved=batch.before-batch.after;batch.completed=true;
  cycle.targeted.stopped=batch.resolved<=0;cycle.stopReason=batch.after<=cycle.target?'target':batch.resolved<=0?'targeted_no_progress':'targeted_ready';
  cycle.history.push({round:cycle.round,targetedBatch:batch.number,before:batch.before,after:batch.after,resolved:batch.resolved,requestsUsed:cycle.budget.used});
  cycle.active=null;
  if(cycle.stopReason==='targeted_ready'&&!targetedAvailability({round:cycle.round,issues:cycle.issues,cycle}).available)cycle.stopReason='targeted_complete';
  await persist();emit('targeted_batch_finished',{...revisionCounts(cycle.issues),resolved:batch.resolved,stopReason:cycle.stopReason});
  return finish();
}
