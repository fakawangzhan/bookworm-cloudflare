import { KEYWORD_CATEGORIES, KEYWORD_LIMIT, keywordText } from './keyword-library.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export async function cloudKeywords(request,env,user,isAdmin){
 if(!user)return json({error:'请先登录。'},401);
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/keywords/stats'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT category,COUNT(*) count FROM bw_keywords'+(isAdmin?'':' WHERE EXISTS(SELECT 1 FROM bw_keyword_sources s WHERE s.term_id=bw_keywords.id AND s.owner_id=?)')+' GROUP BY category').bind(...(isAdmin?[]:[user.id])).all();return json({protocol:'local-keywords-v1',instance:'cloudflare-d1',limit:KEYWORD_LIMIT,categories:KEYWORD_CATEGORIES.map(([id])=>({id,count:rows.results.find(r=>r.category===id)?.count||0}))});
 }
 if(path==='/api/keywords/search'&&request.method==='GET'){
  const category=url.searchParams.get('category'),q=keywordText(url.searchParams.get('q')),after=url.searchParams.get('after')||'',limit=Math.min(50,Math.max(1,Number(url.searchParams.get('limit'))||20));
  if(!KEYWORD_CATEGORIES.some(([id])=>id===category)||q.length>120)return json({error:'检索词或分类无效。'},400);
  const direct=await env.DB.prepare('SELECT id,category,word FROM bw_keywords WHERE category=? AND word>=? AND word<? AND word>?'+(isAdmin?'':' AND EXISTS(SELECT 1 FROM bw_keyword_sources s WHERE s.term_id=bw_keywords.id AND s.owner_id=?)')+' ORDER BY word LIMIT ?').bind(category,q,q+'\u{10ffff}',after,...(isAdmin?[]:[user.id]),limit+1).all();
  const aliases=q?await env.DB.prepare('SELECT k.id,k.category,k.word FROM '+(isAdmin?'bw_keyword_aliases':'bw_keyword_owner_aliases')+' a JOIN bw_keywords k ON k.id=a.term_id WHERE k.category=? AND a.alias>=? AND a.alias<?'+(isAdmin?'':' AND a.owner_id=?')+' LIMIT ?').bind(category,q,q+'\u{10ffff}',...(isAdmin?[]:[user.id]),limit).all():{results:[]};
  return json({terms:[...new Map([...direct.results.slice(0,limit),...aliases.results].map(r=>[r.id,r])).values()].slice(0,limit),more:direct.results.length>limit,next:direct.results.length>limit?direct.results[limit-1].word:null});
 }
 if(path==='/api/keywords/sync'&&request.method==='POST'){
  const input=await request.json(),owner=isAdmin?input.ownerId||user.id:user.id;
  if(!isAdmin&&input.ownerId&&input.ownerId!==user.id)return json({error:'无权同步其他账户资料。'},403);
  if(!input.bookId||!Array.isArray(input.terms)||input.terms.length>500)return json({error:'词库同步每批最多500条。'},400);
  if(!await env.DB.prepare('SELECT 1 FROM bw_books WHERE owner_id=? AND book_id=? AND deleted_at IS NULL').bind(owner,input.bookId).first())return json({error:'作品不存在或无权访问。'},403);
  const rows=input.terms.map(t=>({category:t.category,word:keywordText(t.word),aliases:[...new Set((Array.isArray(t.aliases)?t.aliases:[]).map(keywordText).filter(a=>a&&a.length<=120))].slice(0,12)}));
  if(rows.some(t=>!KEYWORD_CATEGORIES.some(([id])=>id===t.category)||!t.word||t.word.length>120))return json({error:'词条分类或名称无效。'},400);
  const payload=JSON.stringify(rows),result=await env.DB.prepare("INSERT OR IGNORE INTO bw_keywords(category,word,created_at) SELECT json_extract(value,'$.category'),json_extract(value,'$.word'),datetime('now') FROM json_each(?)").bind(payload).run();
  await env.DB.prepare("INSERT OR IGNORE INTO bw_keyword_aliases SELECT k.category,a.value,k.id FROM json_each(?) t JOIN bw_keywords k ON k.category=json_extract(t.value,'$.category') AND k.word=json_extract(t.value,'$.word') JOIN json_each(t.value,'$.aliases') a").bind(payload).run();
  await env.DB.prepare("INSERT OR IGNORE INTO bw_keyword_sources SELECT ?,?,k.id FROM json_each(?) t JOIN bw_keywords k ON k.category=json_extract(t.value,'$.category') AND k.word=json_extract(t.value,'$.word')").bind(owner,input.bookId,payload).run();
  await env.DB.prepare("INSERT OR IGNORE INTO bw_keyword_owner_aliases SELECT ?,k.id,a.value FROM json_each(?) t JOIN bw_keywords k ON k.category=json_extract(t.value,'$.category') AND k.word=json_extract(t.value,'$.word') JOIN json_each(t.value,'$.aliases') a").bind(owner,payload).run();
  const full=await env.DB.prepare('SELECT category FROM bw_keywords GROUP BY category HAVING COUNT(*)>=?').bind(KEYWORD_LIMIT).all();
  return json({added:result.meta.changes,existing:Math.max(0,rows.length-result.meta.changes),full:full.results.map(r=>r.category),limit:KEYWORD_LIMIT});
 }
 return json({error:'词库接口不存在。'},404);
}
