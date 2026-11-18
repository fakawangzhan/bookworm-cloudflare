export const MANAGED_AI_PREFIXES = {'local-newapi':'LOCAL_AI_NEWAPI','local-jizhi':'LOCAL_AI_JIZHI','local-cosplay':'LOCAL_AI_COSPLAY','local-gpt6-astra':'LOCAL_AI_GPT6_ASTRA'};
export function managedAiProfiles(env) {
 const labels={'local-newapi':'NewAPI','local-jizhi':'Jizhi','local-cosplay':'CosplayAI','local-gpt6-astra':'GPT-6 Astra（自定义托管）'};
 const profiles=Object.entries(MANAGED_AI_PREFIXES).map(([id,prefix])=>({id,label:labels[id],endpoint:String(env[prefix+'_ENDPOINT']||'').trim().replace(/\/+$/,''),model:env[prefix+'_MODEL'],apiKey:env[prefix+'_KEY'],verified:env[prefix+'_VERIFIED']==='1'})).filter(p=>p.endpoint&&p.model&&p.apiKey);
 if(env.DEEPSEEK_API_KEY)profiles.unshift({id:'deepseek',label:'DeepSeek',endpoint:String(env.DEEPSEEK_BASE_URL||'https://api.deepseek.com').trim().replace(/\/+$/,''),model:env.DEEPSEEK_MODEL||'deepseek-chat',apiKey:env.DEEPSEEK_API_KEY,verified:true});
 // Database profiles are authoritative after additive environment migration.
 const byId=new Map(profiles.map(p=>[p.id,p]));
 for(const p of env.NF_MANAGED_AI_PROFILES||[])byId.set(p.id,p);
 return [...byId.values()];
}
export function resolveManagedAi(env,params) {
 if(!params.profileId)return params;
 const managed=managedAiProfiles(env).find(p=>p.id===params.profileId);
 if(!managed)throw Object.assign(new Error('该内置档案尚未配置，原任务已保留。'),{status:400,code:'PROFILE_UNAVAILABLE'});
 if(params.endpoint&&params.endpoint.replace(/\/$/,'')!==managed.endpoint || managed.id!=='deepseek'&&params.model&&params.model!==managed.model)throw Object.assign(new Error('当前托管档案已经变化，请重新选择后开始新任务；旧候选保留。'),{status:409,code:'CONFIG_CHANGED'});
 return {...params,endpoint:managed.endpoint,model:managed.id==='deepseek'&&params.model?params.model:managed.model,apiKey:managed.apiKey,custom:true,serverManaged:true,provider:managed.label};
}
