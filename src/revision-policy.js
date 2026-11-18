export const REVISION_CYCLE_PROTOCOL='book-revision-cycle-v1';
export const REVISION_MAX_ROUNDS=3;
export const REVISION_FOLLOWUP_LIMIT=50;
export const revisionTarget=value=>[1,2,3].includes(Number(value))?Number(value):3;
export const revisionResolved=issue=>['applied','dismissed'].includes(issue?.status);
export const revisionActionable=issue=>!revisionResolved(issue)&&!['blocked','stale','not-located'].includes(issue?.status)&&revisionFailureKind(issue)!=='needs_context'&&Array.isArray(issue.evidence)&&issue.evidence.some(e=>!e.stale);
export const revisionCounts=issues=>({remaining:issues.filter(i=>!revisionResolved(i)).length,actionable:issues.filter(revisionActionable).length});
export const revisionStopLabels={target:'达到剩余目标',round_limit:'上次修订已暂停，可继续',budget:'历史暂停，可继续',no_progress:'本轮无进展',no_actionable:'剩余问题需人工确认',item_limit:'当前片段可继续'};
revisionStopLabels.technical_complete='本次技术补处理已结束';
Object.assign(revisionStopLabels,{targeted_ready:'本批定向修订结束，可手动处理下一批',targeted_no_progress:'定向修订无进展，已停止',targeted_complete:'定向修订已结束，其余问题待确认'});
export function technicalRecoveryIssues(record){
  const cycle=record?.cycle;
  if(!cycle||cycle.policyVersion===REVISION_REPAIR_POLICY||cycle.technicalRepair?.started||!['no_progress','round_limit','no_actionable'].includes(cycle.stopReason))return [];
  return (record.issues||[]).filter(i=>revisionActionable(i)&&revisionFailureKind(i)==='technical');
}
export function revisionContinuation(record,target=3){
  if(!record)return {round:0,remaining:0,actionable:0,stopReason:null};
  const counts=Array.isArray(record.issues)?revisionCounts(record.issues):{remaining:Number(record.pending)||0,actionable:Number(record.pending)||0};
  const cycle=record.cycle?.protocol===REVISION_CYCLE_PROTOCOL?record.cycle:null;
  const round=Math.max(0,Number(record.round)||0);
  const reason=cycle?.stopReason;
  const stopReason=(['budget','round_limit','item_limit'].includes(reason)?null:reason) || (counts.remaining<=revisionTarget(target)?'target':!counts.actionable?'no_actionable':null);
  const technical=technicalRecoveryIssues(record).length;
  return {...counts,round,stopReason,technical};
}
import {REVISION_REPAIR_POLICY,revisionFailureKind,contentFailures} from './revision-failures.js';
