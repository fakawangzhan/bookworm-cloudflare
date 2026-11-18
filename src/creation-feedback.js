// Presentation only: keep original errors, profile IDs and model provenance in
// persisted records. Manuscript, settings and generated prose never pass here.
export function creationFeedback(message, profiles=[]) {
  let text=String(message || '');
  if (/links\[\d+\]\.(from|to)/.test(text)) return '关系图谱有未对应的单位，进度已保存。请继续任务以纠正关联；若仍未完成，可由作者手动核对。';
  if (/issues\[\d+\]\.anchors?/.test(text)) return '审查结果中有待核对的原文位置，进度已保存。请继续审查，或确认由作者接管。';
  if (/源码已过期|源码更新|sourceHash|reboot\.(bat|sh)/i.test(text)) return '本地服务需要重新启动，请联系管理员处理后重试。已有作品和配置保留。';
  if (/请求上限|请求.*额度.*用完|预留额度|累计.*预算/.test(text)) return '已有结果保留，请继续当前步骤；历史请求次数不会阻止续跑。';
  const names=[...new Set(profiles.flatMap(p=>[p.model,p.label]).filter(v=>typeof v==='string'&&v.length>=3))].sort((a,b)=>b.length-a.length);
  for(const name of names) text=text.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'AI 服务');
  text=text.replace(/\b(?:gpt-\d|deepseek|claude|gemini|qwen|moonshot|glm-\d|o[134]-)[a-z\d._/-]*\b/gi,'AI 服务')
    .replace(/https?:\/\/[^\s<>"'，。；）]+/gi,'服务地址');
  if (/\b(?:tokens?|cache hit|PID)\b|并发上限|图谱大块抽取|batch-\d+/i.test(text)) return '正在处理当前内容，已完成的进度会保留。';
  return text;
}
