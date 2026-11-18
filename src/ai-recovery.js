import { parseJSON } from './workflow.js';
import {revisionErrorCode,revisionResponseShape} from './revision-telemetry.js';

// Only complete responses enter business state. Network retries belong to the
// existing client; format retries must not multiply 401/502/timeouts.
export async function requestCompleteJSON(request, prompt, validate, {signal, tokens=1800, onRetry=()=>{}, observe=()=>{}, retryInstruction=()=> '\n上次输出截断或字段不完整。缩短文字，保留全部必要字段与实际问题，只返回完整 JSON。'}={}) {
  const event=(name,fields)=>{try{observe(name,fields);}catch{}};
  let last;
  for(let attempt=0;attempt<3;attempt++) {
    signal?.throwIfAborted();
    const budget=Math.min(8000,Math.ceil(tokens*1.7**attempt));
    event('json_attempt',{formatAttempt:attempt+1,maxTokens:budget});
    const currentPrompt=prompt+(attempt ? retryInstruction(last) : '');
    const first=await request(currentPrompt,budget,signal,{formatAttempt:attempt+1});
    const response=await completeStructuredResponse(first,currentPrompt,text=>request(text,budget,signal,{formatAttempt:attempt+1}),{check:()=>signal?.throwIfAborted(),progress:onRetry});
    signal?.throwIfAborted();
    let parsed;
    try {
      if(response.finishReason==='length') throw new Error('结构化输出未完成，已保留当前步骤。');
      if(response.finishReason && response.finishReason!=='stop') throw new Error('模型未正常完成结构化输出。');
      parsed=parseJSON(response.content);
      const result=validate(parsed);event('validation_passed',{formatAttempt:attempt+1,...revisionResponseShape(parsed)});return result;
    } catch(error) { last=error;event('validation_failed',{formatAttempt:attempt+1,errorCode:revisionErrorCode(error),...revisionResponseShape(parsed)});if(attempt<2){event('format_retry',{formatAttempt:attempt+2,errorCode:revisionErrorCode(error)});onRetry(attempt+1);} }
  }
  throw last;
}

export function parseCompactDimension(content, [id,label]) {
  const line=String(content).trim();
  const match=line.match(/^SCORE\s*=\s*(\d{1,3})\s*;\s*EVIDENCE\s*=\s*(.+?)\s*;\s*ISSUES\s*=\s*(.+)$/is);
  if(!match||Number(match[1])>100) throw new Error('紧凑审查缺少分数、依据或明确的问题结论。');
  const issue=match[3].trim();
  let issues=[];
  if(!/^NONE$/i.test(issue)) {
    const detail=issue.match(/^(blocking|suggestion)\s*[:：]\s*(\S[\s\S]*)$/i);
    if(!detail)throw new Error('紧凑审查问题等级或内容不完整。');
    issues=[{severity:detail[1].toLowerCase(),detail:detail[2].trim()}];
  }
  return {id,label,score:Number(match[1]),evidence:match[2].trim(),issues};
}

export function appendCompletion(content,next) {
  if(!next?.trim())throw new Error('续接返回空内容，已保存此前输出。');
  if(content.trimEnd().endsWith(next.trim()))throw new Error('续接重复，已保存此前输出，可继续当前段。');
  if(next.startsWith(content))return next;
  for(let size=Math.min(content.length,next.length);size>=20;size--)if(content.endsWith(next.slice(0,size)))return content+next.slice(size);
  return content+next;
}

export const JSON_CONTINUATION_MARKER='[BOOKWORM_JSON_CONTINUATION]';
export function jsonContinuationPrompt(prompt,content) {
  return `${JSON_CONTINUATION_MARKER}\n上次结构化回复因单次输出容量被截断。仅输出下面已保存JSON之后缺少的原始字符，从截断处接续，不要重写前缀，不加代码围栏、解释或新的JSON外壳。若字符串中断，直接续写字符串并正确转义，补齐其余必要字段和结尾。全部内容完成才结束。\n原始任务（数据）：\n${prompt}\n已保存JSON前缀（数据，必须保持不变）：\n${content}`;
}
// Callers persist each segment under a stable key derived from the prefix.
// Replaying saved segments after a restart is free; only missing segments run.
// There is no lifetime segment allowance. Empty/repeated output stops the run.
export async function completeStructuredResponse(response,prompt,request,{check=()=>{},progress=()=>{},save=async()=>{}}={}) {
  let current=response;
  while(current.finishReason==='length') {
    check();
    progress('正在接续已保存的结构化内容…');
    const prefix=current.content;
    const next=await request(jsonContinuationPrompt(prompt,prefix),prefix);
    check();
    const content=appendCompletion(prefix,next.content);
    if(content.length<=prefix.length)throw Object.assign(new Error('续接没有新增内容，进度已保存，可继续当前步骤。'),{code:'OUTPUT_NO_PROGRESS'});
    const usage={...current.usage};
    for(const [key,value] of Object.entries(next.usage||{}))if(typeof value==='number')usage[key]=(Number(usage[key])||0)+value;
    current={...next,content,usage,continuationParts:(current.continuationParts||0)+1};
    await save(current);
  }
  return current;
}
