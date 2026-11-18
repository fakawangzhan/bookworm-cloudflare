export const REVISION_REPAIR_POLICY='context-units-v1';
const technical=new Set(['INVALID_JSON','PATCH_ARRAYS_REQUIRED','PATCH_ITEM_LIMIT','PATCH_FIELDS_OR_ISSUE_IDS','PATCH_SOURCE_NOT_UNIQUE_OR_UNCHANGED','PATCH_SOURCE_NOT_UNIQUE','PATCH_NO_CHANGE','PATCH_OUTSIDE_EVIDENCE','PATCH_OUTSIDE_SCOPE','PATCH_OVERLAP','PATCH_UNIT_INVALID','MISSING_ISSUE_RESULT','INVALID_REVISION_CHECK']);
technical.add('OUTPUT_LENGTH');
technical.add('TARGETED_ATTEMPT_USED');
export function revisionFailureKind(issue){
  if(['technical','content','needs_context','unclassified'].includes(issue?.failureKind))return issue.failureKind;
  if(technical.has(issue?.errorCode))return 'technical';
  if(issue?.errorCode==='VERIFICATION_UNRESOLVED')return 'content';
  // Exact legacy messages describe validator failures, not literary ability.
  const reason=String(issue?.reason||'');
  if(/模型响应无法安全解析|模型响应的补丁结构无效|补丁没有覆盖该问题的原文证据|补丁原句无法唯一匹配|替换文字未变化|补丁字段或问题编号不完整|补丁与其他修改重叠/.test(reason))return 'technical';
  return 'unclassified';
}
export const contentFailures=issue=>revisionFailureKind(issue)==='technical'?Number(issue?.contentFailureStreak)||0:Number(issue?.contentFailureStreak??issue?.failureStreak)||0;
export const revisionFailureLabel=issue=>({technical:'技术校验失败',content:'局部复核仍未确认解决',needs_context:'需要补充事实或作者方向',unclassified:'原因待核对'})[revisionFailureKind(issue)];
