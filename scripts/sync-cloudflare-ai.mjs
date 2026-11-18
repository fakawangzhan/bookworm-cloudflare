import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { MANAGED_AI_PREFIXES, managedAiProfiles } from '../src/managed-ai.js';
import { ROOT, localConfig, wrangler } from './cloudflare-cli.mjs';

export async function syncCloudflareAi({ target = ROOT, configPath = localConfig, source, dryRun = false } = {}) {
  // Never search parent projects for credentials. Only an explicit source or
  // this checkout's .dev.vars is allowed.
  const sourcePath = source ? resolve(source) : resolve(target, '.dev.vars');
  let local = {};
  try { local = parseEnv(await readFile(sourcePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' || source) throw error; }
  const secrets = {}, vars = {};
  for (const profile of managedAiProfiles(local)) {
    if (profile.id === 'deepseek') continue;
    const prefix = MANAGED_AI_PREFIXES[profile.id];
    secrets[prefix + '_KEY'] = profile.apiKey;
    for (const suffix of ['ENDPOINT', 'MODEL', 'VERIFIED']) {
      if (local[prefix + '_' + suffix]) vars[prefix + '_' + suffix] = local[prefix + '_' + suffix];
    }
  }
  if (local.DEEPSEEK_API_KEY) {
    secrets.DEEPSEEK_API_KEY = local.DEEPSEEK_API_KEY;
    for (const name of ['DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL']) if (local[name]) vars[name] = local[name];
  }
  if (!dryRun) {
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    let existing;
    try {
      existing = JSON.parse(wrangler(['secret', 'list'], { config: configPath, capture: true }));
    } catch (error) {
      if (!/Worker [^\n]+ not found\./i.test(error.wranglerOutput || '')) throw error;
      existing = [];
    }
    if (!existing.some(secret => secret.name === 'TASK_CREDENTIAL_KEY')) {
      secrets.TASK_CREDENTIAL_KEY = local.TASK_CREDENTIAL_KEY || randomBytes(32).toString('base64url');
    }
    if (Object.keys(secrets).length) {
      wrangler(['secret', 'bulk'], { config: configPath, input: JSON.stringify(secrets) });
    }
    config.vars = { ...config.vars, ...vars };
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  }
  const summary = { dryRun, configuredProfiles: managedAiProfiles(local).map(profile => profile.id),
    secretNames: Object.keys(secrets), variableNames: Object.keys(vars), preservesExistingCredentialKey: true };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  syncCloudflareAi({
    target: resolve(args.find(arg => arg.startsWith('--target='))?.slice(9) || ROOT),
    source: args.find(arg => arg.startsWith('--source='))?.slice(9),
    dryRun: args.includes('--dry-run')
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
