import { fingerprint } from './workflow.js';

export const MINIMAL_REVISION_POLICY = 'minimal-issues-v1';
export const issueId = issue => {
  if (issue?.id) return issue.id;
  const evidence = Array.isArray(issue?.evidence) && issue.evidence.length
    ? issue.evidence
    : issue?.chapterId != null ? [{chapterId:issue.chapterId, quote:issue.quote}] : [];
  return fingerprint([issue?.criterion, issue?.severity, issue?.detail,
    evidence.map(ref => [ref?.chapterId, ref?.quote])]);
};
// Only retry work that is still actionable. Terminal location states remain
// visible in the record but must not trigger another AI request.
export const revisionIssueSettled = issue => ['applied', 'dismissed', 'blocked', 'stale', 'not-located'].includes(issue?.status);
// A finding can quote more than one fragment. Use the first fragment that is
// actually present in the current coverage map; stale leading evidence must
// not make the issue disappear from all local patch requests.
export function issueOwnerPartId(issue, parts) {
  const ids = new Set((parts || []).map(part => part?.id).filter(Boolean));
  return (issue?.evidence || []).find(ref => ids.has(ref?.partId))?.partId || null;
}
export const issueMatches = (issue, finding, criterion) => finding.criterion === criterion && (issue.id ? issue.id === issueId(finding)
  : issue.detail === finding.detail
    || issue.detail === `${finding.detail}（${(finding.evidence || []).map(e => `${e.title}：${e.quote}`).join('；')}）`
    || (finding.evidence || []).some(e => issue.detail === `《${e.title}》：${finding.detail}（正文：${e.quote}）`));

export function revisionIssues(report) {
  if (Array.isArray(report.revisionRecord?.issues)) return report.revisionRecord.issues;
  const entries = new Map();
  for (const raw of report.findings || []) {
    const entry = { criterion: raw.criterion, severity: raw.severity, detail: raw.detail, evidence: raw.evidence || [] };
    const id = issueId(entry); entries.set(id, { ...entry, id });
  }
  for (const item of report.items || []) for (const issue of item.issues || []) {
    if ([...entries.values()].some(f => issueMatches(issue, f, item.id))) continue;
    const entry = { ...issue, criterion: item.id, evidence: issue.evidence || [] };
    const id = issueId(entry); entries.set(id, { ...entry, id });
  }
  return [...entries.values()];
}

// The same settlement is used by full-book adoption and quality candidates.
// This is a visible editorial score adjustment, never another model rating.
export function applyMinimalRevisionResult(report, record) {
  const applied = (record.issues || []).filter(i => i.status === 'applied');
  const previous = new Set((report.revisionRecord?.issues || []).filter(i => i.status === 'applied').map(issueId));
  const update = items => items.map(item => {
    const credited = new Set(item.revisionScoreIssueIds || []);
    const fresh = applied.filter(i => i.criterion === item.id && !previous.has(issueId(i)) && !credited.has(issueId(i)));
    const originalScore = Number.isInteger(item.originalScore) ? item.originalScore : item.score;
    const increase = Math.min(fresh.length * 5, Math.max(0, 20 - (item.score - originalScore)), 100 - item.score);
    applied.filter(i => i.criterion === item.id).forEach(i => credited.add(issueId(i)));
    const settled = (record.issues || []).filter(i => ['applied', 'dismissed'].includes(i.status));
    return { ...item, originalScore, score: item.score + increase, revisionScoreIncrease: increase, revisionScoreIssueIds: [...credited],
      issues: item.issues.filter(issue => !settled.some(f => issueMatches(issue, f, item.id))) };
  });
  return { ...report, items: update(report.items), ...(report.globalItems ? { globalItems: update(report.globalItems) } : {}),
    originalItems: report.originalItems || report.items, scoreBasis: 'after-minimal-revision', revisionScoreApplied: true };
}

// Pending locations follow exact insertions/deletions; old offsets are never
// silently applied to a newer candidate. Changed evidence remains pending.
export function rebaseIssueEvidence(ref, source, content, patches, parts) {
  let { start, end } = ref;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > source.length
    || ref.quote && source.slice(start, end) !== ref.quote) {
    start = ref.quote ? source.indexOf(ref.quote) : -1;
    if (start < 0 || source.indexOf(ref.quote, start + 1) >= 0) return null;
    end = start + ref.quote.length;
  }
  const move = (at, right) => {
    let delta = 0;
    for (const patch of patches) {
      if (at >= patch.end) delta += patch.after.length - (patch.end - patch.start);
      else if (at > patch.start) return patch.start + delta + (right ? patch.after.length : 0);
      else break;
    }
    return at + delta;
  };
  start = move(start, false); end = move(end, true);
  const part = parts.find(p => p.start <= start && p.end >= end);
  if (!part || end <= start) return null;
  return { ...ref, partId: part.id, start, end, quote: content.slice(start, end), anchor: `L${start}_${end}` };
}
