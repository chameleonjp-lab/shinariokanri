// Supplemental literal-source actual-App/native-IDB comparison. Local loopback only.
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {release,cpus,totalmem} from 'node:os';
import {pathToFileURL} from 'node:url';
const args=Object.fromEntries(process.argv.slice(2).reduce((rows,value,index,array)=>index%2?rows:[...rows,[value.replace(/^--/,''),array[index+1]]],[]));
const root=resolve(args.root??process.cwd()),suite=args.suite,output=args.output&&resolve(args.output),requested=args.product??'HEAD';
if(!['standard','large'].includes(suite)||!output)throw Error('Usage: node scripts/optimization/measure-derived-ui.mjs --suite standard|large --output NEW_DIRECTORY [--root ROOT --product COMMIT --text-code-units N]');
const overlays=['scripts/optimization/measure-derived-ui.mjs','tests/optimization/derived-measurement-harness.html','tests/optimization/derived-measurement-harness.tsx'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trimEnd();
const gitBytes=(...a)=>execFileSync('git',a,{cwd:root,maxBuffer:64*1024*1024});
const selected=name=>name.startsWith('src/')||name.startsWith('scripts/optimization/')||name.startsWith('tests/optimization/')||['package.json','package-lock.json'].includes(name);
const runtime=name=>name.startsWith('scripts/build/')||name.startsWith('public/')||name.startsWith('examples/browser-game/')||/^tsconfig.*\.json$/.test(name)||name==='vite.config.ts';
async function files(directory,prefix=''){
 const rows=[];for(const entry of await readdir(directory,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())rows.push(...await files(join(directory,entry.name),name+'/'));else{const bytes=await readFile(join(directory,entry.name));rows.push({path:name,bytes:bytes.length,sha256:digest(bytes)});}}
 return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
const summary=values=>{const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,minimum:sorted[0],median:sorted[Math.ceil(values.length*.5)-1],p95:sorted[Math.ceil(values.length*.95)-1],maximum:sorted.at(-1)};};
await mkdir(output); // Never overwrite failed/adverse evidence.
const runId=randomUUID(),distribution=join(output,'dist'),timeout=600000;
const result={version:1,suite,repetitions:30,sequence:['霧','霧の','門番','記録','霧','霧の'],status:'running',recordedAt:new Date().toISOString(),scope:'Supplemental actual-App/native-IDB observations; not formal phase3 acceptance',environment:{node:process.version,os:process.platform,release:release(),arch:process.arch,cpu:cpus()[0]?.model,logicalCPUs:cpus().length,totalMemory:totalmem(),physicalDevice:false},definition:{latency:'OFF: actual capturing input/click event to two animation frames, then assertions/digests/checkpoints excluded. Startup excludes bundle load, seed, Auth.',diagnostics:'Separately seeded ON context; no top-level ON latency. Numeric phase durations are diagnostics only.',queries:'Thirty continuous repetitions of the original six-query sequence; cold first observation is retained, not removed.',navigation:'Thirty alternating previous/selected-page actions after selecting the original tail dialogue; complete order/selection assertions outside the clock.',database:'Actual native browser IndexedDB; complete current validation retained. Page-row counts do not imply partial DB reads.',heap:'CDP JSHeapUsedSize observations only, including React/fixture/IDB renderer costs; no peak/worker/physical/GC acceptance.',watchdog:'600000 ms supplemental watchdog; interruption completion UNKNOWN, never fabricated elapsed',seed:'Only untimed seed Date constructor ISO timestamp fixed at 2026-10-05; native Date.now and all timed operations restored.'},cohorts:[],errors:[],unexpectedRequests:[]};
let pending=Promise.resolve();
const persist=()=>{const bytes=JSON.stringify(result,null,2)+'\n';pending=pending.catch(()=>{}).then(()=>writeFile(join(output,'measurements.json'),bytes));return pending;};
let browser,server;
await persist();
try{
 result.sourceCommit=git('rev-parse',requested);result.sourceTree=git('rev-parse',`${requested}^{tree}`);result.productTree=git('rev-parse',`${requested}:src`);result.checkoutHead=git('rev-parse','HEAD');result.workingStatus=git('status','--porcelain');
 const tracked=git('ls-tree','-r','--name-only',result.sourceCommit).split('\n'),sourcePaths=tracked.filter(selected),runtimePaths=tracked.filter(runtime);
 const changes=[...git('diff','--name-only','HEAD').split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')].filter(Boolean);
 if(changes.some(name=>!overlays.includes(name)))throw Error(`Unexpected working change: ${changes.join(',')}`);
 const {zipSync}=await import('fflate');
 async function archive(paths,name){const records=[],members={};for(const path of paths){const bytes=gitBytes('show',`${result.sourceCommit}:${path}`),actual=await readFile(join(root,path));if(digest(bytes)!==digest(actual))throw Error(`Literal source mismatch: ${path}`);records.push({path,bytes:bytes.length,sha256:digest(bytes)});members[path]=new Uint8Array(bytes);}const bytes=zipSync(members);await writeFile(join(output,name),bytes);return{records,zip:{path:name,bytes:bytes.length,sha256:digest(bytes)}};}
 const source=await archive(sourcePaths,'source.zip'),extra=await archive(runtimePaths,'runtime-source.zip');result.sourceFiles=source.records;result.sourceArchive=source.zip;result.runtimeFiles=extra.records;result.runtimeArchive=extra.zip;
 result.sourceProof={commit:gitBytes('cat-file','commit',result.sourceCommit).toString(),trees:{}};
 const directories=new Set(['']);for(const path of [...sourcePaths,...runtimePaths]){const pieces=path.split('/');pieces.pop();while(pieces.length){directories.add(pieces.join('/'));pieces.pop();}}
 for(const directory of directories){const ref=directory?`${result.sourceCommit}:${directory}`:`${result.sourceCommit}^{tree}`,sha=git('rev-parse',ref);result.sourceProof.trees[sha]=gitBytes('ls-tree','-z',ref).toString().split('\0').filter(Boolean).map(line=>{const match=/^(\d+) (blob|tree) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);if(!match)throw Error('Unsupported Git tree');return{mode:match[1],type:match[2],sha:match[3],name:match[4]};});}
 const members={};result.overlays=[];for(const path of overlays){const bytes=await readFile(join(root,path));members[path]=new Uint8Array(bytes);result.overlays.push({path,bytes:bytes.length,sha256:digest(bytes)});}const overlayZip=zipSync(members);await writeFile(join(output,'measurement-source.zip'),overlayZip);result.overlayArchive={path:'measurement-source.zip',bytes:overlayZip.length,sha256:digest(overlayZip)};
 await writeFile(join(output,'generator.stdout.log'),execFileSync(process.execPath,['scripts/build/portable-runtime.mjs'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}));
 result.generatedFiles=[];for(const directory of ['src/portable/generated','examples/browser-game/generated','public/examples/browser-game'])for(const row of await files(join(root,directory)))result.generatedFiles.push({...row,path:`${directory}/${row.path}`});
 const {build}=await import('vite');await build({configFile:false,root,base:'/',build:{target:'es2022',outDir:distribution,emptyOutDir:false,rollupOptions:{input:join(root,'tests/optimization/derived-measurement-harness.html')}},logLevel:'warn'});
 const buildMembers={};result.buildFiles=await files(distribution);for(const row of result.buildFiles)buildMembers[row.path]=new Uint8Array(await readFile(join(distribution,row.path)));const buildZip=zipSync(buildMembers);await writeFile(join(output,'actual-build.zip'),buildZip);result.buildArchive={path:'actual-build.zip',bytes:buildZip.length,sha256:digest(buildZip)};
 for(const row of [...result.sourceFiles,...result.runtimeFiles,...result.overlays])if(digest(await readFile(join(root,row.path)))!==row.sha256)throw Error(`Generator/build changed source: ${row.path}`);
 result.literalSourceVerified=true;await persist();
 server=createServer(async(req,res)=>{const path=resolve(distribution,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(distribution+'/')){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',extname(path)==='.js'?'text/javascript':extname(path)==='.css'?'text/css':'text/html');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 const {chromium,expect}=await import('@playwright/test');browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});result.environment.browser=await browser.version();
 const origin=`http://127.0.0.1:${server.address().port}`;
 for(const enabled of [false,true]){
  const options={suite,runId,enabled,...(args['text-code-units']===undefined?{}:{textCodeUnits:Number(args['text-code-units'])})};
  const cohort={enabled,status:'running',startedAt:new Date().toISOString(),heaps:[]};result.cohorts.push(cohort);await persist();
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(timeout);let pageError;
  await context.route('**/*',async route=>{const url=route.request().url();if(url.startsWith(origin+'/'))await route.continue();else{result.unexpectedRequests.push({url,enabled});await route.abort();}});
  page.on('pageerror',error=>{pageError=error;result.errors.push({kind:'pageerror',enabled,message:error.message});});
  await page.exposeFunction('derivedCheckpoint',async value=>{cohort.observations=value;await persist();});
  await page.goto(`${origin}/tests/optimization/derived-measurement-harness.html`);await page.waitForFunction(()=>!!window.derivedMeasurement);
  const session=await context.newCDPSession(page);await session.send('Performance.enable');
  const heap=async label=>{const metrics=await session.send('Performance.getMetrics');cohort.heaps.push({label,JSHeapUsedSize:metrics.metrics.find(row=>row.name==='JSHeapUsedSize')?.value??null});await persist();};
  try{
   const setup=await page.evaluate(o=>window.derivedMeasurement.start(o),options);await page.evaluate(o=>window.derivedMeasurement.coreRead(o),options);await page.evaluate(o=>window.derivedMeasurement.mount(o),options);
   await heap('after-startup');await page.waitForTimeout(400); // Original 200-ms view debounce settles outside every latency interval.
   const input=page.locator('#catalog-search');
   for(let repetition=0;repetition<30;repetition++)for(let queryIndex=0;queryIndex<6;queryIndex++){
    const query=result.sequence[queryIndex];await page.evaluate(v=>window.derivedMeasurement.arm(v.label,v.expectation),{label:`query-${repetition}-${queryIndex}`,expectation:{query,repetition,queryIndex}});await input.fill(query);await page.evaluate(()=>window.derivedMeasurement.done());
   }
   await heap('after-queries');await page.waitForTimeout(400);await page.evaluate(()=>window.derivedMeasurement.verify());
   // Selection and paging are genuine UI actions. Setup is outside nav samples.
   await input.fill(setup.selection.name);await expect(page.locator('.search-page .entity-card h3').filter({hasText:setup.selection.name})).toHaveCount(1);await page.locator('.search-page .entity-card').filter({has:page.locator('h3',{hasText:setup.selection.name})}).click();
   await page.locator('[aria-label="検索結果の表示"]').getByRole('button',{name:'表',exact:true}).click();await input.fill('');
   const pager=page.getByRole('navigation',{name:'検索結果表のページ',exact:true}),selectedPage=Math.floor(setup.selection.index/60);
   await expect(pager.locator('span')).toHaveText(new RegExp(`^${selectedPage+1} / `));await page.waitForTimeout(400);
   for(let repetition=0;repetition<30;repetition++)for(const [action,targetPage] of [['前のページ',selectedPage-1],['選択中の項目のページへ',selectedPage]]){
    await page.evaluate(v=>window.derivedMeasurement.arm(v.label,v.expectation),{label:`navigation-${repetition}-${targetPage}`,expectation:{page:targetPage,repetition}});await pager.getByRole('button',{name:action,exact:true}).click();await page.evaluate(()=>window.derivedMeasurement.done());
   }
   await heap('after-navigation');await page.waitForTimeout(400);await page.evaluate(()=>window.derivedMeasurement.verify());await page.evaluate(o=>window.derivedMeasurement.participant(o),options);
   await page.evaluate(()=>window.derivedMeasurement.closeUI());await heap('after-close');await page.evaluate(o=>window.derivedMeasurement.rename(o),options);
   if(pageError)throw pageError;if(result.unexpectedRequests.length)throw Error('Unexpected nonloopback network request');
   cohort.status='ok';cohort.finishedAt=new Date().toISOString();await persist();
  }finally{await context.close();}
 }
 const off=result.cohorts[0].observations;result.summary={queries:result.sequence.map((_,i)=>summary(off.actions.filter(row=>row.expectation.queryIndex===i).map(row=>row.milliseconds))),navigation:summary(off.actions.filter(row=>row.expectation.page!==undefined).map(row=>row.milliseconds)),participant:summary(off.operations.filter(row=>row.label.startsWith('participant-')).map(row=>row.milliseconds))};
 result.status='ok';result.finishedAt=new Date().toISOString();
}catch(error){result.status='error';result.errors.push({kind:'driver',message:String(error.message??error),stack:error.stack});process.exitCode=1;}
finally{await browser?.close();await new Promise(done=>server?server.close(done):done());await persist();}
console.log(JSON.stringify({status:result.status,output,sourceCommit:result.sourceCommit,suite,summary:result.summary,errors:result.errors}));
