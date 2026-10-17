// Supplemental real-IndexedDB comparison. Default check mode records no timings.
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,extname,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {release,cpus,totalmem} from 'node:os';

const allowed=['output','suite','mode','product-head','timeout'];
const args={};
for(let i=2;i<process.argv.length;i+=2){const name=process.argv[i]?.replace(/^--/,'');if(!allowed.includes(name)||!process.argv[i+1]||args[name]!==undefined)throw Error(`Invalid/duplicate argument ${process.argv[i]}`);args[name]=process.argv[i+1];}
const mode=args.mode??'check',suite=args.suite??'legacy100',productHead=args['product-head']??'0479d4eedae9b51fbc6fd785265bbbc2de870e78';
if(!['check','capture'].includes(mode)||!['legacy100','legacy1000','legacy10000','standard','large','added-heavy'].includes(suite))throw Error('Invalid mode/suite');
const timeout=Number(args.timeout??1200000);if(!Number.isSafeInteger(timeout)||timeout<1000)throw Error('Invalid timeout');
const runId=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`,root=process.cwd(),output=resolve(args.output??`test-results/p2-04-driver/${runId}`),distribution=join(output,'build');
// Refuse any prior output, including failed runs. Never erase existing evidence.
await mkdir(dirname(output),{recursive:true});
await mkdir(output,{recursive:false});
const path=join(output,'result.json'),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const overlayPaths=['scripts/optimization/measure-history-metadata.mjs','tests/optimization/history-measurement-core.ts','tests/optimization/history-measurement-fixtures.ts','tests/optimization/history-measurement-harness.ts','tests/optimization/history-measurement-harness.html','tests/optimization/history-measurement.test.ts'];
const result={version:1,mode,suite,runId,argv:process.argv.slice(2),root,productHead,recordedAt:new Date().toISOString(),status:'starting',errors:[],source:null,build:null,
 environment:{node:process.version,osVersion:release(),cpu:cpus()[0]?.model,logicalCPUs:cpus().length,totalMemory:totalmem(),physicalDevice:false,network:'HTTP loopback only'},
 scope:'Check mode: correctness only, no harness timers/probes. Capture mode: one OFF and one separately seeded ON per API. ON durations are not reported as latency. No original final acceptance/distribution. Worker-internal hashing/IDB keepalive UNKNOWN.'};
const persist=()=>writeFile(path,JSON.stringify(result,null,2)+'\n');
const git=(...command)=>execFileSync('git',command,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const file=async name=>{const bytes=await readFile(resolve(root,name));return{path:name,bytes:bytes.length,sha256:digest(bytes)};};
async function files(directory,prefix=''){const rows=[];for(const entry of await readdir(directory,{withFileTypes:true})){const name=prefix+entry.name,p=join(directory,entry.name);if(entry.isDirectory())rows.push(...await files(p,name+'/'));else{const bytes=await readFile(p);rows.push({path:name,bytes:bytes.length,sha256:digest(bytes)});}}return rows.sort((a,b)=>a.path.localeCompare(b.path));}
let browser,server;
await persist();
try{
 const head=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}'),productTree=git('rev-parse',`${productHead}^{tree}`),status=git('status','--porcelain');
 if(![head,tree,productTree].every(value=>/^[a-f0-9]{40}$/.test(value)))throw Error('Invalid/empty Git identity');
 const tracked=git('ls-tree','-r','--name-only',productHead).split('\n');
 // All tracked runtime source, build scripts/config and original fixture definitions
 // must literally equal the requested product commit, regardless of checkout HEAD.
 const productPaths=tracked.filter(name=>name.startsWith('src/')||name.startsWith('scripts/build/')||['package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','tests/optimization/fixtures.ts'].includes(name));
 const productFiles=[];
 for(const name of productPaths){const actual=await file(name),committed=execFileSync('git',['show',`${productHead}:${name}`],{cwd:root,maxBuffer:64*1024*1024});if(actual.sha256!==digest(committed))throw Error(`Product byte mismatch: ${name}`);productFiles.push({...actual,gitBlob:git('rev-parse',`${productHead}:${name}`),matchesProductCommit:true});}
 const changes=[...git('diff','--name-only','HEAD').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);
 if(changes.some(name=>!overlayPaths.includes(name)&&name!=='docs/optimization/phase2/p2-04/DESIGN.md'))throw Error(`Unexpected dirty overlay: ${changes.join(',')}`);
 const overlays=await Promise.all(overlayPaths.map(file));
 result.source={head,tree,productHead,productTree,status,productFiles,overlays,workingDiff:git('diff','--binary','HEAD'),overlayPolicy:'Only these identical measurement files plus additive DESIGN; no product overlay'};
 await persist();
 // Fresh ignored runtime is generated BEFORE hash/build. A spawn/setup failure
 // throws and is retained; a false-success empty git result cannot be accepted.
 const command=['scripts/build/portable-runtime.mjs'];
 try{const stdout=execFileSync(process.execPath,command,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});await writeFile(join(output,'generator.stdout.log'),stdout);result.generator={command:[process.execPath,...command],exitCode:0};}
 catch(error){result.generator={command:[process.execPath,...command],exitCode:error.status??null};throw error;}
 result.generatedFiles=[];
 for(const directory of ['src/portable/generated','examples/browser-game/generated','public/examples/browser-game'])for(const row of await files(join(root,directory)))result.generatedFiles.push({...row,path:`${directory}/${row.path}`});
 for(const row of productFiles)if((await file(row.path)).sha256!==row.sha256)throw Error(`Generator changed product: ${row.path}`);
 result.source.hashMoment='Tracked product bytes verified before generator, rehashed equal after fresh generator; generated hashes captured now before build';
 const {build}=await import('vite');
 await build({configFile:false,root,base:'/',build:{target:'es2022',outDir:distribution,emptyOutDir:false,rollupOptions:{input:resolve(root,'tests/optimization/history-measurement-harness.html')}},logLevel:'warn'});
 const buildFiles=await files(distribution),{zipSync}=await import('fflate'),members={};for(const row of buildFiles)members[row.path]=new Uint8Array(await readFile(join(distribution,row.path)));
 const zip=zipSync(members);await writeFile(join(output,'actual-build.zip'),zip);result.build={command:'Vite API configFile:false, target:es2022, base:/, unchanged product + identical measurement harness',files:buildFiles,zip:{path:'actual-build.zip',bytes:zip.byteLength,sha256:digest(zip)}};
 const probeSource=await readFile(join(root,'src/observability/probe.ts'),'utf8'),historyCountersSupported=probeSource.includes("'history.write.sealBytes'")&&probeSource.includes("'history.legacy.rows'");
 result.historyCountersSupported=historyCountersSupported;result.historyCountersSupportEvidence='Exact hashed product probe source metrics; absent counters UNKNOWN on baseline';
 // Verify source remains fixed after generator/build, including generated inputs.
 for(const row of productFiles)if((await file(row.path)).sha256!==row.sha256)throw Error(`Build changed product: ${row.path}`);
 for(const row of overlays)if((await file(row.path)).sha256!==row.sha256)throw Error(`Build changed overlay: ${row.path}`);
 await persist();
 server=createServer(async(req,res)=>{const requested=resolve(distribution,'.'+new URL(req.url,'http://localhost').pathname);if(!requested.startsWith(distribution+'/')){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',extname(requested)==='.js'?'text/javascript':extname(requested)==='.css'?'text/css':'text/html');res.end(await readFile(requested));}catch{res.writeHead(404).end();}});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 const {chromium}=await import('@playwright/test');browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});result.environment.browser=await browser.version();
 const page=await browser.newPage();page.setDefaultTimeout(timeout);
 page.on('pageerror',error=>{result.errors.push({name:error.name,message:error.message,kind:'pageerror'});});
 await page.exposeFunction('historyMeasurementCheckpoint',async value=>{result.observations=value;await persist();});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/optimization/history-measurement-harness.html`);await page.waitForFunction(()=>!!window.historyMeasurement);
 const operation=page.evaluate(options=>window.historyMeasurement.run(options),{suite,mode,historyCountersSupported,runId});
 let timer;try{await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(`Harness timeout after ${timeout} ms`)),timeout);})]);}finally{clearTimeout(timer);}
 if(result.errors.length)throw Error('Browser page error recorded');
 result.status='ok';result.finishedAt=new Date().toISOString();
}catch(error){result.status='error';result.errors.push({name:error.name??'Error',message:String(error.message??error),exitCode:error.status??null,stdout:error.stdout?.toString(),stderr:error.stderr?.toString()});process.exitCode=1;}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}await persist();}
console.log(JSON.stringify({output,mode,suite,status:result.status,errors:result.errors.length}));
