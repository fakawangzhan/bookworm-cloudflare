import { featureEnabled } from './parameters.js';
import { novelPresetById, PRESET_FIELD_LABELS, PRESET_DIMENSIONS } from './novel-presets.js';

const copy = value => structuredClone(value);
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const has = (value,key) => Object.prototype.hasOwnProperty.call(value,key);
const text = (value,max=2500) => typeof value==='string' && value.trim().length>0 && value.length<=max;
const list = (value,max=30) => Array.isArray(value) && value.length<=max && value.every(v=>text(v,250));
const scopes = ['authorSettings','humanization','settings'];
const invalid = () => { throw new Error('小说模式快照格式无效，请使用完整的作品备份。'); };
const forbidden = new Set(['__proto__','constructor','prototype']);
const safePath = path => typeof path==='string' && path.length<150 && path.split('.').length<=3 && !path.split('.').some(p=>forbidden.has(p)) && scopes.includes(path.split('.')[0]);
const get = (s,path) => path.split('.').reduce((v,k)=>v?.[k],s);
function set(s,path,value) {
  if(!safePath(path))invalid();
  const keys=path.split('.');let target=s;
  for(const key of keys.slice(0,-1))target=target[key] ||= {};
  if(value===undefined)delete target[keys.at(-1)];else target[keys.at(-1)]=copy(value);
}
function leaves(value,prefix='') {
  return Object.entries(value||{}).flatMap(([key,v])=>{
    if(forbidden.has(key))invalid();
    const path=prefix?`${prefix}.${key}`:key;
    return v && typeof v==='object' && !Array.isArray(v) ? leaves(v,path) : [[path,v]];
  });
}
export const activeNovelPreset = s => s?.workflow?.novelPreset?.snapshot || null;
export function validateNovelPresetRecord(record) {
  if(record===undefined)return;
  if(!record || record.schema!==1 || JSON.stringify(record).length>90000)invalid();
  const p=record.snapshot;
  if(!p || !text(p.id,80) || !/^[a-z0-9-]+$/.test(p.id) || !text(p.name,100) || !text(p.group,100) || !Number.isInteger(p.version) || p.version<1 || !text(p.description,500))invalid();
  if(!p.dimensions || Object.keys(PRESET_DIMENSIONS).some(k=>!text(p.dimensions[k])))invalid();
  if(!list(p.rules) || !p.rules.length || !list(p.audit) || !p.audit.length)invalid();
  if(!p.authorSettings || Object.entries(p.authorSettings).some(([key,value])=>!has(PRESET_FIELD_LABELS,key)||!list(value)))invalid();
  if(!p.humanization || Object.entries(p.humanization).some(([key,value])=>!/^([a-zA-Z]+Enabled|[a-zA-Z]+Ratio)$/.test(key) || (key.endsWith('Enabled')?typeof value!=='boolean':!Number.isFinite(value)||value<0||value>100)))invalid();
  if(!p.settings || Object.keys(p.settings).some(k=>k!=='growthRule') || typeof p.settings.growthRule!=='boolean')invalid();
  if(!p.chapterTags || ['opening','development','turning','climax','ending','flavor'].some(k=>!list(p.chapterTags[k])||!p.chapterTags[k].length))invalid();
  if(!record.baseline || scopes.some(scope=>!record.baseline[scope] || typeof record.baseline[scope]!=='object' || Array.isArray(record.baseline[scope])))invalid();
  if(!record.sources || !record.applied || typeof record.sources!=='object' || typeof record.applied!=='object' || Array.isArray(record.sources) || Array.isArray(record.applied))invalid();
  if(Object.entries(record.sources).some(([path,source])=>!safePath(path)||!['default','preset','author','ai'].includes(source)) || Object.keys(record.applied).some(path=>!safePath(path)))invalid();
  for(const [path,value] of leaves(record.baseline))if(!safePath(path) || !(value===null || ['string','number','boolean','undefined'].includes(typeof value) || list(value,200)))invalid();
  return record;
}

export function markPresetField(s,path,source='author') {
  const record=s?.workflow?.novelPreset;
  if(record && safePath(path))record.sources[path]=source;
  else if(s?.workflow?.storyBibleFresh && safePath(path)) (s.workflow.storyBibleFieldSources ||= {})[path]=source;
}
export function presetLocked(s) { return Boolean(s?.workflow?.novelPreset?.locked || s?.workflow?.autoRun || s?.workflow?.synopsis?.trim() || s?.chapters?.length || Object.values(s?.drafts||{}).some(v=>v?.trim())); }

