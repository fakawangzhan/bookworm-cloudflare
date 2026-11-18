import { GRAPH_TYPES, graphTypeLabel } from './knowledge-graph.js';

export const KEYWORD_LIMIT=100000;
export const KEYWORD_CATEGORIES=[...GRAPH_TYPES,['idiom','成语'],['expression','普通表达']];
export const keywordText=value=>String(value||'').normalize('NFC').trim();
export function keywordCategory(value) {
  if(KEYWORD_CATEGORIES.some(([id])=>id===value))return value;
  const aliases={'角色':'person','角色/单位':'person','单位':'faction','组织':'faction','场景':'place','地理':'place','术语':'concept','普通词':'expression'};
  return aliases[value]||KEYWORD_CATEGORIES.find(([,label])=>label===value)?.[0]||'concept';
}
export const keywordLabel=value=>KEYWORD_CATEGORIES.find(([id])=>id===keywordCategory(value))?.[1]||'概念';
const key=t=>JSON.stringify([keywordCategory(t.category),keywordText(t.source)]);
const list=value=>Array.isArray(value)?value:[];

// Preserve all manual choices. Graph references identify units within this
// book; public dictionary IDs never select or modify another manuscript.
export function mergeBookTerms(existing,incoming) {
  const result=list(existing).map(t=>({...t})),known=new Map(result.map(t=>[key(t),t]));
  for(const t of list(incoming)) {
    if(!keywordText(t.source))continue;
    const old=known.get(key(t));
    if(old)for(const field of ['chapters','unitIds','aliases'])old[field]=[...new Set([...list(old[field]),...list(t[field])])];
    else {const next={...t};result.push(next);known.set(key(next),next);}
  }
  return result;
}
export function graphBookTerms(s) {
  return list(s.graph?.units).map(u=>({category:graphTypeLabel(u.type),source:u.name,target:'',enabled:false,
    unitIds:[u.id],aliases:[...list(u.aliases)],chapters:list(u.evidenceChapters).map(index=>s.chapters[index-1]?.id).filter(id=>id!=null)}));
}
export function keywordContributions(book) {
  return mergeBookTerms(book.workflow?.termDictionary,graphBookTerms({...book,chapters:book.chapters||[]})).flatMap(t=>{
    const base={category:keywordCategory(t.category),word:keywordText(t.source),aliases:list(t.aliases),unitId:list(t.unitIds).join(',')||`term:${key(t)}`};
    return t.target?.trim()&&t.target.trim()!==t.source?[base,{...base,word:keywordText(t.target),aliases:[],unitId:`target:${base.unitId}`}]:[base];
  });
}
export function createKeywordClient() {
  const storageKey='novelforge-local-keyword-capability-v1';
  const capability=()=>{
    let value=localStorage.getItem(storageKey);
    if(!/^[a-f0-9]{64}$/.test(value||'')){value=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');localStorage.setItem(storageKey,value);}
    return value;
  };
  async function api(path,options={}) {
    const requestOptions={...options,headers:{'content-type':'application/json','x-nf-keyword-scope':capability()},signal:options.signal||AbortSignal.timeout(30000)};
    let response=await fetch(`/api/keywords${path}`,requestOptions);
    const value=await response.json();
    if(!response.ok)throw new Error(value.error||`词库请求失败（HTTP ${response.status}）`);
    return value;
  }
  return {stats:()=>api('/stats'),search:(category,q,signal)=>api(`/search?${new URLSearchParams({category:keywordCategory(category),q,limit:'20'})}`,{signal}),
    sync:({bookId,ownerId,terms})=>api('/sync',{method:'POST',body:JSON.stringify({bookId,ownerId,terms})})};
}
