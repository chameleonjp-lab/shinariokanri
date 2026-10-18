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
const output=resolve(option('output','test-results/p2-03/diagnostic.json')),suite=option('suite','standard');
if(!['standard','large'].includes(suite))throw new Error('Unknown suite');
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
const result={version:1,suite,recordedAt:new Date().toISOString(),sourceCommit:null,sourceTree:null,dirty:null,
  environment:{os:'Linux',osVersion:release(),node:process.version,cpu:cpus()[0]?.model,logicalCPUs:cpus().length,totalMemory:totalmem(),physicalDevice:false,network:'loopback only'},
  scope:'Literal checked-out product source; supplemental one OFF and one ON sample per operation, fixed OFF then ON order on separately seeded databases. Warm application cache. Not a latency distribution. Setup, input construction, validation assertions and probe settling excluded from interval. Additional diagnostics. Setup excluded. Inclusive nested spans; payload bytes are UTF-8 scalar/key plus binary estimates, not disk/wire/heap bytes. Worker-internal validation/hash and native IDB keep-alive requests UNKNOWN. Not formal30/180/7200 acceptance.',
  sourceFiles:[],errors:[]};
const persist=async()=>{await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');};
let browser,server;
try{
  result.sourceCommit=git('rev-parse','HEAD');result.sourceTree=git('rev-parse','HEAD^{tree}');result.dirty=!!git('status','--porcelain');
  // Fresh ignored input is mandatory before hashes and build, including baseline overlays.
  execFileSync(process.execPath,['scripts/build/portable-runtime.mjs'],{cwd:root,stdio:['ignore',2,2]});
  result.generator={command:'node scripts/build/portable-runtime.mjs',exitCode:0};
  for(const directory of ['src','tests/optimization','scripts/optimization'])for(const row of await files(resolve(root,directory)))result.sourceFiles.push({...row,path:`${directory}/${row.path}`});
  for(const path of ['package.json','package-lock.json','scripts/build/portable-runtime.mjs']){const bytes=await readFile(path);result.sourceFiles.push({path,bytes:bytes.length,sha256:digest(bytes)});}
  result.sourceStatus=git('status','--porcelain');
  result.productDiff=git('diff','HEAD','--','src');
  await build({configFile:false,root,base:'/',build:{target:'es2022',outDir:distribution,emptyOutDir:true,rollupOptions:{input:resolve('tests/optimization/save-changeset-harness.html')}},logLevel:'warn'});
  result.buildFiles=await files(distribution);
  server=createServer(async(req,res)=>{
    const path=resolve(distribution,'.'+new URL(req.url,'http://localhost').pathname);
    if(!path.startsWith(distribution+'/')){res.writeHead(403).end();return;}
    try{res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.end(await readFile(path));}catch{res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  result.environment.browser=await browser.version();
  const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(600000);page.on('pageerror',error=>result.errors.push({name:error.name,message:error.message,kind:'pageerror'}));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/optimization/save-changeset-harness.html`);
  await page.waitForFunction(()=>!!window.saveChangesetMeasurement);
  result.observations=await page.evaluate(suite=>window.saveChangesetMeasurement.compare(suite),suite);
  result.finishedAt=new Date().toISOString();
}catch(error){result.errors.push({name:error.name,message:error.message});process.exitCode=1;}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}await persist();}
console.log(JSON.stringify({output,suite,errors:result.errors.length}));
