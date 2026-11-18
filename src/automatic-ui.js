import { creationFeedback } from './creation-feedback.js';
import { authorAcceptanceReady, automaticDraftGate, bookSignature } from './workflow.js';
import { graphSignature } from './knowledge-graph.js';
import { AUTO_STAGES, automaticIssues, canSkipAutomaticStage } from './automatic-flow.js';
import { storyBibleView } from './story-bible-ui.js';

export function automaticView(s,{h,button,note,settingsPanel}) {
  const run=s.workflow.autoRun;
  const field=(key,label,value,type='text')=>`<label class="wf-field"><span>${label}</span><input data-auto-field="${key}" type="${type}" value="${h(value ?? '')}" ${type==='number' ? key==='chapters'?'min="1" max="1000"':'min="500" max="10000"' : ''}></label>`;
  return `${note('一次开始，按顺序写完整部作品。逐章审查为零，全本检查一轮，最终由你集中审阅与定稿。')}
  <section class="panel wf-card wf-auto"><span class="panel-kicker">一键自动模式</span><h2>${run ? '继续你的自动创作' : '设定故事，剩下的交给 AI'}</h2>
  <p>已有正文与配置保留。自动过程会补全缺失内容，完成后停在人工终审。</p>
  ${storyBibleView(s,h,'automatic')}
  <label class="wf-field"><span>一句话故事</span><textarea data-auto-field="idea" placeholder="写下你想讲的故事">${h(s.storyIdea)}</textarea></label>
  <div class="wf-auto-fields">${field('protagonistName','主角姓名',s.authorSettings.protagonistName)}${field('genres','题材',s.authorSettings.genres?.join('、'))}${field('styles','文风',s.authorSettings.styles?.join('、'))}${field('chapters','总章节数',s.scale.totalChapters,'number')}${field('words','每章字数',s.scale.wordsPerChapter,'number')}</div>
  <label class="wf-field"><span>结局方向（可选）</span><textarea data-auto-field="ending">${h(s.workflow.autoSetup?.ending || '')}</textarea></label>
  <label class="wf-field"><span>必须遵守的设定</span><textarea data-auto-field="hardConstraints">${h(s.authorSettings.hardConstraints || '')}</textarea></label>
  <div class="wf-actions">${button('auto-start',run ? '继续自动任务' : '一键开始，完成后交给我终审',false,'primary')}${canSkipAutomaticStage(s)?button('auto-skip-stage','保留结果并跳过当前辅助步骤'):''}${run?.manuscriptCompletedAt ? button('goto-human-review','进入人工终审') : ''}${button('entry-mode:expert','切换专业模式')}</div>
  ${run ? `<div class="wf-auto-progress" role="status"><b>${h(run.status==='running'?'正在运行':run.status==='awaiting-human'?'等待作者终审':'已暂停，可继续')}</b><p>${h(creationFeedback(run.message || '',s.aiProfiles))}</p><p>${s.chapters.filter(c=>s.drafts[c.id]?.trim()).length} / ${run.targetChapters} 章已有正文</p><small>最近保存：${h(run.updatedAt ? new Date(run.updatedAt).toLocaleString('zh-CN') : '尚未开始')}</small>${run.error?`<p class="wf-warning">${h(creationFeedback(run.error,s.aiProfiles))}</p>`:''}<ol>${AUTO_STAGES.map(([id,label])=>`<li class="${run.stage===id?'current':''}">${run.skippedStages?.[id]?.signature===bookSignature(s)?'待补 · ':run.stages?.[id]?'✓ ':''}${label}</li>`).join('')}</ol></div>`:''}
  <p class="wf-hint">运行期间保持浏览器打开。刷新、休眠或中断后，重新点击继续即可恢复；已有完整章节不会重写。</p></section>
  <details class="wf-manual"><summary>完整作者配置 · 可选</summary>${settingsPanel()}</details>`;
}

