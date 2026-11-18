import { activeNovelPreset } from './novel-preset-runtime.js';

const STEPS = {
  settings:'先完善创作意图、主角目标和世界规则，可手填或采用 AI 方案。阅读后点击“确认全局设定”进入大纲；只保存配置不会代替这次确认。',
  outline:'先确认故事设定，再准备总体大纲、每章标题和核心事件。检查章节顺序后确认目录；修改全局设定或目录后需要重新确认。',
  studio:'依次完成本章规划、确认规划、创作正文和阅读确认。启用章节审查时，按当前审查结果处理后继续下一章；关闭时在全书写完后统一审查。',
  review:'全部章节准备好后检查全书。当前版本的完整报告即可继续，分数与问题供参考；审查中断可继续任务，或勾选两项知情确认由作者接管。辅助修订可选。',
  detail:'按需整理和替换词语，先预览再采用。无需改动时点击“确认当前版本无需调整”。修改正文后，原报告或作者接管确认可能失效，按提示重新确认。',
  relations:'整理或手动编辑单位及关联，核对名称、关系方向和原文后确认图谱。只改图谱不会改写正文；需要同步正文时请另行使用更新功能并核对候选。',
  'human-review':'阅读完整书稿，核对图谱与推广资料后确认。使用作者接管时，这一步是导出前的必要确认；作品修改后需要重新核对。',
  export:'选择所需格式下载。按钮不可用时，按页面提示前往尚未完成的步骤。投稿资料包保留审查状态；作者接管不会被记作 AI 审查完成。',
  automatic:'填写故事构想或选择参考故事模板，确认章节数与每章字数后开始。其余设定可由 AI 补充；任务中断后点击继续，完成后在人工终审核对书稿。',
  flows:'选择适合自己的创作方式。小白模式可以从作品名或一句灵感开始；专业模式逐步确认设定与章节；一键自动模式完成后集中终审。'
};
export function workflowHelpView(tab) {
  return STEPS[tab] ? `<details class="wf-step-help"><summary>本步操作说明 <small>红色 <span class="wf-required" aria-label="必填">*</span> 为本步必须完成的内容，可由 AI 辅助填写</small></summary><p>${STEPS[tab]}</p></details>` : '';
}

// Annotate rendered controls only. Values, validation rules and configuration
// stay with their existing owners, including optional AI-assisted fields.
let helpSerial=0;
export function enhanceWorkflowHelp(root, state) {
  if(!root)return;
  const rules=[
    ['[data-wf-field="story"]',true,'创作意图','确认设定前需要有内容。可先留空，让 AI 根据书名构思，再采用方案。'],
    ['[data-wf-field="chapter-count"],[data-novice-field="chapterCount"],[data-auto-field="chapters"]',true,'章节数','范围 1—1000 章，决定全书结构；修改后请检查大纲与设定。'],
    ['[data-novice-field="wordCount"],[data-auto-field="words"]',true,'每章字数','范围 500—10000 字，作为每章创作目标。'],
    ['[data-wf-field="synopsis"],[data-wf-synopsis]',true,'故事大纲','写清起因、关键转折和结果，可采用 AI 生成的章纲后再调整。'],
    ['[data-wf-outline-title],[data-wf-field="chapter-title"]',true,'章节标题','确认目录前需要标题，尽量突出本章事件。'],
    ['[data-wf-field^="plan:"]',true,'章节规划','确认规划前需要填写，可由 AI 生成；确实不涉及的内容可写“无”。'],
    ['[data-wf-field="draft"]',true,'章节正文','确认本章规划后可手写或使用 AI。修改正文后，原审查或接管确认需要重新核对。'],
    ['[data-config-text="authorSettings.protagonistGoal"]',true,'主角目标与代价','确认故事设定前必须完善：主角想得到什么，失败会失去什么。'],
    ['[data-config-text="authorSettings.worldSetting"]',true,'世界观与规则','确认故事设定前必须完善：时代环境、能力边界与不可违反的规则。'],
    ['[data-auto-field="idea"]',!activeNovelPreset(state),'一句话故事',activeNovelPreset(state)?'已选择故事模板，此项可选；填写后可让故事更贴近你的想法。':'填写主要人物、目标或冲突；也可先选择参考故事模板，由模板辅助构思。'],
    ['[data-novice-field="premise"]',!state.books?.find(b=>b.id===state.activeBookId)?.title?.trim(),'小说灵感','与作品名至少提供一项。写清想看的情节，其余可交给 AI 完善。'],
    ['[data-auto-field="protagonistName"],[data-novice-field="protagonistName"]',false,'主角姓名','可选，留空可由 AI 代拟。'],
    ['[data-auto-field="genres"],[data-novice-field="genre"]',false,'题材','可选，留空按故事构想判断。'],
    ['[data-human-review-input]',false,'作品关键词 / 作者评价','可选，填写亮点、受众和推广方向；留空时根据现有简介生成。'],
    ['[data-wf-intent]',false,'给 AI 的方向','可选，只描述本次希望调整的内容；留空按当前设定与正文处理。'],
    ['[data-graph-field="name"]',true,'单位名称','保存单位时必填，使用正文中的姓名、地点或事件名称。'],
    ['[data-graph-field="type"]',true,'单位类型','选择最符合本质的类型，便于分类查看和核对关系。'],
    ['[data-term-target]',false,'替换词','可选，留空保留原词。填写后先预览命中位置，再确认采用。'],
    ['[data-review-handoff-manuscript],[data-review-handoff-audit]',true,'作者接管确认','仅在选择作者接管时必须勾选。请阅读书稿并知晓 AI 审查状态后确认。'],
    ['[data-auto-ack]',true,'定稿确认','阅读并核对对应内容后勾选，确认当前版本定稿。']
  ];
  for(const [selector,required,label,help] of rules)for(const control of root.querySelectorAll(selector)){
    if(control.dataset.workflowHelp)continue;
    control.dataset.workflowHelp='true';
    const doc=control.ownerDocument,serial=++helpSerial,id='wf-help-'+serial;
    let wrapper=control.closest('label'),caption=wrapper?.querySelector(':scope > span');
    if(!wrapper){
      wrapper=doc.createElement('label');wrapper.className='wf-help-label';
      control.id ||= 'wf-control-'+serial;wrapper.htmlFor=control.id;wrapper.textContent=label;control.before(wrapper);
    }
    if(required){
      control.setAttribute('aria-required','true');
      const marker=doc.createElement('span');marker.className='wf-required';marker.textContent='*';marker.setAttribute('aria-label','必填');
      if(caption)caption.append(marker);else wrapper.insertBefore(marker,wrapper.contains(control)?control:null);
    }
    const hint=doc.createElement('small');hint.id=id;hint.className='wf-field-help';hint.textContent=help;
    if(control.type==='checkbox'&&wrapper.contains(control))wrapper.after(hint);else control.after(hint);
    control.setAttribute('aria-describedby',[control.getAttribute('aria-describedby'),id].filter(Boolean).join(' '));
  }
}
