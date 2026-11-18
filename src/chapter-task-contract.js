import { CHAPTER_CRITERIA, PASS_SCORE, validateReview, splitText } from './workflow.js';
import { validateEvidence, validateFindings } from './long-task-contract.js';

export const CHAPTER_TASK_PROTOCOL = 'chapter-patches-v2';
export const LONG_CHAPTER_LIMIT = 18000;
export const chapterTaskError = message => Object.assign(new Error(message), { code: 'OUTPUT_FORMAT' });
const fail = message => { throw chapterTaskError(message); };
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max;

// Normalize typography only. Map the match back to exact original characters;
// never use approximate word similarity to accept invented evidence.
export function chapterEvidence(ref, parts) {
  const part = parts.find(p => p.id === ref?.partId);
  if (part && typeof ref?.anchor === 'string') {
    if (/^S\d+$/.test(ref.anchor)) {
      const span = chapterAnchors(part)[Number(ref.anchor.slice(1)) - 1];
      if (!span) fail('证据编号 ' + ref.anchor + ' 不存在，请只选当前正文提供的S编号。');
      return { partId: part.id, chapterId: part.chapterId, title: part.title, quote: span.content,
        start: span.start, end: span.end, anchor: 'L' + span.start + '_' + span.end };
    }
    const match = ref.anchor.match(/^L(\d+)_(\d+)$/);
    const start = match && Number(match[1]), end = match && Number(match[2]);
    if (!match || start < part.start || end > part.start + part.content.length || end <= start || end - start > 300) fail('证据编号 ' + ref.anchor + ' 无效，请复制资料中已提供的编号，不能自行计算或使用示例占位符。');
    return { ...validateEvidence({ partId: part.id, quote: part.content.slice(start - part.start, end - part.start) }, parts), anchor: ref.anchor, start, end };
  }
  if (!part || !text(ref?.quote, 300)) return validateEvidence(ref, parts);
  if (part.content.includes(ref.quote)) return validateEvidence(ref, parts);
  const canonical = value => {
    const chars = [], offsets = [];
    for (let i = 0; i < value.length; i++) {
      let char = value[i].normalize('NFKC');
      if (/\s/.test(char)) continue;
      char = char.replace(/[“”「」]/g, '"').replace(/[‘’]/g, "'").replace(/。/g, '.');
      for (const c of char) { chars.push(c); offsets.push(i); }
    }
    return { content: chars.join(''), offsets };
  };
  const source = canonical(part.content), needle = canonical(ref.quote.replace(/^["'“”‘’「」]+|["'“”‘’「」]+$/g, '')).content;
  const index = needle.length >= 5 ? source.content.indexOf(needle) : -1;
  if (index >= 0) {
    const quote = part.content.slice(source.offsets[index], source.offsets[index + needle.length - 1] + 1);
    return validateEvidence({ ...ref, quote }, parts);
  }
  fail('quote 未匹配当前片段原句：「' + ref.quote.slice(0, 90) + '」。请重新从当前正文逐字复制短句，不得概括、拼接或取自前后文参考。');
}
export function chapterAnchors(part) {
  let offset = part.start;
  return splitText(part.content, 200).map((content, index) => {
    const start = offset; offset += content.length;
    return { anchor: 'S' + (index + 1), start, end: offset, content };
  });
}
export function chapterFindings(values, parts, criteria) {
  if (!Array.isArray(values)) fail('issues 必须是数组。');
  const normalized = values.map(f => ({ ...f, evidence: Array.isArray(f?.evidence) ? f.evidence.map(ref => chapterEvidence(ref, parts)) : f?.evidence }));
  return validateFindings(normalized, parts, criteria).map((f, i) => ({ ...f, evidence: normalized[i].evidence }));
}

export function validateChapterPart(value, part, criteria) {
  if (typeof value?.summary !== 'string' || !value.summary.trim() || !Array.isArray(value.facts)) fail('片段摘要和事实数组不完整。');
  const checked = validateReview({ items: value.items, ledger: value.summary }, criteria);
  const facts = value.facts.map(f => {
    if (!text(f?.subject, 120) || !text(f.category, 80) || !text(f.statement, 300)) fail('事实主体、分类和陈述不完整。');
    return { subject: f.subject, category: f.category, statement: f.statement, ...chapterEvidence({ partId: part.id, quote: f.quote, anchor: f.anchor }, [part]) };
  });
  const items = checked.items.map(item => {
    const raw = value.items.find(i => i.id === item.id);
    const evidence = chapterEvidence({ partId: part.id, quote: raw.quote, anchor: raw.anchor }, [part]);
    const findings = chapterFindings(item.issues.map(issue => ({ ...issue, criterion: item.id, evidence: [{ partId: part.id, quote: issue.quote, anchor: issue.anchor }] })), [part], criteria);
    if (item.score < PASS_SCORE && !findings.length) fail('低分项必须提供有原文定位的可执行问题。');
    return { ...item, location: evidence, findings, issues: findings.map(f => ({ severity: f.severity, detail: f.detail })) };
  });
  return { summary: value.summary, facts, items };
}

// The model returns only short replacements. Unmentioned characters never
// leave the original manuscript assembly path.
export function validateChapterPatches(value, part, issues) {
  if (!Array.isArray(value?.patches) || value.patches.length > 12 || !Array.isArray(value.dismissed)) fail('局部修订须返回 patches 和 dismissed 数组。');
  const ids = new Set(issues.map(i => i.id)), covered = new Set();
  const patches = value.patches.map(p => {
    if (!text(p?.before, 600) || !text(p.after, 1200) || !text(p.reason, 500) || !Array.isArray(p.issueIds) || !p.issueIds.length || p.issueIds.some(id => !ids.has(id))) fail('替换须有短原句、修订句及有效问题编号。');
    const start = part.content.indexOf(p.before);
    if (start < 0 || part.content.indexOf(p.before, start + 1) >= 0) fail('替换原句必须逐字匹配且在当前片段唯一；请补充少量上下文。');
    if (p.before === p.after) fail('相同原句不能算修订；无需修改时请说明撤回问题的依据。');
    if (!p.issueIds.some(id => issues.find(i => i.id === id).evidence.some(e => e.partId === part.id && e.start < part.start + start + p.before.length + 500 && e.end > part.start + start - 500))) fail('替换位置与问题证据无关。');
    p.issueIds.forEach(id => covered.add(id));
    return { start: part.start + start, end: part.start + start + p.before.length, before: p.before, after: p.after, reason: p.reason, issueIds: p.issueIds };
  });
  const dismissed = value.dismissed.map(item => {
    if (!ids.has(item?.issueId) || !text(item.reason, 500)) fail('撤回问题须列出编号与原文依据。');
    covered.add(item.issueId); return { issueId: item.issueId, reason: item.reason };
  });
  if ([...ids].some(id => !covered.has(id))) fail('修订遗漏了待处理问题；每项必须修改或说明无需修改的依据。');
  applyChapterPatches(part.content, patches.map(p => ({ ...p, start: p.start - part.start, end: p.end - part.start })));
  return { patches, dismissed };
}

export function applyChapterPatches(source, values) {
  const unique = [...new Map(values.map(p => [JSON.stringify([p.start, p.end, p.before, p.after]), p])).values()].sort((a, b) => a.start - b.start);
  let end = 0, content = '';
  for (const p of unique) {
    if (!Number.isSafeInteger(p.start) || !Number.isSafeInteger(p.end) || p.start < end || p.end <= p.start || source.slice(p.start, p.end) !== p.before || typeof p.after !== 'string' || !p.after.trim()) fail('局部替换位置冲突或原稿已变化；候选稿未应用。');
    content += source.slice(end, p.start) + p.after; end = p.end;
  }
  content += source.slice(end);
  if (content.length < source.length * 0.85 || content.length > Math.max(source.length * 1.3, source.length + 500)) fail('局部修订超出合理篇幅范围，原稿保留。');
  return content;
}

export function validateImpact(value) {
  if (typeof value?.safe !== 'boolean' || !text(value.reason, 1000) || !Array.isArray(value.affectedCriteria) || value.affectedCriteria.some(id => !CHAPTER_CRITERIA.some(([key]) => key === id))) fail('修订影响核实结果不完整。');
  if (!value.safe) fail('候选修订可能损伤原有事实或遗漏信息：' + value.reason);
  return { safe: true, reason: value.reason, affectedCriteria: [...new Set(['expression', ...value.affectedCriteria])] };
}
