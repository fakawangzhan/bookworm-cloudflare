import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'fflate';
import { buildCloudflareSource } from '../scripts/build-cloudflare-source.mjs';
import { databaseId } from '../scripts/deploy-cloudflare.mjs';
import { syncCloudflareAi } from '../scripts/sync-cloudflare-ai.mjs';

function untar(bytes) {
  const files = new Map(), decode = new TextDecoder();
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    const name = decode.decode(bytes.slice(offset, offset + 100)).replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(decode.decode(bytes.slice(offset + 124, offset + 136)).replace(/\0.*$/s, ''), 8);
    files.set(name, decode.decode(bytes.slice(offset + 512, offset + 512 + size)));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

test('D1 ID accepts create and list response formats', () => {
  assert.equal(databaseId({ database_id: 'created' }), 'created');
  assert.equal(databaseId({ uuid: 'existing' }), 'existing');
  assert.equal(databaseId({ result: { database_id: 'nested' } }), 'nested');
  assert.equal(databaseId({}), undefined);
});

test('backup contains rebuild inputs and excludes credentials, caches and itself', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bookworm-backup-test-'));
  try {
    for (const folder of ['src', 'scripts', 'migrations', 'public', 'docs', 'tests', 'dist', '.github']) {
      await mkdir(join(root, folder), { recursive: true });
      await writeFile(join(root, folder, 'input.txt'), folder);
    }
    for (const file of ['index.html', 'vite.config.js', 'package.json', 'package-lock.json',
      '.dev.vars.example', '.gitignore', '.gitattributes', '.nvmrc', 'schema.sql',
      'install.sh', 'install.cmd', 'README.md', 'wrangler.jsonc']) {
      await writeFile(join(root, file), file === 'wrangler.jsonc' ? '{"name":"portable"}' : file);
    }
    await writeFile(join(root, '.dev.vars'), 'SECRET=never-package');
    await writeFile(join(root, 'wrangler.local.jsonc'), '{"account_id":"private-account"}');
    await writeFile(join(root, 'src/cloudflare-source.js'), 'old embedded archive');
    await writeFile(join(root, 'src/debug.sqlite'), 'private data');
    const archive = await buildCloudflareSource(root);
    const contents = untar(gunzipSync(archive));
    for (const file of ['index.html', 'vite.config.js', 'public/input.txt', 'docs/input.txt', 'dist/input.txt']) {
      assert.ok(contents.has(file), `${file} is needed to rebuild`);
    }
    for (const file of ['.dev.vars', 'wrangler.local.jsonc', 'src/cloudflare-source.js', 'src/debug.sqlite']) {
      assert.ok(!contents.has(file), `${file} must stay out of the archive`);
    }
    assert.equal(contents.get('wrangler.jsonc'), '{"name":"portable"}');
    const generated = await readFile(join(root, 'src/cloudflare-source.js'), 'utf8');
    assert.ok(generated.startsWith('export const sourceArchive = '));
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('AI sync does not read a parent checkout credential file', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'bookworm-ai-source-test-'));
  const child = join(parent, 'checkout');
  try {
    await mkdir(child);
    await writeFile(join(parent, '.dev.vars'), 'DEEPSEEK_API_KEY=parent-only-key\n');
    const isolated = await syncCloudflareAi({ target: child, dryRun: true });
    assert.deepEqual(isolated.configuredProfiles, []);
    const explicit = await syncCloudflareAi({ target: child, source: join(parent, '.dev.vars'), dryRun: true });
    assert.deepEqual(explicit.configuredProfiles, ['deepseek']);
  } finally { await rm(parent, { recursive: true, force: true }); }
});
