import { BOOK_CRITERIA, CHAPTER_CRITERIA, bookSignature, bookIdentityTitle, fingerprint, validateReview, reviewItemPasses } from './workflow.js';
import { BOOK_QUALITY_PROTOCOL } from './book-quality.js';
import { CHAPTER_TASK_PROTOCOL, applyChapterPatches } from './chapter-task-contract.js';
import { LONG_TASK_PROTOCOL, LONG_TASK_REVISION, coverageComplete } from './long-task-contract.js';
import { MINIMAL_REVISION_POLICY } from './revision-result.js';
import { BOOK_AUDIT_PROTOCOL } from './book-audit-contract.js';
import { LARGE_TEXT_PROTOCOL, CHAPTER_BATCH_PROTOCOL } from './large-text-contract.js';

export const QUALITY_RUN_PROTOCOL = 'quality-check-v3';
export const QUALITY_LONG_TASK_CAPABILITIES = Object.freeze({
  protocol: LONG_TASK_PROTOCOL,
  revision: LONG_TASK_REVISION,
  auditProtocol: BOOK_AUDIT_PROTOCOL,
  chapterProtocol: CHAPTER_TASK_PROTOCOL,
  largeTextProtocol: LARGE_TEXT_PROTOCOL
});
export function qualityBackendReady(health = {}) {
  return Object.entries(QUALITY_LONG_TASK_CAPABILITIES).every(([key, value]) => health[key] === value);
}
const average = items => Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length);
const compact = value => String(value || '').replace(/\s/g, '');
const stamp = () => new Date().toISOString();

// Quality candidates may pass through multiple local revision rounds.  Chapter
// patch offsets from a later round refer to the previous candidate, so expose
// one deterministic diff against the original chapter for safe adoption.
export function candidatePatch(source, content, reason) {
  if (source === content) return [];
  let start = 0;
  while (start < source.length && start < content.length && source[start] === content[start]) start += 1;
  const commonStart = start;
  let sourceEnd = source.length, contentEnd = content.length;
  while (sourceEnd > start && contentEnd > start && source[sourceEnd - 1] === content[contentEnd - 1]) {
    sourceEnd -= 1; contentEnd -= 1;
  }
  // applyChapterPatches requires a non-empty before/after span.  Expand a
  // pure insertion to include its preceding character; normal revisions use
  // the exact changed range and preserve every untouched character.
  if (sourceEnd === start) {
    if (start === 0) {
      sourceEnd = Math.min(1, source.length);
      contentEnd = Math.min(content.length, sourceEnd + Math.max(0, content.length - source.length));
    } else {
      start -= 1;
      sourceEnd = commonStart;
      contentEnd = Math.min(content.length, commonStart + Math.max(0, content.length - source.length));
    }
  } else if (contentEnd === start) {
    // The patch protocol requires a non-empty replacement. Include one
    // unchanged neighbouring character so a deletion remains representable.
    if (sourceEnd < source.length) {
      sourceEnd += 1;
      contentEnd += 1;
    }
    else if (start > 0) { start -= 1; contentEnd = start + 1; sourceEnd = source.length; }
  }
  return [{ start, end: sourceEnd, before: source.slice(start, sourceEnd), after: content.slice(start, contentEnd), reason: reason || '质量检查最小修订' }];
}

const identityTitle=book=>bookIdentityTitle({...book,activeBookId:book.id,books:[book]});
export function qualitySource(book) {
  return { bookId: book.id, ownerId: book.ownerId || 'local-author', title: identityTitle(book) || '未命名作品',
    chapters: (book.chapters || []).map((chapter, index) => ({
      chapterId: chapter.id, chapterIndex: index + 1, title: chapter.title || `第${index + 1}章`,
      synopsis: chapter.synopsis || '', plan: chapter.plan || {}, tags: chapter.tags || [], content: String(book.drafts?.[chapter.id] || ''),
      signature: fingerprint([chapter.id, chapter.title, chapter.synopsis, chapter.plan, chapter.tags, book.drafts?.[chapter.id] || ''])
    })).filter(chapter => chapter.content.trim()) };
}
const sourceSignature = book => fingerprint([book.ownerId || 'local-author', bookSignature({ ...book, activeBookId: book.id, books: [book] })]);
const contextSignature = book => fingerprint([book.id, book.ownerId, identityTitle(book), book.storyIdea, book.authorSettings, book.settings, book.scale, book.humanization, book.workflow?.synopsis, (book.chapters || []).map(c => [c.id, c.title, c.synopsis, c.plan, c.tags])]);
export function qualityRunKey(book, profiles) {
  return fingerprint([QUALITY_RUN_PROTOCOL, sourceSignature(book), profiles.map(p => [p.id, p.model, p.endpoint])]);
}

