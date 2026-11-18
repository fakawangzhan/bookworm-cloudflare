export const GRAPH_TYPES = [
  ['person','人物'], ['event','事件'], ['item','道具'], ['vehicle','车辆'], ['time','时间'], ['ability','能力'],
  ['creature','动植物'], ['finance','金融'], ['rule','规则'], ['place','地点'], ['faction','势力'],
  ['clue','线索'], ['concept','概念']
];

export const GRAPH_RELATIONS = [
  ['family','亲属/家族'], ['parent','父母/子女'], ['sibling','兄弟姐妹'],
  ['romance','恋爱/婚姻'], ['friendship','朋友/信任'], ['mentor','师徒/指导'],
  ['member','成员/领袖'], ['ally','盟友/合作'], ['rival','竞争/对立'], ['enemy','敌对/仇恨'],
  ['controls','控制/服从'], ['employs','雇佣/服务'], ['owns','拥有/持有'], ['uses','使用/依赖'],
  ['creates','创造/制造'], ['inherits','继承/传承'], ['trades','交易/交换'], ['protects','保护/救援'],
  ['investigates','调查/追踪'], ['organizes','组织/安排'], ['deceives','欺骗/伪装'], ['causes','导致/引发'], ['blocks','阻止/限制'],
  ['reveals','揭示/证明'], ['depends','依赖/条件'], ['violates','违反/触发'], ['located','位于/发生于'],
  ['before','先于/后于'], ['part_of','属于/组成'], ['related','其他关联']
];

export const GRAPH_TYPE_FIELDS = {
  person:['姓名/称号','身份与阵营','性格动机','能力边界','关系变化','出场章节'],
  event:['发生时间地点','参与单位','起因与结果','证据/影响','事件状态','发生章节'],
  item:['来源与材质','持有者变化','用途与能力','限制与代价','状态变化','出场章节'],
  vehicle:['型号与用途','所有者与使用者','运行状态','维修与限制','状态变化','出场章节'],
  time:['绝对时间','相对顺序','涉及事件','时间跨度','时间线约束'],
  ability:['能力本质','触发条件','效果范围','限制与代价','已知持有者','首次揭示章节'],
  creature:['物种/药性','习性与能力','产地/生态','用途与禁忌','状态变化','出场章节'],
  finance:['货币/金额','发行与兑换','流通范围','价值约束','交易参与者','涉及章节'],
  rule:['规则内容','适用范围','例外条件','违反代价','发现与变化','发现章节'],
  place:['位置层级','环境资源','所属势力','空间限制','出入条件','出场章节'],
  faction:['成员与领袖','目标立场','资源能力','关系敌友','组织变化','出场章节'],
  clue:['线索内容','来源','指向事件/单位','已知结论','状态（未解/已解）','出现章节'],
  concept:['概念定义','适用范围','相关单位','正反例','变化与争议','出现章节']
};

