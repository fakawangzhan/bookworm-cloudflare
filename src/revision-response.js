// Local, bounded syntax normalization. Never guess missing quotation marks,
// escapes, closing brackets, fields, or extract a patch from incomplete JSON.
export function parseRevisionResponse(content) {
  const source=String(content??'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return {value:JSON.parse(source),normalizations:0};}catch{}
  let output='',quoted=false,escaped=false,normalizations=0;
  for(let index=0;index<source.length;index++){
    const char=source[index];
    if(quoted){
      if(escaped){output+=char;escaped=false;continue;}
      if(char==='\\'){output+=char;escaped=true;continue;}
      if(char==='"')quoted=false;
      if(char.charCodeAt(0)<32){output+=JSON.stringify(char).slice(1,-1);normalizations++;continue;}
    }else{
      if(char==='"')quoted=true;
      if(char===','){
        const next=source.slice(index+1).trimStart()[0],previous=output.trimEnd().at(-1);
        if((next==='}'||next===']')&&previous&&!['{','[',',',':'].includes(previous)){normalizations++;continue;}
      }
    }
    output+=char;
  }
  if(normalizations){try{return {value:JSON.parse(output),normalizations};}catch{}}
  throw Object.assign(new Error('模型响应无法安全解析，原文与响应已保留。'),{code:'INVALID_JSON'});
}
