// Controlled source experiment of collection preparation/acquisition only.
// Actual App/native-IDB latency is measured separately by measure-derived-ui.
import {registerHooks} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpus,release,totalmem} from 'node:os';
import assert from 'node:assert/strict';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);throw error;}}});
const {createPerformanceFixture,createMaterialPerformanceFixture}=await import('../../src/testing/performanceFixture.ts');
const {studyFixtureIdentity}=await import('./fixtureIdentity.ts');
const {captureImmutablePlainData}=await import('../../src/domain/immutablePlainData.ts');
const {ProjectDerivedOwner,DerivedIndexBudget}=await import('../../src/domain/derivedIndexes.ts');
const {filterCatalogEntities,createCatalogCollection}=await import('../../src/domain/catalog.ts');
const {startProbe,probeEnabled}=await import('../../src/observability/probe.ts');
const {zipSync}=await import('fflate');
const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i<0?undefined:process.argv[i+1];};
const suite=arg('suite'),output=arg('output')&&resolve(arg('output'));
if(!['standard','large'].includes(suite)||!output)throw Error('Usage: node scripts/optimization/compare-collection-designs.mjs --suite standard|large --output NEW_DIRECTORY');
await mkdir(output);
const git=(...a)=>execFileSync('git',a,{encoding:'utf8',maxBuffer:64*1024*1024}).trimEnd(),sha=bytes=>createHash('sha256').update(bytes).digest('hex'),idsHash=ids=>sha(Buffer.from(JSON.stringify(ids)));
const modes=['full-array','ordinal-A','provider-B'],summarize=values=>{const a=[...values].sort((x,y)=>x-y);return{count:a.length,minimum:a[0],median:a[14],p95:a[28],maximum:a[29]};};
const result={version:1,suite,repetitions:30,status:'running',recordedAt:new Date().toISOString(),sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),productTree:git('rev-parse','HEAD:src'),scope:'Supplemental Node collection preparation/acquisition comparison; not App/DB/formal acceptance',environment:{node:process.version,os:process.platform,release:release(),cpu:cpus()[0]?.model,logicalCPUs:cpus().length,totalMemory:totalmem()},definition:{modes,order:'rotate three modes by repetition; new isolated synthetic owner/budget for every mode/repetition',input:'Exact original fixture captured immutable once outside all intervals; owner is harness-only, not a native store proof',prepare:'OFF includes owner/evaluation preparation, full query or ordered query, and ordinal map where used',read:'OFF one synchronous tail position, page60 and independent hidden selection; full ordered oracle/digest/assertions outside clock',ON:'Separate fresh owner; thirty acquisitions, diagnostics only, no elapsed values',retention:'Logical store budget plus visible row/ordinal container cardinalities, not heap; no DB reduction claim'},observations:[],diagnostics:[],errors:[]};
const persist=()=>writeFile(join(output,'measurements.json'),JSON.stringify(result,null,2)+'\n');
await persist();
try{
 assert.equal(git('status','--porcelain'),'','Seal the source before measuring');
 const paths=git('ls-files','--','src','scripts/optimization','tests/optimization','package.json','package-lock.json').split('\n').filter(Boolean),members={};result.sourceFiles=[];
 const directories=new Set(['']);
 for(const path of paths){const bytes=await readFile(path);assert.equal(sha(bytes),sha(execFileSync('git',['show',`${result.sourceCommit}:${path}`],{maxBuffer:64*1024*1024})));result.sourceFiles.push({path,bytes:bytes.length,sha256:sha(bytes)});members[path]=new Uint8Array(bytes);const parts=path.split('/');parts.pop();while(parts.length){directories.add(parts.join('/'));parts.pop();}}
 result.sourceProof={commit:execFileSync('git',['cat-file','commit',result.sourceCommit],{encoding:'utf8'}),trees:{}};
 for(const directory of directories){const ref=directory?`${result.sourceCommit}:${directory}`:`${result.sourceCommit}^{tree}`;result.sourceProof.trees[git('rev-parse',ref)]=git('ls-tree','-z',ref).split('\0').filter(Boolean).map(line=>{const m=/^(\d+) (blob|tree) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);assert(m);return{mode:m[1],type:m[2],sha:m[3],name:m[4]};});}
 const zip=zipSync(members);await writeFile(join(output,'source.zip'),zip);result.sourceArchive={path:'source.zip',bytes:zip.length,sha256:sha(zip)};
 const fixture=suite==='large'?await createMaterialPerformanceFixture('large-material-rb10-v1'):await createPerformanceFixture('standard-r06-v1');
 result.fixture={seed:fixture.seed,counts:fixture.counts,assetBytes:fixture.assetBytes,...await studyFixtureIdentity(fixture),assets:(fixture.assets??[]).map(a=>({bytes:a.bytes.length,sha256:sha(a.bytes)}))};
 const captured=captureImmutablePlainData(fixture.project);assert(captured.captured);const project=captured.value,expected=project.entities.filter(e=>!e.deletedAt).map(e=>e.id),selectedId=expected.at(-1),hiddenId=expected[0];
 result.expected={count:expected.length,sha256:idsHash(expected),selectedId,selectedIndex:expected.length-1,hiddenId};
 function prepare(mode){
  const budget=new DerivedIndexBudget(),owner=new ProjectDerivedOwner(project,budget,{accountId:null,roleGeneration:0});owner.bind(project);
  let rows,positions,collection;
  if(mode==='provider-B')collection=createCatalogCollection(project,{op:'text',value:''});
  else{rows=filterCatalogEntities(project,{op:'text',value:''});if(mode==='ordinal-A')positions=new Map(rows.map((e,i)=>[e.id,i]));}
  return{owner,budget,rows,positions,collection};
 }
 function read(session){
  if(session.collection){const frame=session.collection.beginRead(),position=frame.positionOf(selectedId);return{position,page:frame.readPage(Math.floor(position/60)*60,60).rows.map(e=>e.id),selected:frame.selected(hiddenId)};}
  const position=session.positions?.get(selectedId)??session.rows.findIndex(e=>e.id===selectedId);
  const selected=session.positions?session.rows[session.positions.get(hiddenId)]:session.rows.find(e=>e.id===hiddenId);
  return{position,page:session.rows.slice(Math.floor(position/60)*60,(Math.floor(position/60)+1)*60).map(e=>e.id),selected:{state:'loaded',row:selected}};
 }
 function verify(session,value){assert.equal(value.position,expected.length-1);assert.deepEqual(value.page,expected.slice(Math.floor(value.position/60)*60));assert.equal(value.selected.state,'loaded');assert.equal(value.selected.row.id,hiddenId);assert.equal(idsHash(session.collection?.ids??session.rows.map(e=>e.id)),result.expected.sha256);}
 for(let repetition=0;repetition<30;repetition++)for(const mode of modes.slice(repetition%3).concat(modes.slice(0,repetition%3))){
  assert.equal(probeEnabled(),false);const started=performance.now(),session=prepare(mode),prepareMilliseconds=performance.now()-started,readStarted=performance.now(),value=read(session),milliseconds=performance.now()-readStarted;
  verify(session,value);const retained=session.budget.snapshot(),containers={fullResultRows:session.rows?.length??0,ordinalEntries:session.positions?.size??session.collection?.ids.length??0,requestedPageRows:value.page.length,selectedRows:1};session.owner.close();
  result.observations.push({repetition,mode,prepareMilliseconds,milliseconds,retained,containers,afterClose:session.budget.snapshot(),orderedOracle:true});await persist();
 }
 for(const mode of modes){const probe=startProbe(),session=prepare(mode);try{for(let n=0;n<30;n++)verify(session,read(session));await probe.settle();result.diagnostics.push({mode,probe:probe.snapshot(),retained:session.budget.snapshot()});}finally{probe.stop();session.owner.close();}}
 result.summary=Object.fromEntries(modes.map(mode=>[mode,{prepare:summarize(result.observations.filter(r=>r.mode===mode).map(r=>r.prepareMilliseconds)),read:summarize(result.observations.filter(r=>r.mode===mode).map(r=>r.milliseconds))}]));
 result.status='ok';result.finishedAt=new Date().toISOString();
}catch(error){result.status='error';result.errors.push({message:error.message,stack:error.stack});process.exitCode=1;}
await persist();console.log(JSON.stringify({status:result.status,summary:result.summary,errors:result.errors}));