export function graphTypeLabel(type){ return GRAPH_TYPES.find(([id])=>id===type)?.[1] || '单位'; }
export function graphRelationLabel(type){ return GRAPH_RELATIONS.find(([id])=>id===type)?.[1] || '其他关联'; }
export function graphRelationType(label){
  const text = String(label || '');
  return GRAPH_RELATIONS.find(([,name]) => name.split('/').some(part => text.includes(part)))?.[0] || 'related';
}
export function newGraphAnalysis(){
  return { version: 1, bookId: '', status: 'idle', startedAt: '', updatedAt: '', chapterFingerprints: {}, chapterResults: {}, completedChapters: [], pendingChapters: [], chunksProcessed: 0, totalChunks: 0, lastError: '' };
}
export function newGraph(){ return {version:2,layout:'network',units:[],links:[],confirmed:'',lastSync:null,analysis:newGraphAnalysis()}; }
function safeChapterList(value){ return Array.isArray(value) ? [...new Set(value.filter(Number.isSafeInteger))].slice(0, 2000) : []; }
function safeString(value, max){ return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeConfidence(value){ const n=Number(value); return Number.isFinite(n) ? Math.max(0,Math.min(1,n)) : 0.7; }
function normalizeUnit(unit){
  const properties = unit.properties && typeof unit.properties === 'object' ? Object.fromEntries(Object.entries(unit.properties).filter(([k,v])=>typeof k==='string'&&typeof v==='string').slice(0,50).map(([k,v])=>[k.slice(0,80),v.slice(0,1200)])) : {};
  const aliases = Array.isArray(unit.aliases) ? unit.aliases.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().slice(0,120)).slice(0,30) : [];
  return { id:unit.id, type:GRAPH_TYPES.some(([id])=>id===unit.type)?unit.type:'person', name:safeString(unit.name,120)||'未命名单元', aliases, tags:Array.isArray(unit.tags)?unit.tags.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().slice(0,60)).slice(0,30):[], properties, special:Boolean(unit.special), confidence:safeConfidence(unit.confidence), evidenceChapters:safeChapterList(unit.evidenceChapters||unit.chapters), origin:unit.origin === 'ai' ? 'ai' : 'manual' };
}
function normalizeLink(link, ids){
  if(!link||!ids.has(link.from)||!ids.has(link.to)||link.from===link.to)return null;
  const label=safeString(link.label,80)||'其他关联', chapters=safeChapterList(link.evidenceChapters||link.chapters);
  return {from:link.from,to:link.to,label,relationType:GRAPH_RELATIONS.some(([id])=>id===link.relationType)?link.relationType:graphRelationType(label),directed:link.directed!==false,status:['active','changed','uncertain','resolved'].includes(link.status)?link.status:'active',confidence:safeConfidence(link.confidence),evidenceChapters:chapters,firstChapter:Number.isSafeInteger(link.firstChapter)?link.firstChapter:(chapters[0]||null),lastChapter:Number.isSafeInteger(link.lastChapter)?link.lastChapter:(chapters.at(-1)||null),notes:safeString(link.notes,600)};
}
export function normalizeGraph(graph){
  const g={...newGraph(),...(graph||{})};
  // Keep imported or model-generated graph data bounded so a malformed backup
  // cannot freeze the editor while rendering thousands of untrusted nodes.
  const seenIds = new Set();
  g.units=Array.isArray(g.units)?g.units.filter(u=>u&&Number.isSafeInteger(u.id)&&u.id>0&&!seenIds.has(u.id)&&(seenIds.add(u.id),true)).slice(0,5000).map(normalizeUnit):[];
  const ids=new Set(g.units.map(u=>u.id)); g.links=Array.isArray(g.links)?g.links.slice(0,12000).map(link=>normalizeLink(link,ids)).filter(Boolean):[];
  const raw=g.analysis&&typeof g.analysis==='object'?g.analysis:{}; const analysis={...newGraphAnalysis(),...raw};
  analysis.bookId=safeString(analysis.bookId,160); analysis.status=['idle','running','partial','complete','error'].includes(analysis.status)?analysis.status:'idle';
  analysis.chapterFingerprints=analysis.chapterFingerprints&&typeof analysis.chapterFingerprints==='object'?Object.fromEntries(Object.entries(analysis.chapterFingerprints).filter(([k,v])=>/^\d+$/.test(k)&&typeof v==='string').slice(0,2000)):{};
  analysis.chapterResults=analysis.chapterResults&&typeof analysis.chapterResults==='object'?Object.fromEntries(Object.entries(analysis.chapterResults).filter(([k,v])=>/^\d+$/.test(k)&&v&&typeof v==='object').slice(0,2000)):{};
  analysis.completedChapters=safeChapterList(analysis.completedChapters); analysis.pendingChapters=safeChapterList(analysis.pendingChapters); analysis.chunksProcessed=Math.max(0,Number(analysis.chunksProcessed)||0); analysis.totalChunks=Math.max(0,Number(analysis.totalChunks)||0); analysis.lastError=safeString(analysis.lastError,600); g.analysis=analysis; return g;
}
export function graphSignature(g){const n=normalizeGraph(g);return JSON.stringify({units:n.units,links:n.links});}
export function graphReady(g){const n=normalizeGraph(g);return !n.units.length||n.confirmed===graphSignature(n);}
