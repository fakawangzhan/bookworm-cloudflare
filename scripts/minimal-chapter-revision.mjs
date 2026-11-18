import { now } from './task-utils.mjs';
import { CHAPTER_TASK_PROTOCOL, applyChapterPatches, chapterTaskError } from '../src/chapter-task-contract.js';
import { coverageComplete } from '../src/long-task-contract.js';
import { validateReview, CHAPTER_CRITERIA, reviewItemPasses } from '../src/workflow.js';
import { MINIMAL_REVISION_POLICY, revisionIssues, revisionIssueSettled, applyMinimalRevisionResult, rebaseIssueEvidence, issueOwnerPartId } from '../src/revision-result.js';

// Opt-in for quality mode. The existing chapter task owns requests, streaming,
// retries, truncation subdivision and SQLite checkpoints. No whole prose is
// regenerated and no new review is launched when settling a successful patch.
export async function reviseMinimalChapter(tasks, base) {
  const { job, e, signal } = tasks, chapter = job.snapshot.chapters[0], source = chapter.content;
  validateReview(base, CHAPTER_CRITERIA);
  if (!Array.isArray(base.partReports) || !coverageComplete(job.snapshot, base.partReports.map(r => r.part))) throw chapterTaskError('修订依据没有覆盖当前正文。');
  const all = revisionIssues(base), pending = all.filter(i => !revisionIssueSettled(i));
  const failures = new Map(), dismissed = new Map(), handled = new Set();
  const plans = await tasks.pool(base.partReports, async record => {
    // Findings may cite more than one fragment. Assign them to the first
    // fragment that is actually present, rather than trusting stale leading
    // evidence from an earlier candidate.
    const issues = pending.filter(i => issueOwnerPartId(i, base.partReports.map(r => r.part)) === record.part.id);
    if (!issues.length) return [];
    const results = [];
    // Small groups bound both input and output. A failed group never discards
    // a successful sibling; the next round receives its pending IDs only.
    for (let n = 0; n < issues.length; n += 3) {
      const batch = issues.slice(n, n + 3);
      batch.forEach(i => handled.add(i.id));
      try {
        const result = await tasks.patches(record.part, batch);
        results.push(result);
        for (const item of result.dismissed) dismissed.set(item.issueId, item.reason);
        for (const item of result.rejected||[]) failures.set(item.issueId,'局部复查未通过：'+item.reason);
      } catch (error) {
        if (signal.aborted || error.name === 'AbortError' || ['AUDIT_BUDGET','CONFIG_CHANGED','SOURCE_STALE'].includes(error.code) || [401,402,403].includes(error.status)) throw error;
        batch.forEach(i => failures.set(i.id, `未修正：${error.message}`));
      }
    }
    return results;
  });
  e.check(job, signal);
  const patches = [], applied = new Set();
  for (const plan of plans.flat()) {
    try {
      applyChapterPatches(source, [...patches, ...plan.patches]);
      patches.push(...plan.patches);
      plan.patches.forEach(p => p.issueIds.forEach(id => applied.add(id)));
    } catch (error) {
      plan.patches.forEach(p => p.issueIds.forEach(id => failures.set(id, `未修正：${error.message}`)));
    }
  }
  // Multiple identical replacements can serve several issues. Rebase with
  // the effective replacements once, matching applyChapterPatches semantics.
  const effective = [...new Map(patches.map(p => [JSON.stringify([p.start,p.end,p.before,p.after]),p])).values()].sort((a,b) => a.start-b.start);
  const content = applyChapterPatches(source, effective);
  let offset = 0;
  const records = base.partReports.map(record => {
    const p = record.part;
    const local = effective.filter(x => x.start >= p.start && x.end <= p.end).map(x => ({...x, start:x.start-p.start,end:x.end-p.start}));
    // Exact splice only; the whole-chapter guard was already applied above.
    let text = '', end = 0;
    for (const patch of local) { text += p.content.slice(end, patch.start) + patch.after; end = patch.end; }
    text += p.content.slice(end);
    const start = offset; offset += text.length;
    return { part: {...p, id:`${chapter.chapterId}:${start}:${offset}`, start, end:offset, content:text,
      before:content.slice(Math.max(0,start-500),start),after:content.slice(offset,offset+500),last:offset===content.length},
      // Kept as a coverage map, not a claim that unchanged evidence was reread.
      source:record.source, reused:true };
  });
  const snapshot = {...job.snapshot,chapters:[{...chapter,content}]};
  if (!coverageComplete(snapshot,records.map(r => r.part))) throw chapterTaskError('局部替换合成覆盖不完整，原稿保留。');
  const entries = all.map(issue => {
    if (issue.status === 'applied') return issue;
    if (applied.has(issue.id)) return {...issue,status:'applied',attempted:true,reason:'最小修正已按问题编号写入对应正文，并通过精确替换校验。'};
    const refs = issue.evidence.map(ref => rebaseIssueEvidence(ref,source,content,effective,records.map(r => r.part))).filter(Boolean);
    if (dismissed.has(issue.id) && !applied.has(issue.id)) return {...issue,evidence:refs,status:'dismissed',attempted:true,reason:`无需修改：${dismissed.get(issue.id)}`};
    return {...issue,evidence:refs,status:refs.length?'not-applied':'not-located',attempted:handled.has(issue.id),
      reason:failures.get(issue.id)||'未能定位到安全替换处，保留原文与问题，下一轮可继续处理。'};
  });
  const round = job.config.revisionAttempts + 1;
  const record = {protocol:MINIMAL_REVISION_POLICY,status:'completed',round,issues:entries,total:entries.length,
    newlyApplied:applied.size,applied:entries.filter(i=>i.status==='applied').length,pending:entries.filter(i=>!revisionIssueSettled(i)).length,
    attempted:entries.filter(i=>i.attempted||i.status==='applied').length,chapters:[{chapterId:chapter.chapterId,changes:`本轮精确替换 ${effective.length} 处。`}]};
  const settled = applyMinimalRevisionResult(base,record);
  const sources = [...new Map([...(base.sources||[]),...tasks.sources.map(r=>r.source)].filter(Boolean).map(s=>[JSON.stringify(s),s])).values()];
  const review = {...settled,taskId:job.id,signature:job.signature,revisionRecord:record,revisionPolicy:MINIMAL_REVISION_POLICY,
    revisionAttempts:round,partReports:records,findings:entries.filter(i=>!revisionIssueSettled(i)),coverage:records.map(r=>r.part.id),parts:records.length,
    sources,lockedCriteria:settled.items.filter(reviewItemPasses).length,gateStatus:'completed',forcedAfterMaxRounds:false,at:now()};
  validateReview(review,CHAPTER_CRITERIA);
  return {protocol:CHAPTER_TASK_PROTOCOL,mode:'ai',bookId:job.book,ownerId:job.owner,chapterId:chapter.chapterId,signature:job.signature,
    taskId:job.id,content,patches:effective,review,revisionAttempts:round,revisionPolicy:MINIMAL_REVISION_POLICY,parts:records.length,at:now()};
}
