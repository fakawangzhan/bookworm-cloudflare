import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const localConfig = resolve(ROOT, 'wrangler.local.jsonc');
export const templateConfig = resolve(ROOT, 'wrangler.jsonc');

// Invoke Wrangler with Node directly so Windows does not need shell quoting.
export function wrangler(args, { config, capture = false, input } = {}) {
  const selected = config || (existsSync(localConfig) ? localConfig : templateConfig);
  const result = spawnSync(process.execPath, [
    resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js'),
    ...args, '--config', selected
  ], {
    cwd: ROOT,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    encoding: 'utf8',
    stdio: capture || input !== undefined ? ['pipe', 'pipe', 'pipe'] : 'inherit',
    input,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    // Do not print captured output: secret bulk input must never enter logs.
    const error = new Error(`Wrangler ${args.slice(0, 2).join(' ')} 执行失败，请检查授权、配置和网络。`);
    // Kept only for recognizing an explicit Worker-not-found response. Callers
    // must not log this field when handling commands which receive secrets.
    error.wranglerOutput = (result.stdout || '') + (result.stderr || '');
    throw error;
  }
  return result.stdout || '';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { wrangler(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
