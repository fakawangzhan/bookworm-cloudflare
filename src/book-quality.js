import { BOOK_CRITERIA, fingerprint, splitText, validateReview } from './workflow.js';
import {runBookRevision} from './book-revision-engine.js';
import {revisionErrorCode} from './revision-telemetry.js';
import {revisionEditUnits,revisionSentenceUnits,allowedRevisionUnits,matchRevisionSource} from './revision-units.js';

export const BOOK_QUALITY_PROTOCOL = 'full-quality-v1';
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;
const compact = value => String(value).replace(/\s/g, '');
const quoteText = value => String(value).replace(/[\s\p{P}]/gu,'');
export const bookQualityRetryInstruction = error => `\n上次结果未通过校验：${error?.message || '输出不完整'}。请修正该问题并返回完整 JSON。可以缩短解释、ledger 与 summary；content 若为正文必须完整保留，不得省略段落或概括为摘要。quote 只能引用本段实际原句，不得引用前章档案或拼接改写。`;


export function validateBookUpdates(updates, chapters) {
  if (!Array.isArray(updates) || !updates.length) throw new Error('没有可采用的全书修订正文。');
  const seen = new Set();
  for (const update of updates) {
    if (!chapters.some(c=>c.id === update?.chapterId) || seen.has(update.chapterId) || typeof update.content !== 'string' || !update.content.trim()) throw new Error('全书修订方案不完整，原正文已保留。');
    seen.add(update.chapterId);
  }
  return updates;
}

