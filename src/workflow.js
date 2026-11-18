import { proseWords, proseBounds } from './prose-length.js';
import { effectiveStory, booleanValue } from './parameters.js';
// Workflow rules shared by the UI and regression tests. Reports are local editorial
// records, not server-side authorization or a guarantee of literary quality.
import {revisionContinuation} from './revision-policy.js';
import { presetSignatureData, validateNovelPresetRecord } from './novel-preset-runtime.js';
export const PASS_SCORE = 82;
export const CHAPTER_CRITERIA = [
  ['character', '人物与动机'], ['causality', '因果与推进'], ['plan', '场景与章末钩子'],
  ['expression', '文笔与重复'], ['constraints', '全局设定约束']
];
export const BOOK_CRITERIA = [
  ['continuity', '时间线与跨章连贯'], ['arcs', '人物弧光与关系'], ['payoff', '伏笔与结局回收'],
  ['pacing', '全书节奏与主线'], ['constraints', '全局设定与历史约束']
];
import { normalizeGraph, graphReady, graphSignature } from './knowledge-graph.js';
export const PLAN_FIELDS = [
  ['goal', '本章目标', '本章结束时，人物或局势必须发生什么变化？'],
  ['conflict', '阻力与代价', '谁阻止主角？选择会失去什么？'],
  ['beats', '场景节拍', '按起因 → 行动 → 转折 → 结果安排场景。'],
  ['emotion', '人物与情绪', '人物知道什么、误信什么，情绪如何转变？'],
  ['foreshadow', '线索与伏笔', '本章埋下、推进或回收什么？无则写“无”。'],
  ['hook', '结尾与承接', '留下什么期待？如何为下一章提供行动起点？']
];

