import { hash, now } from './task-utils.mjs';
import { CHAPTER_TASK_PROTOCOL } from '../src/chapter-task-contract.js';
import { CHAPTER_REVISION_PROTOCOL, CHAPTER_REVISION_LIMIT, reviseChapterLocally } from '../src/chapter-revision.js';
import { manuscriptParts, coverageComplete } from '../src/long-task-contract.js';

// Browser and background chapter revisions share the book's patch executor.
// SQLite keeps the complete checkpoint; the provider is called once here so
// retries and both author-adopted rounds share the chapter's bounded budget.
export async function reviseStoredChapter(tasks, base) {
  const { e, job, signal } = tasks, store = e.store, chapter = job.snapshot.chapters[0];
  if (!Array.isArray(base.partReports) || !coverageComplete(job.snapshot, base.partReports.map(r => r.part))) throw new Error('原章节报告未覆盖当前正文，保留原稿。');
  const key = CHAPTER_REVISION_PROTOCOL + ':checkpoint';
  store.putNode(job.id, key, 'chapter-local-checkpoint', {});
  store.auditBudget(job.id, { plannedRequests: CHAPTER_REVISION_LIMIT, requestLimit: CHAPTER_REVISION_LIMIT, tokenLimit: CHAPTER_REVISION_LIMIT * 130000 });
  const candidate = await reviseChapterLocally({ chapter, report: { ...base, signature: job.signature },
    signature: job.signature, scope: { session: job.scope, ownerId: job.owner, bookId: job.book },
    modelKey: hash(job.config.profiles[0]), context: job.config.context + '\n前章结尾（不可修改）：' + job.config.previousTail,
    directions: job.config.directions, round: job.config.revisionAttempts,
    resume: store.node(job.id, key)?.result, check: () => e.check(job, signal), progress: message => tasks.message(message),
    save: record => { store.nodeState(job.id, key, record.status === 'candidate-ready' ? 'done' : 'running', record); return e.flushCheckpoint?.(); },
    request: async (prompt, accept, tokens, meta) => {
      e.check(job, signal);
      const step = CHAPTER_REVISION_PROTOCOL + ':' + meta.phase + ':' + meta.stepId;
      store.putNode(job.id, step, 'chapter-local-' + meta.phase, { chapterId: chapter.chapterId });
      if (e.durableRawRequest) { const result = await accept(await e.durableRawRequest(job,step,prompt,tokens)); store.nodeState(job.id,step,'done'); return result; }
      // Persist reservations and received bodies independently of parsing.
      // A process stop between receiving and checkpointing can reuse the body.
      const cached = store.auditResponse(job.id, step, hash(prompt));
      if (cached) return accept({ content: cached.content, finishReason: cached.finish_reason,
        reasoningCharacters: cached.finish_reason === 'reasoning' ? 1 : 0, usage: cached.usage ? JSON.parse(cached.usage) : null });
      const attempt = store.reserveAuditRequest(job.id, step, Buffer.byteLength(prompt, 'utf8') + tokens);
      store.attempt(job.id, step);
      let received;
      try {
        received = await e.provider(job.config.profiles[0], { prompt, maxTokens: tokens, timeout: job.config.timeout, signal, stream: true,
          thinking: job.config.thinking || 'disabled', responseFormat: 'json_object' });
        store.saveAuditResponse(job.id, step, attempt, hash(prompt), received);
        store.finishAuditRequest(job.id, step, attempt, 'received', received.usage);
        const result = await accept(received);
        store.nodeState(job.id, step, 'done');
        store.finishAuditRequest(job.id, step, attempt, 'done', received.usage);
        return result;
      } catch (error) {
        store.finishAuditRequest(job.id, step, attempt, signal.aborted ? 'interrupted' : 'failed', received?.usage || error.usage, error.message);
        if (!received && !signal.aborted && (error.retryable === true || error.status === 429 || error.status >= 500 || ['UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK'].includes(error.code))) error.retryable = true;
        throw error;
      }
    } });
  const parts = manuscriptParts({ ...job.snapshot, chapters: [{ ...chapter, content: candidate.content }] });
  const review = { ...candidate.review, protocol: CHAPTER_TASK_PROTOCOL, taskId: job.id, signature: job.signature, at: now(),
    findings: candidate.review.chapterRevision.issues.filter(i => !['applied', 'dismissed'].includes(i.status)),
    // This is an exact coverage map for the composed candidate, not a new
    // full-chapter review or a claim that the model read unchanged text again.
    partReports: parts.map(part => ({ part, reused: true })), parts: parts.length, coverage: parts.map(p => p.id) };
  return { protocol: CHAPTER_TASK_PROTOCOL, mode: 'ai', bookId: job.book, ownerId: job.owner, chapterId: chapter.chapterId,
    signature: job.signature, taskId: job.id, content: candidate.content, patches: candidate.patches, review,
    revisionAttempts: candidate.round, revisionPolicy: job.config.revisionPolicy, summary: candidate.summary, at: now() };
}