export function validateRevisionPatches(value, source, issues = [],options={}) {
  // Empty optional lists may be omitted by otherwise valid JSON responses.
  // Normalize only unambiguous empty/singular forms; never invent patch text.
  if(value&&typeof value==='object'&&!Array.isArray(value)){
    const list=item=>item==null?[]:!Array.isArray(item)&&item?.issueId&&typeof item.reason==='string'?[item]:item;
    value={...value,dismissed:list(value.dismissed),deferred:list(value.deferred)};
  }
  if (!Array.isArray(value?.patches) || !Array.isArray(value?.dismissed) || (value.deferred !== undefined && !Array.isArray(value.deferred))) throw Object.assign(new Error('Revision patches require patches and dismissed arrays.'),{code:'PATCH_ARRAYS_REQUIRED'});
  if (value.patches.length > 6 || value.dismissed.length > 8 || (value.deferred?.length || 0) > 8) throw Object.assign(new Error('Revision result exceeds batch item limit.'),{code:'PATCH_ITEM_LIMIT'});
  const ids = new Set(issues.map(issue => issue.id)), covered = new Set(), patches = [], rejected = [];
  const diagnostics=[];
  const scopeUnits=options.contextual?revisionEditUnits(source):[];
  const units=options.sentence?revisionSentenceUnits(source):scopeUnits;
  if(options.sentence&&value.patches.reduce((n,p)=>n+(typeof p?.after==='string'?p.after.length:0),0)>1200)throw Object.assign(new Error('Short patch output exceeds limit.'),{code:'PATCH_ITEM_LIMIT'});
  for (let patch of value.patches) {
    try {
      if(options.sentence&&(typeof patch?.unitId!=='string'||typeof patch?.after!=='string'||patch.after.length>450))throw Object.assign(new Error('Short patch requires a sentence ID and at most 450 characters.'),{code:'PATCH_FIELDS_OR_ISSUE_IDS'});
      if(options.contextual&&patch?.unitId!==undefined){
        const unit=units.find(u=>u.id===patch.unitId);
        if(!unit)throw Object.assign(new Error('Unknown source unit.'),{code:'PATCH_UNIT_INVALID'});
        patch={...patch,before:unit.text,start:unit.start};
      }else if(options.contextual&&typeof patch?.before==='string'){
        const matched=matchRevisionSource(source,patch.before);
        if(matched)patch={...patch,...matched};
      }
      if (!text(patch?.before,1200) || typeof patch.after !== 'string' || patch.after.length>1600 || !Array.isArray(patch.issueIds) || !patch.issueIds.length || patch.issueIds.some(id=>!ids.has(id))) throw new Error('Revision patch has an unknown issue or missing source text.');
      const match=source.indexOf(patch.before), unique=match>=0 && source.indexOf(patch.before,match+1)<0;
      const start=unique ? match : Number.isInteger(patch.start) && patch.start>=0 && source.slice(patch.start,patch.start+patch.before.length)===patch.before ? patch.start : -1;
      if(start<0) throw new Error('Revision patch source must match exactly once and change text.');
      if(patch.before===patch.after||options.contextual&&compact(patch.before)===compact(patch.after))throw Object.assign(new Error('Revision patch source must match exactly once and change text.'),{code:'PATCH_NO_CHANGE'});
      const end=start+patch.before.length;
      for(const id of patch.issueIds) {
        const issue=issues.find(i=>i.id===id), refs=issue.evidence?.filter(e=>!e.stale&&Number.isInteger(e.start)&&Number.isInteger(e.end))||[];
        if(options.contextual){
          const allowed=options.sentence&&Array.isArray(issue.allowedUnitIds)?units.filter(u=>issue.allowedUnitIds.includes(u.id)):allowedRevisionUnits(issue,scopeUnits);
          if(!allowed.some(u=>u.start<=start&&u.end>=end))throw Object.assign(new Error('Revision patch is outside adjacent source units.'),{code:'PATCH_OUTSIDE_SCOPE'});
          if(!text(patch.reason,500))throw Object.assign(new Error('Revision patch requires an issue-specific reason.'),{code:'PATCH_FIELDS_OR_ISSUE_IDS'});
        }else if(refs.length && !refs.some(e=>e.start<end&&e.end>start))throw new Error('Revision patch does not overlap its issue evidence.');
      }
      if(patches.some(p=>p.start<end&&p.end>start))throw new Error('Revision patches overlap.');
      patches.push({start,end,before:patch.before,after:patch.after,reason:String(patch.reason||'Minimal correction').slice(0,500),issueIds:[...new Set(patch.issueIds)]});
      patch.issueIds.forEach(id=>covered.add(id));
    }catch(error){
      const reason=error.code==='PATCH_OUTSIDE_SCOPE'?'修改超出证据所在及紧邻单元，保留原文。':error.code==='PATCH_UNIT_INVALID'?'回复引用了未提供的段落编号，保留原文。':/overlap its issue evidence/.test(error.message)?'补丁没有覆盖该问题的原文证据，保留原文待确认。':/match exactly once/.test(error.message)?'补丁原句无法唯一匹配，或替换文字未变化，保留原文待确认。':/patches overlap/.test(error.message)?'补丁与其他修改重叠，保留此项待确认。':'补丁字段或问题编号不完整，保留原文待确认。';
      const errorCode=revisionErrorCode(error);
      diagnostics.push({errorCode});
      for(const id of Array.isArray(patch?.issueIds)?patch.issueIds:[])if(ids.has(id))rejected.push({issueId:id,reason,errorCode,failureKind:'technical'});
    }
  }
  const dismissed=[];
  for(const item of value.dismissed){
    if(!ids.has(item?.issueId)||!text(item.reason,500)){diagnostics.push({errorCode:'DISMISSAL_FIELDS_OR_ISSUE_ID'});continue;}
    if(!covered.has(item.issueId)){dismissed.push({issueId:item.issueId,reason:item.reason});covered.add(item.issueId);}
  }
  const deferred=[...new Map([...(value.deferred||[]).map(item=>({...item,failureKind:item?.category==='needs_context'?'needs_context':item?.category==='content'?'content':'unclassified'})),...rejected].filter(item=>ids.has(item?.issueId)&&text(item.reason,500)&&!covered.has(item.issueId)).map(item=>[item.issueId,{issueId:item.issueId,reason:item.reason,failureKind:item.failureKind,...(item.errorCode?{errorCode:item.errorCode}:{})}])).values()];
  for(const issue of issues)if(!covered.has(issue.id)&&!deferred.some(i=>i.issueId===issue.id))deferred.push({issueId:issue.id,reason:'模型未返回该问题的处理结果，尚不能判断能否解决。',failureKind:'technical',errorCode:'MISSING_ISSUE_RESULT'});
  return {patches:patches.sort((a,b)=>a.start-b.start),dismissed,deferred,diagnostics};
}

export function applyRevisionPatches(source, patches) {
  let output='',cursor=0;
  for(const patch of [...patches].sort((a,b)=>a.start-b.start)) {
    if(!Number.isInteger(patch.start)||!Number.isInteger(patch.end)||patch.start<cursor||patch.end<=patch.start||source.slice(patch.start,patch.end)!==patch.before||typeof patch.after!=='string')throw new Error('Revision patch no longer matches source text.');
    output+=source.slice(cursor,patch.start)+patch.after;cursor=patch.end;
  }
  return output+source.slice(cursor);
}

