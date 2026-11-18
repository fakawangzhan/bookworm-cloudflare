import { hash } from './task-utils.mjs';
import { BOOK_AUDIT_PROTOCOL, planBookAudit, validateAuditBatch } from '../src/book-audit-contract.js';
import { stableBlockPlan, LARGE_TEXT_PROTOCOL } from '../src/large-text-contract.js';
import { validateExtraction, coverageComplete } from '../src/long-task-contract.js';
import { CHAPTER_TASK_PROTOCOL } from '../src/chapter-task-contract.js';
import { CHAPTER_CRITERIA, validateReview } from '../src/workflow.js';

export const modelIdentity = profiles => profiles.map(p => [p.id, p.endpoint, p.model, Boolean(p.serverManaged), p.serverRevision || '']);
export const blockIdentity = block => block.parts.map(p => [p.id, p.chapterId, p.chapterIndex, p.title, p.content]);
export function priorBlockGroups(store, scope, snapshot, kind) {
  const row = store.db.prepare('SELECT snapshot,config FROM jobs WHERE scope=? AND owner=? AND book=? AND kind=? ORDER BY created DESC,rowid DESC LIMIT 1')
    .get(scope, snapshot.ownerId, snapshot.bookId, kind);
  if (!row) return [];
  const config = JSON.parse(row.config);
  if (Array.isArray(config.blockGroups)) return config.blockGroups;
  return planBookAudit(JSON.parse(row.snapshot)).batches.map(b => [...new Set(b.parts.map(p => p.chapterId))]);
}

// Only successful, schema-checked raw JSON enters this index. Provider cache
// accounting remains separate: a local hit never reserves a paid request.
export class ResultReuse {
  constructor(store, job) { this.store = store; this.job = job; this.loadedAudit = false; }
  key(type, input) { return this.digestKey(type,hash(input)); }
  digestKey(type, digest) { return hash([LARGE_TEXT_PROTOCOL, type, this.job.config.context, modelIdentity(this.job.config.profiles), digest]); }
  scope() { return hash([LARGE_TEXT_PROTOCOL, this.job.scope, this.job.owner, this.job.book]); }
  get(key) { return this.store.cached(this.scope(), key); }
  put(key, raw, source, origin = {}) { this.store.remember(this.scope(), key, { raw, source, origin }); }
  importAudit() {
    if (this.store.durable) return;
    if (this.loadedAudit) return; this.loadedAudit = true;
    const jobs = this.store.db.prepare("SELECT id,config FROM jobs WHERE scope=? AND owner=? AND book=? AND kind='quality' AND json_extract(config,'$.auditProtocol')=? AND id<>?")
      .all(this.job.scope, this.job.owner, this.job.book, BOOK_AUDIT_PROTOCOL, this.job.id);
    for (const row of jobs) {
      const config = JSON.parse(row.config);
      if (config.context !== this.job.config.context || hash(modelIdentity(config.profiles)) !== hash(modelIdentity(this.job.config.profiles))) continue;
      const nodes = this.store.db.prepare("SELECT n.key,n.type,n.data,n.result,r.content,r.prompt_hash FROM nodes n JOIN audit_responses r ON r.job=n.job AND r.key=n.key WHERE n.job=? AND n.type IN ('audit','audit-report') AND n.status='done' AND r.finish_reason='stop' ORDER BY r.attempt DESC").all(row.id);
      for (const n of nodes) {
        try {
          const raw = JSON.parse(n.content), result = JSON.parse(n.result), block = JSON.parse(n.data);
          if(n.type==='audit'?!raw.batchId:!Array.isArray(raw.items))continue; // Locator patches are not full reviews.
          if(n.type==='audit')validateAuditBatch(raw,block);
          const key = n.type==='audit'?this.key(BOOK_AUDIT_PROTOCOL, blockIdentity(block)):this.digestKey('audit-report',n.prompt_hash);
          if (!this.get(key)) this.put(key, raw, result.source, { jobId: row.id, key: n.key });
        } catch { /* Legacy malformed responses are not reuse candidates. */ }
      }
    }
  }
}

export function auditPlanForJob(job) {
  return job.config.blockGroups ? stableBlockPlan(job.snapshot, job.config.blockGroups) : planBookAudit(job.snapshot);
}

