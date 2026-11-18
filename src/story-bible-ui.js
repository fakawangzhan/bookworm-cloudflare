import { NOVEL_PRESETS, PRESET_GROUPS, PRESET_DIMENSIONS, PRESET_FIELD_LABELS } from './novel-presets.js';
import { activeNovelPreset, presetLocked } from './novel-preset-runtime.js';

const format = value => Array.isArray(value) ? value.join('、') : String(value ?? '未设置');
const selectedView = (active, h) => active ? `<b>${h(active.name)}</b> · 版本 ${active.version} · ${h(active.description)}` : '当前未使用参考模型，沿用本作品现有设置。';
function mappingsView(s, active, h) {
  return active ? Object.entries(active.authorSettings).map(([key, value]) => {
    const source = s.workflow.novelPreset.sources['authorSettings.' + key];
    return `<tr><th>${h(PRESET_FIELD_LABELS[key] || key)}</th><td>${h(format(value))}</td><td>${h(format(s.authorSettings[key]))}${source === 'author' ? '（作者设置优先）' : ''}</td></tr>`;
  }).join('') : '';
}
const principlesView = (active, h) => active ? `<dl>${Object.entries(PRESET_DIMENSIONS).map(([key,label]) => `<dt>${h(label)}</dt><dd>${h(active.dimensions[key])}</dd>`).join('')}</dl><p>${h(active.rules.join('；'))}</p>` : '';

export function storyBibleView(s, h, scope = 'author') {
  const active = activeNovelPreset(s), locked = presetLocked(s);
  return `<section class="panel wf-card wf-story-bible" data-story-bible-panel="${scope}"><h3>参考故事圣经设置</h3>
    <p class="wf-hint">20 种小说通用模型，选择后关联题材、人物、冲突、节奏和文风。已有作者设置优先；具体故事由现有创作流程生成。</p>
    <p data-story-bible-selected>${selectedView(active,h)}</p>
    ${locked ? '<p class="wf-hint">大纲或正文创作已开始，参考模型版本固定。作者配置仍可按原流程调整。</p>' : `<details class="wf-story-bible-options" ${active ? '' : 'open'}><summary>${active ? '更换参考模型' : '选择一种参考模型'}</summary><div class="wf-story-bible-grid">${PRESET_GROUPS.map(group => `<fieldset><legend>${h(group)}</legend>${NOVEL_PRESETS.filter(p => p.group === group).map(p => `<label><input type="radio" name="story-bible-${scope}" data-story-bible="${p.id}" ${p.id === active?.id ? 'checked' : ''}><span><b>${h(p.name)}</b><small>${h(p.description)}</small></span></label>`).join('')}</fieldset>`).join('')}</div></details><button type="button" class="button secondary" data-wf="clear-story-bible" ${active ? '' : 'hidden'}>清除参考，保留作者修改</button>`}
    <details data-story-bible-mapping ${active ? '' : 'hidden'}><summary>查看故事原则和参数映射</summary><div data-story-bible-principles>${principlesView(active,h)}</div><div class="wf-story-bible-table"><table><thead><tr><th>作者参数</th><th>模型推荐</th><th>当前生效值</th></tr></thead><tbody>${mappingsView(s,active,h)}</tbody></table></div><p class="wf-hint">章节规划还会关联开局、发展、转折、高潮和收束标签；文风比例进入现有人性化设置。章数、字数、AI 配置及审核开关由原有设置控制。</p></details>
  </section>`;
}

// Preserve radios, buttons and expanded sections; only the passive explanation
// and parameter mapping need new content after a selection or author edit.
export function refreshStoryBible(s, h) {
  const active = activeNovelPreset(s);
  document.querySelectorAll('[data-story-bible-panel]').forEach(panel => {
    const html = (selector, value) => { const el = panel.querySelector(selector); if (el && el.innerHTML !== value) el.innerHTML = value; };
    html('[data-story-bible-selected]', selectedView(active,h));
    html('[data-story-bible-principles]', principlesView(active,h));
    html('.wf-story-bible-table tbody', mappingsView(s,active,h));
    panel.querySelectorAll('[data-story-bible]').forEach(el => { el.checked = el.dataset.storyBible === active?.id; });
    const summary = panel.querySelector('.wf-story-bible-options > summary');
    if (summary) summary.textContent = active ? '更换参考模型' : '选择一种参考模型';
    const clear = panel.querySelector('[data-wf="clear-story-bible"]');
    if (clear) clear.hidden = !active;
    const mapping = panel.querySelector('[data-story-bible-mapping]');
    if (mapping) mapping.hidden = !active;
  });
}
