import { fingerprint, splitText } from './workflow.js';
import { revisionFindings, rebaseRevisionFindings, validateBookUpdates } from './book-quality.js';
import {REVISION_CYCLE_PROTOCOL,REVISION_MAX_ROUNDS,revisionCounts,revisionTarget} from './revision-policy.js';

const compact = value => String(value).replace(/\s/g, '');
const issueTerms = value => {
  const normalized = String(value || '').replace(/[\s\p{P}\p{S}]+/gu, '');
  const terms = [];
  for (let i = 0; i < normalized.length - 1; i += 1) terms.push(normalized.slice(i, i + 2));
  return [...new Set(terms)].filter(term => term.length > 1);
};
export const BOOK_REVISION_RECORD = 'book-revision-applied-v1';

// Keep the result deterministic: a finding is considered resolved only when
// the adopted candidate actually changed the quoted source location.  The
// criterion is retained so the UI can update only the affected score.
const criterionOf = issue => String(issue?.criterion || '');

// Record applied text, not an invented AI verdict. Adopting a completed
// candidate requires no additional model call; the caller derives score
// adjustments only from entries verified here as applied.
export function recordBookRevision({chapters, updates, report, signature, fragments = {},cycle}) {
  validateBookUpdates(updates, chapters.map(c=>({id:c.chapterId})));
  const changes = [];
  for (const update of updates) {
    const chapter = chapters.find(c=>c.chapterId===update.chapterId);
    if (compact(chapter.content)===compact(update.content)) continue;
    const original = splitText(chapter.content,1400), revised = fragments?.[chapter.chapterId];
    const aligned = Array.isArray(revised) && revised.length===original.length && revised.map(p=>p.content).join('\n\n')===update.content;
    let offset = 0;
    if (aligned) for (let i=0;i<original.length;i++) {
      const start=offset; offset+=original[i].length;
      if (compact(original[i])!==compact(revised[i].content)) changes.push({chapterId:chapter.chapterId,start,end:offset});
    }
  }
  const changedUpdates = updates.filter(update => {
    const chapter = chapters.find(c => c.chapterId === update.chapterId);
    return chapter && compact(chapter.content) !== compact(update.content);
  });
  const located = revisionFindings(report);
  const global = (report.globalItems || report.items || []).flatMap(item=>(item.issues || []).map(issue=>({criterion:item.id,...issue,evidence:[]})));
  const previous = report.revisionRecord?.issues;
  const previousApplied = new Set((Array.isArray(previous) ? previous : []).filter(issue => issue.status === 'applied').map(issue => issue.id || fingerprint(issue)));
  const issues = Array.isArray(previous) ? previous : [...new Map([...located,...global].map(issue=>{
    const id = issue.id || fingerprint(issue);
    return [id, {...issue, id}];
  })).values()];
  const currentStates = new Map(updates.flatMap(update => Object.entries(update.revisionStates || {}).map(([id, state]) => [id, state])));
  const rebased = rebaseRevisionFindings(issues, chapters);
  const bounded=cycle?.protocol===REVISION_CYCLE_PROTOCOL;
  const entries = bounded ? structuredClone(cycle.issues) : rebased.map(issue=>{
    if (['applied','dismissed','blocked','stale','not-located'].includes(issue.status)) return issue;
    const state = currentStates.get(issue.id || fingerprint(issue));
    if (state?.status === 'dismissed') return {...issue,status:'dismissed',attempted:true,reason:`无需修改：${state.reason}`};
    if (state?.status === 'blocked') return {...issue,status:'blocked',attempted:true,reason:state.reason};
    if (state?.status === 'deferred' || state?.status === 'stale') return {...issue,status:state.status,attempted:true,reason:state.reason};
    if (state?.status === 'applied') return {...issue,status:'applied',attempted:true,reason:state.reason || '局部最小修订已写入对应正文。'};
    if (issue.stale) return {...issue,status:'stale',attempted:true,reason:'Current evidence no longer has a safe location.'};
    const hasLocation=Array.isArray(issue.evidence)&&issue.evidence.length>0;
    const changed = issue.evidence?.some(ref=>{
      const chapter=chapters.find(c=>c.chapterId===ref.chapterId), update=updates.find(u=>u.chapterId===ref.chapterId);
      if (!chapter || !update) return false;
      let start=ref.start,end=ref.end;
      if (!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>chapter.content.length) {
        start=ref.quote ? chapter.content.indexOf(ref.quote) : -1;
        if(start<0 || chapter.content.indexOf(ref.quote,start+1)>=0)return false;
        end=start+ref.quote.length;
      }
      if (changes.some(c=>c.chapterId===ref.chapterId&&c.start<end&&c.end>start)) return true;
      // Legacy candidates do not have fragment mappings. Count an applied
      // location only when its actual original quotation was replaced.
      const quote=chapter.content.slice(start,end);
      return quote.trim().length>=2 && !update.content.includes(quote);
    });
    const detailTerms = issueTerms(issue.detail);
    const describedChange = !hasLocation && detailTerms.length && changedUpdates.some(update => {
      const overlap = issueTerms(update.changes).filter(term => detailTerms.includes(term)).length;
      return overlap >= Math.min(2, detailTerms.length);
    });
    const status=changed || describedChange?'applied':hasLocation?'not-applied':'not-located';
    const reason=(changed || describedChange)?'最小修正已写入对应正文，问题已修正并从当前待处理清单移除。':hasLocation?'本轮候选未确认替换该定位处文字，未标记为已修正；可在细节优化中手动处理。':'报告只提供维度级问题，没有可核对的原文位置，本轮未擅自标记为已修正。';
    return {...issue,status,attempted:true,reason};
  });
  const newlyApplied = entries.filter(i=>i.status==='applied' && !previousApplied.has(i.id || fingerprint(i)));
  const appliedByCriterion = newlyApplied.reduce((map, issue)=>{
    const criterion = criterionOf(issue);
    if (criterion) map[criterion] = (map[criterion] || 0) + 1;
    return map;
  }, {});
  const round = bounded ? cycle.round : Math.max(0,Number(report.revisionRecord?.round)||0)+1;
  const {remaining:pending,actionable}=revisionCounts(entries);
  const exhausted = pending > revisionTarget(cycle?.target) && Boolean(cycle?.stopReason && !['budget','round_limit','item_limit'].includes(cycle.stopReason));
  return {protocol:BOOK_REVISION_RECORD,status:'completed',sourceSignature:signature,
    round,
    chapters:updates.map(u=>({chapterId:u.chapterId,changes:String(u.changes || ''),contentFingerprint:fingerprint(u.content)})),
    issues:entries,total:entries.length,applied:entries.filter(i=>i.status==='applied').length,pending,
    attempted:entries.filter(i=>i.attempted||i.status==='applied').length,notLocated:entries.filter(i=>i.status==='not-located').length,
    newlyApplied:newlyApplied.length, appliedByCriterion, exhausted, forcedAfterMaxRounds:exhausted,actionable,...(bounded?{cycle:structuredClone(cycle)}:{})};
}
