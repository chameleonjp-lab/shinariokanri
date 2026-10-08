import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const base = process.env.APP_BASE || '/shinariokanri/';
if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..')) throw new Error('Invalid APP_BASE');
async function files(dir) {
  return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(async entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]))).flat();
}
const paths = (await files('dist')).filter(path=> !path.endsWith('/sw.js')&&!path.endsWith('/build-info.json'));
let commit='unknown';let dirty=true;
try {commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();dirty=Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim());}catch{}
const metadata={commit,dirty,base,builtAt:new Date().toISOString(),versionHashScope:'sorted paths and bytes plus build info before version'};
const hash = createHash('sha256');
hash.update(JSON.stringify(metadata));
for(const path of paths.sort()){hash.update(path);hash.update(await readFile(path));}
const version = hash.digest('hex').slice(0,20);
await writeFile('dist/build-info.json',JSON.stringify({...metadata,version},null,2)+'\n');
paths.push('dist/build-info.json');
const urls = paths.map(path=>base+path.slice(5));
urls.push(base);
const cache = `shinariokanri:${base}:${version}`;
await writeFile('dist/sw.js', `const CACHE=${JSON.stringify(cache)}, BASE=${JSON.stringify(base)}, URLS=${JSON.stringify(urls)};\nself.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(URLS))));\n// Waiting workers activate only after old clients close, keeping editing sessions stable.\nself.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('shinariokanri:'+BASE+':')&&key!==CACHE).map(key=>caches.delete(key))))));\nself.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;if(URLS.includes(url.pathname)){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname,{ignoreVary:true}))||fetch(event.request)));return;}if(event.request.mode==='navigate'&&!/\\.[a-z0-9]+$/i.test(url.pathname)){event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(BASE+'index.html',{ignoreVary:true}))||fetch(event.request)));}});\n`);
console.log(`Offline shell generated: ${version}, ${base}`);
