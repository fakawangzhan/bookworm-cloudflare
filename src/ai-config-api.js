// Both runtimes use the same administrator-only save/test contract.
export async function aiConfigApi(request, registry, env, user, isAdmin, probe) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
  if (!user) return json({ error: '请先登录。', code: 'AUTH_REQUIRED' }, 401);
  const path = new URL(request.url).pathname;
  if (request.method === 'GET') return json(await registry.list(env));
  if (!isAdmin) return json({ error: '只有系统管理员或程序员可以保存全局 AI 配置。', code: 'AUTH_FORBIDDEN' }, 403);
  const input = await request.json();
  if (path === '/api/ai-config' && request.method === 'PATCH') return json(await registry.save(input, env));
  if (path === '/api/ai-config/test' && request.method === 'POST') {
    const record = await registry.seed(env);
    if (input.version !== record.version) return json({ error: 'AI 配置已更新，请重新载入。', code: 'AI_CONFIG_CONFLICT' }, 409);
    const profile = await registry.candidate(input.profile, record);
    const response = await probe({ ...profile, custom: true, prompt: '请只回复：连接成功。不要解释。', maxTokens: 512, stream: true });
    const data = await response.json();
    if (!response.ok || !data.content?.trim()) {
      const error = String(data.error || '接口返回空内容，请检查模型和接口配置。');
      return json({ error: profile.apiKey ? error.split(profile.apiKey).join('[已隐藏]') : error, code: data.code || 'AI_TEST_FAILED' }, response.ok ? 422 : response.status);
    }
    return json(await registry.save({ version: record.version, profiles: [{ ...profile, verified: true }], roles: input.roles || {} }, env));
  }
  return json({ error: 'AI 配置接口不支持此操作。' }, 405);
}
