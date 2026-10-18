// Additional original CP05/G05 exceptions with the actual full Large113 file.
// Run only after the separately retained original7200/full recovery finishes.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const repo = '/workspace/pr49-graph-measure-source';
const require = createRequire(join(repo, 'package.json'));
const { chromium } = require('playwright');
const { unzipSync, zipSync } = require('fflate');
const root = '/workspace/pr49-checks/soak7200-1fcadcca-attempt1';
const output = resolve(process.argv[2] ?? '/workspace/pr49-checks/large-negatives-1fcadcca-attempt1/raw.json');
const destination = dirname(output);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (value, message) => { if (!value) throw Error(message); };
const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8'}).trim();
check(!existsSync(output), 'Never overwrite a prior result');
const sourceRaw = await readFile(join(root, 'raw.json'));
const source = JSON.parse(sourceRaw);
const exit = JSON.parse(await readFile(join(root, 'execution/exit.json'), 'utf8'));
const adjudication = JSON.parse(await readFile(join(root, 'ADJUDICATION.json'), 'utf8'));
check(source.status === 'completed' && source.completed && source.fullInputRecoveryCompleted && source.errors.length === 0, 'Original run must have completely finished');
check(source.cleanup.status === 'completed' && source.soak.elapsedSeconds >= 7200, 'Never share resources with the active original run');
check(exit.returncode === 0 && exit.executedWrapperBytesUnchanged && adjudication.actual7200 === 'passed', 'Require actual original child exit and full adjudication');
check(git('rev-parse', 'HEAD') === '1fcadcca703863873a57d297e83b1b184e63e778' && git('status', '--porcelain') === '', 'Immutable clean product required');
check(source.sourceCommit===git('rev-parse','HEAD')&&source.sourceTree===git('rev-parse','HEAD^{tree}')&&source.dirty===false,'Original run must name this exact clean product');
check(adjudication.raw.bytes===sourceRaw.length&&adjudication.raw.sha256===digest(sourceRaw),'Use the exact adjudicated original raw');
check(JSON.stringify(adjudication.product)===JSON.stringify(source.buildInfo),'Original adjudication/build identity differs');
const actual = await readFile(source.completeFile.path);
check(actual.length === source.completeFile.bytes && digest(actual) === source.completeFile.sha256, 'Use actual original complete bytes');
const helperRoot = source.helperRetention.directory;
async function helperFiles(directory, prefix = '') {
  const rows = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const relative = prefix ? prefix + '/' + entry.name : entry.name, path = join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...await helperFiles(path, relative));
    else { const raw = await readFile(path); rows.push({path: relative, bytes: raw.length, sha256: digest(raw)}); }
  }
  return rows.sort((a,b) => a.path.localeCompare(b.path));
}
const beforeHelper = await helperFiles(helperRoot);
check(JSON.stringify(beforeHelper.map(row => ({...row, path: 'large-history-helper/' + row.path}))) === JSON.stringify(source.helperRetention.after.retainedFiles), 'Retained original helper identity differs');
const result = {
  startedAt: new Date().toISOString(), sourceCommit: git('rev-parse','HEAD'), sourceTree: git('rev-parse','HEAD^{tree}'), dirty: false,
  buildInfo: source.buildInfo, status: 'preparing', completed: false, errors: [], stages: [], workerEvents: [], failures: [],
  scope: 'Additional original CP05/G05 full-input exceptions in an empty isolated native destination. Not a new7200 or physical-device certification; original procedures and acceptance limits are unchanged.',
  sourceOriginalRun: {path: join(root,'raw.json'), bytes: sourceRaw.length, sha256: digest(sourceRaw)},
  input: source.completeFile, originalInput: {records: 88003, sourceCommands: 113, sourcePending: 113, assetBytes: 75497472},
  helperRetention: {directory: helperRoot, before: beforeHelper}, failuresExpected: ['final_native_error','final_native_quota'],
};
await mkdir(destination,{recursive:true});
await copyFile(fileURLToPath(import.meta.url), join(destination,'executed-driver.mjs'), 1);
const executedDriverSHA = digest(await readFile(fileURLToPath(import.meta.url)));
const persist = () => writeFile(output, JSON.stringify(result,null,2)+'\n');
const stage = async name => {result.status=name;result.stages.push({name,at:new Date().toISOString()});await persist();console.log('stage',name);};
let server, context, temporary;
try {
  await stage('prepare_same_full_input_negatives');
  const original = unzipSync(actual), names = Object.keys(original).sort();
  check(names.includes('manifest.json') && names.includes('data/project.json'),'Original native paths required');
  result.originalMembers = names.map(path => ({path,bytes:original[path].length,sha256:digest(original[path])}));
  const corrupt = {...original, 'data/project.json': original['data/project.json'].slice()};
  const target = Buffer.from(corrupt['data/project.json']);
  let offset = target.indexOf(Buffer.from('"revision"'));
  check(offset >= 0,'Actual project revision must be present');
  offset = target.indexOf(58,offset)+1;
  while (target[offset] === 32 || target[offset] === 34) offset++;
  check(target[offset] >= 48 && target[offset] <= 57,'Corrupt exactly one actual revision digit');
  const beforeByte = target[offset];target[offset] = beforeByte === 57 ? 48 : beforeByte+1;
  corrupt['data/project.json'] = new Uint8Array(target);
  const manifest = JSON.parse(Buffer.from(original['manifest.json']).toString('utf8'));
  check(manifest.formatVersion === '1.0.0','Do not change the actual native contract');
  const unknown = {...original,'manifest.json':new TextEncoder().encode(JSON.stringify({...manifest,formatVersion:'99.0.0'}))};
  const assets=names.filter(name=>name.startsWith('assets/'));
  check(assets.length===3&&assets.every(name=>original[name].length===25165824),'Keep all actual72MiB materials');
  const lastAsset=assets.at(-1),assetBytes=original[lastAsset].slice(),assetOffset=assetBytes.length-1,assetBefore=assetBytes[assetOffset];assetBytes[assetOffset]^=1;
  const lateAsset={...original,[lastAsset]:assetBytes};
  result.negativeInputs = [];
  for (const [kind,members,changed,reason] of [
    ['hash_mismatch',corrupt,'data/project.json','ハッシュ|hash|一致|破損'],
    ['unknown_major',unknown,'manifest.json','版|未対応|形式'],
    ['last_material_hash_mismatch',lateAsset,lastAsset,'ハッシュ|hash|一致|破損'],
  ]) {
    check(Object.keys(members).sort().join('\n') === names.join('\n'),'Never shrink input members');
    for (const name of names) if(name!==changed) check(Buffer.from(members[name]).equals(Buffer.from(original[name])),'Unrelated original member changed');
    const bytes=zipSync(members,{level:6}), path=join(destination,kind+'.scenario');await writeFile(path,bytes,{flag:'wx'});
    result.negativeInputs.push({kind,path,bytes:bytes.length,sha256:digest(bytes),changedMember:changed,expectedReason:reason,
      unchangedMembers:result.originalMembers.filter(row=>row.path!==changed),...(kind==='hash_mismatch'?{offset,beforeByte,afterByte:target[offset]}:kind==='last_material_hash_mismatch'?{offset:assetOffset,beforeByte:assetBefore,afterByte:assetBytes[assetOffset]}:{oldFormatVersion:'1.0.0',newFormatVersion:'99.0.0'})});
  }
  await stage('start_bound_production_and_original_helper');
  server=createServer(async(request,response)=>{
    try {
      const path=new URL(request.url,'http://localhost').pathname;
      if(path==='/actual-complete.scenario'){response.setHeader('Content-Type','application/zip');response.end(actual);return;}
      if(path==='/__large-history/'){response.setHeader('Content-Type','text/html');response.end('<meta charset="utf-8"><script type="module" src="entry.js"></script>');return;}
      const isHelper=path.startsWith('/__large-history/'), directory=isHelper?helperRoot:join(repo,'dist');
      check(isHelper||path.startsWith(source.buildInfo.base),'Outside bound serving paths');
      const file=resolve(directory,isHelper?path.slice('/__large-history/'.length):path.slice(source.buildInfo.base.length)||'index.html');
      check(file.startsWith(directory+'/'),'Unsafe serving path');
      response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]??'application/octet-stream');response.end(await readFile(file));
    }catch{response.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin='http://127.0.0.1:'+server.address().port;
  temporary=await mkdtemp(join(tmpdir(),'pr49-full-large-negatives-'));
  context=await chromium.launchPersistentContext(join(temporary,'empty-profile'),{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding'],viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{
    const state=globalThis.__finalImportFault={attempts:[],throws:0}, transactions=new WeakMap();
    for(const method of ['add','put']){
      const original=IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method]=function(...args){
        const tx=this.transaction;
        if(tx.mode==='readwrite' && tx.objectStoreNames.contains('importLogs') && tx.objectStoreNames.contains('commands')){
          let record=transactions.get(tx);
          if(!record){record={counters:{},startedAt:performance.now(),state:'writing'};transactions.set(tx,record);tx.addEventListener('abort',()=>{record.state='aborted';record.finishedAt=performance.now();});tx.addEventListener('complete',()=>{record.state='completed';record.finishedAt=performance.now();});}
          record.counters[this.name]=(record.counters[this.name]??0)+1;
          if(this.name==='importLogs' && method==='add' && record.index===undefined){record.index=state.attempts.length;state.attempts.push(record);}
          if(this.name==='importLogs' && method==='add' && state.throws<2){
            record.fault=state.throws===0?'final_native_error':'final_native_quota';state.throws++;
            if(record.fault==='final_native_quota')throw new DOMException('Full Large final import log quota injection','QuotaExceededError');
            throw new Error('Full Large final import log error injection');
          }
        }
        return original.apply(this,args);
      };
    }
  });
  const page=await context.newPage();page.setDefaultTimeout(600000);
  page.on('pageerror',error=>result.errors.push({message:error.message,at:new Date().toISOString()}));
  page.on('worker',worker=>{const record=state=>result.workerEvents.push({state,url:worker.url(),at:new Date().toISOString(),stage:result.status});record('created');worker.on('close',()=>record('closed'));});
  await page.goto(origin+source.buildInfo.base);await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();
  result.environment={browserVersion:context.browser()?.version(),userAgent:await page.evaluate(()=>navigator.userAgent),quota:await page.evaluate(()=>navigator.storage.estimate()),quotaOverride:false,physicalDevice:false};
  const nativeCounts=()=>page.evaluate(async()=>{
    const all=await indexedDB.databases(),matches=[];
    for(const info of all){const db=await new Promise((yes,no)=>{const r=indexedDB.open(info.name);r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error);});
      if(!db.objectStoreNames.contains('projects')||!db.objectStoreNames.contains('recordParts')){db.close();continue;}
      const names=[...db.objectStoreNames],counts=await new Promise((yes,no)=>{const tx=db.transaction(names,'readonly'),out={};for(const name of names){const r=tx.objectStore(name).count();r.onsuccess=()=>out[name]=r.result;}tx.oncomplete=()=>yes(out);tx.onabort=()=>no(tx.error);});db.close();matches.push({database:info.name,counts});}
    if(matches.length!==1)throw Error('One actual application native DB required');return matches[0];
  });
  const critical=['projects','entities','relations','blocks','snapshots','commands','outbox','assets','views','syncMetadata','restorePoints','worlds','importLogs','recoveredPending','syncBases','preparedSync','syncConflicts','syncAckEvidence','retainedSyncRecovery','syncAssetAcks','recordParts'];
  const empty=row=>{for(const name of critical)check(row.counts[name]===0,'Partial native write or nonempty baseline: '+name);};
  result.initial=await nativeCounts();empty(result.initial);
  for(const input of result.negativeInputs){
    await stage('reject_'+input.kind);
    await page.locator('input[type=file][accept*=".scenario"]').setInputFiles(input.path);
    await page.getByRole('alert').filter({hasText:new RegExp(input.expectedReason)}).filter({hasText:input.changedMember}).first().waitFor();
    const observation={kind:input.kind,native:await nativeCounts(),alerts:await page.getByRole('alert').allTextContents()};empty(observation.native);check(observation.alerts.some(text=>text.includes(input.changedMember)),'Actual rejected member path must be explained');input.actualRejection=observation;await persist();
  }
  await stage('load_original_full_Large113_file');
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles(source.completeFile.path);
  await page.locator('.import-preview h3').filter({hasText:'検査済みの作品'}).waitFor();
  await page.getByLabel('復元方法',{exact:true}).selectOption('new');
  for(let index=0;index<2;index++){
    await stage(index===0?'final_native_error':'final_native_quota');
    await page.getByLabel('復元方法と対象への影響を確認しました').check();
    const began=performance.now();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();
    await page.waitForFunction(index=>globalThis.__finalImportFault.attempts[index]?.state==='aborted',index);
    await page.getByRole('button',{name:'この内容で復元する',exact:true}).waitFor({state:'visible'});
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='この内容で復元する'&&!b.disabled));
    const probe=await page.evaluate(()=>globalThis.__finalImportFault),attempt=probe.attempts[index],c=attempt.counters;
    check(c.entities>=68003&&c.relations>=20000&&c.assets===3&&c.commands===113&&c.recoveredPending===113&&c.outbox===1&&c.recordParts>0,'Fault must occur after actual full content/history/pending/asset writes');
    const native=await nativeCounts();empty(native);
    const alerts=await page.getByRole('alert').allTextContents();check(alerts.some(v=>v.trim()),'Visible failure required');if(index===1)check(alerts.some(v=>/容量|空き/.test(v)),'Quota-specific guidance required');
    check(await page.locator('.import-preview h3').filter({hasText:'検査済みの作品'}).count()===1,'Original checked file must remain');
    check(await page.getByLabel('復元方法',{exact:true}).inputValue()==='new','Original restore choice must remain');
    check(!((await page.locator('body').innerText()).includes('検査した作品を端末内に復元しました。保存した版を確認しました。')),'No false saved success');
    const elapsedMs=performance.now()-began;check(elapsedMs<=600000,'Original full import deadline exceeded');
    result.failures.push({attempt,native,alerts,mode:'new',elapsedMs,inputRetained:true,checkedAfterFailure:await page.getByLabel('復元方法と対象への影響を確認しました').isChecked()});await persist();
  }
  await stage('normal_retry_same_full_file');
  await page.getByLabel('復元方法と対象への影響を確認しました').check();const retryBegan=performance.now();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await page.waitForFunction(()=>globalThis.__finalImportFault.attempts[2]?.state==='completed');await page.locator('.app-shell').waitFor();
  result.retryElapsedMs=performance.now()-retryBegan;check(result.retryElapsedMs<=600000,'Original full import deadline exceeded on normal retry');
  result.successfulRetryProbe=await page.evaluate(()=>globalThis.__finalImportFault);
  check(result.successfulRetryProbe.attempts[2]?.state==='completed'&&result.successfulRetryProbe.throws===2,'Actual third transaction must commit');
  await stage('cold_original_full_native_oracle');await page.reload();await page.locator('.app-shell').waitFor();
  result.native=await page.evaluate(async expected=>{await import('/__large-history/entry.js');return inspectNative(expected,'new');},source.expected);
  check(result.errors.length===0,'Unexpected browser page error');
  result.helperRetention.after=await helperFiles(helperRoot);check(JSON.stringify(result.helperRetention.after)===JSON.stringify(beforeHelper),'Original helper bytes changed');
  check(digest(await readFile(source.completeFile.path))===source.completeFile.sha256,'Original input changed');
  check(digest(await readFile(fileURLToPath(import.meta.url)))===executedDriverSHA,'Executed driver changed');
  result.executedDriverSHA256=executedDriverSHA;result.status='passed_same_full_Large_negative_and_retry';result.completed=true;result.finishedAt=new Date().toISOString();await persist();
}catch(error){result.status='failed';result.completed=false;result.errors.push({message:error.message,stack:error.stack,at:new Date().toISOString()});await persist();throw error;}
finally{
  result.cleanup={status:'running',errors:[]};
  try{if(context)await context.close();result.cleanup.browser='closed';}catch(error){result.cleanup.errors.push(String(error));}
  try{if(server){server.closeAllConnections();await new Promise(done=>server.close(done));}result.cleanup.server='closed';}catch(error){result.cleanup.errors.push(String(error));}
  try{if(temporary)await rm(temporary,{recursive:true,force:true});result.cleanup.temporaryIsolatedProfile='removed_after_recording_native_oracle';}catch(error){result.cleanup.errors.push(String(error));}
  result.cleanup.status=result.cleanup.errors.length?'failed':'completed';if(result.cleanup.errors.length){result.completed=false;result.status='failed_cleanup';process.exitCode=1;}await persist();
}
