// IDs and coordinates are generated locally. New replies reference one unit
// instead of retyping source prose; line separators always remain untouched.
export function revisionEditUnits(source){
  const units=[];
  for(const match of source.matchAll(/[^\r\n]+/g)){
    let start=match.index,end=match.index+match[0].length;
    if(!match[0].trim())continue;
    while(start<end){
      let stop=Math.min(end,start+800);
      if(stop<end){
        const head=source.slice(start,stop),boundaries=[...head.matchAll(/[。！？!?；;]/g)];
        const last=boundaries.at(-1);if(last&&last.index>=200)stop=start+last.index+1;
      }
      units.push({id:`U${units.length+1}`,start,end:stop,text:source.slice(start,stop)});start=stop;
    }
  }
  return units;
}
export function allowedRevisionUnits(issue,units){
  const indices=units.flatMap((u,index)=>issue.evidence?.some(e=>!e.stale&&Number.isInteger(e.start)&&Number.isInteger(e.end)&&e.start<u.end&&e.end>u.start)?[index]:[]);
  return units.filter((u,index)=>indices.some(i=>Math.abs(index-i)<=1));
}
// Keep offsets in the original text; do not reconstruct whitespace or quotes.
export function revisionSentenceUnits(source){
  const units=[];
  for(const paragraph of revisionEditUnits(source)){
    let start=paragraph.start,end=paragraph.end;
    while(start<end){
      let stop=Math.min(end,start+240);
      for(let i=start;i<stop;i++)if(/[。！？!?；;]/.test(source[i])||(source[i]==='.'&&(!source[i+1]||/\s/.test(source[i+1])))){
        stop=i+1;while(stop<end&&/[”’」』"']/.test(source[stop]))stop++;break;
      }
      if(stop<end&&/[\uD800-\uDBFF]/.test(source[stop-1]))stop--;
      const text=source.slice(start,stop);if(text.trim())units.push({id:`S${units.length+1}`,start,end:stop,text});start=stop;
    }
  }
  return units;
}
export function matchRevisionSource(source,before){
  const at=source.indexOf(before);
  if(at>=0&&source.indexOf(before,at+1)<0)return {start:at,before};
  const needle=before.replace(/\s/g,'');
  if(needle.length<5)return null;
  let compact='';const offsets=[];
  for(let i=0;i<source.length;i++)if(!/\s/.test(source[i])){compact+=source[i];offsets.push(i);}
  const pos=compact.indexOf(needle);
  if(pos<0||compact.indexOf(needle,pos+1)>=0)return null;
  const start=offsets[pos],end=offsets[pos+needle.length-1]+1;
  return {start,before:source.slice(start,end)};
}
