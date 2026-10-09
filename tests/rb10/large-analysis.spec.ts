import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

async function nav(page:Page,name:RegExp){await page.locator('.app-shell').waitFor();const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();await page.locator('.sidebar').getByRole('button',{name}).first().click();}
async function reader(page:Page){await nav(page,/^構成/);await page.getByRole('tab',{name:'試読・検査',exact:true}).click();}
async function scene(page:Page,name:string){await nav(page,/^資料/);await page.getByLabel('情報の種類',{exact:true}).selectOption('scene');await page.locator('.entity-card').filter({has:page.getByRole('heading',{name,exact:true})}).click();}
async function downloadResult(page:Page){const pending=page.waitForEvent('download');await page.getByRole('button',{name:'検査結果を保存',exact:true}).click();const file=await pending;expect(await file.failure()).toBeNull();return JSON.parse(await readFile((await file.path())!,'utf8'));}
async function nativeFingerprint(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open('scenario-manager-local-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 try{
 const names=Array.from(db.objectStoreNames).sort();
  const rows=await new Promise<Record<string,unknown[]>>((resolve,reject)=>{const tx=db.transaction(names,'readonly'),all:Record<string,unknown[]>={};for(const name of names){const q=tx.objectStore(name).getAll();q.onsuccess=()=>{all[name]=q.result;};}tx.oncomplete=()=>resolve(all);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
  const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),v=>v.toString(16).padStart(2,'0')).join('');
  const encoder=new TextEncoder();
  async function normalize(value:unknown):Promise<unknown>{
   if(value instanceof ArrayBuffer)return {binaryType:'ArrayBuffer',bytes:value.byteLength,sha256:await hash(new Uint8Array(value))};
   if(ArrayBuffer.isView(value))return {binaryType:value.constructor.name,bytes:value.byteLength,sha256:await hash(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))};
   if(Array.isArray(value)){const result:unknown[]=[];for(const item of value)result.push(await normalize(item));return result;}
   if(value&&typeof value==='object'){const result:Record<string,unknown>={};for(const key of Object.keys(value).sort())result[key]=await normalize((value as Record<string,unknown>)[key]);return result;}
   return value;
  }
  const out:Record<string,{count:number;sha256:string}>={};
  for(const name of names){const perRow:string[]=[];for(const row of rows[name])perRow.push(await hash(encoder.encode(JSON.stringify(await normalize(row)))));out[name]={count:rows[name].length,sha256:await hash(encoder.encode(JSON.stringify(perRow)))};}
  return out;
 }finally{db.close();}
});}