// Import limits protect the browser from malformed or accidentally huge backup
// files. They are intentionally generous for normal long-form novels.
export const IMPORT_LIMITS = Object.freeze({
  title: 1000, storyIdea: 20000, synopsis: 10000, planField: 6000,
  chapterTitle: 300, chapterText: 500000, revisionCount: 10000,
  reviewHistoryCount: 10000, chapters: 10000, drafts: 10000, tags: 80,
  tagLength: 120, arrayItems: 5000, graphUnits: 5000, graphLinks: 12000
});
function importString(value, max, label, optional = true) {
  if (value === undefined && optional) return;
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label}格式无效或超过${max}字限制。`);
}
function importStringArray(value, maxItems, maxLength, label) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > maxItems || value.some(item => typeof item !== 'string' || item.length > maxLength)) throw new Error(`${label}格式无效或数量/长度超限。`);
}
function validateImportedReview(review, criteria, label) {
  if (review === undefined || review === null) return;
  try { validateReview(review, criteria); } catch (error) { throw new Error(`${label}${error.message}`); }
}
export function validateImportedProject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('作品备份必须是 JSON 对象。');
  validateNovelPresetRecord(raw.workflow?.novelPreset);
  importString(raw.title, IMPORT_LIMITS.title, '作品标题', false);
  importString(raw.storyIdea, IMPORT_LIMITS.storyIdea, '创作意图');
  if (!Array.isArray(raw.chapters) || raw.chapters.length > IMPORT_LIMITS.chapters) throw new Error(`章节数量不能超过${IMPORT_LIMITS.chapters}章。`);
  if (!raw.drafts || typeof raw.drafts !== 'object' || Array.isArray(raw.drafts)) throw new Error('正文数据格式无效。');
  const draftKeys = Object.keys(raw.drafts);
  if (draftKeys.length > IMPORT_LIMITS.drafts) throw new Error(`正文条目不能超过${IMPORT_LIMITS.drafts}项。`);
  for (const [id, content] of Object.entries(raw.drafts)) {
    if (!/^\d+$/.test(String(id)) || typeof content !== 'string' || content.length > IMPORT_LIMITS.chapterText) throw new Error('正文章节编号或内容格式无效，或正文超过单章长度限制。');
  }
  const ids = new Set();
  for (const chapter of raw.chapters) {
    if (!chapter || typeof chapter !== 'object' || !Number.isSafeInteger(chapter.id) || chapter.id < 1 || ids.has(chapter.id)) throw new Error('作品中的章节编号格式无效或重复。');
    ids.add(chapter.id);
    importString(chapter.title, IMPORT_LIMITS.chapterTitle, '章节标题', false);
    importString(chapter.synopsis, IMPORT_LIMITS.synopsis, '章节大纲');
    if (chapter.plan !== undefined && (!chapter.plan || typeof chapter.plan !== 'object' || Array.isArray(chapter.plan))) throw new Error('场景规划格式无效。');
    for (const [key, value] of Object.entries(chapter.plan || {})) importString(value, IMPORT_LIMITS.planField, `场景规划「${key}」`);
    importStringArray(chapter.tags, IMPORT_LIMITS.tags, IMPORT_LIMITS.tagLength, '章节标签');
    if (chapter.revisions !== undefined) {
      if (!Array.isArray(chapter.revisions) || chapter.revisions.length > IMPORT_LIMITS.revisionCount) throw new Error('历史版本数量超过限制。');
      chapter.revisions.forEach(revision => { if (!revision || typeof revision !== 'object') throw new Error('历史版本格式无效。'); importString(revision.content, IMPORT_LIMITS.chapterText, '历史版本正文', false); });
    }
    if (chapter.reviewHistory !== undefined) {
      if (!Array.isArray(chapter.reviewHistory) || chapter.reviewHistory.length > IMPORT_LIMITS.reviewHistoryCount) throw new Error('审查历史数量超过限制。');
      chapter.reviewHistory.forEach(review => validateImportedReview(review, CHAPTER_CRITERIA, '章节审查历史'));
    }
    validateImportedReview(chapter.review, CHAPTER_CRITERIA, '章节审查');
  }
  validateImportedReview(raw.workflow?.finalReview, BOOK_CRITERIA, '全书终审');
  importString(raw.workflow?.synopsis, IMPORT_LIMITS.synopsis, '总体大纲');
  importStringArray(raw.authorSettings?.genres, 100, 120, '题材');
  importStringArray(raw.authorSettings?.styles, 100, 120, '文风');
  importStringArray(raw.authorSettings?.contentTags, 200, 120, '内容标签');
  if (raw.graph && typeof raw.graph === 'object') {
    if (Array.isArray(raw.graph.units) && raw.graph.units.length > IMPORT_LIMITS.graphUnits) throw new Error('关系图谱单位数量超过限制。');
    if (Array.isArray(raw.graph.links) && raw.graph.links.length > IMPORT_LIMITS.graphLinks) throw new Error('关系图谱关联数量超过限制。');
  }
  return true;
}

export function fingerprint(value) {
  const text = JSON.stringify(value) ?? '';
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}
export function settingsSignature(s = {}) {
  // Review timing is a workflow preference, not manuscript content. Excluding
  // the new key also preserves signatures in existing projects and backups.
  if(s.workflow?.parameterProtocol==='effective-story-v1')return fingerprint([s.storyIdea||'',effectiveStory(s),presetSignatureData(s)]);
  const { chapterReviewEnabled: _reviewTiming, ...storySettings } = s.settings || {};
  const material=[s.storyIdea || '', s.authorSettings || {}, storySettings, s.scale || {}, s.humanization || {}];
  const preset=presetSignatureData(s);
  if(preset)material.push(preset);
  return fingerprint(material);
}
export function authorLedWorkflow(s) { const run=s?.workflow?.autoRun; return s?.entryMode === 'automatic' && run?.policy === 'author-final-v1' && typeof run.id === 'string' && Boolean(run.startedAt); }
// Chapter level AI review is opt-in. Existing explicit true/false values are
// preserved; only an omitted setting defaults to closed for new workspaces.
export function chapterReviewEnabled(s) { return !authorLedWorkflow(s) && booleanValue(s?.settings?.chapterReviewEnabled,false); }
export function outlineSignature(s = {}) {
  const chapters = Array.isArray(s.chapters) ? s.chapters : [];
  return fingerprint([s.workflow?.synopsis || '', chapters.map(c => [c.id, c.synopsis || ''])]);
}
export function planSignature(c = {}) { return fingerprint([c.synopsis || '', c.plan || {}, c.tags || []]); }
export function settingsReady(s = {}) { return s.workflow?.settingsConfirmed === settingsSignature(s); }
export function outlineReady(s) {
  const chapters = Array.isArray(s?.chapters) ? s.chapters : [];
  return settingsReady(s) && chapters.length > 0 && s.workflow?.outlineConfirmed === outlineSignature(s);
}
export function planReady(c) {
  return Boolean(c && PLAN_FIELDS.every(([k]) => c.plan?.[k]?.trim()) && c.planConfirmed === planSignature(c));
}
const chapterMaterial = (s = {}, c = {}) => [c.id, c.title, c.synopsis, c.plan, c.tags, s.drafts?.[c.id] || ''];
export function chapterSignature(s, c) {
  const chapters = Array.isArray(s?.chapters) ? s.chapters : [];
  const index = chapters.indexOf(c);
  return fingerprint([settingsSignature(s), s?.workflow?.synopsis || '', chapters.slice(0, index + 1).map(entry => chapterMaterial(s, entry))]);
}
export function reviewItemPasses(item) {
  return Number.isInteger(item?.score) && item.score >= PASS_SCORE && item.score <= 100
    && typeof item.evidence === 'string' && Boolean(item.evidence.trim())
    && Array.isArray(item.issues) && item.issues.every(issue => issue?.severity === 'suggestion' && typeof issue.detail === 'string' && issue.detail.trim());
}
// Locks only survive targeted AI revisions. Other changes invalidate them via
// the full chapter/context signature; legacy unscoped arrays are not trusted.
export function chapterReviewLocks(s, c) {
  const signature = chapterSignature(s, c);
  const candidates = c?.review?.mode === 'ai' && c.review.signature === signature ? c.review.items : [];
  const carried = c?.reviewLocks?.mode === 'ai' && c.reviewLocks.signature === signature ? c.reviewLocks.items : [];
  const byId = new Map();
  for (const item of [...(Array.isArray(carried) ? carried : []), ...(Array.isArray(candidates) ? candidates : [])]) {
    if (CHAPTER_CRITERIA.some(([id]) => id === item?.id) && reviewItemPasses(item)) byId.set(item.id, item);
  }
  return [...byId.values()];
}
export function reviewRound(s,c) {
  const signature=chapterSignature(s,c);
  if (c?.reviewCycle?.signature===signature) return Math.max(0,Number(c.reviewCycle.round)||0);
  return c?.review?.signature===signature ? Math.max(0,Number(c.review?.revisionAttempts)||0) : 0;
}
export function chapterReviewDecision(items, round) {
  const checked=validateReview({items,ledger:'门槛校验'}, CHAPTER_CRITERIA).items;
  const blockingIssues=checked.flatMap(item=>item.issues.filter(i=>i.severity==='blocking').map(i=>({...i,criterion:item.id})));
  const strict=checked.every(reviewItemPasses);
  // The second targeted revision is the hard stop.  Remaining low scores or
  // model flagged issues stay visible in the report, but cannot trap the author
  // in an unbounded rewrite loop; the manuscript may proceed with warnings.
  return {policyVersion:2, revisionAttempts:round, qualityScore:Object.fromEntries(checked.map(i=>[i.id,i.score])), blockingIssues,
    gateStatus: strict ? 'passed' : round>=2 ? 'passed-with-suggestions' : 'needs-revision', forcedAfterMaxRounds: Boolean(!strict && round>=2)};
}
export function reportPassed(report, signature, criteria) {
  if (report?.mode !== 'ai' || report.signature !== signature || !Array.isArray(report.items) || report.items.length !== criteria.length) return false;
  const expected = new Set(criteria.map(([id]) => id));
  const seen = new Set();
  const allowSoft = criteria === CHAPTER_CRITERIA && report.policyVersion === 2 && Number(report.revisionAttempts) >= 2;
  for (const item of report.items) {
    if (!expected.has(item?.id) || seen.has(item.id) || !Number.isInteger(item.score) || item.score < (allowSoft ? 0 : PASS_SCORE) || item.score > 100 || typeof item.evidence !== 'string' || !item.evidence.trim() || !Array.isArray(item.issues)) return false;
    if (item.issues.some(issue => !issue || !['blocking', 'suggestion'].includes(issue.severity) || typeof issue.detail !== 'string' || !issue.detail.trim())) return false;
    if (item.issues.some(issue => issue.severity === 'blocking') && !allowSoft) return false;
    seen.add(item.id);
  }
  if (seen.size !== expected.size) return false;
  if (allowSoft) {
    return true;
  }
  return true;
}
export function chapterPassed(s, c) {
  return Boolean(outlineReady(s) && c && planReady(c) && s.drafts?.[c.id]?.trim() && reportPassed(c.review, chapterSignature(s, c), CHAPTER_CRITERIA));
}
export function bookRevisionComplete(s) {
  const report=s?.workflow?.finalReview,record=report?.revisionRecord || report?.revisionClosure;
  // An adopted candidate stops at its target or a durable safety ceiling.
  // Legacy two-round records may use their remaining third-round allowance.
  return Boolean(bookReviewReady(s) && record?.status==='completed' && record.adoptedAt && record.signature===report.signature
    && Boolean(revisionContinuation(record,s.workflow.bookRevisionTarget).stopReason));
}
export function bookReviewReady(s) {
  // A completed, current report unlocks the editorial workflow. Low scores
  // and suggested revisions inform the author; they do not require a loop.
  const report=s?.workflow?.finalReview;
  if(report?.mode!=='ai'||report.signature!==bookSignature(s))return false;
  try {validateReview(report,BOOK_CRITERIA);return true;}catch{return false;}
}
// Author handoff is a separate record. It never changes an AI report, its
// signature, scores, coverage, request budget or completion status.
export function bookReviewHandoffReady(s) {
  const record=s?.workflow?.reviewHandoff;
  return Boolean(!authorLedWorkflow(s) && record?.protocol==='book-review-handoff-v1' && record.status==='approved'
    && record.bookId===s.activeBookId && record.signature===bookSignature(s)
    && record.ownerId===(s.books?.find(b=>b.id===s.activeBookId)?.ownerId || s.currentUserId || 'local-author')
    && record.acceptedBy && record.at && record.manuscriptAcknowledged===true && record.auditAcknowledged===true && !finalGate(s));
}
export function editorialReviewReady(s) { return bookReviewReady(s) || bookReviewHandoffReady(s); }
export function recordBookReviewHandoff(s, {signature,manuscriptAcknowledged,auditAcknowledged,task,administrator=false}={}) {
  if(authorLedWorkflow(s))throw new Error('请在一键自动模式的人工终审中确认接管。');
  const gate=finalGate(s);if(gate)throw new Error(gate);
  if(signature!==bookSignature(s))throw new Error('正文或设定已变化，请重新阅读并确认当前版本。');
  if(manuscriptAcknowledged!==true||auditAcknowledged!==true)throw new Error('请勾选已阅读正文及已知晓 AI 审查未完成。');
  if(!s.currentUserId)throw new Error('请先登录后确认作者接管。');
  const ownerId=s.books?.find(b=>b.id===s.activeBookId)?.ownerId || s.currentUserId;
  if(ownerId!==s.currentUserId&&!administrator)throw new Error('只有作品作者或管理员可以确认接管。');
  const report=s.workflow.finalReview;
  const record={protocol:'book-review-handoff-v1',status:'approved',bookId:s.activeBookId,
    ownerId,acceptedBy:s.currentUserId,
    signature,manuscriptAcknowledged:true,auditAcknowledged:true,at:new Date(Math.max(Date.now(),(Date.parse(s.workflow.reviewHandoff?.at)||0)+1)).toISOString(),
    reportStatus:bookReviewReady(s)?'complete':!report?'missing':report.signature!==signature?'stale':'invalid',
    reportSignature:report?.signature || '',
    auditTask:task?{id:task.id,signature:task.signature,status:task.status,error:task.error || '',
      completedParts:task.completedParts || 0,totalParts:task.totalParts || 0}:null};
  if(s.workflow.reviewHandoff)(s.workflow.reviewHandoffHistory ||= []).push(s.workflow.reviewHandoff);
  s.workflow.reviewHandoff=record;
  return record;
}
export function chapterContentReady(s,c) {
  if(!outlineReady(s)||!c||!planReady(c)||!s.drafts?.[c.id]?.trim())return false;
  const target=Number(s.scale?.wordsPerChapter);
  if(!Number.isSafeInteger(target)||target<1)return false;
  const bounds=proseBounds(target),actual=proseWords(s.drafts[c.id]);
  return actual>=bounds.min&&actual<=bounds.max;
}
export function chapterHandoffReady(s,c) {
  const record=c?.reviewHandoff;
  return Boolean(record?.status==='accepted'&&record.signature===chapterSignature(s,c)&&record.acceptedBy&&record.at&&chapterContentReady(s,c));
}
export function recordChapterHandoff(s,c,acceptedBy) {
  if(!acceptedBy||!chapterContentReady(s,c))throw new Error('请先确认本章规划，并保存符合目标篇幅的完整正文；缺失或不完整的正文不能跳过。');
  if(c.reviewHandoff)(c.reviewHandoffHistory ||= []).push(c.reviewHandoff);
  c.reviewHandoff={status:'accepted',signature:chapterSignature(s,c),acceptedBy,at:new Date().toISOString(),auditStatus:'incomplete'};
  return c.reviewHandoff;
}
export function chapterReady(s, c) {
  return chapterReviewEnabled(s) ? chapterPassed(s, c) || chapterHandoffReady(s,c)
    : Boolean(outlineReady(s) && c && planReady(c) && s.drafts?.[c.id]?.trim());
}
export function chapterGate(s, c) {
  if (!settingsReady(s)) return '请先确认故事设定与全局约束。';
  if (!outlineReady(s)) return '请先生成并确认总体大纲与章节目录。';
  const chapters = Array.isArray(s?.chapters) ? s.chapters : [];
  if (!c || !chapters.includes(c)) return '请先从总体大纲中选择章节。';
  const previous = chapters.slice(0, chapters.indexOf(c)).find(entry => !chapterReady(s, entry));
  return previous ? `请先完成《${previous.title}》的${chapterReviewEnabled(s) ? '写作与质量审查' : '规划确认与正文写作'}，再规划本章。` : '';
}
function hasBookIdentity(s) {
  const identity=s?.workflow?.bookIdentity;
  return identity?.protocol==='book-identity-v1' && identity.bookId===s.activeBookId
    && (typeof identity.titleSeed==='string'||identity.titleSeed===null);
}
export function bookIdentityTitle(s) {
  return hasBookIdentity(s) ? s.workflow.bookIdentity.titleSeed : s?.books?.find(b=>b.id===s.activeBookId)?.title;
}
export function renameBook(s,title) {
  const book=s?.books?.find(b=>b.id===s.activeBookId);
  if(!book||typeof title!=='string'||title===book.title)return false;
  s.workflow ||= {};
  // Retain the legacy hash input as an immutable seed. No paid report,
  // checkpoint, pending candidate or task signature needs to be rewritten.
  if(!hasBookIdentity(s))s.workflow.bookIdentity={protocol:'book-identity-v1',bookId:s.activeBookId,titleSeed:book.title??null};
  book.title=title;
  return true;
}
const storedBookState=book=>({...book,activeBookId:book.id,books:[book]});
export function needsBookIdentityRecovery(book) {
  const s=storedBookState(book),report=book.workflow?.finalReview;
  if(hasBookIdentity(s)||report?.mode!=='ai'||typeof report.signature!=='string'||report.signature===bookSignature(s))return false;
  try{validateReview(report,BOOK_CRITERIA);return true;}catch{return false;}
}
export function recoverBookIdentity(book,title) {
  if(typeof title!=='string'||!needsBookIdentityRecovery(book))return false;
  const s=storedBookState(book),identity={protocol:'book-identity-v1',bookId:book.id,titleSeed:title};
  // Recompute using today's complete manuscript/settings and only the
  // historical title. A content change must never become a passed review.
  s.workflow={...s.workflow,bookIdentity:identity};
  if(bookSignature(s)!==book.workflow.finalReview.signature)return false;
  book.workflow.bookIdentity=identity;
  return true;
}
export function bookSignature(s) {
  // Editorial approval is a property of the manuscript. Graph edits may need
  // confirmation before publishing, but they must not block reading the book.
  const chapters = Array.isArray(s?.chapters) ? s.chapters : [];
  return fingerprint([s?.activeBookId, bookIdentityTitle(s), settingsSignature(s), outlineSignature(s), chapters.map(c => chapterMaterial(s, c))]);
}
export function finalGate(s) {
  if (!outlineReady(s)) return '请先确认全局设定和总体大纲。';
  const incomplete = (Array.isArray(s?.chapters) ? s.chapters : []).find(c => !chapterReady(s, c));
  return incomplete ? (chapterReviewEnabled(s) ? `《${incomplete.title}》尚未通过当前版本的章节审查。` : `请先完成《${incomplete.title}》的规划确认与正文写作，再进行全书终审。`) : '';
}
export function detailAdjustReady(s) {
  const record = s.workflow?.detailAdjustment;
  // Existing workspaces created before the whole-book keyword step have no
  // record; keep them readable and let the new UI offer an explicit skip.
  if (!record) return true;
  return Boolean(record && record.signature === bookSignature(s) && (record.status === 'applied' || record.status === 'skipped' || record.operations?.confirmedNoop || Array.isArray(record.chapters)));
}
export function humanReviewReady(s) {
  const record = s.workflow?.humanReview;
  if (authorLedWorkflow(s) && (!authorAcceptanceReady(s) || record?.graphSignature !== graphSignature(s.graph))) return false;
  if (!bookReviewReady(s) && bookReviewHandoffReady(s)
    && (record?.reviewHandoffAt!==s.workflow.reviewHandoff.at || record?.graphSignature!==graphSignature(s.graph))) return false;
  return Boolean(record && record.signature === bookSignature(s) && record.status === 'approved');
}
export function automaticDraftGate(s) {
  const run=s?.workflow?.autoRun;
  if (!authorLedWorkflow(s)) return '请先启动一键自动模式。';
  if (run.status === 'running') return '自动任务仍在运行。';
  if (!Number.isInteger(run.targetChapters) || s.chapters.length < run.targetChapters || s.chapters.length < Number(s.scale?.totalChapters || 1)) return '目标章节尚未全部完成。';
  if (!outlineReady(s) || s.chapters.some(c=>!planReady(c) || !s.drafts?.[c.id]?.trim())) return '请先完成设定、大纲、章节规划与全部正文。';
  if (!run.manuscriptCompletedAt || run.pendingDraft) return '正文生成尚未完成，请继续当前任务。';
  return '';
}
export function authorAcceptanceReady(s) {
  const record=s?.workflow?.authorAcceptance;
  return Boolean(!automaticDraftGate(s) && record?.status==='approved' && record.signature===bookSignature(s) && record.graphSignature===graphSignature(s.graph) && record.auditAcknowledged && record.materialsAcknowledged);
}
export function exportGate(s) {
  if (s?.adminSettings?.allowExport === false) return '工作区已关闭导出权限。';
  if (authorLedWorkflow(s)) return automaticDraftGate(s) || (!authorAcceptanceReady(s) ? '请在人工终审核对正文、问题和图谱，并确认当前版本定稿。' : !humanReviewReady(s) ? '请生成并确认当前定稿的推广资料。' : '');
  const reviewGate = finalGate(s) || (editorialReviewReady(s) ? '' : '请先完成当前版本的全本审查，或在全书终审中确认由作者接管；评分达标不作为导出条件。');
  if (reviewGate) return reviewGate;
  if (!detailAdjustReady(s)) return '请在全书终审后完成“细节调整”，或确认当前版本无需调整。';
  if (!graphReady(s.graph)) return '关系图谱有未确认的单位或关联变更，请先完成图谱校验。';
  if (!bookReviewReady(s) && bookReviewHandoffReady(s) && !humanReviewReady(s)) return '作者已接管未完成的 AI 审查，请在人工终审中确认当前书稿与推广资料后导出。';
  return '';
}
export function exportNextStep(s) {
  if (!exportGate(s) || s?.adminSettings?.allowExport===false) return null;
  if (authorLedWorkflow(s)) return automaticDraftGate(s) ? ['automatic','继续一键自动创作'] : ['human-review','前往人工终审'];
  if (!settingsReady(s)) return ['settings','确认故事设定'];
  if (!outlineReady(s)) return ['outline','确认总体大纲'];
  if (finalGate(s)) return ['studio','完成逐章创作'];
  if (!editorialReviewReady(s)) return ['review','前往全书终审'];
  if (!detailAdjustReady(s)) return ['detail','前往细节优化'];
  if (!graphReady(s.graph)) return ['relations','前往关系图谱'];
  return ['human-review','前往人工终审'];
}
export function chapterStatus(s, c) {
  if (!chapterReviewEnabled(s)) return chapterReady(s, c) ? '正文已完成 · 全书统一审查' : s?.drafts?.[c?.id]?.trim() ? '正文已保存 · 待确认规划' : planReady(c) ? '待写正文' : '待剧情规划';
  if (chapterPassed(s, c)) return '审查通过';
  if (chapterHandoffReady(s,c))return '作者接管 · AI 检查待补';
  if (c?.review && c.review.signature !== chapterSignature(s, c)) return '修改后待复审';
  if (c?.review?.mode === 'demo') return '演示审查 · 待正式审查';
  if (c && s?.drafts?.[c.id]?.trim()) return c.review ? '待修订 / 复审' : '正文待审查';
  return planReady(c) ? '待写正文' : '待剧情规划';
}
export function normalizeWorkflow(s) {
  s.workflow = { synopsis: '', settingsConfirmed: '', outlineConfirmed: '', finalReview: null, detailAdjustment: null, detailAdjustOptions: {}, termDictionary: [], termProposal: null, humanReview: null, ...s.workflow };
  s.chapters = Array.isArray(s.chapters) ? s.chapters : [];
  s.drafts = s.drafts && typeof s.drafts === 'object' ? s.drafts : {};
  s.graph = normalizeGraph(s.graph);
  s.chapters.forEach(c => {
    c.synopsis = typeof c.synopsis === 'string' ? c.synopsis : '';
    c.plan = { ...Object.fromEntries(PLAN_FIELDS.map(([k]) => [k, ''])), ...c.plan };
    c.tags = Array.isArray(c.tags) ? c.tags : String(c.sceneCard || '').split('、').filter(Boolean);
    c.planConfirmed ||= '';
    c.review ||= null;
  });
  if (!s.chapters.some(c => c.id === s.selectedChapter)) s.selectedChapter = s.chapters[0]?.id || null;
}
export function deleteChapter(s, id) {
  const index = s.chapters.findIndex(c => c.id === id);
  if (index < 0) return false;
  s.chapters.splice(index, 1);
  delete s.drafts[id];
  renumberChapterTitles(s);
  s.workflow.outlineConfirmed = '';
  s.workflow.finalReview = null;
  // Deleting even the last chapter changes the intended resolution of the book.
  s.chapters.forEach(c => { c.review = null; });
  if (s.selectedChapter === id) s.selectedChapter = s.chapters[Math.min(index, s.chapters.length - 1)]?.id || null;
  return true;
}

// Chapter ids remain stable so drafts, reviews and graph references stay attached
// to the same chapter. Only the human-facing numeric prefix is regenerated.
export function renumberChapterTitles(s) {
  s.chapters.forEach((chapter, index) => {
    const title = String(chapter.title || '').trim();
    const match = title.match(/^第\s*(?:\d+|[零〇一二三四五六七八九十百千万两]+)\s*章\s*/);
    if (match) {
      const rest = title.slice(match[0].length).trim();
      chapter.title = `第${index + 1}章${rest ? `  ${rest}` : ''}`;
    }
  });
  return s.chapters;
}
export function parseJSON(text) {
  try { return JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error('AI 返回的结构不完整，请重试；原内容已保留。'); }
}
export function validateReview(value, criteria) {
  if (!Array.isArray(value?.items) || value.items.length !== criteria.length) throw new Error('审查结果缺少必要维度，不能判定通过。');
  const items = criteria.map(([id, label]) => {
    const matches = value.items.filter(item => item.id === id);
    const item = matches[0];
    if (matches.length !== 1 || !Number.isInteger(item.score) || item.score < 0 || item.score > 100 || typeof item.evidence !== 'string' || !item.evidence.trim() || !Array.isArray(item.issues) || item.issues.some(issue => !['blocking', 'suggestion'].includes(issue?.severity) || typeof issue.detail !== 'string' || !issue.detail.trim())) {
      throw new Error('审查结果的分数、依据或问题格式无效，不能判定通过。');
    }
    return { id, label, score: item.score, evidence: item.evidence, issues: item.issues };
  });
  if (typeof value.ledger !== 'string' || !value.ledger.trim()) throw new Error('审查缺少有效的连续性档案，请重试。');
  return { items, ledger: value.ledger };
}
export function mergeReviews(reports, criteria) {
  return criteria.map(([id, label]) => {
    const items = reports.map(r => r?.items?.find(item => item.id === id)).filter(Boolean);
    if (!items.length) return { id, label, score: 0, evidence: '该维度没有可核实的审查结果。', issues: [{ severity: 'blocking', detail: '审查结果不完整，请重新检查。' }] };
    return { id, label, score: Math.min(...items.map(item => Number.isFinite(item.score) ? item.score : 0)), evidence: items.map((item, i) => `检查 ${i + 1}：${item.evidence || '未提供依据'}`).join('\n'), issues: items.flatMap(item => Array.isArray(item.issues) ? item.issues : [{ severity: 'blocking', detail: '审查问题格式不完整。' }]) };
  });
}
export function splitText(text, limit = 10000) {
  const source = String(text || '');
  const size = Math.max(200, Number(limit) || 10000);
  const parts = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(source.length, start + size);
    if (end < source.length) {
      // Keep paragraphs and sentences intact when there is a safe boundary in
      // the latter half of the window. A hard split remains the last resort,
      // and every character is still preserved exactly once.
      const windowStart = start + Math.floor(size * 0.55);
      const boundary = source.slice(windowStart, end).search(/[\n。！？!?；;]\s*/g);
      if (boundary >= 0) end = windowStart + boundary + 1;
    }
    if (end <= start) end = Math.min(source.length, start + size);
    parts.push(source.slice(start, end));
    start = end;
  }
  return parts;
}