const unique = values => [...new Map(values.map(value => [JSON.stringify(value), value])).values()];
const issueSettled = issue => ['applied', 'dismissed', 'blocked', 'stale', 'not-located'].includes(issue?.status);
const issueKey = issue => {
  const refs = Array.isArray(issue?.evidence) && issue.evidence.length
    ? issue.evidence
    : issue?.chapterId != null ? [{chapterId:issue.chapterId, quote:issue.quote}] : [];
  return String(issue?.id || fingerprint([issue?.criterion, issue?.severity, issue?.detail,
    refs.map(ref => [ref?.chapterId, ref?.quote])]))
  .replace(/\s+/g, '');
};
const locateQuote = (source, quote, hint) => {
  if (typeof quote !== 'string' || !quote.trim()) return null;
  const exact = [];
  let at = source.indexOf(quote);
  while (at >= 0) { exact.push(at); at = source.indexOf(quote, at + 1); }
  if (exact.length === 1) return { start: exact[0], end: exact[0] + quote.length, quote: source.slice(exact[0], exact[0] + quote.length) };
  if (Number.isInteger(hint) && hint >= 0 && source.slice(hint, hint + quote.length) === quote)
    return { start: hint, end: hint + quote.length, quote };
  const compactSource = compact(source), compactQuote = compact(quote);
  if (compactQuote.length < 5) return null;
  const normalized = [];
  let index = 0;
  for (let i = 0; i < source.length; i++) { if (!/\s/.test(source[i])) normalized.push(i); }
  let compactAt = compactSource.indexOf(compactQuote);
  if (compactAt < 0 || compactSource.indexOf(compactQuote, compactAt + 1) >= 0) return null;
  const start = normalized[compactAt], end = normalized[compactAt + compactQuote.length - 1] + 1;
  return { start, end, quote: source.slice(start, end) };
};
const locateByAnchors = (source, ref) => {
  const before = compact(ref?.anchorBefore || ''), after = compact(ref?.anchorAfter || '');
  if (before.length < 8 || after.length < 8) return null;
  const normalized = compact(source);
  const beforeAt = normalized.indexOf(before), afterAt = normalized.indexOf(after, beforeAt + before.length);
  if (beforeAt < 0 || afterAt < 0 || normalized.indexOf(before, beforeAt + 1) >= 0
    || normalized.indexOf(after, afterAt + 1) >= 0 || afterAt - (beforeAt + before.length) > 1600) return null;
  const positions = [];
  for (let i = 0; i < source.length; i++) if (!/\s/.test(source[i])) positions.push(i);
  const start = positions[beforeAt + before.length - 1] + 1;
  const end = positions[afterAt];
  return end > start ? {start, end, quote:source.slice(start, end)} : null;
};
function rebaseFinding(finding, chapters) {
  let valid = 0;
  const evidence = (finding.evidence || []).map(ref => {
    const chapter = chapters.find(c => c.chapterId === ref.chapterId);
    if (!chapter) return { ...ref, stale: true };
    const found = locateQuote(chapter.content, ref.quote, ref.start) || locateByAnchors(chapter.content, ref);
    if (!found) return { ...ref, stale: true };
    valid += 1;
    return { ...ref, ...found, chapterId: chapter.chapterId, title: chapter.title, stale: false };
  });
  return { ...finding, id: issueKey(finding), evidence, stale: valid === 0 };
}
export function rebaseRevisionFindings(findings, chapters) {
  return findings.map(finding => rebaseFinding(finding, chapters));
}
const findingOwnerChapterId = (finding, chapters) => finding.evidence?.find(ref =>
  !ref.stale && chapters.some(chapter => chapter.chapterId === ref.chapterId))?.chapterId || null;
export function revisionFindings(report) {
  const findings = new Map();
  for (const raw of report.findings || []) {
    const {criterion, severity, detail, evidence, ...location} = raw;
    // Long-task reports repeat the full evidence array for every located copy.
    // Keep every distinct reference, including cross-chapter evidence, once.
    const refs = unique([...(evidence || []), ...(location.chapterId != null ? [location] : [])]);
    const identity = raw.id || JSON.stringify([criterion, severity, detail, refs.map(ref=>JSON.stringify(ref)).sort()]);
    // Equal wording at different locations is still a different issue. Do not
    // combine unrelated references into an unbounded, indivisible record.
    if (!findings.has(identity)) findings.set(identity, {...raw, criterion, severity, detail, evidence:refs, id:raw.id || fingerprint([criterion, severity, detail, refs.map(ref => [ref.chapterId, ref.quote])])});
  }
  // Legacy reports may contain only dimension issues. Preserve them in the
  // revision ledger, but leave evidence empty so automatic patching will keep
  // the original prose and expose the item for human handling.
  for (const item of report.globalItems || report.items || []) for (const issue of item.issues || []) {
    const criterion = item.id, detail = String(issue.detail || '').trim();
    if (!criterion || !detail || [...findings.values()].some(f => f.criterion === criterion
      && (f.detail === detail || f.detail.includes(detail) || detail.includes(f.detail)))) continue;
    const evidence = Array.isArray(issue.evidence) ? issue.evidence : [];
    const id = issue.id || fingerprint([criterion, issue.severity, detail, evidence.map(ref => [ref?.chapterId, ref?.quote])]);
    findings.set(id, {...issue, criterion, detail, evidence, id});
  }
  return [...findings.values()];
}

// Preserve the public entry point and legacy checkpoint signature.
export async function reviseWholeBook(options) {
  return runBookRevision({...options,findings:revisionFindings(options.report),rebase:rebaseRevisionFindings,validate:validateRevisionPatches,apply:applyRevisionPatches});
}
