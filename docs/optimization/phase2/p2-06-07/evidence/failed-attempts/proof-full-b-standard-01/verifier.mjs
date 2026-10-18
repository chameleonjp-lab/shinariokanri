// Independent functional oracle. Node fake-IDB is explicit; native UI evidence
// is separate and must have the identical normalized-current content hash.
import {registerHooks} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {zipSync} from 'fflate';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(`${specifier}.ts`,context);throw error;}}});
const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i<0?undefined:process.argv[i+1];};
const root=resolve(arg('root')??process.cwd()),output=arg('output')&&resolve(arg('output')),uiPath=arg('ui')&&resolve(arg('ui'));
if(!output||!uiPath)throw Error('Usage: node scripts/optimization/verify-derived-results.mjs --output NEW_DIRECTORY --ui MATCHED_UI_JSON [--root ROOT]');
const ui=JSON.parse(await readFile(uiPath,'utf8')),suite=ui.suite,git=(...a)=>execFileSync('git',a,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trimEnd(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const load=name=>import(pathToFileURL(join(root,name)));
await mkdir(output);
const commit=git('rev-parse',ui.sourceCommit);
const result={version:1,scope:'Independent functional full-order oracle with fake IndexedDB; not browser latency or native persistence proof',suite,status:'running',recordedAt:new Date().toISOString(),sourceCommit:commit,sourceTree:git('rev-parse',`${commit}^{tree}`),productTree:git('rev-parse',`${commit}:src`),phases:[],errors:[]};
const persist=()=>writeFile(join(output,'verification.json'),JSON.stringify(result,null,2)+'\n');
let store;
await persist();
try{
 assert.equal(result.sourceCommit,ui.sourceCommit,'Functional/UI literal commit differs');
 const runner=await readFile(new URL(import.meta.url));await writeFile(join(output,'verifier.mjs'),runner);result.runner={path:'verifier.mjs',bytes:runner.length,sha256:sha(runner)};
 const paths=git('ls-tree','-r','--name-only',commit).split('\n').filter(p=>p.startsWith('src/')||p.startsWith('scripts/optimization/')||p.startsWith('tests/optimization/')||['package.json','package-lock.json'].includes(p)),members={},directories=new Set(['']);result.sourceFiles=[];
 for(const path of paths){const bytes=await readFile(join(root,path));assert.equal(sha(bytes),sha(execFileSync('git',['show',`${commit}:${path}`],{cwd:root,maxBuffer:64*1024*1024})));result.sourceFiles.push({path,bytes:bytes.length,sha256:sha(bytes)});members[path]=new Uint8Array(bytes);const parts=path.split('/');parts.pop();while(parts.length){directories.add(parts.join('/'));parts.pop();}}
 result.sourceProof={commit:execFileSync('git',['cat-file','commit',commit],{cwd:root,encoding:'utf8'}),trees:{}};
 for(const dir of directories){const ref=dir?`${commit}:${dir}`:`${commit}^{tree}`;result.sourceProof.trees[git('rev-parse',ref)]=git('ls-tree','-z',ref).split('\0').filter(Boolean).map(line=>{const m=/^(\d+) (blob|tree) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);assert(m);return{mode:m[1],type:m[2],sha:m[3],name:m[4]};});}
 const zip=zipSync(members);await writeFile(join(output,'source.zip'),zip);result.sourceArchive={path:'source.zip',bytes:zip.length,sha256:sha(zip)};
 const {createPerformanceFixture,createMaterialPerformanceFixture}=await load('src/testing/performanceFixture.ts'),{studyFixtureIdentity}=await load('scripts/optimization/fixtureIdentity.ts'),{ScenarioStore}=await load('src/storage/store.ts'),catalog=await load('src/domain/catalog.ts'),{jsonBytes}=await load('src/storage/json.ts');
 const fixture=suite==='large'?await createMaterialPerformanceFixture('large-material-rb10-v1'):await createPerformanceFixture('standard-r06-v1'),assets=fixture.assets??[];
 result.fixture={seed:fixture.seed,counts:fixture.counts,assetBytes:fixture.assetBytes,...await studyFixtureIdentity(fixture),assets:assets.map(a=>({bytes:a.bytes.length,sha256:sha(a.bytes)}))};
 assert.deepEqual(result.fixture,ui.cohorts[0].observations.fixture);
 const options=ui.cohorts[0].observations.options;result.textCodeUnits=options.textCodeUnits??null;
 store=new ScenarioStore({databaseName:`p206-order-proof-${crypto.randomUUID()}`,...(options.textCodeUnits===undefined?{}:{derivedIndexes:{textCodeUnits:options.textCodeUnits}})});
 const NativeDate=Date;
 try{globalThis.Date=new Proxy(NativeDate,{construct(target,args,newTarget){return Reflect.construct(target,args.length?args:['2026-10-05T00:00:00.000Z'],newTarget);}});await store.saveProject(fixture.project,{reason:'P206 unchanged original fixture seed',includeHistory:false,operationId:'a2060000-0000-4000-8000-000000000001',assets});}finally{globalThis.Date=NativeDate;}
 const current=await store.loadEditor(fixture.project.projectId,{immutableView:true});assert(current);const {history:_history,...content}=current;result.normalizedCurrentSHA256=sha(jsonBytes(content));assert.equal(result.normalizedCurrentSHA256,ui.cohorts[0].observations.savedSource.current);
 result.providerSupported=typeof catalog.createCatalogCollection==='function';
 const oracle=structuredClone(fixture.project),textKinds=new Set(['character','event','scene','dialogue_line','foreshadow']);
 const ids=rows=>({count:rows.length,sha256:sha(Buffer.from(JSON.stringify(rows)))});
 const personId=oracle.entities[0].id;
 function expected(query){return oracle.entities.filter(e=>!e.deletedAt&&(query===''||query==='門番'?query===''||e.kind==='character'&&e.name.startsWith('門番'):['霧','霧の','記録'].includes(query)?textKinds.has(e.kind):e.id===personId&&[e.name,...(e.data.aliases??[]).map(a=>a.text)].includes(query))).map(e=>e.id);}
 async function verify(label,project,queries){
  const phase={label,queries:[]};result.phases.push(phase);
  for(const text of queries){
   const expectation=expected(text),full=catalog.filterCatalogEntities(project,{op:'text',value:text}).map(e=>e.id),row={text,expected:ids(expectation),full:ids(full),provider:null};assert.deepEqual(full,expectation);
   if(result.providerSupported){
    const collection=catalog.createCatalogCollection(project,{op:'text',value:text}),frame=collection.beginRead(),ordered=[...frame.ids],pages=[];
    for(let offset=0;offset<ordered.length;offset+=60){const page=frame.readPage(offset,60);assert.equal(page.state,'loaded');assert(page.rows.length<=60);pages.push(...page.rows.map(e=>e.id));}
    assert.deepEqual(ordered,expectation);assert.deepEqual(pages,expectation);
    const membership=new Set(expectation),hidden=project.entities.find(e=>!e.deletedAt&&!membership.has(e.id)),selection=hidden?frame.selected(hidden.id):null;
    if(hidden){assert.equal(frame.positionOf(hidden.id),-1);assert.equal(selection.state,'loaded');assert.equal(selection.row.id,hidden.id);}
    row.provider={ids:ids(ordered),pages:ids(pages),pageSize:60,allPageStates:'loaded',hiddenSelection:hidden?{id:hidden.id,state:selection.state,actualId:selection.row.id}:null};
   }
   phase.queries.push(row);await persist();
  }
 }
 await verify('original',current,['霧','霧の','門番','記録','']);
 let changed=await store.loadEditor(fixture.project.projectId);const person=changed.entities.find(e=>e.id===personId);person.name='計測変更後の人物';person.data.aliases[0].text='追加した独立別名';
 const oraclePerson=oracle.entities.find(e=>e.id===personId);oraclePerson.name=person.name;oraclePerson.data.aliases[0].text=person.data.aliases[0].text;
 const renamed=(await store.saveProject(changed,{reason:'independent rename and alias',includeHistory:false,immutableView:true,operationId:'a2060000-0000-4000-8000-000000001001'})).project;
 await verify('renamed-alias',renamed,['計測変更後の人物','追加した独立別名','記録名0','霧']);
 const archived={...renamed,entities:renamed.entities.map(e=>e.id===personId?{...e,deletedAt:'2026-10-18T00:00:00.000Z',deletionOperationId:'a2060000-0000-4000-8000-000000001002'}:e)};oraclePerson.deletedAt='2026-10-18T00:00:00.000Z';
 const removed=(await store.saveProject(archived,{reason:'independent archive',includeHistory:false,immutableView:true,operationId:'a2060000-0000-4000-8000-000000001003'})).project;
 await verify('archived',removed,['計測変更後の人物','追加した独立別名','霧']);
 store.close();result.afterClose=store.derivedIndexRetention?.()??null;result.status='ok';result.finishedAt=new Date().toISOString();
}catch(error){result.status='error';result.errors.push({message:error.message,stack:error.stack});process.exitCode=1;}
finally{await store?.deleteDatabase();await persist();}
console.log(JSON.stringify({status:result.status,suite,sourceCommit:result.sourceCommit,providerSupported:result.providerSupported,errors:result.errors}));