function captureEdits(s,record) {
  for(const [path,value] of Object.entries(record.applied))if(!same(get(s,path),value))record.sources[path]='author';
}
// Only an explicitly new book may replace untouched factory values. Existing
// books keep their populated fields, even if those happen to equal defaults.
export function selectNovelPreset(s,id,{fresh=false}={}) {
  const preset=novelPresetById(id);
  if(!preset)throw new Error('找不到该小说模式。');
  if(presetLocked(s))throw new Error('创作已经开始，模式版本已固定；请新建作品使用其他模式。');
  const previous=s.workflow?.novelPreset;
  const baseline=previous?copy(previous.baseline):Object.fromEntries(scopes.map(scope=>[scope,copy(s[scope]||{})]));
  const record=previous?copy(previous):{schema:1,baseline,sources:Object.fromEntries(leaves(baseline).map(([path,value])=>[path,
    s.workflow?.storyBibleFieldSources?.[path] || (!fresh && !(value==null || value==='' || Array.isArray(value)&&!value.length) ? 'author' : 'default')])),applied:{}};
  if(previous)captureEdits(s,record);
  // Rebuild all template-owned values from the original new-book baseline.
  // Explicit author edits, including edits equal to a default, are preserved.
  for(const path of Object.keys(record.applied))if(record.sources[path]!=='author') {
    set(s,path,get(baseline,path));record.sources[path]='default';
  }
  record.snapshot=copy(preset);record.applied={};record.locked=false;
  for(const [path,value] of leaves({authorSettings:preset.authorSettings,humanization:preset.humanization,settings:preset.settings})) {
    if(record.sources[path]==='author')continue;
    set(s,path,value);record.sources[path]='preset';record.applied[path]=copy(value);
  }
  s.workflow ||= {};s.workflow.novelPreset=record;
  s.selectedGenre=s.authorSettings.genres?.[0]||'';s.selectedStyle=s.authorSettings.styles?.[0]||'';
  validateNovelPresetRecord(record);
  return record;
}
export function clearNovelPreset(s) {
  const record=s.workflow?.novelPreset;
  if(!record)return;
  if(presetLocked(s))throw new Error('创作已经开始，模式版本已固定。');
  captureEdits(s,record);
  for(const path of Object.keys(record.applied))if(record.sources[path]!=='author')set(s,path,get(record.baseline,path));
  if(s.workflow.storyBibleFresh)s.workflow.storyBibleFieldSources=Object.fromEntries(Object.entries(record.sources).filter(([,source])=>source==='author'));
  delete s.workflow.novelPreset;
  s.selectedGenre=s.authorSettings.genres?.[0]||'';s.selectedStyle=s.authorSettings.styles?.[0]||'';
}
export function assertPresetCompatible(s) {
  const p=activeNovelPreset(s);if(!p)return;
  validateNovelPresetRecord(s.workflow.novelPreset);
  if(p.id==='alternative-history' && featureEnabled(s,'historicalReference'))
    throw new Error('架空历史允许历史分叉，与“历史结局不可篡改”的历史参考模式冲突。请关闭历史参考模式，考据要求可填写在世界设定中。');
}
// Metadata, field provenance and baseline backups are not manuscript content.
// No-preset books return null so their legacy signature remains byte-identical.
export function presetSignatureData(s) {
  const p=activeNovelPreset(s);
  return p ? [p,String(s.workflow.autoSetup?.ending||'')] : null;
}
export function presetCommonContext(s,{legacy=false}={}) {
  const p=activeNovelPreset(s);if(!p)return '';
  const a=s.authorSettings||{};
  return `\n小说模式：${p.name}（版本${p.version}）。作者当前配置、明确的故事意图与硬性约束优先于模式的推荐和示例；已关闭的配置项不重新启用。\n${Object.entries(PRESET_DIMENSIONS).map(([k,label])=>`${label}：${p.dimensions[k]}`).join('\n')}\n类型规则：${p.rules.join('；')}\n作者结局方向：${s.workflow.autoSetup?.ending?.trim()||'按当前结局倾向完成全书'}\n${(legacy?a.featureToggles?.characters===false:!featureEnabled(s,'characters'))?'':`人物档案：${a.characterRoster||'待根据故事生成'}\n`}具体人物、地点和事件须原创。模式示例是备选方向，不是已发生事实。`;
}
export function presetChapterPhase(index,total) {
  if(total<=1)return 'ending';
  if(index>=total-1)return 'ending';
  const progress=(index+1)/total;
  return progress<=.15?'opening':progress<.55?'development':progress<.8?'turning':'climax';
}
export function presetAllowedTags(s) {
  const p=activeNovelPreset(s);return p?[...new Set(Object.values(p.chapterTags).flat())]:[];
}
export function presetStageContext(s,stage,{index=0,total=s.scale?.totalChapters||1}={}) {
  const p=activeNovelPreset(s);if(!p)return '';
  const intro=`\n[小说模式阶段：${stage}] `;
  if(stage==='settings')return intro+'为本作品构思具体原创设定，明确人物目标、关系、时代、世界限制与结局基础；模板原则不等于完成的故事。多种世界或人物例子只选与作者意图一致的一套。';
  if(stage==='outline')return intro+'按总章节数分配开局、发展、转折、高潮与收束，列明读者期待的阶段兑现和最终回收；短篇合并阶段，长篇避免重复冲突。总纲可以写清幕后真相，但人物只能逐步获知。';
  if(stage==='chapters')return intro+`每章返回tags数组，选择1至6个与实际章纲相符的标签。可用标签：${presetAllowedTags(s).join('、')}。按各章位置安排功能，不把高潮、揭秘复制到所有章节。`;
  if(stage==='plan')return intro+`当前阶段：${({opening:'开局',development:'发展',turning:'转折',climax:'高潮',ending:'收束'})[presetChapterPhase(index,total)]}。建议功能：${p.chapterTags[presetChapterPhase(index,total)].join('、')}。${total===1?'本章同时完成开局、发展、转折与结局。':''}每个场景有选择和后果，分别记录人物知道、误信和读者已知的信息；计划不能写入已发生事实记忆。`;
  if(stage==='draft')return intro+'按本章目标与标签选择细节密度，保持当前视角和知情范围；延续前文物品、能力、伤势与关系。标签是写作要求，不在正文列出标签或面板之外的规则说明。';
  if(stage==='review')return intro+`在原有五维审查中关注：${p.audit.join('；')}。按本类型与作者配置判断，不因文学留白、非圆满结局或有意慢热而机械扣分；问题必须有正文证据。`;
  return '';
}
export function validatePresetChapterTags(s,raw,chapters) {
  if(!activeNovelPreset(s))return chapters;
  const allowed=new Set(presetAllowedTags(s));
  return chapters.map((chapter,index)=>{
    const tags=raw.chapters[index]?.tags;
    if(!Array.isArray(tags)||tags.length<1||tags.length>6||tags.some(t=>!allowed.has(t))||new Set(tags).size!==tags.length)
      throw new Error('小说模式章纲需要1至6个合法且不重复的剧情标签。');
    return {...chapter,tags:[...tags]};
  });
}
export const PRESET_STORY_FIELDS = ['protagonistName','protagonistGoal','worldSetting','coreTheme','mainline','hiddenLine','hardConstraints','supportingCharacters','relationshipMap','timeSetting','characterRoster'];
export function presetInitializationSchema(s) {
  const fields=PRESET_STORY_FIELDS.filter(key=>!s.authorSettings[key]?.trim());
  return {...(!s.storyIdea?.trim()?{storyIdea:'原创一句话故事，100字内',title:'原创书名，30字内'}:{}),...Object.fromEntries(fields.map(k=>[k,'具体设定，200字内']))};
}
export function validatePresetInitialization(value,schema) {
  if(Object.keys(schema).some(k=>!text(value?.[k],k==='title'?100:k==='storyIdea'?1000:2000)))throw new Error('小说模式的原创故事或设定没有完整返回。');
  return Object.fromEntries(Object.keys(schema).map(k=>[k,value[k].trim()]));
}
export function restorePresetImport(book) {
  if(!book.workflow?.novelPreset)return book;
  validateNovelPresetRecord(book.workflow.novelPreset);
  if(book.workflow.autoRun) {
    const run=book.workflow.autoRun;
    if(run.policy!=='author-final-v1' || typeof run.id!=='string' || !run.startedAt)throw new Error('小说模式的自动任务检查点无效。');
    run.bookId=book.id;
    if(run.status==='running'){run.status='paused';run.error='已恢复作品，请点击继续自动任务。';}
    // Imported duplicates get a new book identity. Never resume tasks owned by
    // the source book (including its revision/background task references).
    delete run.auditRef;
  }
  delete book.workflow.backgroundTasks;
  for(const c of book.chapters||[])delete c.backgroundTasks;
  return book;
}
