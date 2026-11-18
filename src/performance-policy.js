export const PERFORMANCE_POLICIES = [
  ['legacy','保留当前配置'], ['balanced','稳健均衡'], ['economy','成本优先'], ['fast','时间优先']
];
export const creationPolicy = state => state.workflow?.performance?.strategy || 'legacy';
export const policyEnabled = state => creationPolicy(state) !== 'legacy';
export function officialModel(policy, purpose) {
  // Flash prose stays closed until the same-task benchmark passes. Economy
  // uses the verified fast model only for independently verifiable materials.
  return policy === 'economy' && purpose === 'materials' ? 'deepseek-flash' : 'deepseek-v4-pro';
}
export function offPeakAt(date = new Date()) {
  const weekday=date.getUTCDay(),hour=date.getUTCHours();
  return weekday===0||weekday===6||!((hour>=1&&hour<4)||(hour>=6&&hour<10));
}
export function nextOffPeak(date = new Date()) {
  const value=new Date(date);
  while(!offPeakAt(value)){value.setUTCMinutes(0,0,0);value.setUTCHours(value.getUTCHours()+1);}
  return value;
}
export function performanceView(state,h) {
  const current=creationPolicy(state);
  return `<details class="wf-performance"><summary><span>运行策略</span><span class="wf-performance-status">${h(PERFORMANCE_POLICIES.find(p=>p[0]===current)?.[1]||'保留当前配置')}</span></summary>
    <div class="wf-performance-body"><div class="wf-performance-grid">
    <label class="wf-field"><span>普通创作与资料处理</span><select data-performance-strategy>${PERFORMANCE_POLICIES.map(([id,label])=>`<option value="${id}" ${current===id?'selected':''}>${label}</option>`).join('')}</select></label>
    <label class="wf-field"><span>创作方案</span><select data-performance-profile><option value="">系统推荐方案</option>${(state.aiProfiles||[]).map((p,i)=>p.serverManaged||p.apiKey?`<option value="${h(p.id)}" ${state.workflow?.performance?.profileId===p.id?'selected':''}>${h(p.label || p.id)} · ${h(p.model || '未选择模型')}${p.serverManaged ? '（内置）' : ''}</option>`:'').join('')}</select></label>
    </div><p class="wf-hint wf-performance-description">选择适合本书的创作方案与处理偏好，已有内容和设置保留。</p>
    <div class="wf-performance-options">
    <label class="wf-performance-check"><input type="checkbox" data-performance-offpeak ${state.workflow?.performance?.offPeak?'checked':''}><span>批量自动任务只在官方谷时开始</span></label>
    <label class="wf-performance-check"><input type="checkbox" data-performance-preview ${state.workflow?.performance?.preview?'checked':''}><span>显示生成中的正文预览</span></label></div>
    <pre class="wf-performance-preview" data-creation-preview hidden></pre>
    <div class="wf-performance-footer"><div class="wf-performance-actions">
    <button type="button" class="button secondary" data-creation-retry>连接中断后重试</button></div><p class="wf-hint">仅重试因连接中断而未完成的操作，已完成的内容保留。</p></div></div></details>`;
}
