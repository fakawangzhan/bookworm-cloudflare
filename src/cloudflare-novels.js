import { hash,now } from '../scripts/task-utils.mjs';
import { cloudSettings } from './cloudflare-config.js';
import { needsBookIdentityRecovery, recoverBookIdentity } from './workflow.js';
const marker='__bookworm_chunks_v1__:',size=128*1024;
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export async function readCloudBook(env,row){
 let content=row.content;
 if(String(content).startsWith(marker)){
  const parts=await env.DB.prepare('SELECT content FROM bw_book_parts WHERE owner_id=? AND book_id=? ORDER BY part_index').bind(row.owner_id,row.book_id).all();
  const expected=Number(content.slice(marker.length));if(parts.results.length!==expected)throw new Error('作品分块尚未完整，请稍后重新读取。');
  content=parts.results.map(p=>p.content).join('');
 }
 const book=JSON.parse(content),taskId=book.workflow?.backgroundTasks?.quality?.id;
 if(taskId&&needsBookIdentityRecovery(book)){
  // No migration or write on load; normal versioned saving can persist the
  // verified identity. Never trust a task belonging to another author/book.
  try{
   const input=await env.DB.prepare("SELECT b.content FROM bw_task_blobs b JOIN bw_long_tasks t ON t.id=b.task_id WHERE t.id=? AND t.owner_id=? AND t.book_id=? AND t.kind='quality' AND b.name='input' ORDER BY b.part_index").bind(taskId,row.owner_id,row.book_id).all();
   if(input.results.length)recoverBookIdentity(book,JSON.parse(input.results.map(r=>r.content).join('')).snapshot?.title);
  }catch{/* A missing legacy source must not block opening the manuscript. */}
 }
 return book;
}
export async function cloudNovels(request,env,path,user,isAdmin){
 if(!user)return json({error:'请先登录。',code:'AUTH_REQUIRED'},401);
 if(path==='/api/novels/session'&&request.method==='GET')return json({protocol:'local-novels-v1',token:crypto.randomUUID()});
 if(path==='/api/novels'&&request.method==='GET'){
  const rows=isAdmin?await env.DB.prepare('SELECT * FROM bw_books WHERE deleted_at IS NULL ORDER BY updated_at').all():await env.DB.prepare('SELECT * FROM bw_books WHERE owner_id=? AND deleted_at IS NULL ORDER BY updated_at').bind(user.id).all();
  const books=[];for(const row of rows.results)books.push({book:await readCloudBook(env,row),revision:row.revision,hash:row.content_hash,savedAt:row.updated_at});
  return json({protocol:'local-novels-v1',instance:'cloudflare-d1',books});
 }
 if(request.method!=='POST'||!['/api/novels/save','/api/novels/import'].includes(path))return json({error:'小说存储接口不存在。'},404);
 const input=await request.json(),versions=[],imports=[],importing=path.endsWith('/import');
 for(const item of Array.isArray(input.books)?input.books:[]){
  const book=importing?item:item.book;if(!book||typeof book.id!=='string'||!book.id)throw new Error('作品标识无效。');
  const owner=isAdmin?String(book.ownerId||user.id):user.id;
  if(!isAdmin&&book.ownerId&&book.ownerId!==user.id)return json({error:'无权保存其他用户作品。'},403);
  const content=JSON.stringify({...book,ownerId:owner}),digest=hash(content);
  const existing=await env.DB.prepare('SELECT revision,content_hash,deleted_at FROM bw_books WHERE owner_id=? AND book_id=?').bind(owner,book.id).first();
  // Browser legacy data must never replace an existing database record.
  if(importing&&existing){imports.push({id:book.id,ownerId:owner,status:'exists'});continue;}
  if(existing&&!existing.deleted_at&&existing.content_hash===digest){versions.push({ownerId:owner,id:book.id,revision:existing.revision,hash:digest});continue;}
  if(!importing&&existing&&(item.expectedRevision!==existing.revision||existing.deleted_at))return json({error:'作品已被其他会话更新或删除，请刷新作品列表；当前编辑内容保留。',code:'NOVEL_CONFLICT'},409);
  if(!existing&&!importing&&item.expectedRevision!=null)return json({error:'作品版本已变化，请刷新后重试。',code:'NOVEL_CONFLICT'},409);
  const revision=(existing?.revision||0)+1,savedAt=now(),chunks=content.length>size?Math.ceil(content.length/size):0;
  const statements=[env.DB.prepare('INSERT INTO bw_books(owner_id,book_id,title,revision,content_hash,content,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,NULL) ON CONFLICT(owner_id,book_id) DO UPDATE SET title=excluded.title,revision=excluded.revision,content_hash=excluded.content_hash,content=excluded.content,updated_at=excluded.updated_at WHERE bw_books.revision=? AND bw_books.deleted_at IS NULL').bind(owner,book.id,book.title||'未命名作品',revision,digest,chunks?marker+chunks:content,savedAt,existing?.revision??-1)];
  statements.push(env.DB.prepare('DELETE FROM bw_book_parts WHERE owner_id=? AND book_id=? AND EXISTS(SELECT 1 FROM bw_books WHERE owner_id=? AND book_id=? AND revision=? AND content_hash=?)').bind(owner,book.id,owner,book.id,revision,digest));
  for(let i=0;i<chunks;i++)statements.push(env.DB.prepare('INSERT INTO bw_book_parts(owner_id,book_id,part_index,content) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM bw_books WHERE owner_id=? AND book_id=? AND revision=? AND content_hash=?)').bind(owner,book.id,i,content.slice(i*size,(i+1)*size),owner,book.id,revision,digest));
  const results=await env.DB.batch(statements);if(!results[0].meta.changes)return json({error:'作品刚被其他会话保存，请刷新后继续。',code:'NOVEL_CONFLICT'},409);
  versions.push({ownerId:owner,id:book.id,revision,hash:digest,savedAt});if(importing)imports.push({ownerId:owner,id:book.id,status:'imported'});
 }
 if(!importing&&input.deleted?.length){
  const settings=await cloudSettings(env);if(!isAdmin&&settings.settings.adminSettings?.allowOwnProjectDelete===false)return json({error:'管理员已关闭删除作品权限。'},403);
  for(const item of input.deleted){const owner=isAdmin?item.ownerId||user.id:user.id;if(!isAdmin&&item.ownerId!==user.id)return json({error:'无权删除其他用户作品。'},403);const r=await env.DB.prepare('UPDATE bw_books SET deleted_at=?,revision=revision+1 WHERE owner_id=? AND book_id=? AND revision=? AND deleted_at IS NULL').bind(now(),owner,item.id,item.expectedRevision).run();if(!r.meta.changes)return json({error:'作品删除版本冲突，请刷新后重试。',code:'NOVEL_CONFLICT'},409);}
 }
 return json({protocol:'local-novels-v1',versions,imports});
}
