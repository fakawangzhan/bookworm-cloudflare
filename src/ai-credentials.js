async function vaultKey(secret) {
  if (!secret) throw new Error('服务端凭据存储尚未配置。');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealAiCredential(secret, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultKey(secret), new TextEncoder().encode(value));
  return { iv: [...iv], data: [...new Uint8Array(data)] };
}
export async function openAiCredential(secret, value) {
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(value.iv) }, await vaultKey(secret), new Uint8Array(value.data)));
}
