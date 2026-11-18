import { JSON_CONTINUATION_MARKER } from './ai-recovery.js';
import { managedAiProfiles } from './managed-ai.js';
import { thinkingMode, thinkingParameters } from './ai-thinking.js';
import {sanitizeRevisionEvent,revisionUsage,validRevisionRunId} from './revision-telemetry.js';
function combineUsage(previous,next) {
  if(!previous)return next||null;if(!next)return previous;
  const value={...previous};
  for(const [key,item] of Object.entries(next))value[key]=typeof item==='number'?(Number(value[key])||0)+item:item&&typeof item==='object'&&!Array.isArray(item)?combineUsage(value[key],item):item;
  return value;
}
const ALLOWED_ENDPOINTS = new Set([
  'https://api.deepseek.com',
  'https://api.deepseek.com/v1',
  'https://api.openai.com/v1',
  'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'https://api.moonshot.cn/v1',
  'https://open.bigmodel.cn/api/paas/v4',
  'https://api.siliconflow.cn/v1',
  'https://openrouter.ai/api/v1',
  'https://api.groq.com/openai/v1',
  'http://127.0.0.1:11434/v1',
  'http://localhost:11434/v1'
]);

function normalizeEndpoint(value) {
  const endpoint = String(value || '').trim().replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/i, '');
  return endpoint;
}

function customEndpointAllowed(endpoint) {
  try {
    const url = new URL(endpoint);
    if (!['https:', 'http:'].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) return false;
    return Boolean(url.hostname);
  } catch { return false; }
}

function localEndpoint(endpoint) {
  try { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(endpoint).hostname); }
  catch { return false; }
}

function endpointAllowed(endpoint, custom = false) {
  return ALLOWED_ENDPOINTS.has(endpoint) || (custom && customEndpointAllowed(endpoint));
}

function bearerHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

