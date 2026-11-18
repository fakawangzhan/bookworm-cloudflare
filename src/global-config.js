import { REQUEST_RULES, numeric, booleanValue } from './parameters.js';
export const GLOBAL_DEFAULTS = Object.freeze({
  programmerSettings: { ...Object.fromEntries(Object.entries(REQUEST_RULES).map(([k,v])=>[k,v.default])), deepThinking:false, localDemo:true, requestCache:false, logRequests:false, failoverEnabled:true },
  adminSettings: { workspaceName:'BookWorm 工作区', allowExternalProviders:false, allowOwnProjectDelete:true, allowExport:true, maintenanceMode:false },
  globalAssist: { programmerConfirmed:false, adminConfirmed:false }
});
export const PERSONAL_DEFAULTS = Object.freeze({autoSave:true, sidebarCollapsed:false});
export const BUILTIN_ENDPOINTS = new Set(['https://api.deepseek.com','https://api.deepseek.com/v1','https://api.openai.com/v1','https://dashscope.aliyuncs.com/compatible-mode/v1','https://api.moonshot.cn/v1','https://open.bigmodel.cn/api/paas/v4','https://api.siliconflow.cn/v1','https://openrouter.ai/api/v1','https://api.groq.com/openai/v1']);
export function trustedEndpoint(endpoint) {
  const normalized=String(endpoint||'').trim().replace(/\/+$/,'');
  if(BUILTIN_ENDPOINTS.has(normalized))return true;
  try {const u=new URL(normalized);return ['http:','https:'].includes(u.protocol)&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&!u.username&&!u.password;} catch {return false;}
}
// Preserve only known parameter values. No connection profiles or credentials
// belong in global settings, history or personal-preference records.
export function legacyParameters(source={}) {
  const keys={programmerSettings:[...Object.keys(GLOBAL_DEFAULTS.programmerSettings),'autoSave','safeMode','redactPrompts','streamOutput','outputValidation'],adminSettings:[...Object.keys(GLOBAL_DEFAULTS.adminSettings),'allowProjectDelete','allowInvite','requireReview','auditLog','backupEnabled','retentionDays','enabledRoles','allowAdultContent'],globalAssist:Object.keys(GLOBAL_DEFAULTS.globalAssist)};
  return Object.fromEntries(Object.entries(keys).map(([group,fields])=>[group,Object.fromEntries(fields.filter(key=>Object.hasOwn(source[group]||{},key)).map(key=>[key,source[group][key]]))]));
}
export function selectGlobal(source = {}, { strict = false } = {}) {
  const result = {};
  for (const [group, fields] of Object.entries(GLOBAL_DEFAULTS)) {
    result[group] = {};
    for (const [key, fallback] of Object.entries(fields)) {
      const raw = source[group]?.[key] ?? fallback;
      let value;
      if (typeof fallback === 'number') value = numeric(raw, REQUEST_RULES[key]);
      else if (typeof fallback === 'boolean') value = [true,false,'true','false',0,1,'0','1'].includes(raw) ? booleanValue(raw) : null;
      else value = typeof raw === 'string' && raw.trim() && raw.length <= 200 ? raw.trim() : null;
      if (value === null && strict) throw Object.assign(new Error(`配置 ${group}.${key} 的类型或范围无效。`), {code:'CONFIG_INPUT',status:400});
      result[group][key] = value ?? fallback;
    }
  }
  return result;
}
export function selectPersonal(source = {}) {
  return Object.fromEntries(Object.entries(PERSONAL_DEFAULTS).map(([key, value])=>[key,booleanValue(source[key],value)]));
}
