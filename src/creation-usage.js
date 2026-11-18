import { offPeakAt } from './performance-policy.js';
export function summarizeCreationUsage(rows=[]) {
  const summary={requests:rows.length,known:0,unknown:0,unknownPrice:0,input:0,output:0,usd:0,durationMs:0,rejected:0,duplicate:0,queueMs:0};
  for(const row of rows){
    summary.durationMs+=Number(row.duration_ms)||0;summary.queueMs+=Number(row.queue_ms)||0;
    if(row.status==='rejected')summary.rejected++;if(row.status==='duplicate')summary.duplicate++;
    const u=row.usage;
    if(!u||!Number.isFinite(u.prompt_tokens)||!Number.isFinite(u.completion_tokens)){summary.unknown++;continue;}
    summary.known++;summary.input+=u.prompt_tokens;summary.output+=u.completion_tokens;
    const hit=u.prompt_cache_hit_tokens??u.prompt_tokens_details?.cached_tokens;
    if(!Number.isFinite(hit)){summary.unknownPrice++;continue;}
    const prices=row.pricing_source==='deepseek-official'?(row.model==='deepseek-flash'?[.003,.15,.6]:row.model==='deepseek-v4-pro'?[.022,.66,1.98]:null):null;
    if(!prices){summary.unknownPrice++;continue;}
    summary.usd+=(hit*prices[0]+Math.max(0,u.prompt_tokens-hit)*prices[1]+u.completion_tokens*prices[2])*(offPeakAt(new Date(row.started))?1:2)/1e6;
  }
  return summary;
}
export function creationUsageText(rows){const s=summarizeCreationUsage(rows);return `普通创作实际请求 ${s.requests} 次 · 输入 ${s.input} / 输出 ${s.output} Token · 校验未通过 ${s.rejected} 次 · 重复 ${s.duplicate} 次 · 可计价部分 $${s.usd.toFixed(4)} USD · 未知用量 ${s.unknown} 次 / 缺少计价信息 ${s.unknownPrice} 次 · 累计等待/调用 ${(s.durationMs/1000).toFixed(1)} 秒。官方估价按 2026-09-15 价格，自定义接口费用以其账单为准；终审用量在终审报告中查看。`;}