// Local-only managed profiles keep credentials in .dev.vars.  The browser
// receives metadata and sends the profile id; keys never enter project
// snapshots or the page payload.
const managedProfiles=managedAiProfiles;
function managedProfile(env, id) {
  return managedProfiles(env).find(profile => profile.id === String(id || ''));
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
function boundedNumber(value, fallback, min, max) {
  const number = value === undefined ? NaN : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function modelIds(result) {
  const source = Array.isArray(result?.data) ? result.data : Array.isArray(result?.models) ? result.models : [];
  return [...new Set(source.map(item => typeof item === 'string' ? item : item?.id).filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))].slice(0, 500);
}

function messageContent(message) {
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.map(part => messageContent(part)).join('');
  if (message && typeof message === 'object') return messageContent(message.text)
    || messageContent(message.content)
    || messageContent(message.output_text)
    || messageContent(message.value)
    || messageContent(message.delta);
  return '';
}

function completionContent(result) {
  const choice = result?.choices?.[0];
  const message = choice?.message || {};
  return messageContent(message.content)
    || messageContent(choice?.text)
    || messageContent(choice?.delta?.content)
    || messageContent(choice?.delta)
    || messageContent(result?.output_text)
    || messageContent(result?.output?.[0]?.content)
    || messageContent(result?.response?.output_text)
    || messageContent(result?.response?.output)
    || messageContent(result?.content)
    || messageContent(result?.delta)
    || messageContent(result?.data);
}

function reasoningContent(result) {
  const choice = result?.choices?.[0];
  const message = choice?.message || {};
  return messageContent(message.reasoning_content)
    || messageContent(choice?.delta?.reasoning_content)
    || messageContent(result?.reasoning_content)
    || messageContent(result?.reasoning)
    || messageContent(result?.response?.reasoning_content);
}
async function readJSON(stream, maxBytes) {
  if (!stream) throw new Error('empty');
  const reader = stream.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error('too-large'); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

async function readStreamCompletion(stream, maxBytes, onContent) {
  if (!stream) throw new Error('empty');
  const reader = stream.getReader(), decoder = new TextDecoder();
  let bytes = 0, payloadBytes = 0, buffer = '', content = '', reasoning = '', finishReason = null, usage = null, completed = false;
  const consume = payload => {
    const data = payload.trim();
    if (!data || completed) return;
    if (data === '[DONE]') { completed = true; return; }
    const event = JSON.parse(data);
    if (event?.error) {
      const detail=typeof event.error==='string'?event.error:event.error.message;
      throw Object.assign(new Error(String(detail||'模型服务在响应流中返回错误。').slice(0,1200)),{upstreamStreamError:true,upstreamCode:String(event.error?.code||event.error?.type||'').slice(0,120)});
    }
    const choice = event?.choices?.[0];
    const text = completionContent({ ...event, choices: choice ? [{ ...choice, message: choice.message || choice.delta }] : event.choices });
    const thought = messageContent(choice?.message?.reasoning_content) || messageContent(choice?.delta?.reasoning_content) || '';
    payloadBytes += new TextEncoder().encode(text + thought).byteLength;
    if (payloadBytes > maxBytes) throw new Error('too-large');
    content += text;
    if(text && onContent)onContent(text);
    reasoning += thought;
    finishReason ||= choice?.finish_reason || null;
    usage = event?.usage || usage;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      // SSE repeats metadata per token; keep its wire limit separate from prose.
      if (bytes > maxBytes * 8) { await reader.cancel(); throw new Error('too-large'); }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';
      if (new TextEncoder().encode(buffer).byteLength > maxBytes * 2) throw new Error('too-large');
      for (const event of events) consume(event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5)).join('\n'));
      if (completed) break;
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5)).join('\n'));
    if (!completed && !finishReason) throw new Error('stream-interrupted');
    return { content, reasoning, finishReason, usage };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'novelforge-api', mode: env.DEEPSEEK_API_KEY ? 'managed-deepseek' : 'byok', envConfigured: Boolean(env.DEEPSEEK_API_KEY) });
    if (url.pathname === '/api/local-ai-profiles') {
      if (request.method !== 'GET') return json({ error: '请使用 GET 请求' }, 405);
      return json({ profiles: managedProfiles(env).map(({ apiKey, credential, ...profile }) => ({ ...profile, custom: true, serverManaged: true, serverVerified: Boolean(profile.verified) })) });
    }
    if (url.pathname === '/api/models') {
      if (request.method !== 'POST') return json({ error: '请使用 POST 请求' }, 405);
      let body;
      try { body = await readJSON(request.body, 128 * 1024); }
      catch (error) { return json({ error: error.message === 'too-large' ? '请求过大' : '请求必须是有效 JSON' }, error.message === 'too-large' ? 413 : 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: '请求必须是 JSON 对象' }, 400);
      const found = managedProfile(env, body.profileId);
      const managed = found?.id === 'deepseek' && body.model ? { ...found, model: body.model } : found;
      if(body.profileId&&!managed)return json({error:'该内置 AI 档案尚未配置，请重新选择。',code:'PROFILE_UNAVAILABLE'},400);
      const endpoint = normalizeEndpoint(managed?.endpoint || body.endpoint || env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com');
      const envEndpoint = normalizeEndpoint(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com');
      const apiKey = String(managed?.apiKey || body.apiKey || (env.DEEPSEEK_API_KEY && endpoint === envEndpoint ? env.DEEPSEEK_API_KEY : '')).trim();
      if (!endpointAllowed(endpoint, Boolean(body.custom) || Boolean(managed))) return json({ error: '不支持该接口地址；请使用内置服务商或启用安全的自定义 HTTPS/本地接口' }, 400);
      if (!apiKey && !localEndpoint(endpoint)) return json({ error: '读取远程模型列表需要 API Key' }, 400);
      const timeout = boundedNumber(body.timeout, 20, 5, 60) * 1000;
      try {
        const upstream = await fetch(`${endpoint}/models`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { Accept: 'application/json', ...bearerHeaders(apiKey) } });
        if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); return json({ error: '模型列表接口发生重定向，请检查接口地址' }, 502); }
        let result;
        try { result = await readJSON(upstream.body, 2 * 1024 * 1024); }
        catch { return json({ error: '模型列表返回格式异常，请手动填写模型 ID' }, 502); }
        if (!upstream.ok) return json({ error: result?.error?.message || '读取模型列表失败，请手动填写模型 ID' }, upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502);
        const models = modelIds(result);
        if (!models.length) return json({ error: '接口未返回可用模型，请手动填写模型 ID' }, 422);
        return json({ models });
      } catch (error) {
        const timeoutError = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        return json({ error: timeoutError ? '读取模型列表超时，请手动填写模型 ID' : '暂时无法读取模型列表，请手动填写模型 ID' }, timeoutError ? 504 : 502);
      }
    }
    if (url.pathname !== '/api/generate') return url.pathname.startsWith('/api/') ? json({ error: '接口不存在' }, 404) : env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json({ error: '请使用 POST 请求' }, 405);
    let body;
    try { body = await readJSON(request.body, 1024 * 1024); }
    catch (error) { return json({ error: error.message === 'too-large' ? '请求过大，请分段处理' : '请求必须是有效 JSON' }, error.message === 'too-large' ? 413 : 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: '请求必须是 JSON 对象' }, 400);
    const localRevision=validRevisionRunId(body.revisionTrace?.runId);
    body.thinking=thinkingMode(body.thinking);
    if(localRevision){body.responseFormat='json_object';body.maxTokens=Math.min(2200,Number(body.maxTokens)||2200);}
    const found = managedProfile(env, body.profileId);
      const managed = found?.id === 'deepseek' && body.model ? { ...found, model: body.model } : found;
    if(body.profileId&&!managed)return json({error:'该内置 AI 档案尚未配置，请重新选择。',code:'PROFILE_UNAVAILABLE'},400);
    const endpoint = normalizeEndpoint(managed?.endpoint || body.endpoint || env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com');
    const envEndpoint = normalizeEndpoint(env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com');
    const apiKey = String(managed?.apiKey || body.apiKey || (env.DEEPSEEK_API_KEY && endpoint === envEndpoint ? env.DEEPSEEK_API_KEY : '')).trim();
    if (!endpointAllowed(endpoint, Boolean(body.custom) || Boolean(managed))) return json({ error: '暂不支持该服务商地址，请使用内置服务商或安全的自定义 HTTPS/本地接口' }, 400);
    if (!apiKey && !localEndpoint(endpoint)) return json({ error: '请提供有效的 API Key' }, 400);
    // Providers may issue short tokens (for example self-hosted gateways).
    // Presence is validated here; the upstream remains the authority on
    // whether the credential is accepted.
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt.trim()) return json({ error: '缺少生成内容' }, 400);
    // This configured GGUF service rejects json_object before generating any
    // content (HTTP 400: Only text responses are supported). Request JSON in
    // the prompt and retain the callers' strict validators and request budgets.
    // Keep native JSON mode for every other profile/model; do not replay HTTP
    // requests invisibly or change the saved configuration to work around it.
    const nativeJson = !prompt.startsWith(JSON_CONTINUATION_MARKER) && body.responseFormat === 'json_object'
      && !(managed?.id === 'local-cosplay' && /gemma-4-31b-it-abliterated-v2-gguf$/i.test(managed.model));
    // Preserve the complete input; callers split long work at durable boundaries.
    const temperature = boundedNumber(body.temperature, 0.75, 0, 2);
    const requestedMaxTokens = Math.floor(boundedNumber(body.maxTokens, 3000, 1, 8000));
    // Completion capacity includes hidden reasoning. The normal prose request
    // stays unchanged; a proven reasoning-only exhaustion can use more room.
    // Patch JSON is small, but its hidden reasoning is not bounded by its
    // visible length. All roles share capacity recovery and learned capacity.
    const recoveryTokenCeiling=65536;
    const knownOutputLimit=Number.isSafeInteger(body.outputTokenLimit)&&body.outputTokenLimit>0?body.outputTokenLimit:recoveryTokenCeiling;
    let maxTokens = Math.min(recoveryTokenCeiling,knownOutputLimit,Math.max(requestedMaxTokens,Number(body.outputTokenMinimum)||0)),observedOutputLimit=null;
    const timeout = boundedNumber(body.timeout, 180, 10, 300) * 1000;
    const deadline = AbortSignal.timeout(timeout);
    const signal = AbortSignal.any([request.signal,deadline]);
    const trace=sanitizeRevisionEvent({...body.revisionTrace,event:'request_started'});
    const startedAt=Date.now();
    let partialContent='';
    const receiveContent=delta=>{partialContent+=delta;if(typeof env.NF_CREATION_PREVIEW==='function')env.NF_CREATION_PREVIEW(delta);};
    const observe=(event,fields={})=>{
      if(!trace||typeof env.NF_REVISION_LOG!=='function')return;
      try{Promise.resolve(env.NF_REVISION_LOG({...trace,...fields,event,at:new Date().toISOString()})).catch(()=>{});}catch{}
    };
    const finish=(response,fields={})=>{observe('request_finished',{httpStatus:response.status,durationMs:Date.now()-startedAt,...fields});return response;};
    observe('request_started',{model:managed?.model||body.model||'deepseek-chat',inputChars:prompt.length,maxTokens,temperature,timeoutSeconds:timeout/1000,
      thinkingMode:body.thinking||'provider-default',responseFormat:body.responseFormat||'provider-default'});
    let priorUsage=null,upstreamAttempts=0,recoveredMinimum=null;
    try {
      for(let recovery=0;recovery<5;recovery++){
      let upstream;
      for(let negotiation=0;negotiation<2;negotiation++){
      upstreamAttempts++;
      upstream = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST', redirect: 'manual', signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...bearerHeaders(apiKey) },
        // Always request SSE from compatible providers. We aggregate the
        // chunks below before returning the stable JSON contract consumed by
        // the existing UI, so streaming improves upstream timeout behavior
        // without changing any business workflow code.
        body: JSON.stringify({ model: managed?.model || body.model || 'deepseek-chat', messages: [...(!prompt.startsWith(JSON_CONTINUATION_MARKER)&&body.responseFormat==='json_object'&&!/json/i.test(prompt)?[{role:'system',content:'Return valid JSON.'}]:[]), { role: 'user', content: prompt }], temperature, max_tokens: maxTokens, stream: true,
          ...thinkingParameters(managed?.model||body.model,body.thinking),
          ...(nativeJson?{response_format:{type:'json_object'},stream_options:{include_usage:true}}:{}) })
      });
      if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); return finish(json({ error: '模型服务发生重定向，请检查接口地址',code:'UPSTREAM_REDIRECT',retryable:false }, 502),{errorCode:'UPSTREAM_REDIRECT'}); }
      if (!upstream.ok) {
        let result;
        try { result = await readJSON(upstream.body, 2 * 1024 * 1024); } catch (error) { if(signal.aborted) throw error; result = null; }
        const status=upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
        const retryHeader=upstream.headers.get('retry-after');
        const retryAfterMs=Math.min(30000,Math.max(0,Number(retryHeader)*1000 || Date.parse(retryHeader)-Date.now() || 0));
        const detail=typeof result?.error==='string' ? result.error : result?.error?.message;
        const error=typeof detail==='string' ? detail.split(apiKey || '\0').join('[已隐藏]').slice(0,600) : '上游模型网关请求失败';
        const outputLimit = status === 400 && error.match(/max_(?:completion_)?tokens\s+cannot\s+exceed\s+(\d+)/i);
        if (outputLimit && Number(outputLimit[1]) > 0 && Number(outputLimit[1]) < maxTokens) {
          if(negotiation===0){maxTokens=Number(outputLimit[1]);observedOutputLimit=maxTokens;continue;}

        }
        return finish(json({ error,code:'UPSTREAM_HTTP',usage:priorUsage,upstreamAttempts,upstreamStatus:status,retryable:status>=500 || [408,429].includes(status),retryAfterMs },status),{errorCode:'UPSTREAM_HTTP'});
      }
      break;
      }
      let result;
      const streamed = /text\/event-stream/i.test(upstream.headers.get('content-type') || '');
      try { result = streamed ? await readStreamCompletion(upstream.body, 2 * 1024 * 1024, receiveContent) : await readJSON(upstream.body, 2 * 1024 * 1024); }
      catch (error) {
        if(signal.aborted || ['AbortError','TimeoutError'].includes(error?.name)) throw error;
        if(error.upstreamStreamError) {
          const rejected=/context|token|length|capacity|quota|balance|credit|invalid|unsupported|forbidden|auth|limit/i.test(error.upstreamCode+' '+error.message);
          const detail=apiKey?error.message.split(apiKey).join('[已隐藏]'):error.message;
          return finish(json({error:detail,code:'UPSTREAM_STREAM_ERROR',usage:priorUsage,upstreamAttempts,upstreamCode:error.upstreamCode,retryable:!rejected,
            ...(partialContent?{partialContent,finishReason:'interrupted'}:{})},502),{errorCode:'UPSTREAM_STREAM_ERROR'});
        }
        const oversized=error.message==='too-large';
        const malformed=error instanceof SyntaxError || error.message==='empty';
        return finish(json({error:oversized ? '模型响应超过容量，请缩小本次处理内容' : malformed ? '模型未返回有效 JSON，原内容已保留' : '模型响应传输中断，原内容已保留',usage:priorUsage,upstreamAttempts,code:oversized ? 'UPSTREAM_TOO_LARGE' : malformed ? 'UPSTREAM_FORMAT' : 'UPSTREAM_INTERRUPTED',retryable:!oversized && !malformed,...(partialContent?{partialContent,finishReason:'interrupted'}:{})},502),{errorCode:oversized?'UPSTREAM_TOO_LARGE':malformed?'UPSTREAM_FORMAT':'UPSTREAM_INTERRUPTED'});
      }
      const finishReason = streamed ? result.finishReason : result?.choices?.[0]?.finish_reason || result?.finish_reason || null;
      const content = streamed ? result.content : completionContent(result);
      const usage=combineUsage(priorUsage,result?.usage);
      if (!content.trim()) {
        const hasReasoning = Boolean(reasoningContent(streamed ? { reasoning_content: result.reasoning } : result))
          || Number(result?.usage?.completion_tokens_details?.reasoning_tokens)>0;
        const recoveryCapacity=Math.min(hasReasoning?recoveryTokenCeiling:8000,observedOutputLimit||knownOutputLimit);
        const nextCapacity=Math.min(recoveryCapacity,maxTokens<8000?8000:Math.max(16384,maxTokens*2));
        if(finishReason==='length'&&recovery<4&&nextCapacity>maxTokens){
          // Retry only a proven empty length exhaustion. A returned prefix is
          // continued by the durable caller; it is never regenerated here.
          priorUsage=usage;maxTokens=nextCapacity;recoveredMinimum=maxTokens;continue;
        }
        // A provider that still returns no final content pauses recoverably.
        if (finishReason === 'length') return finish(json({
          error:hasReasoning?'模型推理已耗尽本次响应容量，尚未返回结果；已保存进度与用量，请调整处理范围后继续。':'模型在本次响应容量内未返回有效内容；已保存进度，请稍后继续。',
          code: 'OUTPUT_LENGTH', retryable: false, finishReason, usage, upstreamAttempts,
          attemptedMaxTokens:maxTokens,reasoningOnly:hasReasoning
        }, 502),{finishReason,errorCode:'OUTPUT_LENGTH',...revisionUsage(usage)});
        return finish(json({
          error: hasReasoning ? '模型只返回了推理内容，未返回最终内容；请降低思考强度或更换支持最终输出的模型' : '模型未返回有效内容，原内容已保留',
          code: hasReasoning ? 'UPSTREAM_REASONING_ONLY' : 'UPSTREAM_EMPTY', retryable: false, finishReason, usage, upstreamAttempts
        }, 422),{finishReason,errorCode:hasReasoning?'UPSTREAM_REASONING_ONLY':'UPSTREAM_EMPTY',...revisionUsage(usage)});
      }
      return finish(json({ content, finishReason, ...(observedOutputLimit?{outputTokenLimit:observedOutputLimit,requestedMaxTokens}:{}), usage, upstreamAttempts, ...(recoveredMinimum?{outputTokenMinimum:recoveredMinimum}:{}), streamed,
        reasoningCharacters:streamed?(result.reasoning||'').length:reasoningContent(result).length }),{finishReason,outputChars:content.length,reasoningCharacters:streamed?(result.reasoning||'').length:reasoningContent(result).length,...revisionUsage(usage)});
      }
    } catch (error) {
      if(request.signal.aborted) return finish(json({error:'请求已取消',code:'CANCELLED',retryable:false,usage:priorUsage,upstreamAttempts,...(partialContent?{partialContent,finishReason:'interrupted'}:{})},499),{errorCode:'CANCELLED'});
      const timedOut = deadline.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError';
      if (body.logRequests === true) console.error(JSON.stringify({ event: 'model-request-failed', reason: timedOut ? 'timeout' : 'network', path: url.pathname }));
      return finish(json({ error: timedOut ? '模型处理超时，原内容已保留，请重试当前步骤' : '暂时无法连接模型服务，原内容已保留',code:timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK',retryable:true,usage:priorUsage,upstreamAttempts,...(partialContent?{partialContent,finishReason:'interrupted'}:{}) }, timedOut ? 504 : 502),{errorCode:timedOut?'UPSTREAM_TIMEOUT':'UPSTREAM_NETWORK'});
    }
  }
};
