import { cloudAiFetch } from './cloudflare-dispatch.js';
import { managedAiProfiles } from './managed-ai.js';
import { hash } from '../scripts/task-utils.mjs';
import { cloudAiRegistry } from './cloudflare-ai-registry.js';
export function availableCloudProfiles(env) {
  return managedAiProfiles(env);
}
export function assertCloudEndpoint(endpoint) {
  let u;try{u=new URL(endpoint);}catch{throw new Error('AI 接口地址无效。');}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(u.hostname))throw new Error('云端 AI 需要可公网访问的 HTTPS 接口，无法连接浏览器本机端口。');
}
async function vaultKey(env){if(!env.TASK_CREDENTIAL_KEY)throw new Error('云端凭据存储未配置，请运行部署脚本。');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.TASK_CREDENTIAL_KEY)),'AES-GCM',false,['encrypt','decrypt']);}
export async function sealCredential(env,value){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await vaultKey(env),new TextEncoder().encode(value));return {iv:[...iv],data:[...new Uint8Array(cipher)]};}
async function openCredential(env,value){return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv)},await vaultKey(env),new Uint8Array(value.data)));}
export async function cloudProfile(env,input={}) {
  if (!env.NF_MANAGED_AI_PROFILES) env = await cloudAiRegistry(env).environment(env);
  const found=availableCloudProfiles(env).find(p=>p.id===input.id);
  const managed=input.apiKey&&!input.serverManaged?null:found;
  if(input.serverManaged&&!managed)throw new Error('该内置 AI 档案尚未同步至云端。');
  const p=managed&&input.id==='deepseek'?{...managed,model:input.model||managed.model}:managed||input;assertCloudEndpoint(p.endpoint);
  if(!p.id||!p.model||!p.apiKey)throw new Error('AI 档案缺少模型或访问凭据。');
  if(managed&&input.id!=='deepseek'&&input.model&&input.model!==managed.model)throw new Error('该 AI 档案已变化，请重新选择后提交。');
  return {id:p.id,label:p.label||p.id,endpoint:p.endpoint,model:p.model,custom:true,serverManaged:!!managed,
    serverRevision:hash([p.endpoint,p.model,p.apiKey]),...(!managed?{credential:await sealCredential(env,p.apiKey)}:{})};
}
export async function cloudGenerate(env,profile,options,beforeDispatch) {
  env = await cloudAiRegistry(env).environment(env);
  const managed=profile.serverManaged?availableCloudProfiles(env).find(p=>p.id===profile.id):null;
  const apiKey=managed?.apiKey||(profile.credential?await openCredential(env,profile.credential):'');
  if(!apiKey||hash([profile.endpoint,profile.model,apiKey])!==profile.serverRevision)throw Object.assign(new Error('任务所用 AI 配置已变化，已保存进度；请为当前配置提交新任务。'),{code:'CONFIG_CHANGED'});
  const response=await cloudAiFetch({endpoint:profile.endpoint,model:profile.model,apiKey,custom:true,temperature:0.15,stream:true,...options},env,{beforeDispatch});
  const value=await response.json();if(!response.ok){let message=String(value.error||'模型请求失败').split(apiKey).join('[已隐藏]');throw Object.assign(new Error(message),{status:response.status,code:value.code,usage:value.usage,retryAfterMs:value.retryAfterMs,retryable:value.retryable,response:{...value,error:message}});}return value;
}
