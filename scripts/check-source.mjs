import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT } from './cloudflare-cli.mjs';

const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(?:js|mjs)$/.test(entry.name) && entry.name !== 'cloudflare-source.js') files.push(path);
  }
}
for (const folder of ['src', 'scripts', 'tests']) await walk(resolve(ROOT, folder));
files.push(resolve(ROOT, 'vite.config.js'));
for (const path of files) {
  const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(1);
}
const packageJson = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(resolve(ROOT, 'package-lock.json'), 'utf8'));
for (const key of ['name', 'version']) {
  if (packageJson[key] !== lock.packages[''][key]) throw new Error(`lockfile ${key} 不一致`);
}
console.log(`语法检查通过：${files.length} 个 JavaScript 文件；依赖锁文件存在。`);
