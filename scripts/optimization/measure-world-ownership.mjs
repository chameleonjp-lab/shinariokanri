// Supplemental real-IndexedDB comparison. Default check mode records no timings.
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,extname,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {release,cpus,totalmem} from 'node:os';
import {fileURLToPath} from 'node:url';

/** Outer interruption never invents an API completion duration. */
export function interruptedOperation(observations,cause){
 const active=observations?.activeOperation;
 return{cause,activeOperation:active?structuredClone(active):null,apiCompletion:active?.apiCompletion??'UNKNOWN',apiMilliseconds:'UNKNOWN: outer interruption is not an API completion',counterCompleteness:active?.probeEnabled?'UNKNOWN: no final settled snapshot':'not captured',completedOperationRowsRetained:observations?.operations?.length??0};
}
async function versions(page){
 await page.locator('.sidebar').getByRole('button',{name:/^年表/}).click();await page.getByRole('tab',{name:'世界・地図・履歴',exact:true}).click();await page.getByRole('tab',{name:'共通世界の固定版',exact:true}).click();
}
async function choose(page,expect,world){
 await page.getByLabel('参照する共通世界',{exact:true}).selectOption(world.projectId);
 await expect(page.getByLabel('固定する共通世界版',{exact:true}).locator(`option[value="${world.snapshotId}"]`)).toHaveCount(1);
}
async function runUIProof(page,expect,runId,mode,supported,active){
 await active('mount actual App');const fixture=await page.evaluate(id=>window.worldOwnershipUI.setup(id),runId);
 try{
  await expect(page.locator('.project-switch')).toContainText('P205 work 0');await versions(page);
  if(mode==='capture')await page.evaluate(()=>window.worldOwnershipUI.startObservation());
  await active('failed preview preserves author input');await choose(page,expect,fixture.worlds[1]);
  await page.getByLabel('固定する共通世界版',{exact:true}).selectOption(fixture.worlds[1].snapshotId);
  await page.getByRole('checkbox',{name:'P205 place 1',exact:true}).check();await page.getByRole('searchbox',{name:'採用する世界設定を検索'}).fill('P205 place');
  const before={source:await page.getByLabel('参照する共通世界',{exact:true}).inputValue(),snapshot:await page.getByLabel('固定する共通世界版',{exact:true}).inputValue(),query:await page.getByRole('searchbox',{name:'採用する世界設定を検索'}).inputValue(),adopted:await page.getByRole('checkbox',{name:'P205 place 1',exact:true}).isChecked()};
  await page.evaluate(id=>window.worldOwnershipUI.failNextPreviewHash(id),fixture.worlds[1].projectId);
  await page.getByRole('button',{name:'適用前の差分・影響を確認',exact:true}).click();await expect(page.getByText('P205 literal rejected preview hash',{exact:true})).toBeVisible();
  const after={source:await page.getByLabel('参照する共通世界',{exact:true}).inputValue(),snapshot:await page.getByLabel('固定する共通世界版',{exact:true}).inputValue(),query:await page.getByRole('searchbox',{name:'採用する世界設定を検索'}).inputValue(),adopted:await page.getByRole('checkbox',{name:'P205 place 1',exact:true}).isChecked()};
  expect(after).toEqual(before);
  await active('late source A to B to A');await page.evaluate(id=>window.worldOwnershipUI.holdSource(id),fixture.worlds[2].projectId);
  await page.getByLabel('参照する共通世界',{exact:true}).selectOption(fixture.worlds[2].projectId);await expect.poll(()=>page.evaluate(()=>window.worldOwnershipUI.gateEntered())).toBe(true);
  await choose(page,expect,fixture.worlds[3]);await choose(page,expect,fixture.worlds[2]);await page.evaluate(()=>window.worldOwnershipUI.releaseGate());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.getByLabel('固定する共通世界版',{exact:true}).selectOption(fixture.worlds[2].snapshotId);
  await page.getByRole('button',{name:'共通世界の元情報を開く',exact:true}).click();await expect(page.getByRole('dialog').last()).toContainText('P205 place 2');
  await page.getByRole('dialog').last().getByRole('button',{name:'閉じる',exact:true}).click();
  const boundaries=[];
  for(const world of fixture.worlds){await choose(page,expect,world);boundaries.push({source:world.projectId,...await page.evaluate(()=>window.worldOwnershipUI.snapshot())});}
  for(const world of fixture.worlds)await expect(page.getByLabel('参照する共通世界',{exact:true}).locator(`option[value="${world.projectId}"]`)).toHaveCount(1);
  await expect(page.getByText(`参照版：${fixture.adoptedLabel}`,{exact:true})).toBeVisible();
  await active('outer selection rejection preserves current preview capability');
  // A real completed import follows a different editor while the current
  // editor stays mounted. Only that selected read is injected to reject.
  await page.locator('.project-switch').click();await page.locator('.project-card').filter({hasText:'P205 work 0'}).click();
  await expect(page.locator('.project-switch')).toContainText('P205 work 0');
  await page.locator('.sidebar').getByRole('button',{name:/^作品・保存/}).click();await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();
  const incoming=await page.evaluate(()=>window.worldOwnershipUI.followSelectionFixture());await page.evaluate(id=>window.worldOwnershipUI.rejectNextFollowSelection(id),incoming.projectId);
  await page.locator('input[type=file]').setInputFiles({name:'p205-follow-selection.scenario',mimeType:'application/zip',buffer:Buffer.from(incoming.bytes)});
  await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();
  await expect(page.getByText('P205 literal follow-selection failure',{exact:true})).toBeVisible();await expect(page.locator('.project-switch')).toContainText('P205 work 0');
  await versions(page);await choose(page,expect,fixture.worlds[3]);
  await page.evaluate(id=>window.worldOwnershipUI.holdSource(id),fixture.worlds[2].projectId);
  await page.getByLabel('参照する共通世界',{exact:true}).selectOption(fixture.worlds[2].projectId);await expect.poll(()=>page.evaluate(()=>window.worldOwnershipUI.gateEntered())).toBe(true);
  await choose(page,expect,fixture.worlds[3]);await choose(page,expect,fixture.worlds[2]);await page.evaluate(()=>window.worldOwnershipUI.releaseGate());
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.getByLabel('固定する共通世界版',{exact:true}).selectOption(fixture.worlds[2].snapshotId);
  await page.getByRole('button',{name:'共通世界の元情報を開く',exact:true}).click();await expect(page.getByRole('dialog').last()).toContainText('P205 place 2');
  await page.getByRole('dialog').last().getByRole('button',{name:'閉じる',exact:true}).click();await expect(page.getByText(`参照版：${fixture.adoptedLabel}`,{exact:true})).toBeVisible();
  const final=await page.evaluate(()=>window.worldOwnershipUI.snapshot());if(mode==='check'){expect(final.instrumentationStarts).toBe(0);expect(final).not.toHaveProperty('probe');}
  return{status:'ok',actualApp:true,transport:'HTTP loopback',failedPreview:{before,after},lateSequence:'source 2 -> 3 -> 2, old 2 released after new 2 is displayed; immutable detail still resolves',outerSelectionRejection:'real import succeeded, followed editor read rejected; previous editor and adopted edition remain; source 2 -> 3 -> 2 rejects the old request and current immutable source detail resolves',allSixPickerChoicesPreserved:true,adoptedEditionPreserved:true,boundaries,final,uiMetricSupport:supported?'actual ON gauges only in capture mode':'UNKNOWN: literal baseline has no UI retention gauges',latency:'NOT MEASURED: functional UI proof'};
 }finally{await page.evaluate(()=>window.worldOwnershipUI.cleanup());}
}
async function heapDiagnostic(browser,url,runId,expect){
 const context=await browser.newContext(),page=await context.newPage(),rows=[];
 try{
  await page.goto(url);await page.waitForFunction(()=>!!window.worldOwnershipUI);
  const cdp=await context.newCDPSession(page),sample=async boundary=>rows.push({boundary,...await cdp.send('Runtime.getHeapUsage')});
  await sample('pre-load');const fixture=await page.evaluate(id=>window.worldOwnershipUI.setup(id),runId);await expect(page.locator('.project-switch')).toContainText('P205 work 0');await versions(page);
  for(const world of fixture.worlds)await choose(page,expect,world);await sample('after multi-source selection');
  await page.evaluate(()=>window.worldOwnershipUI.release());await sample('after editor/preview release');await page.evaluate(()=>window.worldOwnershipUI.close());await sample('after store close');
  await page.evaluate(()=>window.worldOwnershipUI.cleanup());
  return{status:'observed',facility:'CDP Runtime.getHeapUsage',freshContext:true,forcedGC:false,rows,limitations:'Instantaneous renderer/isolate samples include JIT/GC/transients and harness/browser scope. No reachable-retained, peak or release acceptance inference.'};
 }catch(error){return{status:'UNKNOWN',rows,error:{name:error.name,message:error.message},forcedGC:false};}
 finally{await context.close();}
}
async function main(){
const allowed=['output','suite','mode','product-head','timeout','ui','heap'];
const args={};
for(let i=2;i<process.argv.length;i+=2){const name=process.argv[i]?.replace(/^--/,'');if(!allowed.includes(name)||!process.argv[i+1]||args[name]!==undefined)throw Error(`Invalid/duplicate argument ${process.argv[i]}`);args[name]=process.argv[i+1];}
const mode=args.mode??'check',suite=args.suite??'standard',requestedProductHead=args['product-head']??'HEAD';
if(args.ui!==undefined&&!['true','false'].includes(args.ui)||args.heap!==undefined&&!['true','false'].includes(args.heap))throw Error('Invalid ui/heap flag');
if(mode==='check'&&args.heap==='true')throw Error('Heap observations require separately reviewed capture mode');
if(!['check','capture'].includes(mode)||!['supplemental','standard','large'].includes(suite))throw Error('Invalid mode/suite');
const timeout=Number(args.timeout??1200000);if(!Number.isSafeInteger(timeout)||timeout<1000)throw Error('Invalid timeout');
const runId=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`,root=process.cwd(),output=resolve(args.output??`test-results/p2-05-driver/${runId}`),distribution=join(output,'build');
// Refuse any prior output, including failed runs. Never erase existing evidence.
await mkdir(dirname(output),{recursive:true});
await mkdir(output,{recursive:false});
const path=join(output,'result.json'),digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const overlayPaths=['scripts/optimization/measure-world-ownership.mjs','tests/optimization/world-ownership-measurement-core.ts','tests/optimization/world-ownership-measurement-fixtures.ts','tests/optimization/world-ownership-measurement-harness.tsx','tests/optimization/world-ownership-measurement-harness.html','tests/optimization/world-ownership-measurement.test.ts','tests/optimization/world-ownership-measurement-failure.test.ts'];
const result={version:1,mode,suite,runId,argv:process.argv.slice(2),root,requestedProductHead,recordedAt:new Date().toISOString(),status:'starting',errors:[],source:null,build:null,
 environment:{node:process.version,osVersion:release(),cpu:cpus()[0]?.model,logicalCPUs:cpus().length,totalMemory:totalmem(),physicalDevice:false,network:'HTTP loopback only'},
 scope:'Check mode: correctness only, no harness timers/probes. Capture mode: one OFF and one separately seeded ON per API. ON durations are not reported as latency. No original final acceptance/distribution. Worker-internal hashing/IDB keepalive UNKNOWN.'};
let pendingPersist=Promise.resolve();
const persist=()=>{const bytes=JSON.stringify(result,null,2)+'\n';pendingPersist=pendingPersist.catch(()=>{}).then(()=>writeFile(path,bytes));return pendingPersist;};
const git=(...command)=>execFileSync('git',command,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const file=async name=>{const bytes=await readFile(resolve(root,name));return{path:name,bytes:bytes.length,sha256:digest(bytes)};};
async function files(directory,prefix=''){const rows=[];for(const entry of await readdir(directory,{withFileTypes:true})){const name=prefix+entry.name,p=join(directory,entry.name);if(entry.isDirectory())rows.push(...await files(p,name+'/'));else{const bytes=await readFile(p);rows.push({path:name,bytes:bytes.length,sha256:digest(bytes)});}}return rows.sort((a,b)=>a.path.localeCompare(b.path));}
let browser,server,interruptionCause='outer failure',rejectPageError;
let closing=false;
await persist();
try{
 const head=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}'),productHead=git('rev-parse',requestedProductHead),productTree=git('rev-parse',`${productHead}^{tree}`),status=git('status','--porcelain');result.productHead=productHead;
 if(![head,tree,productTree].every(value=>/^[a-f0-9]{40}$/.test(value)))throw Error('Invalid/empty Git identity');
 const tracked=git('ls-tree','-r','--name-only',productHead).split('\n');
 // All tracked runtime source, build scripts/config and original fixture definitions
 // must literally equal the requested product commit, regardless of checkout HEAD.
 const productPaths=tracked.filter(name=>name.startsWith('src/')||name.startsWith('scripts/build/')||['package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','tests/optimization/fixtures.ts'].includes(name));
 const productFiles=[];
 for(const name of productPaths){const actual=await file(name),committed=execFileSync('git',['show',`${productHead}:${name}`],{cwd:root,maxBuffer:64*1024*1024});if(actual.sha256!==digest(committed))throw Error(`Product byte mismatch: ${name}`);productFiles.push({...actual,gitBlob:git('rev-parse',`${productHead}:${name}`),matchesProductCommit:true});}
 const changes=[...git('diff','--name-only','HEAD').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);
 if(changes.some(name=>!overlayPaths.includes(name)&&name!=='docs/optimization/phase2/p2-05/DESIGN.md'))throw Error(`Unexpected dirty overlay: ${changes.join(',')}`);
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
 await build({configFile:false,root,base:'/',build:{target:'es2022',outDir:distribution,emptyOutDir:false,rollupOptions:{input:resolve(root,'tests/optimization/world-ownership-measurement-harness.html')}},logLevel:'warn'});
 const buildFiles=await files(distribution),{zipSync}=await import('fflate'),members={};for(const row of buildFiles)members[row.path]=new Uint8Array(await readFile(join(distribution,row.path)));
 const zip=zipSync(members);await writeFile(join(output,'actual-build.zip'),zip);result.build={command:'Vite API configFile:false, target:es2022, base:/, unchanged product + identical measurement harness',files:buildFiles,zip:{path:'actual-build.zip',bytes:zip.byteLength,sha256:digest(zip)}};
 const probeSource=await readFile(join(root,'src/observability/probe.ts'),'utf8'),worldCountersSupported=probeSource.includes("'world.closure.fullFallback'")&&probeSource.includes("'ui.worldRegistry.entries'");
 result.worldCountersSupported=worldCountersSupported;result.counterSupportEvidence='Exact hashed product probe source metric declarations. Absent world/UI metrics are UNKNOWN, never zero on the literal baseline.';
 // Verify source remains fixed after generator/build, including generated inputs.
 for(const row of productFiles)if((await file(row.path)).sha256!==row.sha256)throw Error(`Build changed product: ${row.path}`);
 for(const row of overlays)if((await file(row.path)).sha256!==row.sha256)throw Error(`Build changed overlay: ${row.path}`);
 await persist();
 server=createServer(async(req,res)=>{const requested=resolve(distribution,'.'+new URL(req.url,'http://localhost').pathname);if(!requested.startsWith(distribution+'/')){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',extname(requested)==='.js'?'text/javascript':extname(requested)==='.css'?'text/css':'text/html');res.end(await readFile(requested));}catch{res.writeHead(404).end();}});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 const {chromium,expect}=await import('@playwright/test');browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});result.environment.browser=await browser.version();
 const page=await browser.newPage();page.setDefaultTimeout(timeout);
 page.on('pageerror',error=>{result.errors.push({name:error.name,message:error.message,kind:'pageerror'});interruptionCause='pageerror';rejectPageError?.(error);});
 await page.exposeFunction('worldOwnershipCheckpoint',async value=>{if(!closing){result.observations=value;await persist();}});
 await page.goto(`http://127.0.0.1:${server.address().port}/tests/optimization/world-ownership-measurement-harness.html`);await page.waitForFunction(()=>!!window.worldOwnershipMeasurement);
 const pageFailure=new Promise((_,reject)=>{rejectPageError=reject;});
 const operation=page.evaluate(options=>window.worldOwnershipMeasurement.run(options),{suite,mode,worldCountersSupported,runId}).then(async()=>{
  if(args.ui!=='false')result.ui=await runUIProof(page,expect,`${runId}-ui`,mode,worldCountersSupported,async action=>{result.activeUIAction=action;await persist();});
  delete result.activeUIAction;
 });
 let timer;try{await Promise.race([operation,pageFailure,new Promise((_,reject)=>{timer=setTimeout(()=>{interruptionCause='watchdog';reject(Error(`Harness timeout after ${timeout} ms`));},timeout);})]);}finally{clearTimeout(timer);}
 if(args.heap==='true')result.heap=await heapDiagnostic(browser,`http://127.0.0.1:${server.address().port}/tests/optimization/world-ownership-measurement-harness.html`,`${runId}-heap`,expect);
 else result.heap={status:'NOT RUN',reason:'separate fresh-context diagnostic after exact-head reviews; no heap release/peak acceptance inferred'};
 if(result.errors.length)throw Error('Browser page error recorded');
 result.status='ok';result.finishedAt=new Date().toISOString();
}catch(error){closing=true;result.status='error';if(result.activeUIAction)result.uiInterruption={action:result.activeUIAction,completion:'UNKNOWN',milliseconds:'UNKNOWN: functional UI proof is not an API latency interval'};if(result.observations?.activeOperation)result.interruption=interruptedOperation(result.observations,interruptionCause);result.errors.push({name:error.name??'Error',message:String(error.message??error),exitCode:error.status??null,stdout:error.stdout?.toString(),stderr:error.stderr?.toString()});process.exitCode=1;}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}await persist();}
console.log(JSON.stringify({output,mode,suite,status:result.status,errors:result.errors.length}));

}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
