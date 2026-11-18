// One workspace setting controls every creation/review role. Providers that
// cannot disable reasoning use their lowest supported effort when switched off.
export const thinkingMode = value => value === true || value === 'enabled' ? 'enabled' : 'disabled';

export function thinkingParameters(model, mode) {
  const enabled = thinkingMode(mode) === 'enabled';
  const name=String(model || '').split('/').at(-1);
  // Legacy chat-only models have no switchable reasoning capability. Avoid
  // adding unsupported flags that can prevent an otherwise valid request.
  if (/^(?:gpt-[34](?:[.o-]|$)|moonshot-v1-|qwen2(?:\.5)?[:.-]|llama|glm-4-(?:flash|plus|air)$)/i.test(name)) return {};
  if (/^(?:gpt-(?:5|6)(?:[.-]|$)|o[134](?:[.-]|$))/i.test(name)) {
    return { reasoning_effort: enabled ? 'high' : 'low' };
  }
  if (/qwen/i.test(model || '')) return { enable_thinking: enabled };
  return { thinking: { type: enabled ? 'enabled' : 'disabled' } };
}
