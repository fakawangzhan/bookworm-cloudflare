import { GLOBAL_DEFAULTS, selectGlobal, selectPersonal, trustedEndpoint } from './global-config.js';
import { availableCloudProfiles, assertCloudEndpoint } from './cloudflare-ai.js';
import { sanitizeRevisionEvent } from './revision-telemetry.js';
import { cloudAiRegistry } from './cloudflare-ai-registry.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export async function cloudSettings(env){const row=await env.DB.prepare("SELECT value FROM bw_settings WHERE key='parameters.global.v1'").first();return row?JSON.parse(row.value):{version:0,settings:structuredClone(GLOBAL_DEFAULTS)};}
export async function authorizeCloudAi(env,params,{configure=false}={}){
 const record=await cloudSettings(env),settings=record.settings;
 const managed=availableCloudProfiles(env).find(p=>p.id===(params.profileId||params.id));
 if(params.endpoint)assertCloudEndpoint(params.endpoint);
 if(record.version&&settings.adminSettings?.maintenanceMode)throw Object.assign(new Error('系统维护中，新的模型调用已暂停；仍可保存作品。'),{code:'CONFIG_MAINTENANCE',status:503});
 if(record.version&&!configure&&settings.adminSettings?.allowExternalProviders===false&&!managed&&!trustedEndpoint(params.endpoint))throw Object.assign(new Error('当前全局配置仅允许内置档案及官方接口。'),{code:'CONFIG_FORBIDDEN',status:403});
 return {...params,thinking:params.thinking??(settings.programmerSettings?.deepThinking?'enabled':'disabled')};
}
export async function cloudConfigApi(request,env,path,user,isAdmin){
 if(!user)return json({error:'请先登录。',code:'AUTH_REQUIRED'},401);
 const method=request.method;
 if(path==='/api/local-ai-profiles'&&method==='GET')return json(await cloudAiRegistry(env).list(env));
 if(path==='/api/export-permission'&&method==='GET'){const r=await cloudSettings(env);return r.settings.adminSettings?.allowExport===false?json({error:'管理员已关闭投稿包导出。'},403):json({ok:true});}
 if(path==='/api/system-config'&&method==='GET')return json(await cloudSettings(env));
 if(path==='/api/system-config'&&['POST','PATCH'].includes(method)){
  if(!isAdmin)return json({error:'只有管理员可以保存全局配置。'},403);
  const input=await request.json(),previous=await cloudSettings(env);
  if(method==='POST'&&previous.version)return json(previous);
  if(method==='PATCH'&&input.version!==previous.version)return json({error:'全局配置已被其他会话更新，请重新载入；当前编辑保留。',code:'CONFIG_CONFLICT'},409);
  const record={version:previous.version+1,settings:selectGlobal(input.settings,{strict:method==='PATCH'}),updatedBy:user.id,updatedAt:new Date().toISOString()};
  // Conditional update is the concurrency boundary; stale tabs never replace newer settings.
  const changed=await env.DB.prepare("INSERT INTO bw_settings(key,value,updated_at) VALUES('parameters.global.v1',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE json_extract(bw_settings.value,'$.version')=? RETURNING key").bind(JSON.stringify(record),record.updatedAt,previous.version).first();
  if(!changed)return json({error:'全局配置已更新，请重新载入。',code:'CONFIG_CONFLICT'},409);
  await env.DB.prepare('INSERT OR IGNORE INTO bw_settings VALUES(?,?,?)').bind('parameters.global.v1.history.'+record.version,JSON.stringify({previous,next:record}),record.updatedAt).run();return json(record);
 }
 if(path==='/api/user-preferences'){
  const row=await env.DB.prepare('SELECT value FROM bw_preferences WHERE user_id=?').bind(user.id).first(),previous=row?JSON.parse(row.value):{version:0,exists:false,values:selectPersonal()};
  if(method==='GET')return json(previous);
  if(method==='PUT'){const input=await request.json();if(input.version!==previous.version)return json({error:'个人设置已在其他会话更新，请重新载入。',code:'CONFIG_CONFLICT'},409);const record={version:previous.version+1,exists:true,values:selectPersonal(input.values)};const changed=await env.DB.prepare("INSERT INTO bw_preferences VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE json_extract(bw_preferences.value,'$.version')=? RETURNING user_id").bind(user.id,JSON.stringify(record),new Date().toISOString(),previous.version).first();return changed?json(record):json({error:'个人设置已更新，请重新载入。',code:'CONFIG_CONFLICT'},409);}
 }
 if(path==='/api/system-config/capabilities'&&method==='DELETE'){if(!isAdmin)return json({error:'需要管理员权限。'},403);await env.DB.prepare("DELETE FROM bw_settings WHERE key LIKE 'parameters.capability.%'").run();return json({ok:true});}
 if(path==='/api/revision-log'&&method==='POST'){
  const config=await cloudSettings(env),enabled=config.settings.programmerSettings?.logRequests===true;
  if(!enabled)return json({ok:true,enabled:false,accepted:0});
  const input=await request.json(),events=(Array.isArray(input.events)?input.events:[]).slice(0,20).map(sanitizeRevisionEvent).filter(Boolean);
  await env.DB.batch(events.map(e=>env.DB.prepare('INSERT OR IGNORE INTO bw_service_logs VALUES(?,?,?,?)').bind(e.eventId||crypto.randomUUID(),user.id,JSON.stringify(e),new Date().toISOString())));return json({ok:true,enabled:true,accepted:events.length});
 }
 if(path==='/api/system-logs'){
  if(!isAdmin)return json({error:'需要管理员权限。'},403);const config=await cloudSettings(env),loggingEnabled=config.settings.programmerSettings?.logRequests===true;
  if(method==='GET'){const row=await env.DB.prepare('SELECT COUNT(*) count,COALESCE(SUM(length(CAST(value AS BLOB))),0) totalBytes FROM bw_service_logs').first();return json({...row,loggingEnabled});}
  if(method==='POST'){const input=await request.json();if(input.action!=='clear')return json({error:'日志操作无效。'},400);const result=await env.DB.prepare('DELETE FROM bw_service_logs').run();return json({removedCount:result.meta.changes,failed:[],loggingEnabled});}
 }
 return json({error:'配置接口不存在。'},404);
}
