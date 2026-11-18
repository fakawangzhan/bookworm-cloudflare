import { fingerprint } from './workflow.js';
import { officialModel } from './performance-policy.js';
import { graphTypeLabel } from './knowledge-graph.js';

export function validateMaterialTerms(value, source) {
  if (!Array.isArray(value?.terms) || value.terms.length>300) throw new Error('词表结构不完整或超过单章容量。');
  const terms=[],diagnostics=[],seen=new Set();
  for(const item of value.terms) {
    if(typeof item?.source!=='string'||!item.source.trim()||item.source.length>120||!source.includes(item.source)
      ||typeof item.category!=='string'||!item.category.trim()||item.category.length>30) {
      diagnostics.push({source:typeof item?.source==='string'?item.source.slice(0,120):'',reason:'未在正文中逐字找到或词条格式不完整，未加入正式词表。'});continue;
    }
    if(!seen.has(item.source)){terms.push({source:item.source,category:item.category});seen.add(item.source);}
  }
  return {terms,diagnostics};
}

export async function automaticMaterials({state:s,backend,request,context,save,signal,progress}) {
  const run=s.workflow.autoRun,policy=run.executionPolicy||'balanced';
  const snapshot={bookId:s.activeBookId,ownerId:s.books?.find(b=>b.id===s.activeBookId)?.ownerId||s.currentUserId,
    title:s.books?.find(b=>b.id===s.activeBookId)?.title||'',chapters:s.chapters.map(c=>({chapterId:c.id,title:c.title,synopsis:c.synopsis,plan:c.plan,content:s.drafts[c.id]}))};
  const profileId=s.workflow.performance?.profileId||'deepseek',profile=s.aiProfiles.find(p=>p.id===profileId);
  const signature=fingerprint(snapshot),model=s.workflow.performance?.profileId?profile.model:officialModel(policy,'materials');
  let ref=await backend.start('graph',snapshot,signature,context,profileId,{profiles:[{id:profile.id,label:profile.label,endpoint:profile.endpoint,custom:profile.custom,serverManaged:profile.serverManaged,model,...(profile?.apiKey?{apiKey:profile.apiKey}:{})}]});
  const checkpoint=async()=>{run.materialGraphRef=ref;await save();};
  await checkpoint();
  try {
    if(['paused','cancelled'].includes(ref.status)){ref={...ref,...await backend.control(ref,'resume')};await checkpoint();}
    while(['queued','running'].includes(ref.status)) {
      signal.throwIfAborted();progress(ref.message||'正在复用大切片图谱抽取…');
      await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},1000);signal.addEventListener('abort',abort,{once:true});});
      ref=await backend.status(ref);
    }
    await checkpoint();signal.throwIfAborted();
    if(ref.status!=='completed')throw new Error(ref.error||'图谱抽取尚未完成。');
    const graph=await backend.result(ref);
    if(graph.signature!==signature||graph.bookId!==snapshot.bookId)throw new Error('资料结果与当前作品版本不匹配。');
    const records=[];
    for(const [index,c] of snapshot.chapters.entries()) {
      signal.throwIfAborted();
      const extracted=graph.chapterResults[c.chapterId];
      if(!extracted)throw new Error('图谱缺少章节覆盖。');
      const names=extracted.units.flatMap(u=>[u.name,...(u.aliases||[])]);
      const key=fingerprint([c.content,names,'terms-v1',model]);
      let terms=run.materialParts['terms:'+c.chapterId];
      if(terms?.key!==key) {
        progress(`正在核对第 ${index+1} 章独立术语与词句…`);
        const value=await request(`图谱已提取名称和别名：${JSON.stringify(names)}。仅补充需要全书统一的独立术语、器物称谓、成语或特殊词句，不重复已列名称。所有source须逐字出现在正文，不臆造；可为空。返回JSON：{"terms":[{"source":"正文原词","category":"术语或词句类别"}]}。\n第${index+1}章 ${c.title}\n${c.content}`,v=>validateMaterialTerms(v,c.content),2400,'planner',{purpose:'materials',stepId:key});
        terms={key,value};run.materialParts['terms:'+c.chapterId]=terms;await save();
      }
      run.materialTermDiagnostics ||= {};
      run.materialTermDiagnostics[c.chapterId]=terms.value.diagnostics || [];
      const units=extracted.units.map(u=>({...u,origin:'ai',evidenceChapters:[index+1]}));
      const collected=[...terms.value.terms,...units.flatMap(u=>[u.name,...(u.aliases||[])].filter(n=>c.content.includes(n)).map(source=>({source,category:graphTypeLabel(u.type)})))].map(t=>({...t,target:'',enabled:false,chapters:[c.chapterId]}));
      records.push({chapterId:c.chapterId,result:{units,links:extracted.links,terms:collected}});
    }
    return records;
  } catch(e){if(['queued','running'].includes(ref.status))await backend.control(ref,'pause').catch(()=>{});throw e;}
}
