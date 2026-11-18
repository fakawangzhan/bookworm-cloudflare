// Pure boundary parsers shared by browser and local services. They never mutate
// imported objects; callers retain originals for history and recovery.
export const SCALE_RULES = Object.freeze({
  totalChapters: { min: 1, max: 1000, default: 100, integer: true, label: '章节数' },
  wordsPerChapter: { min: 500, max: 10000, default: 3000, integer: true, label: '每章字数' },
  characters: { min: 1, max: 30, default: 8, integer: true, label: '建议核心人物数量' },
  dailyChapters: { min: 1, max: 20, default: 3, integer: true, label: '每日写作计划' }
});
export const REQUEST_RULES = Object.freeze({
  temperature: { min: 0, max: 1.5, default: 0.75 },
  requestTimeout: { min: 10, max: 300, default: 180, integer: true },
  maxTokens: { min: 500, max: 8000, default: 3000, integer: true },
  maxConcurrent: { min: 1, max: 8, default: 2, integer: true },
  retryCount: { min: 0, max: 5, default: 2, integer: true }
});
export function numeric(value, rule = {}) {
  if (!['number', 'string'].includes(typeof value) || typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && (!rule.integer || Number.isSafeInteger(n)) && n >= (rule.min ?? -Infinity) && n <= (rule.max ?? Infinity) ? n : null;
}
export function numberValue(value, rule) { return numeric(value, rule) ?? rule.default; }
export function booleanValue(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 'enabled') return true;
  if (value === false || value === 'false' || value === 0 || value === '0' || value === 'disabled') return false;
  return fallback;
}
export function effectiveScale(source = {}, { strict = false } = {}) {
  return Object.fromEntries(Object.entries(SCALE_RULES).map(([key, rule]) => {
    const value = numeric(source[key] ?? rule.default, rule);
    if (value === null && strict) throw new Error(`${rule.label}必须为 ${rule.min}—${rule.max} 的整数。`);
    return [key, value ?? rule.default];
  }));
}
export function readScaleInput(element, key) {
  const rule = SCALE_RULES[key], n = numeric(element.value, rule);
  element.setCustomValidity(n === null ? `${rule.label}必须为 ${rule.min}—${rule.max} 的整数。` : '');
  return n;
}
export function effectiveRequest(source = {}) {
  return { ...source, ...Object.fromEntries(Object.entries(REQUEST_RULES).map(([key, rule]) => [key, numberValue(source[key], rule)])),
    ...Object.fromEntries(['deepThinking','requestCache','logRequests'].map(key => [key, booleanValue(source[key])])),
    ...Object.fromEntries(['autoSave','localDemo','failoverEnabled'].map(key => [key, booleanValue(source[key], true)])),
    streamOutput: true, outputValidation: true, redactPrompts: true };
}
// Paid scene/segment checkpoints include the prompt in their identity. Keep
// their original context formatting until that workflow is replaced; a parser
// upgrade alone must never start a second paid version of the same scene.
export function legacyParameterTask(s = {}) {
  const w=s.workflow||{},cp=w.creationProgress,segment=w.segmentProgress,run=w.autoRun;
  return Boolean(cp?.protocol==='scene-prose-v2'||cp?.contextProtocol==='legacy-parameters-v1'
    ||segment&&(!segment.protocol||segment.contextProtocol==='legacy-parameters-v1')
    ||run&&(!run.proseProtocol||run.proseProtocol==='legacy-utf16'));
}
const FIELDS = {
  protagonist: ['protagonistName','protagonistGoal'], protagonistTraits: ['protagonistTraits'],
  characters: ['characterSlots','characterRoster','supportingCharacters'], relations: ['characterRelationTypes','relationshipMap'],
  world: ['worldSetting'], theme: ['coreTheme'], time: ['timeSetting'],
  historicalReference: ['historicalPeriod','historicalEvents','historicalCanonNotes']
};
export function featureEnabled(s, key) {
  const f = s.authorSettings?.featureToggles || {}, settings = s.settings || {};
  if (!booleanValue(f[key], true)) return false;
  if (key === 'genres' && !booleanValue(settings.genreEnabled, true)) return false;
  if (key === 'contentRating' && !booleanValue(settings.boundariesEnabled, true)) return false;
  if (['protagonist','protagonistTraits','world','theme','mainline','hiddenLine'].includes(key) && !booleanValue(settings.coreEnabled, true)) return false;
  if (['protagonistTraits','protagonistMottos'].includes(key) && !featureEnabled(s,'protagonist')) return false;
  if (key === 'relations' && !featureEnabled(s,'characters')) return false;
  if (key === 'historicalReference' && !booleanValue(s.authorSettings?.historicalReferenceEnabled)) return false;
  if (key === 'humanization' && !booleanValue(s.humanization?.enabled, true)) return false;
  return true;
}
export function effectiveStory(s = {}) {
  const author = { ...s.authorSettings };
  for (const key of new Set([...Object.keys(author.featureToggles || {}), ...Object.keys(FIELDS)])) {
    if (!featureEnabled(s,key)) for (const field of FIELDS[key] || [key]) delete author[field];
  }
  for (const key of ['featureToggles','aiCoAuthor','consistencyGuard','autoSceneCards','preserveAuthorVoice']) delete author[key];
  delete author.historicalReferenceEnabled;
  const humanization = featureEnabled(s,'humanization') ? { ...s.humanization } : {};
  for (const key of Object.keys(humanization)) if (key.endsWith('Enabled')) {
    const name=key.slice(0,-7);
    if (!booleanValue(humanization[key], true)) {
      for (const field of [name, `${name}Ratio`, ...(name==='mood'?['authorMood']:[]), ...(name==='regionalDialogue'?['regionalVocabulary']:[]), ...(name==='internetMeme'?['internetMemes']:[])]) delete humanization[field];
    }
    delete humanization[key];
  }
  delete humanization.enabled;
  const { chapterReviewEnabled, genreEnabled, coreEnabled, boundariesEnabled, scaleEnabled, ...settings } = s.settings || {};
  for (const key of ['growthRule','antiStupidRule']) {
    if (!booleanValue(coreEnabled,true) || !booleanValue(settings[key],true)) delete settings[key]; else settings[key]=true;
  }
  const {dailyChapters, ...scale} = effectiveScale(s.scale);
  return { authorSettings: author, settings, scale, humanization };
}
