import { sourceArchive } from './cloudflare-source.js';
import { availableCloudProfiles } from './cloudflare-ai.js';
import { MANAGED_AI_PREFIXES } from './managed-ai.js';
import { hash } from '../scripts/task-utils.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
async function catalog(env){return (await env.DB.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name LIKE 'bw_%' AND name NOT IN ('bw_service_logs','bw_ai_leases') ORDER BY name").all()).results;}
async function version(env,tables){
 const values=await env.DB.batch(tables.map(t=>env.DB.prepare(`SELECT COUNT(*) count,COALESCE(MAX(rowid),0) maximum FROM "${t.name}"`)));
 const clocks=await env.DB.batch([
  env.DB.prepare('SELECT COUNT(*) count,COALESCE(SUM(revision),0) revision,MAX(updated_at) updated,MAX(deleted_at) deleted FROM bw_books'),
  env.DB.prepare('SELECT MAX(updated_at) updated FROM bw_settings'),env.DB.prepare('SELECT MAX(updated_at) updated FROM bw_preferences'),
  env.DB.prepare('SELECT MAX(updated_at) updated FROM bw_users'),env.DB.prepare('SELECT MAX(updated_at) updated FROM bw_long_tasks'),
  env.DB.prepare('SELECT MAX(updated_at) updated FROM bw_task_requests'),env.DB.prepare('SELECT MAX(finished) finished FROM bw_creation_requests')
 ]);return hash([hash(sourceArchive),values.map(r=>r.results),clocks.map(r=>r.results)]);
}
const quote=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
export async function cloudBackup(request,env,user,isAdmin){
 if(!user||!isAdmin)return json({error:'只有系统管理员可以备份系统。'},403);
 const url=new URL(request.url),tables=await catalog(env);
 if(url.pathname==='/api/system-backup'){
  if(!sourceArchive)return json({error:'源码备份尚未打包，请执行 npm run build 后重新部署。'},503);
  const vars={};for(const p of availableCloudProfiles(env)){if(p.id==='deepseek'){vars.DEEPSEEK_API_KEY=p.apiKey;vars.DEEPSEEK_BASE_URL=p.endpoint;}else{const prefix=MANAGED_AI_PREFIXES[p.id];for(const [suffix,value]of Object.entries({ENDPOINT:p.endpoint,MODEL:p.model,KEY:p.apiKey,VERIFIED:p.verified?'1':'0'}))vars[prefix+'_'+suffix]=value;}}
  if(env.TASK_CREDENTIAL_KEY)vars.TASK_CREDENTIAL_KEY=env.TASK_CREDENTIAL_KEY;
  return json({protocol:'cloudflare-backup-v1',version:await version(env,tables),tables,sourceParts:Math.ceil(sourceArchive.length/131072),env:vars,createdAt:new Date().toISOString()});
 }
 if(url.pathname==='/api/system-backup/source'){const index=Number(url.searchParams.get('part'));if(!Number.isSafeInteger(index)||index<0)return json({error:'分块编号无效。'},400);return json({part:index,content:sourceArchive.slice(index*131072,(index+1)*131072)});}
 if(url.pathname==='/api/system-backup/data'){
  const table=tables.find(t=>t.name===url.searchParams.get('table'));if(!table)return json({error:'备份表无效。'},400);
  const after=Math.max(0,Number(url.searchParams.get('after'))||0),rows=(await env.DB.prepare(`SELECT rowid AS __cursor__,* FROM "${table.name}" WHERE rowid>? ORDER BY rowid LIMIT 5`).bind(after).all()).results;
  const sql=rows.map(row=>{const fields=Object.keys(row).filter(k=>k!=='__cursor__');return `INSERT INTO "${table.name}" (${fields.map(k=>'"'+k+'"').join(',')}) VALUES (${fields.map(k=>quote(row[k])).join(',')});`;}).join('\n');
  return json({sql,next:rows.length===5?rows.at(-1).__cursor__:null});
 }
 if(url.pathname==='/api/system-backup/verify'){
  const current=await version(env,tables);return current===url.searchParams.get('version')?json({ok:true}):json({error:'备份期间业务数据发生变化，请在任务停止和作品保存完成后重新备份。'},409);
 }
 return json({error:'备份接口不存在。'},404);
}
