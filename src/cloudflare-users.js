export const CLOUD_ROLES={super_admin:['超级管理员','system_admin'],programmer:['程序员','system_admin'],lead_author:['主笔作者','user'],co_author:['协作作者','user'],editor:['责任编辑','user'],reviewer:['审稿人','user']};
export async function cloudUser(env,row){
 if(!row)return null;
 const saved=await env.DB.prepare('SELECT value FROM bw_settings WHERE key=?').bind('auth.roles.'+row.id).first();
 const ids=saved?JSON.parse(saved.value):[row.group_name==='system_admin'?'super_admin':'lead_author'];
 return {id:row.id,username:row.username,name:row.display_name,displayName:row.display_name,group:row.group_name,groupName:row.group_name,status:row.status,createdAt:row.created_at,roles:ids.filter(id=>CLOUD_ROLES[id]).map(id=>({id,label:CLOUD_ROLES[id][0],groupName:CLOUD_ROLES[id][1]}))};
}
export function roleIds(input){
 if(!Array.isArray(input)||!input.length||input.some(id=>!CLOUD_ROLES[id]))throw new Error('请选择有效的用户角色。');return [...new Set(input)];
}
export async function updateCloudUser(env,actor,id,input,hashPassword){
 const row=await env.DB.prepare('SELECT * FROM bw_users WHERE id=?').bind(id).first();if(!row)throw new Error('用户不存在。');
 const current=await cloudUser(env,row),roles=input.roles?roleIds(input.roles):current.roles.map(r=>r.id);
 const group=roles.some(id=>CLOUD_ROLES[id][1]==='system_admin')?'system_admin':'user';
 const status=input.status??row.status;if(!['active','disabled'].includes(status))throw new Error('账号状态无效。');
 const name=input.name===undefined?row.display_name:String(input.name).trim().slice(0,100);if(!name)throw new Error('用户名称不能为空。');
 const password=input.password?await hashPassword(input.password):row.password_hash;
 // A single conditional write protects the last enabled administrator even
 // if two administration sessions attempt to demote accounts concurrently.
 const changed=await env.DB.prepare("UPDATE bw_users SET display_name=?,group_name=?,status=?,password_hash=?,updated_at=? WHERE id=? AND NOT (group_name='system_admin' AND status='active' AND (?!='system_admin' OR ?!='active') AND (SELECT COUNT(*) FROM bw_users WHERE group_name='system_admin' AND status='active')<=1) RETURNING id").bind(name,group,status,password,new Date().toISOString(),id,group,status).first();
 if(!changed)throw new Error('必须保留至少一个启用的系统管理员。');
 await env.DB.prepare('INSERT INTO bw_settings VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind('auth.roles.'+id,JSON.stringify(roles),new Date().toISOString()).run();
 if(status==='disabled'||input.password)await env.DB.prepare('UPDATE bw_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').bind(new Date().toISOString(),id).run();
 return cloudUser(env,await env.DB.prepare('SELECT * FROM bw_users WHERE id=?').bind(id).first());
}