function delay(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason || new DOMException('任务已暂停', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// Reuse durable chapter/book tasks with a fixed AI per candidate. Existing
// request timeouts, streaming, retries and truncation subdivision remain intact.
export function createQualityTaskRunner(backend, { pollInterval = 4000 } = {}) {
  return async ({ kind, snapshot, signature, context, profile, config, resumeRef, check, onRef, progress, signal }) => {
    if (!backend) throw new Error('质量检查需要本地分段任务服务，请启动服务后继续。');
    check();
    // Rehydrate a matching persisted task after refresh before submitting.
    // The server identity check remains the final deduplication guard.
    let ref = resumeRef?.id && (kind !== 'quality' || resumeRef.revision === BOOK_AUDIT_PROTOCOL) && resumeRef.kind === kind && resumeRef.bookId === snapshot.bookId
      && resumeRef.ownerId === snapshot.ownerId && resumeRef.signature === signature ? resumeRef : null;
    try {
    if (ref) {
      try { ref = await backend.status(ref); onRef(ref); }
      catch { ref = null; }
    }
    if (!ref) {
      ref = await backend.start(kind, snapshot, signature, context, profile.id, { config: config || {} });
      onRef(ref);
    }
    check();
    if (['paused', 'cancelled'].includes(ref.status)) { ref = await backend.control(ref, 'resume'); onRef(ref); }
    while (['queued', 'running'].includes(ref.status)) {
      check(); await delay(pollInterval, signal); check();
      ref = await backend.status(ref); onRef(ref);
      progress(`${profile.label || profile.id} · ${ref.completedParts || 0}/${ref.totalParts || '—'} 块 · 本地复用 ${ref.reuse?.characters||0} 字符${ref.qualityBudget?` · 本书已用请求 ${ref.qualityBudget.used}`:''} · ${ref.message || '处理中'}`);
    }
    check();
    if (ref.status !== 'completed') throw new Error(ref.error || '任务未全部完成，已保存进度，请继续缺失步骤。');
    const result = await backend.result(ref); check();
    if (result?.mode !== 'ai' || result.bookId !== snapshot.bookId || result.ownerId !== snapshot.ownerId || result.signature !== signature
      || result.protocol !== (kind === 'quality' ? BOOK_QUALITY_PROTOCOL : kind==='chapter-batch'?CHAPTER_BATCH_PROTOCOL:CHAPTER_TASK_PROTOCOL)
      || kind === 'quality' && result.longProtocol !== LONG_TASK_PROTOCOL
      || kind === 'quality' && result.scanProtocol !== BOOK_AUDIT_PROTOCOL
      || kind.startsWith('chapter-') && (kind!=='chapter-batch' && result.chapterId !== snapshot.chapters[0].chapterId || result.taskId !== ref.id)) throw new Error('AI 结果与当前作品、章节或任务版本不一致。');
    const sources = (result.review || result).sources;
    if (!sources?.length || sources.some(s => s.id !== profile.id || s.model !== profile.model)) throw new Error('AI 结果来源与所选模型不一致，候选未采用。');
    return result;
    }catch(error){
      if(signal?.aborted&&ref?.id&&['running','queued'].includes(ref.status))await backend.control(ref,'pause').catch(()=>{});
      throw error;
    }
  };
}

function validateChapterReport(report, snapshot) {
  validateReview(report, CHAPTER_CRITERIA);
  if (report?.protocol !== CHAPTER_TASK_PROTOCOL || !Array.isArray(report.partReports)
    || !coverageComplete(snapshot, report.partReports.map(r => r.part))) throw new Error('章节分段审查未覆盖完整正文。');
}
function candidateResult(content, report, patches, chapter, changes) {
  if (typeof content !== 'string' || !content.trim() || compact(content).length < Math.max(240, compact(chapter.content).length * .55)) throw new Error('章节修订不完整或被过度缩写，原稿保留。');
  const checked = validateReview(report, CHAPTER_CRITERIA), { partReports, ...savedReport } = report;
  const safePatches = candidatePatch(chapter.content, content, changes);
  return { content, patches: safePatches, changes, report: savedReport, items: checked.items, score: average(checked.items),
    blocking: checked.items.some(i => i.issues.some(issue => issue.severity === 'blocking')),
    passed: checked.items.every(reviewItemPasses), contentSignature: fingerprint(content), sourceSignature: chapter.signature };
}

export function qualityProgressText(run, active = false) {
  if (!run) return '未开始';
  if (run.protocol !== QUALITY_RUN_PROTOCOL) return '保留旧版结果 · 可启动新版分段检查';
  const counts = `章节检查 ${Object.keys(run.chapterResults || {}).length}/${run.totalChapterChecks || 0} · 合成稿终审 ${Object.keys(run.wholeBookResults || {}).length}/${run.selectedProfiles?.length || 0}`;
  return `${run.status === 'awaiting-human' ? '全部检查完成 · 等待人工终审' : run.status === 'running' && active ? '检查中' : '待继续 · 成功步骤已保留'} · ${counts}`;
}

export async function runQualityCheck({ book, profiles, backgroundTasks, runTask = createQualityTaskRunner(backgroundTasks), save, progress = () => {}, signal, concurrency = 2, getCurrentBook = () => book, analysisContext }) {
  if (!book?.id) throw new Error('找不到待检查作品。');
  const source = qualitySource(book);
  if (!source.chapters.length) throw new Error('作品没有可检查的正文。');
  if (!profiles?.length || new Set(profiles.map(p => p.id)).size !== profiles.length) throw new Error('请选择已测试并保存、且不重复的 AI 档案。');
  book.workflow ||= {};
  const old = book.workflow.qualityRun, key = qualityRunKey(book, profiles), signature = sourceSignature(book);
  const same = old?.protocol === QUALITY_RUN_PROTOCOL && old.key === key && old.sourceSignature === signature;
  if (!same && old) (book.workflow.qualityRunHistory ||= []).push(old);
  const run = book.workflow.qualityRun = same ? old : {
    version: 2, protocol: QUALITY_RUN_PROTOCOL, id: crypto.randomUUID(), bookId: book.id, ownerId: source.ownerId,
    key, sourceSignature: signature, contextSignature: contextSignature(book), startedAt: stamp(),
    sourceChapters: source.chapters.map(c => ({ chapterId: c.chapterId, signature: c.signature })),
    selectedProfiles: profiles.map(p => ({ id: p.id, label: p.label, model: p.model })),
    chapterResults: {}, wholeBookResults: {}, candidates: {}, selectedCandidates: {}, assembledDrafts: {}, taskRefs: {}, acceptedChapters: {}
  };
  run.status = 'running'; run.completedAt = ''; run.errors = []; run.totalChapterChecks = source.chapters.length * profiles.length;
  const saveRun = () => { run.updatedAt = stamp(); if (book.workflow.qualityRun === run) save?.(book); };
  const check = () => {
    signal?.throwIfAborted();
    const current = getCurrentBook();
    if (!current || current.workflow?.qualityRun !== run || sourceSignature(current) !== signature) throw new Error('作品、章节或设定已变化，旧版任务已保留，不能应用到新版本。');
  };
  const context = analysisContext ?? `作品：${source.title}\n创作意图：${book.storyIdea || ''}\n作者设定：${JSON.stringify(book.authorSettings || {})}\n总体大纲：${book.workflow.synopsis || ''}\n只按实际提供的正文和设定判断；未提供的规划不视为缺失。`;
  const task = (taskKey, options) => runTask({ ...options, resumeRef: run.taskRefs[taskKey], check, signal,
    onRef: ref => { run.taskRefs[taskKey] = ref; saveRun(); }, progress: message => progress(`《${source.title}》· ${message}`) });
  const pause = message => { run.status = 'paused'; run.completedAt = ''; if (message) run.errors.push(message); saveRun(); return run; };
  saveRun();
  try {
    check(); run.phase = 'chapters';
    const bases={};
    for(const profile of profiles) {
      if(source.chapters.every(c=>run.chapterResults[`${c.chapterId}:${profile.id}`]))continue;
      try {
        check();
        const result=await task('chapters:'+profile.id,{kind:'chapter-batch',snapshot:source,signature,context,profile});
        for(const chapter of source.chapters)validateChapterReport(result.reports?.[chapter.chapterId],{...source,chapters:[chapter]});
        bases[profile.id]=result;
        run.reuse ||= {};run.reuse[profile.id]=result.reuse;saveRun();
      } catch(error) {check();run.errors.push(`${profile.label||profile.id} · 章节检查：${error.message}`);saveRun();}

    }
    const pending = source.chapters.flatMap(chapter => profiles.filter(profile => bases[profile.id]&&!run.chapterResults[`${chapter.chapterId}:${profile.id}`]).map(profile => ({ chapter, profile })));
    let cursor = 0, fatal = null;
    const worker = async () => {
      while (!fatal) {
        const job = pending[cursor++]; if (!job) return;
        const { chapter, profile } = job, taskKey = `${chapter.chapterId}:${profile.id}`;
        try {
          check(); progress(`《${source.title}》· 第${chapter.chapterIndex}章 · ${profile.label || profile.id} · 分段审查与最小修订`);
          const snapshot = { bookId: source.bookId, ownerId: source.ownerId, title: source.title, chapters: [chapter] };
          const chapterContext = context + '\n本章标签：' + chapter.tags.join('、');
          const previousTail = source.chapters[source.chapters.indexOf(chapter) - 1]?.content.slice(-1500) || '';
          const options = { snapshot, signature: fingerprint([context, chapter.signature,previousTail]), context: chapterContext, profile, config: { previousTail } };
          const base = bases[profile.id].reports[chapter.chapterId];
          validateChapterReport(base, snapshot);
          let report = base, content = chapter.content, patches = [], changes = '分段审查已达标，保留原文。';
          const revisionHistory = [];
          let revisionAttempts = 0, parentTaskId = base.taskId;
          while (!report.items.every(reviewItemPasses)) {
            // The first revision is anchored to the original review task;
            // later rounds are anchored to the previous minimal candidate.
            // This keeps the durable parent/content correspondence strict
            // while allowing unresolved issues to continue independently.
            const currentSnapshot = revisionAttempts === 0
              ? snapshot
              : { ...snapshot, chapters: [{ ...chapter, content }] };
            const currentSignature = revisionAttempts === 0
              ? options.signature
              : fingerprint([signature, chapter.signature, content]);
            const revisionKey = taskKey + ':revision:' + (revisionAttempts + 1);
            const revised = await task(revisionKey, { snapshot: currentSnapshot, signature: currentSignature, context: chapterContext, profile,
              config: { previousTail, reviewTaskId: parentTaskId, qualityRoot:bases[profile.id].taskId, lockedItems: report.items.filter(reviewItemPasses), revisionAttempts,
                revisionPolicy: MINIMAL_REVISION_POLICY,
                directions: '只按有原文定位的问题做最小必要修订，已处理的问题和达标维度保持不变，未涉及的原句全部保留。' }, kind: 'chapter-revision' });
            if (revised.revisionAttempts !== revisionAttempts + 1 || applyChapterPatches(content, revised.patches) !== revised.content) throw new Error('局部修订与当前候选或轮次不一致。');
            validateChapterReport(revised.review, { ...currentSnapshot, chapters: [{ ...chapter, content: revised.content }] });
            revisionAttempts += 1;
            revisionHistory.push({ round: revisionAttempts, patches: revised.patches.length, sourceSignature: fingerprint(content) });
            const noProgress=revised.content===content || (revised.review.findings||[]).length >= (report.findings||[]).length;
            report = revised.review; content = revised.content; parentTaskId = revised.taskId || run.taskRefs[revisionKey]?.id;
            changes = `完成 ${revisionAttempts} 轮局部最小修订，共替换 ${revisionHistory.reduce((sum, item) => sum + item.patches, 0)} 处；已局部复核，分数按已采用修正记分调整，保留初审分数，未重新评分。`;
            if(noProgress || report.chapterRevision?.stopReason && report.chapterRevision.stopReason !== 'continue'){changes+=noProgress?' 本轮无进展，已停止追加修订。':' 已停止追加修订，未解决项保留。';break;}
          }
          check();
          run.chapterResults[taskKey] = { chapterId: chapter.chapterId, profileId: profile.id, sourceSignature: chapter.signature,
            result: { ...candidateResult(content, report, patches, chapter, changes), revisionAttempts, revisionHistory }, at: stamp() }; saveRun();
        } catch (error) {
          run.errors.push(`${profile.label || profile.id} · 第${chapter.chapterIndex}章：${error.message || error}`);
          try { check(); } catch (error) { fatal = error; }
          saveRun();
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(Math.max(1, Number(concurrency) || 1), 8, pending.length || 1) }, worker));
    if (fatal) throw fatal;
    check();
    if (Object.keys(run.chapterResults).length !== run.totalChapterChecks) return pause('章节检查尚未全部完成，暂不合成或推送；继续时只处理缺失结果。');
    run.phase = 'assembly';
    for (const chapter of source.chapters) {
      const candidates = profiles.map(profile => {
        const entry = run.chapterResults[`${chapter.chapterId}:${profile.id}`];
        if (entry.sourceSignature !== chapter.signature || entry.result.contentSignature !== fingerprint(entry.result.content)) throw new Error('已保存候选与章节版本不一致。');
        return { ...entry.result, profileId: profile.id, at: entry.at };
      }).sort((a, b) => b.score - a.score || Number(a.blocking) - Number(b.blocking));
      const best = candidates[0];
      run.candidates[chapter.chapterId] = candidates;
      run.selectedCandidates[chapter.chapterId] = { profileId: best.profileId, score: best.score, sourceSignature: chapter.signature, contentSignature: best.contentSignature };
      run.assembledDrafts[chapter.chapterId] = best.content;
    }
    const assembled = { ...source, chapters: source.chapters.map(c => ({ ...c, content: run.assembledDrafts[c.chapterId] })) };
    run.assembledSignature = sourceSignature({ ...book, drafts: { ...book.drafts, ...run.assembledDrafts } });
    run.phase = 'whole'; saveRun();
    // Every AI reviews the actual assembled version once, rather than applying
    // original-manuscript scores to a different candidate book.
    for (const profile of profiles) {
      if (run.wholeBookResults[profile.id]?.assemblySignature === run.assembledSignature) continue;
      try {
        check(); progress(`《${source.title}》· ${profile.label || profile.id} · 合成稿全本终审`);
        const result = await task('whole:' + profile.id, { kind: 'quality', snapshot: assembled, signature: run.assembledSignature, context, profile,
          config: { strategy: 'fast',qualityRoot:run.taskRefs['chapters:'+profile.id]?.id } });
        validateReview(result, BOOK_CRITERIA); check();
        run.wholeBookResults[profile.id] = { profileId: profile.id, assemblySignature: run.assembledSignature, result, at: stamp() }; saveRun();
      } catch (error) {
        run.errors.push(`${profile.label || profile.id} · 合成稿终审：${error.message || error}`); saveRun(); check();
      }
    }
    if (profiles.some(p => run.wholeBookResults[p.id]?.assemblySignature !== run.assembledSignature)) return pause('合成稿终审尚未全部完成，暂不推送；已完成结果保留。');
    check(); run.status = 'awaiting-human'; run.phase = 'complete'; run.completedAt = stamp(); saveRun(); return run;
  } catch (error) { return pause(String(error.message || error)); }
}

export function qualityRecommendationEligible(run, chapterId) {
  if (run?.protocol !== QUALITY_RUN_PROTOCOL || run.status !== 'awaiting-human' || !run.selectedProfiles?.length) return false;
  const selected = run.selectedCandidates?.[chapterId], candidate = run.candidates?.[chapterId]?.find(c => c.profileId === selected?.profileId);
  return Boolean(candidate?.passed && !candidate.blocking && run.selectedProfiles.every(p => {
    const entry = run.wholeBookResults?.[p.id];
    return entry?.assemblySignature === run.assembledSignature && entry.result.items.every(reviewItemPasses);
  }));
}

// Validate work/run/chapter/content correspondence before changing any prose.
export function acceptQualityRecommendation(book, notification) {
  const run = book?.workflow?.qualityRun;
  if (!book || notification?.bookId !== book.id || notification.runId !== run?.id || notification.status !== 'unread'
    || notification.recipientId !== (book.ownerId || '') || !qualityRecommendationEligible(run, notification.chapterId)
    || contextSignature(book) !== run.contextSignature) throw new Error('推荐不属于当前作品、作者或版本，不能采纳。');
  const source = qualitySource(book), selected = run.selectedCandidates[notification.chapterId];
  const chapter = book.chapters.find(c => c.id === notification.chapterId), original = source.chapters.find(c => c.chapterId === notification.chapterId);
  const candidate = run.candidates[notification.chapterId].find(c => c.profileId === selected.profileId);
  if (!chapter || !original || notification.candidateSignature !== original.signature || selected.sourceSignature !== original.signature
    || source.chapters.length !== run.sourceChapters.length || run.sourceChapters.some(c => source.chapters.find(x => x.chapterId === c.chapterId)?.signature !== (run.acceptedChapters[c.chapterId] || c.signature))
    || candidate.contentSignature !== selected.contentSignature || fingerprint(candidate.content) !== selected.contentSignature
    || applyChapterPatches(book.drafts[chapter.id], candidate.patches) !== candidate.content) throw new Error('章节正文或候选已变化，该推荐已过期。');
  chapter.revisions = [...(chapter.revisions || []), { content: book.drafts[chapter.id], at: stamp(), label: '质量检查推荐采纳前' }];
  book.drafts = { ...book.drafts, [chapter.id]: candidate.content }; chapter.words = compact(candidate.content).length.toLocaleString();
  run.acceptedChapters[chapter.id] = qualitySource(book).chapters.find(c => c.chapterId === chapter.id).signature;
  notification.status = 'accepted'; notification.acceptedAt = stamp(); run.acceptedAt = stamp(); book.workflow.finalReview = null;
  return candidate;
}