// Adapt normalized legacy graph evidence, then bind it to the immutable
// current text. Require unchanged chapter metadata and adjacent input too.
// The legacy model remains the reported source; it is never relabelled Flash.
export function historicalGraphRecords(store, job) {
  if (store.durable) return [];
  const rows = store.db.prepare("SELECT n.key,n.data,n.result,j.id FROM nodes n JOIN jobs j ON j.id=n.job WHERE j.scope=? AND j.owner=? AND j.book=? AND n.type='extract' AND n.status='done' ORDER BY j.created DESC,n.updated DESC")
    .all(job.scope, job.owner, job.book);
  const records = [], accepted = new Map(), snapshots = new Map();
  for (const row of rows) {
    try {
      let old = snapshots.get(row.id);
      if (!old) { const saved=store.db.prepare('SELECT snapshot,config FROM jobs WHERE id=?').get(row.id);old = { snapshot: JSON.parse(saved.snapshot), config: JSON.parse(saved.config) }; snapshots.set(row.id, old); }
      if (old.config.context !== job.config.context) continue;
      const part = JSON.parse(row.data), result = JSON.parse(row.result);
      const index = job.snapshot.chapters.findIndex(c => c.chapterId === part.chapterId), chapter = job.snapshot.chapters[index];
      const previous = old.snapshot.chapters.find(c => c.chapterId === part.chapterId);
      if (!chapter || !previous || chapter.content !== previous.content
        || hash([chapter.title, chapter.synopsis, chapter.plan]) !== hash([previous.title, previous.synopsis, previous.plan])
        || chapter.content.slice(part.start, part.end) !== part.content) continue;
      const before = chapter.content.slice(Math.max(0, part.start - 500), part.start) || job.snapshot.chapters[index - 1]?.content.slice(-500) || '';
      const after = chapter.content.slice(part.end, part.end + 500) || job.snapshot.chapters[index + 1]?.content.slice(0, 500) || '';
      if (part.before !== before || part.after !== after) continue;
      const intervals = accepted.get(chapter.chapterId) || [];
      if (intervals.some(([a, b]) => part.start < b && part.end > a)) continue;
      const raw = result.value;
      const value = validateExtraction({ ...raw, units: raw.units.map(u => ({ ...u, ...u.evidence })), links: raw.links.map(l => ({ ...l, ...l.evidence })) }, part);
      const rebind = entry => ({ ...entry, evidenceChapters: [index + 1], evidence: { ...entry.evidence, title: chapter.title } });
      records.push({ part: { ...part, chapterIndex: index + 1 }, value: { units: value.units.map(rebind), links: value.links.map(rebind), more: false },
        source: result.source, reuse: { jobId: row.id, key: row.key, historical: true } });
      intervals.push([part.start, part.end]); accepted.set(chapter.chapterId, intervals);
    } catch { /* Retain the old record without trusting incompatible data. */ }
  }
  return records;
}

export function historicalChapterReports(store,job) {
  if (store.durable) return new Map();
  const rows=store.db.prepare("SELECT id,snapshot,config,result FROM jobs WHERE scope=? AND owner=? AND book=? AND kind='chapter-quality' AND status='completed' ORDER BY created DESC,rowid DESC")
    .all(job.scope,job.owner,job.book),reports=new Map();
  for(const row of rows) {
    try {
      const snapshot=JSON.parse(row.snapshot),config=JSON.parse(row.config),report=JSON.parse(row.result),old=snapshot.chapters[0];
      const index=job.snapshot.chapters.findIndex(c=>c.chapterId===old.chapterId),chapter=job.snapshot.chapters[index];
      if(!chapter||reports.has(chapter.chapterId)||report.protocol!==CHAPTER_TASK_PROTOCOL||report.chapterId!==chapter.chapterId
        ||config.context!==job.config.context+'\n本章标签：'+(chapter.tags||[]).join('、')
        ||config.previousTail!==(job.snapshot.chapters[index-1]?.content.slice(-1500)||'')
        ||hash(modelIdentity(config.profiles))!==hash(modelIdentity(job.config.profiles))
        ||hash([old.title,old.synopsis,old.plan,old.content])!==hash([chapter.title,chapter.synopsis,chapter.plan,chapter.content])
        ||!report.sources?.length||report.sources.some(s=>s.id!==job.config.profiles[0].id||s.model!==job.config.profiles[0].model)
        ||!report.partReports?.length||report.partReports.some(r=>!r.value?.items))continue;
      validateReview(report,CHAPTER_CRITERIA);
      if(!coverageComplete({...job.snapshot,chapters:[chapter]},report.partReports.map(r=>r.part)))continue;
      const allRefs=[...(report.findings||[]).flatMap(f=>f.evidence||[]),...report.partReports.flatMap(r=>r.value.items.map(i=>i.location))];
      if(allRefs.some(ref=>!ref||ref.chapterId!==chapter.chapterId||typeof ref.quote!=='string'||!ref.quote||chapter.content.slice(ref.start,ref.end)!==ref.quote))continue;
      reports.set(chapter.chapterId,{report,reuse:{jobId:row.id,historical:true},characters:chapter.content.length});
    } catch { /* Unsupported legacy reports remain available as history. */ }
  }
  return reports;
}
