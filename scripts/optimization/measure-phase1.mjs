// Isolated production-bundled App/store, real Chromium IndexedDB, synthetic data only.
import {build} from 'vite';
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {release,cpus,totalmem} from 'node:os';

const option=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1];};
const output=resolve(option('output','test-results/phase1/diagnostic.json')),suite=option('suite','growth');
if(!['growth','standard','large','ui','calibration'].includes(suite))throw new Error('Unknown suite');
const root=process.cwd(),distribution=output.replace(/\.json$/,'')+'-build';
if(distribution===output)throw new Error('Output must end in .json');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function files(directory,prefix=''){
  const result=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name),relative=prefix+entry.name;
    if(entry.isDirectory())result.push(...await files(path,relative+'/'));
    else{const bytes=await readFile(path);result.push({path:relative,bytes:bytes.length,sha256:digest(bytes)});}
  }
  return result.sort((a,b)=>a.path.localeCompare(b.path));
}
const result={version:1,suite,recordedAt:new Date().toISOString(),sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),dirty:!!git('status','--porcelain'),
  environment:{os:'Linux',osVersion:release(),node:process.version,cpu:cpus()[0]?.model,logicalCPUs:cpus().length,totalMemory:totalmem(),physicalDevice:false,network:'loopback only'},
  scope:'Additional diagnostics. Setup excluded. Inclusive nested spans; payload bytes are UTF-8 scalar/key plus binary estimates, not disk/wire/heap bytes. Worker-internal validation/hash and native IDB keep-alive requests UNKNOWN. Not formal30/180/7200 acceptance.',
  sourceFiles:[],errors:[]};
for(const path of [...new Set([...git('ls-files','--','src','tests/optimization','scripts/optimization','package.json','package-lock.json').split('\n'),...git('ls-files','--others','--exclude-standard','--','src','tests/optimization','scripts/optimization').split('\n')])].filter(Boolean).sort()){
  const bytes=await readFile(path);result.sourceFiles.push({path,bytes:bytes.length,sha256:digest(bytes)});
}
const persist=async()=>{await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');};
let browser,server;
try{
  await build({configFile:false,root,base:'/',build:{target:'es2022',outDir:distribution,emptyOutDir:true,rollupOptions:{input:resolve('tests/optimization/harness.html')}},logLevel:'warn'});
  result.buildFiles=await files(distribution);
  server=createServer(async(req,res)=>{
    const path=resolve(distribution,'.'+new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(distribution+'/')){res.writeHead(403).end();return;}
    try{res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.end(await readFile(path));}catch{res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  result.environment.browser=await browser.version();
  const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(600000);
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/optimization/harness.html`);
  await page.waitForFunction(()=>!!window.phase1);
  if(suite==='ui'){
    await page.evaluate(()=>window.phase1.mount());
    await page.getByRole('button',{name:/^資料/}).click();
    await page.locator('.entity-card').first().click();const input=page.getByLabel('名前',{exact:true});
    await input.waitFor();await input.focus();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(!await input.isVisible()||!await input.isEnabled()||!await input.isEditable())throw new Error('Editor readiness failed');
    result.startup=await page.evaluate(()=>window.phase1.uiReady());
    await page.evaluate(()=>window.phase1.beginSave());await input.fill('UI計測の改名');
    await page.locator('.editor-save-state').filter({hasText:'端末内保存済み'}).waitFor();
    result.save=await page.evaluate(()=>window.phase1.saveVisible());
    await page.evaluate(()=>window.phase1.cleanup());
  }else result.observations=await page.evaluate(suite=>suite==='standard'||suite==='large'?window.phase1.profile(suite):window.phase1[suite](),suite);
  result.finishedAt=new Date().toISOString();
}catch(error){result.errors.push({name:error.name,message:error.message});process.exitCode=1;}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}await persist();}
console.log(JSON.stringify({output,suite,errors:result.errors.length}));
