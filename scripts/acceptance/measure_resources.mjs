// Supplemental retained-page heap observation. Never part of formal latency runs.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {cpus,totalmem,release} from 'node:os';
import assert from 'node:assert/strict';
const arg=name=>{const i=process.argv.indexOf('--'+name);return i<0?undefined:process.argv[i+1];};
if(!arg('repository')||!arg('tools-root')||!arg('output'))throw Error('Use --repository CLEAN_CHECKOUT --tools-root INSTALLED_CHECKOUT --output NEW_DIRECTORY');
const repo=resolve(arg('repository')),tools=resolve(arg('tools-root')),output=resolve(arg('output'));
const require=createRequire(join(tools,'package.json')),{build}=await import(pathToFileURL(require.resolve('vite')).href),{chromium}=require('playwright');
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
assert.equal(git('status','--porcelain'),'');
const commit=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}'),productTree=git('rev-parse','HEAD:src');
const buildInfo=JSON.parse(await readFile(join(repo,'dist/build-info.json')));
assert.equal(buildInfo.commit,commit);assert.equal(buildInfo.tree,tree);assert.equal(buildInfo.dirty,false);
await mkdir(output,{recursive:false});await copyFile(new URL(import.meta.url),join(output,'executed-procedure.mjs'));
async function files(directory,prefix=''){
 const rows=[];for(const e of await readdir(directory,{withFileTypes:true})){
  const p=join(directory,e.name),relative=prefix+e.name;
  if(e.isDirectory())rows.push(...await files(p,relative+'/'));
  else{const b=await readFile(p);rows.push({path:relative,bytes:b.length,sha256:sha(b)});}
 }return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
const sourceFiles=[];for(const p of git('ls-files','--','src','package.json','package-lock.json','vite.config.ts').split('\n')){
 const b=await readFile(join(repo,p));sourceFiles.push({path:p,bytes:b.length,sha256:sha(b)});
}
const result={format:'phase3-supplemental-page-heap/1',startedAt:new Date().toISOString(),commit,tree,productTree,buildInfo,
 sourceFiles,servedFiles:await files(join(repo,'dist')),
 environment:{os:'Linux',release:release(),node:process.version,cpu:cpus()[0]?.model,cpus:cpus().length,totalMemoryBytes:totalmem(),physicalDevice:false},
 scope:'Supplemental three fresh browser contexts per size. CDP JSHeapUsedSize/JSHeapTotalSize after two forced collections; main renderer V8 heap only, excludes workers, native IndexedDB, browser processes and actual peak/RSS. Fixed baseline-first order, JIT/GC/environment differences remain. No latency, p95, physical-device or release acceptance.',
 samples:[],errors:[]};
const save=()=>writeFile(join(output,'raw.json'),JSON.stringify(result,null,2)+'\n');
const entry=join(output,'entry.mjs'),helper=join(output,'helper');
await writeFile(entry,`import {ScenarioStore} from ${JSON.stringify(join(repo,'src/storage/store.ts'))};
import {createPerformanceFixture,createMaterialPerformanceFixture} from ${JSON.stringify(join(repo,'src/testing/performanceFixture.ts'))};
import {sha256,jsonBytes} from ${JSON.stringify(join(repo,'src/storage/json.ts'))};
globalThis.seedResource=async(size)=>{const f=size==='large'?await createMaterialPerformanceFixture('large-material-rb10-v1'):await createPerformanceFixture('standard-r06-v1');const s=new ScenarioStore();if((await s.listProjectsForEditing()).length)throw Error('Expected empty native fixture area');const p=(await s.saveProject(f.project,{reason:'補助heap観測fixture',includeHistory:false,assets:f.assets??[]})).project;s.close();localStorage.setItem('scenario-last-project:guest',p.projectId);return {projectId:p.projectId,title:p.name,seed:f.seed,sha256:f.sha256,counts:f.counts,assetBytes:f.assetBytes,storedCurrentHash:await sha256(jsonBytes({...p,history:[]})),assets:(f.assets??[]).map(a=>({hash:a.contentHash,bytes:a.bytes.length}))};};
globalThis.verifyResource=async(f)=>{const s=new ScenarioStore(),p=await s.getProjectForEditing(f.projectId),assets=[];for(const a of f.assets){const b=await s.getAsset(a.hash);assets.push({hash:a.hash,bytes:b?.length,verified:!!b&&b.length===a.bytes&&await sha256(b)===a.hash});}s.close();return {currentHash:await sha256(jsonBytes({...p,history:[]})),records:p.entities.length+p.relations.length,revision:p.revision,assets};};`);
await build({configFile:false,root:repo,base:'/__resource/',logLevel:'error',build:{target:'es2022',outDir:helper,lib:{entry,formats:['es'],fileName:()=> 'entry.js'}}});
result.helperFiles=await files(helper);result.entrySHA256=sha(await readFile(entry));await save();
let server,browser;
try{
 const {createServer}=await import('node:http');
 server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/__resource/'){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><script type="module" src="entry.js"></script>');return;}
   let root,relative;
   if(path.startsWith('/__resource/')){root=helper;relative=path.slice('/__resource/'.length);}
   else if(path.startsWith(buildInfo.base)){root=join(repo,'dist');relative=path.slice(buildInfo.base.length)||'index.html';}
   else{res.writeHead(404).end();return;}
   const target=resolve(root,relative);assert.ok(target.startsWith(root+'/'));
   res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.svg':'image/svg+xml'})[extname(target)]??'application/octet-stream');res.end(await readFile(target));
  }catch{res.writeHead(404).end();}
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});result.environment.browser=browser.version();
 for(const size of ['standard','large'])for(let sample=0;sample<3;sample++){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  try{
   const page=await context.newPage();page.setDefaultTimeout(600000);page.on('pageerror',e=>result.errors.push({size,sample,message:e.message}));
   await page.goto(origin+'/__resource/');await page.waitForFunction(()=>typeof seedResource==='function');
   const fixture=await page.evaluate(size=>seedResource(size),size);
   const recorded={size,sample,fixture,observations:[],status:'running'};result.samples.push(recorded);await save();
   await page.goto(origin+buildInfo.base);await page.locator('.app-shell').waitFor();
   await page.locator('.sidebar').getByRole('button',{name:/^資料/}).first().click();await page.locator('.entity-card').first().click();
   const input=page.getByLabel('名前',{exact:true});assert.equal(await input.isEditable(),true);
   const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
   const collect=async label=>{
    await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');
    const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(r=>[r.name,r.value]));
    assert.ok(Number.isFinite(metrics.JSHeapUsedSize)&&metrics.JSHeapUsedSize>0);
    assert.ok(Number.isFinite(metrics.JSHeapTotalSize)&&metrics.JSHeapTotalSize>=metrics.JSHeapUsedSize);
    return {label,at:new Date().toISOString(),metrics,dom:await cdp.send('Memory.getDOMCounters')};
   };
   const observations=recorded.observations;observations.push(await collect('selected-editable-initial'));await save();
   await page.locator('.sidebar').getByRole('button',{name:/^検索/}).first().click();
   await page.locator('.search-page .kind-select').selectOption('scene');await page.getByLabel('情報の状態で絞り込む',{exact:true}).selectOption('provisional');
   for(let i=0;i<10;i++){
    const query='場面'+((size==='large'?4800:480)+i);await page.getByLabel('作品内を検索',{exact:true}).fill(query);
    await page.locator('.entity-card').filter({hasText:query}).first().waitFor();
   }
   observations.push(await collect('after-ten-filtered-searches'));await save();
   await page.locator('.sidebar').getByRole('button',{name:/^資料/}).first().click();await page.locator('.entity-card').first().click();
   assert.equal(await page.getByLabel('名前',{exact:true}).isEditable(),true);
   observations.push(await collect('returned-editable'));await save();
   const native=await page.evaluate(async f=>{await import('/__resource/entry.js');return verifyResource(f);},fixture);
   recorded.native=native;await save();
   assert.equal(native.records,size==='large'?88003:8800);assert.equal(native.revision,'1');assert.ok(native.assets.every(a=>a.verified));
   assert.equal(native.currentHash,fixture.storedCurrentHash,'Read-only UI changed the complete logical content');
   assert.equal(fixture.assetBytes,size==='large'?75497472:0);assert.equal(native.assets.length,size==='large'?3:0);
   assert.deepEqual(native.assets.map(({hash,bytes})=>({hash,bytes})),fixture.assets);
   recorded.status='completed';await save();console.log(size,sample,'heap points retained');
  }finally{await context.close();}
 }
 assert.equal(result.errors.length,0);assert.equal(git('rev-parse','HEAD'),commit);assert.equal(git('status','--porcelain'),'');
 assert.deepEqual(await files(join(repo,'dist')),result.servedFiles);assert.deepEqual(await files(helper),result.helperFiles);
 if(arg('compare')){
  const baselineBytes=await readFile(resolve(arg('compare'))),baseline=JSON.parse(baselineBytes);
  assert.equal(baseline.status,'completed');assert.deepEqual(baseline.errors,[]);assert.equal(baseline.samples.length,6);
  const shape=r=>r.samples.map(({size,sample,fixture})=>({size,sample,seed:fixture.seed,sha256:fixture.sha256,counts:fixture.counts,assetBytes:fixture.assetBytes,assets:fixture.assets}));
  assert.deepEqual(shape(result),shape(baseline),'Resource comparison fixture content differs');
  assert.equal(baseline.environment.browser,result.environment.browser);
  result.comparison={path:resolve(arg('compare')),bytes:baselineBytes.length,sha256:sha(baselineBytes),identicalFixtureAndBrowser:true};
 }
 result.finishedAt=new Date().toISOString();result.status='completed';await save();
}catch(e){result.errors.push({message:e.message,stack:e.stack});result.status='failed';await save();throw e;}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}}