export function automaticHumanView(s,{h,button,aiButton,note,guidance,relationsView,promotionView}) {
  const run=s.workflow.autoRun, editor=s.workflow.autoEditor || {}, tab=editor.tab || 'reading';
  const issues=automaticIssues(s),checked=editor.checkedIssues || [],issuesVersion=bookSignature(s);
  const tabs=[['reading','全文阅读'],['issues','问题与修订'],['terms','名字与词句'],['graph','关系图谱'],['publish','定稿与推广']];
  const gate=automaticDraftGate(s), accepted=authorAcceptanceReady(s);
  const stale=s.workflow.finalReview?.signature!==issuesVersion;
  let content='';
  if(tab==='reading') {
    const c=s.chapters.find(c=>c.id===editor.chapterId) || s.chapters[0];
    content=c ? `<label class="wf-field"><span>章节目录</span><select data-auto-read-chapter>${s.chapters.map(c=>`<option value="${c.id}" ${c.id===(editor.chapterId || s.chapters[0]?.id)?'selected':''}>${h(c.title)}</option>`).join('')}</select></label>
    <label class="wf-field wf-manuscript"><span>${h(c.title)}</span><textarea class="wf-auto-editor" data-auto-draft="${c.id}">${h(s.drafts[c.id] || '')}</textarea></label>
    <div class="wf-actions">${button(`auto-save-draft:${c.id}`,'保存本章修改',false,'primary')}</div>
    <details class="wf-revisions"><summary>本章历史版本（${c.revisions?.length || 0}）</summary>${(c.revisions || []).map((r,i)=>`<div><p>${h(r.at)} · ${h(r.label)}</p>${button(`auto-restore:${c.id}:${i}`,'恢复此版本')}</div>`).join('')}</details>
    <details class="wf-revisions"><summary>展开全书连续阅读</summary>${s.chapters.map(c=>`<article class="wf-reading"><h3>${h(c.title)}</h3><p>${h(s.drafts[c.id] || '')}</p></article>`).join('')}</details>`:'<p class="wf-empty">正文尚未完成，请先继续自动任务。</p>';
  }
  if(tab==='issues') {
    content=`<p class="wf-hint">${stale?'报告属于修改前版本，保留供你参考；不会自动重新评分。':'以下为本轮真实 AI 检查问题，分数不作为作者验收门槛。'}</p>
    ${run.audit?.status!=='complete'?`<p class="wf-warning">全本 AI 检查未完成：${h(creationFeedback(run.audit?.error || '尚未执行',s.aiProfiles))}。已检查 ${run.auditProgress?.completed?.length || run.audit?.checkedParts || 0} 段，剩余范围未检查。可继续检查，或在定稿页知情接管。</p>`:''}
    <div class="wf-auto-issues">${issues.length?issues.map(issue=>`<article class="wf-auto-issue"><label><input type="checkbox" data-auto-issue="${h(issue.id)}" ${checked.includes(issue.id)?'checked':''}><b>${h(issue.label)} · ${issue.severity==='blocking'?'实质问题':'建议'}</b></label><p>${h(issue.detail)}</p><label class="wf-field"><span>处理决定</span><select data-auto-resolution="${h(issue.id)}"><option value="">待处理</option>${[['accepted','接受原文'],['manual','已手动处理'],['ai','交给 AI 处理']].map(([id,label])=>`<option value="${id}" ${editor.decisions?.[issue.id]?.value===id && editor.decisions[issue.id].signature===issuesVersion?'selected':''}>${label}</option>`).join('')}</select></label></article>`).join(''):'<p class="wf-empty">暂无已记录问题。AI 检查是否完整，请以上方状态为准。</p>'}</div>
    ${guidance('auto-revision','可勾选多个问题，也可以直接写一句全书修改方向。',['按选中问题做最小修订','保留情节，改善对白'])}
    <div class="wf-actions">${aiButton('auto-revise','批量生成修订候选稿',!!gate)}</div>`;
  }
  if(tab==='terms') {
    const terms=s.workflow.termDictionary || [];
    const pages=Math.max(1,Math.ceil(terms.length/30)),page=Math.max(0,Math.min(pages-1,editor.termPage||0));
    content=`<p>已准备 ${terms.length} 条分类词。勾选并填写新词后预览全书命中位置，再统一采用；同名或简称请逐处核对。</p>
    <p class="wf-hint" data-keyword-status>输入替换词时从同类公用词库匹配。</p>
    <div class="wf-auto-terms">${terms.slice(page*30,(page+1)*30).map((t,index)=>{const i=page*30+index;return `<article class="wf-auto-term"><label><input type="checkbox" data-auto-term-enabled="${i}" ${t.enabled?'checked':''}><b>${h(t.category)} · ${h(t.source)}</b></label><label class="wf-field wf-keyword-field"><span>替换为</span><input data-auto-term-target="${i}" value="${h(t.target||'')}" placeholder="保留原词时留空" maxlength="120"><span id="auto-keyword-options-${i}" data-keyword-options class="wf-keyword-options" role="listbox" hidden></span></label><small>章节：${h((t.chapters||[]).join('、') || '全书')}</small></article>`;}).join('')}</div>
    <div class="wf-actions">${button('auto-term-page:previous','上一页',page===0)}<span>${page+1}/${pages}</span>${button('auto-term-page:next','下一页',page>=pages-1)}</div>
    <details class="wf-manual"><summary>手动添加一条替换规则</summary><label class="wf-field"><span>类别</span><input data-auto-new-category value="术语"></label><label class="wf-field"><span>原词</span><input data-auto-new-source></label><label class="wf-field"><span>新词</span><input data-auto-new-target></label>${button('auto-add-term','添加规则')}</details>
    ${editor.termPreview ? `<div class="wf-auto-preview"><h3>本次替换预览</h3><p>${h(editor.termPreview.summary)}</p>${Object.entries(editor.termPreview.counts||{}).map(([term,count])=>`<span>${h(term)} · ${count} 处</span>`).join('、')}</div>` : ''}
    <div class="wf-actions">${button('auto-preview-terms','预览全书替换',!terms.length || !!gate,'secondary')}${button('auto-apply-terms','采用预览并统一替换',!editor.termPreview || !!gate,'primary')}</div>`;
  }
  if(tab==='graph')content=`${note('图谱为自动整理资料。请核对关系；只编辑图谱不会自动重写正文。需要同步剧情时，在“问题与修订”中说明修改方向。')}${relationsView()}`;
  if(tab==='publish') {
    const unresolved=issues.filter(i=>!['accepted','manual'].includes(editor.decisions?.[i.id]?.value) || editor.decisions[i.id].signature!==issuesVersion);
    content=`<h3>确认正文与资料</h3>${gate?`<p class="wf-warning">${h(gate)}</p>`:''}
    <p>共 ${s.chapters.length} 章。${run.audit?.status==='complete'?'AI 全本检查已完成一轮。':'AI 全本检查未完整完成，作者确认表示已知晓并自行接管。'} ${stale?'正文已有调整，旧报告不代表当前版本。':''}</p>
    <p>${unresolved.length} 项问题尚未逐项标记；确认时将记录为“作者审阅后接受当前稿”。</p>
    <label class="wf-auto-check"><input type="checkbox" data-auto-ack="manuscript" ${editor.ackSignature===issuesVersion && editor.ack?.manuscript?'checked':''}>我已阅读当前正文，处理或接受问题，并知晓 AI 检查覆盖情况。</label>
    <label class="wf-auto-check"><input type="checkbox" data-auto-ack="materials" ${editor.ackGraph===graphSignature(s.graph) && editor.ack?.materials?'checked':''}>我已核对词表与关系图谱；未自动整理完成的资料由我接管确认。</label>
    <div class="wf-actions">${button('auto-accept-manuscript',accepted?'当前版本已确认定稿':'确认当前书稿定稿',!!gate,'primary')}</div>
    ${accepted ? promotionView() : '<p class="wf-hint">确认当前书稿后，可填写作品关键词，生成五平台推广文案与配图提示。</p>'}`;
  }
  return `${note('自动创作已交给你。所有阅读、修订、改名和定稿均可在这里集中完成，采用修改不会自动开启评分循环。')}
  <section class="panel wf-card wf-auto-human"><h2>人工终审</h2><p>${h(creationFeedback(run.message || '',s.aiProfiles))}</p>${['incomplete','skipped'].includes(run.materials?.status)||['incomplete','skipped'].includes(run.audit?.status)?button('auto-retry-remaining','继续未完成的资料与审查',false,'secondary'):''}${run.materials?.status==='incomplete'?`<p class="wf-warning">词表或图谱整理未完成：${h(creationFeedback(run.materials.error,s.aiProfiles))}</p>`:''}
  ${Object.values(run.materialTermDiagnostics||{}).some(items=>items.length)?`<details class="wf-hint"><summary>查看未采用的词条（已保留有效词表）</summary>${Object.entries(run.materialTermDiagnostics).flatMap(([chapterId,items])=>items.map(item=>`<p>第 ${h(chapterId)} 章 · ${h(item.source||'格式不完整的词条')}：${h(item.reason)}</p>`)).join('')}</details>`:''}
  <div class="wf-auto-tabs" role="tablist" aria-label="人工终审内容">${tabs.map(([id,label])=>`<button type="button" role="tab" aria-selected="${tab===id}" aria-controls="auto-review-panel" data-wf="auto-tab:${id}" class="button ${tab===id?'primary':'secondary'}">${label}</button>`).join('')}</div>
  <div id="auto-review-panel" role="tabpanel">${content}</div></section>`;
}
