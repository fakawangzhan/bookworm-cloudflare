import { zipSync } from 'fflate';
export async function downloadCloudBackup(manifest,request=fetch){
 const read=async path=>{const r=await request(path,{credentials:'same-origin',cache:'no-store'}),v=await r.json();if(!r.ok)throw new Error(v.error||'系统备份失败。');return v;};
 let base64='';for(let part=0;part<manifest.sourceParts;part++)base64+=(await read('/api/system-backup/source?part='+part)).content;
 const files={'source.tar.gz':Uint8Array.from(atob(base64),c=>c.charCodeAt(0))},encode=s=>new TextEncoder().encode(s);
 const pieces=[manifest.tables.map(t=>t.sql+';').join('\n')+'\n'];
 for(const table of manifest.tables){let after=0;do{const part=await read('/api/system-backup/data?'+new URLSearchParams({table:table.name,after}));pieces.push(part.sql+'\n');after=part.next;}while(after!==null);}
 await read('/api/system-backup/verify?'+new URLSearchParams({version:manifest.version}));
 files['database.sql']=encode(pieces.join(''));files['.dev.vars']=encode(Object.entries(manifest.env).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n');
 files['README.txt']=encode('BookWorm Cloudflare 系统备份\n'+manifest.createdAt+'\n源码、数据库与运行配置已备份，日志排除。\n恢复时解压 source.tar.gz 至独立目录，把 .dev.vars 放入该目录。在空 D1 数据库导入 database.sql 后调整 wrangler.jsonc 的账号和数据库 ID，再执行 install.sh 同步 Secret 并部署。不要将恢复 SQL 导入已有业务数据库。备份含凭据，仅由系统管理员保管。\n');
 return new Blob([zipSync(files,{level:1})],{type:'application/zip'});
}
