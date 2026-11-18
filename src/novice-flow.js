import { effectiveScale } from './parameters.js';
import { fingerprint } from './workflow.js';
import { activeNovelPreset } from './novel-preset-runtime.js';

export const PREVIEW_LABELS = { storyIdea:'一句话故事', protagonistName:'主角是谁', protagonistGoal:'主角想要什么', worldSetting:'故事发生在哪里', coreTheme:'想表达什么', mainline:'故事怎么发展', hiddenLine:'藏着什么秘密', ending:'结局预览', hardConstraints:'必须守住的规则' };
export function newNoviceFlow() {
  return { version:1, stage:'idea', directionCandidates:[], selectedDirection:null, storyPreview:null, pendingProposal:null, generatedChapterCount:0, instructions:{}, confirmations:{}, totalChapterGoal:12 };
}
export function normalizeNoviceFlow(value) {
  const flow={...newNoviceFlow(),...(value && typeof value==='object' ? value : {})};
  flow.instructions=flow.instructions && typeof flow.instructions==='object' ? flow.instructions : {};
  flow.confirmations=flow.confirmations && typeof flow.confirmations==='object' ? flow.confirmations : {};
  flow.directionCandidates=Array.isArray(flow.directionCandidates) ? flow.directionCandidates : [];
  flow.totalChapterGoal=Math.min(1000,Math.max(1,Math.floor(Number(flow.totalChapterGoal)||12)));
  return flow;
}
export function noviceInputSignature(s) { const values=[s.activeBookId,s.workflow?.parameterProtocol==='effective-story-v1'?{...s.noviceSetup,chapterCount:effectiveScale(s.scale).totalChapters,wordCount:effectiveScale(s.scale).wordsPerChapter}:s.noviceSetup];if(activeNovelPreset(s))values.push(activeNovelPreset(s));return fingerprint(values); }
function text(value, label, max=1000) {
  if (typeof value !== 'string' || !value.trim() || value.length>max) throw new Error(`${label}缺失或过长，请重新生成当前步骤。`);
  return value.trim();
}
export function validateDirections(value) {
  if (!Array.isArray(value?.directions) || value.directions.length!==3) throw new Error('需要三个完整故事方向。');
  const directions=value.directions.map(item=>Object.fromEntries(['title','coreConflict','tone','endingHint','sellingPoint'].map(key=>[key,text(item?.[key],key,300)])));
  if(new Set(directions.map(d=>d.title)).size!==3) throw new Error('三个故事方向不能重复。');
  return {directions};
}
export function validatePreview(value) {
  return Object.fromEntries(Object.entries(PREVIEW_LABELS).map(([key,label])=>[key,text(value?.[key],label)]));
}
export function validateChapterBatch(value, size, existing=[]) {
  if(!Array.isArray(value?.chapters)||value.chapters.length!==size) throw new Error(`需要完整的${size}章开篇规划。`);
  const chapters=value.chapters.map(c=>({title:text(c?.title,'章节标题',100),synopsis:text(c?.synopsis,'章纲',1800)}));
  const name=c=>c.title.replace(/^第\s*[零〇一二三四五六七八九十百千万两\d]+\s*章\s*/, '').trim();
  const names=new Set(existing.map(name));
  for(const chapter of chapters) {
    chapter.title=name(chapter);
    if(!chapter.title || names.has(chapter.title)) throw new Error('新增章节标题与已有章节重复，请重新生成。');
    names.add(chapter.title);
  }
  return {chapters};
}
// Append only. Existing chapter objects, IDs, drafts and review signatures stay intact.
export function appendNoviceChapters(s, value) {
  const size=Math.min(3, Math.max(0,(s.noviceFlow?.totalChapterGoal||12)-s.chapters.length));
  const {chapters}=validateChapterBatch(value,size,s.chapters);
  let id=Math.max(0,...s.chapters.map(c=>c.id),...Object.keys(s.drafts).map(Number).filter(Number.isSafeInteger))+1;
  if(!Number.isSafeInteger(id+chapters.length)) throw new Error('章节编号超出范围。');
  const appended=chapters.map(c=>({...c,id:id++,plan:{},tags:[],review:null}));
  s.chapters.push(...appended);
  return appended;
}
