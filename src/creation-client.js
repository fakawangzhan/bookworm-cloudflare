import { completeStructuredResponse } from './ai-recovery.js';
import { fingerprint, parseJSON } from './workflow.js';

export async function creationJSON({prompt,tokens=3000,validate,request,ack,signal,stepId,purpose='creation',progress=()=>{},recover}) {
  const step=stepId||fingerprint(['creation-json-v1',prompt]);
  let last;
  signal?.throwIfAborted();
  if(recover) {
    const body=await recover(step,{prompt,tokens,purpose,signal});
    signal?.throwIfAborted();
    if(body&&body.finishReason!=='length'&&(!body.finishReason||body.finishReason==='stop')){
      let valid=false,value;
      try{value=validate(parseJSON(body.content));valid=true;}catch{}
      if(valid){await ack(body.creationReceipt,true);return value;}
    }
  }
  for(let attempt=0;attempt<2;attempt++) {
    signal?.throwIfAborted();
    // The server retains both the rejected candidate and the reason across
    // refreshes; correction and its budget therefore have one source of truth.
    const original=await request(prompt,tokens,{stepId:step,purpose,signal,json:true});
    const body=await completeStructuredResponse(original,prompt,async(text,prefix)=>{
      const next=await request(text,tokens,{stepId:fingerprint([step,'continuation',prefix]),purpose,signal,json:true});
      await ack(next.creationReceipt,true);return next;
    },{check:()=>signal?.throwIfAborted(),progress});
    body.creationReceipt=original.creationReceipt;
    signal?.throwIfAborted();
    let result;
    try {
      if(body.finishReason==='length')throw new Error('输出截断，请缩短非正文字段，正文必须完整。');
      if(body.finishReason&&body.finishReason!=='stop')throw new Error('模型未正常结束。');
      result=validate(parseJSON(body.content));
    } catch(e) {
      await ack(body.creationReceipt,false,e.message);last=e;
      if(attempt===0)progress('正在修复当前片段，已有正文保留；暂停后仍可继续。');
      continue;
    }
    await ack(body.creationReceipt,true);return result;
  }
  throw last;
}
