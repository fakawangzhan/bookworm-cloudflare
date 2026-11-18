import { hash, now } from '../scripts/task-utils.mjs';
import { summarizeAuditUsage } from './book-audit-usage.js';
const SIZE = 128 * 1024;
export async function putTaskBlob(env, taskId, name, value) {
  const text = JSON.stringify(value), statements = [env.DB.prepare('DELETE FROM bw_task_blobs WHERE task_id=? AND name=?').bind(taskId,name)];
  for(let i=0;i<text.length;i+=SIZE) statements.push(env.DB.prepare('INSERT INTO bw_task_blobs VALUES(?,?,?,?)').bind(taskId,name,i/SIZE,text.slice(i,i+SIZE)));
  // D1 batch is transactional, so readers never observe an incomplete value.
  await env.DB.batch(statements);
}
export async function taskBlob(env,taskId,name) {
  const rows=await env.DB.prepare('SELECT content FROM bw_task_blobs WHERE task_id=? AND name=? ORDER BY part_index').bind(taskId,name).all();
  return rows.results.length?JSON.parse(rows.results.map(r=>r.content).join('')):null;
}
export async function loadCloudJob(env,id,withResult=false) {
  const row=await env.DB.prepare('SELECT * FROM bw_long_tasks WHERE id=?').bind(id).first();
  if(!row)return null;
  const saved=await taskBlob(env,id,'input');
  if(!saved)throw new Error('该历史任务使用旧协议，结果保留；请重新提交当前作品。');
  return {...row,...saved,id,owner:row.owner_id,book:row.book_id,scope:row.owner_id,signature:row.signature,
    ...(withResult?{result:await taskBlob(env,id,'result')}:{})};
}
export async function budgetFor(env,id) {
  const row=await env.DB.prepare('SELECT * FROM bw_task_state WHERE task_id=?').bind(id).first();
  if(!row)return null;
  const usages=await env.DB.prepare('SELECT usage FROM bw_task_requests WHERE task_id=?').bind(id).all();
  const decoded=usages.results.map(r=>r.usage?JSON.parse(r.usage):null);
  return {unlimited:true,planned:row.planned,limit:row.budget_limit,used:row.used,reservedTokens:row.reserved_tokens,tokenLimit:row.token_limit,
    knownUsage:decoded.filter(Boolean),unknownUsage:decoded.filter(u=>!u).length,usage:summarizeAuditUsage(decoded)};
}
// Synchronous working state for the unchanged shared engines. All external
// side effects are committed by the durable request/checkpoint adapter.
export class CloudTaskStore {
  constructor(env,job,parents=[]) {this.env=env;this.job=job;this.durable=true;this.nodes=new Map();this.dirty=new Set();this.parents=new Map(parents.map(p=>[p.id,p]));this.facts=new Map();this.budget=null;}
  async hydrate() {
    const rows=await this.env.DB.prepare("SELECT name,content FROM bw_task_blobs WHERE task_id=? AND name LIKE 'node:%' ORDER BY name,part_index").bind(this.job.id).all();
    const grouped=new Map();for(const row of rows.results)grouped.set(row.name,(grouped.get(row.name)||'')+row.content);
    for(const text of grouped.values()){const record=JSON.parse(text);this.nodes.set(record.key,record);}
    this.budget=await budgetFor(this.env,this.job.id);
  }
  get(id){return id===this.job.id?this.job:this.parents.get(id);}
  node(id,key){return this.nodes.get(key);}
  putNode(id,key,type,data){if(!this.nodes.has(key)){this.nodes.set(key,{key,type,data,status:'pending'});this.dirty.add(key);}}
  nodeState(id,key,status,result,error=''){const n=this.nodes.get(key);if(!n)throw new Error('任务节点不存在');Object.assign(n,{status,error,...(result!==undefined?{result}:{})});this.dirty.add(key);}
  index(id,key,facts){this.facts.set(key,facts);}
  auditBudget(id,plan){if(plan&&!this.budget?.limit)this.budget={planned:plan.plannedRequests,limit:plan.requestLimit,tokenLimit:plan.tokenLimit,used:0,reservedTokens:0};return this.budget;}
  async flush(){
    if(this.budget?.limit)await this.env.DB.prepare('UPDATE bw_task_state SET planned=COALESCE(planned,?),budget_limit=COALESCE(budget_limit,?),token_limit=COALESCE(token_limit,?) WHERE task_id=?').bind(this.budget.planned,this.budget.limit,this.budget.tokenLimit,this.job.id).run();
    for(const key of [...this.dirty]){
      const n=structuredClone(this.nodes.get(key));this.dirty.delete(key);const h=hash(key);
      try{await putTaskBlob(this.env,this.job.id,'node:'+h,n);
        await this.env.DB.prepare('INSERT INTO bw_long_task_parts(task_id,part_id,part_index,value,status,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(task_id,part_id) DO UPDATE SET value=excluded.value,status=excluded.status,updated_at=excluded.updated_at').bind(this.job.id,h,0,JSON.stringify({key,type:n.type,characters:Math.max(0,(n.data?.end||0)-(n.data?.start||0)),error:n.error||''}),n.status,now()).run();
      }catch(e){this.dirty.add(key);throw e;}
    }
  }
}