// Same immutable bytes that failed on C10: all original88,003 records and72MiB,
// plus519 declared records for a256-transition path and an unbounded state loop.
// The functional watchdog covers the whole restore/fingerprint procedure;
// progress, state/transition/time caps and all-table equality stay strict.
test('original Large: responsive cancel, retained unknown result and unfinished input, all native metadata and bytes unchanged',async({page},info)=>{
 test.setTimeout(1_200_000);
 const directory=resolve('tests/fixtures/rb10-large-analysis'),metadata=JSON.parse(await readFile(resolve(directory,'metadata.json'),'utf8')),bytes=await readFile(resolve(directory,metadata.archive));
 expect(bytes.length).toBe(1914098);expect(createHash('sha256').update(bytes).digest('hex')).toBe('1ca2b19dcf4c8464c68a24a1bbe02cd1b1c4be20187ed2cee99d4e541822d0d0');
 expect(metadata.retainedOriginalRecords).toBe(88003);expect(metadata.actualAssetBytes).toBe(72*1024*1024);expect(metadata.finiteLongBranchTransitions).toBe(256);
 await page.goto('./');await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({name:'original-large.scenario',mimeType:'application/zip',buffer:bytes});
 await expect(page.getByRole('heading',{name:/^検査済みの作品/})).toBeVisible({timeout:600_000});await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await page.locator('.app-shell').waitFor({timeout:600_000});
 await scene(page,metadata.sceneName);const advanced=page.locator('details.advanced-details').filter({has:page.getByText('詳細データ・ルビ・本文リンクを編集',{exact:true})});await advanced.locator('summary').click();const input=advanced.getByRole('textbox',{name:'詳細データ',exact:true}),unfinished=(await input.inputValue()).slice(0,-1);await input.fill(unfinished);await expect(page.locator('.editor-save-state')).toContainText('未保存');
 await reader(page);await page.getByLabel('試読の開始点',{exact:true}).selectOption('');
 const declared=await page.getByLabel('試読の開始点',{exact:true}).evaluate(select=>Array.from((select as HTMLSelectElement).options).filter(o=>['原N05無制限探索入口','原N05長い分岐0'].includes(o.text)).map(o=>o.value));expect(declared).toHaveLength(2);
 await expect.poll(()=>page.evaluate(async expected=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open('scenario-manager-local-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise<boolean>((resolve,reject)=>{const q=db.transaction('workspaceInputs','readonly').objectStore('workspaceInputs').get('workspace');q.onsuccess=()=>resolve(Object.values(q.result?.value?.jsonBuffers??{}).some(group=>Object.values(group as Record<string,string>).includes(expected)));q.onerror=()=>reject(q.error);});}finally{db.close();}},unfinished)).toBe(true);
 // Compare the same workspace position, including its durable view state.
 // The navigation itself intentionally saves the selected page and scroll.
 await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);
 const before=await nativeFingerprint(page);expect(before.entities.count+before.relations.count).toBe(88522);expect(before.assets.count).toBe(3);
 await page.evaluate(()=>{
  const probe={startedAt:0,firstPaintAt:0,largestTimerGap:0},button=Array.from(document.querySelectorAll<HTMLButtonElement>('.analysis-section button')).find(b=>b.textContent==='到達性と行き止まりを検査')!;(window as any).__largeAnalysisProbe=probe;
  button.addEventListener('click',()=>{probe.startedAt=performance.now();let previous=probe.startedAt;const timer=setInterval(()=>{const now=performance.now();probe.largestTimerGap=Math.max(probe.largestTimerGap,now-previous);previous=now;},50);(window as any).__stopLargeProbe=()=>clearInterval(timer);const frame=()=>{if(!probe.firstPaintAt){const cancel=Array.from(document.querySelectorAll<HTMLButtonElement>('.analysis-section button')).find(b=>b.textContent==='探索を中止');if(cancel&&cancel.getBoundingClientRect().width&&document.querySelector('.analysis-section [role=status]'))probe.firstPaintAt=performance.now();else requestAnimationFrame(frame);}};requestAnimationFrame(frame);},{once:true});
 });
 await page.getByRole('button',{name:'到達性と行き止まりを検査',exact:true}).click();const cancel=page.getByRole('button',{name:'探索を中止',exact:true});await expect(cancel).toBeVisible({timeout:2000});await page.waitForTimeout(2200);await expect(cancel).toBeEnabled();
 const timing=await page.evaluate(()=>{(window as any).__stopLargeProbe();return (window as any).__largeAnalysisProbe as {startedAt:number;firstPaintAt:number;largestTimerGap:number};});expect(timing.firstPaintAt).toBeGreaterThan(timing.startedAt);expect(timing.firstPaintAt-timing.startedAt).toBeLessThanOrEqual(2000);expect(timing.largestTimerGap).toBeLessThanOrEqual(2000);
 const progress=await page.getByRole('status').filter({hasText:'状態を確認中'}).innerText();await cancel.click();await expect(page.locator('.analysis-result-heading')).toContainText('探索打切り',{timeout:40_000});const first=await downloadResult(page);expect(first.status).toBe('unknown');expect(first.truncated).toBe(true);expect(first.limits).toEqual({maxStates:100000,maxTransitions:10000,maxMs:30000});expect(first.declaredEntryIds).toEqual(expect.arrayContaining(declared));
 await nav(page,/^資料/);await reader(page);await expect(page.locator('.analysis-result-heading')).toContainText('探索打切り');expect(await downloadResult(page)).toEqual(first);
 await scene(page,metadata.sceneName);if(await advanced.getAttribute('open')===null)await advanced.locator('summary').click();await expect(advanced.getByRole('textbox',{name:'詳細データ',exact:true})).toHaveValue(unfinished);
 await reader(page);await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(300);
 const after=await nativeFingerprint(page);
 await info.attach('original-large-analysis-result',{body:Buffer.from(JSON.stringify({fixture:metadata,timing,progress,result:first,nativeBefore:before,nativeAfter:after,actualLayer:'Linux production browser/native IndexedDB',physical:'not_run',actualAuth:'not_run',fullRequirement:'final real7200, full original116 and physical/live gates remain separate'},null,2)),contentType:'application/json'});
 expect(after).toEqual(before);
});
