import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'fflate';
import { ROOT } from './cloudflare-cli.mjs';

// Positive list: no .dev.vars, local Wrangler config, databases or caches.
const folders = ['src', 'scripts', 'migrations', 'public', 'docs', 'tests', 'dist', '.github'];
const files = ['index.html', 'vite.config.js', 'package.json', 'package-lock.json',
  '.dev.vars.example', '.gitignore', '.gitattributes', '.nvmrc', 'schema.sql',
  'install.sh', 'install.cmd', 'README.md'];
const encoder = new TextEncoder();
const forbidden = name => name === 'src/cloudflare-source.js' ||
  /(?:^|\/)(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?|wrangler\.local\.jsonc)$/.test(name) && name !== '.dev.vars.example' ||
  /\.(?:sqlite(?:-wal|-shm)?|db|log|pem|key|zip|tar|gz)$/.test(name);

function tarEntry(name, bytes) {
  if (encoder.encode(name).length > 100) throw new Error(`备份路径过长：${name}`);
  const header = new Uint8Array(512);
  const text = (offset, value) => header.set(encoder.encode(value), offset);
  const octal = (offset, length, value) => text(offset, value.toString(8).padStart(length - 1, '0') + '\0');
  text(0, name); octal(100, 8, name.endsWith('.sh') ? 0o755 : 0o644);
  octal(108, 8, 0); octal(116, 8, 0); octal(124, 12, bytes.length); octal(136, 12, 0);
  text(148, '        '); text(156, '0'); text(257, 'ustar\0'); text(263, '00');
  const checksum = header.reduce((sum, value) => sum + value, 0);
  text(148, checksum.toString(8).padStart(6, '0') + '\0 ');
  const entry = new Uint8Array(512 + Math.ceil(bytes.length / 512) * 512);
  entry.set(header); entry.set(bytes, 512);
  return entry;
}

export async function buildCloudflareSource(target = ROOT) {
  const entries = [];
  async function add(path) {
    const name = relative(target, path).replaceAll('\\', '/');
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error(`源码备份不接受符号链接：${name}`);
    if (stat.isDirectory()) {
      for (const child of (await readdir(path)).sort()) await add(resolve(path, child));
    } else if (stat.isFile() && !forbidden(name)) {
      entries.push(tarEntry(name, new Uint8Array(await readFile(path))));
    }
  }
  for (const name of [...files, ...folders]) {
    try { await add(resolve(target, name)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; else throw new Error(`源码备份缺少文件：${name}`); }
  }
  // Always embed the portable template, never the active account configuration.
  const template = await readFile(resolve(target, 'wrangler.jsonc'), 'utf8');
  entries.push(tarEntry('wrangler.jsonc', encoder.encode(template)));
  const tar = new Uint8Array(entries.reduce((sum, value) => sum + value.length, 1024));
  let offset = 0;
  for (const entry of entries) { tar.set(entry, offset); offset += entry.length; }
  const archive = gzipSync(tar, { level: 6, mtime: 0 });
  await writeFile(resolve(target, 'src/cloudflare-source.js'),
    'export const sourceArchive = ' + JSON.stringify(Buffer.from(archive).toString('base64')) + ';\n');
  console.log(`已打包系统备份源码：${entries.length} 个文件，${archive.length} 字节。`);
  return archive;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildCloudflareSource(resolve(process.argv.find(arg => arg.startsWith('--target='))?.slice(9) || ROOT));
}
