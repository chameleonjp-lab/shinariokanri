import {expect,test,type Page} from '@playwright/test';
import {readFile} from './downloadEvidence';
import {createEntity,createProject,validateProject} from '../../src/domain/model';
import type {ContentState,ProjectData} from '../../src/domain/types';
import {exportScenario,inspectScenario} from '../../src/storage/archive';
import {jsonBytes,sha256} from '../../src/storage/json';

// Additional valid input; never substitutes for an original acceptance fixture.
// Nine distinct 500000-byte strings exceed the unchanged 8MiB native clone
// estimate while each field remains below the original portable field limit.
const id=(serial:number)=>`a2040000-0000-4000-8000-${serial.toString(16).padStart(12,'0')}`;
function fixture():ProjectData {
 const project=createProject('重い履歴と軽い現在');project.projectId=id(1);
 const {history:_history,...before}=project;
 const entities=Array.from({length:10},(_,index)=>{
  const entity=createEntity(project.projectId,'note',index===9?'小さい照合対象':`過去の長文${index}`);
  entity.id=id(10+index);entity.createdAt=entity.updatedAt='2026-10-17T00:00:00.000Z';
  entity.data.body=[{id:id(30+index),kind:'paragraph',text:index===9?'本文一致の独立期待😀':String(index).repeat(500000)}];return entity;
 });
 const heavy:ContentState={...before,revision:'1',entities},current:ContentState={...before,revision:'2'};
 return {...current,history:[
  {operationId:id(2),projectId:project.projectId,baseRevision:'0',revision:'1',createdAt:'2026-10-17T00:00:01.000Z',reason:'ＡＢＣ重い旧稿',targetIds:entities.map(row=>row.id),before,after:heavy},
  {operationId:id(3),projectId:project.projectId,baseRevision:'1',revision:'2',createdAt:'2026-10-17T00:00:02.000Z',reason:'現在は空の稿',targetIds:entities.map(row=>row.id),before:heavy,after:current},
 ]};
}
async function work(page:Page,tab:string){const menu=page.getByRole('button',{name:'メニューを開く'});if(await menu.isVisible())await menu.click();await page.locator('.sidebar').getByRole('button',{name:/^作品・保存/}).click();await page.getByRole('tab',{name:tab,exact:true}).click();}
async function native(page:Page,projectId:string,corrupt=false){return page.evaluate(async({projectId,corrupt})=>{
 for(const entry of await indexedDB.databases()){
  if(!entry.name)continue;const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(entry.name!);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{
   if(!db.objectStoreNames.contains('commands'))continue;
   const rows=await new Promise<any[]>((resolve,reject)=>{const request=db.transaction('commands').objectStore('commands').getAll();request.onsuccess=()=>resolve(request.result.filter(row=>row.projectId===projectId));request.onerror=()=>reject(request.error);});if(!rows.length)continue;
   const canonical=rows.find(row=>row.__scenarioCommandMetadata?.version===1);
   if(corrupt){if(!canonical)throw Error('No canonical row to corrupt');await new Promise<void>((resolve,reject)=>{const tx=db.transaction('recordParts','readwrite'),store=tx.objectStore('recordParts'),request=store.get(canonical.__scenarioRecordParts.parts[0].key);request.onsuccess=()=>{const part=request.result;part.bytes[0]^=1;store.put(part);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}
   const parts=await new Promise<any[]>((resolve,reject)=>{const request=db.transaction('recordParts').objectStore('recordParts').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');
   return {canonical:canonical?{operationId:canonical.operationId,version:canonical.__scenarioCommandMetadata.version,partCount:canonical.__scenarioRecordParts.parts.length,bodyBytes:canonical.__scenarioRecordParts.parts.reduce((sum:number,part:{bytes:number})=>sum+part.bytes,0)}:null,
    commandsHash:await hash(new TextEncoder().encode(JSON.stringify(rows))),parts:await Promise.all(parts.map(async part=>({key:part.key,bytes:part.bytes.byteLength,sha256:await hash(part.bytes)})))};
  }finally{db.close();}
 }
 throw Error('Fixture database missing');
 },{projectId,corrupt});}

test('canonical heavy history uses real metadata pages and verifies selected/cold full bodies at the production threshold',async({page})=>{
 test.setTimeout(120000); // New 4.5MB history fixture, actual UI import/export, no timing assertion.
 const project=fixture();expect(validateProject(project)).toMatchObject({ok:true});const input=await exportScenario(project),canonicalBytes=jsonBytes(project);
 await test.info().attach('p204-fixture-manifest.json',{body:JSON.stringify({seed:'p204-heavy-history-v1',canonicalBytes:canonicalBytes.byteLength,canonicalSHA256:await sha256(canonicalBytes),archiveBytes:input.byteLength,archiveSHA256:await sha256(input),historicalTextBytes:4500000+new TextEncoder().encode('本文一致の独立期待😀').byteLength,productionPackingThreshold:8*1024*1024,engine:test.info().project.name}),contentType:'application/json'});
 await page.goto('./');await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'p204-heavy-history.scenario',mimeType:'application/zip',buffer:Buffer.from(input)});
 await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeEnabled({timeout:60000});await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();
 await page.getByRole('dialog',{name:'作品ファイルを読み込む',exact:true}).waitFor({state:'hidden',timeout:60000});await expect(page.locator('.project-switch strong')).toHaveText(project.name);
 const stored=await native(page,project.projectId);expect(stored.canonical).toMatchObject({operationId:id(2),version:1});expect(stored.canonical!.bodyBytes).toBeGreaterThan(4500000);
 await work(page,'変更履歴');const panel=page.locator('.history-page');await expect(panel.locator('.history-list > li')).toHaveCount(2);
 await panel.getByLabel('履歴を検索',{exact:true}).fill('abc重い旧稿');await expect(panel.locator('.history-list > li')).toHaveCount(1);await panel.getByRole('button',{name:/ＡＢＣ重い旧稿 · 版 1/}).click();
 await expect(panel.getByLabel('復元する時点',{exact:true})).toHaveValue('after',{timeout:60000});await panel.getByLabel('単体復元する対象',{exact:true}).selectOption(id(19));await panel.getByRole('button',{name:'この情報だけの復元を確認',exact:true}).click();await expect(panel.locator('.restore-preview')).toContainText('本文一致の独立期待😀');
 await page.reload();await expect(page.locator('.project-switch strong')).toHaveText(project.name);await work(page,'完全保存・復元');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();const bytes=new Uint8Array(await readFile((await(await download).path())!)),restored=(await inspectScenario(bytes,{worker:false})).project;
 expect(restored.history).toEqual(project.history);expect(restored.entities).toEqual([]);await test.info().attach('p204-actual-cold-full.scenario',{body:Buffer.from(bytes),contentType:'application/zip'});
 await native(page,project.projectId,true);const corrupted=await native(page,project.projectId);
 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('scenario-history-selection:'))localStorage.removeItem(key);});await page.reload();await expect(page.locator('.project-switch strong')).toHaveText(project.name);await work(page,'変更履歴');
 await expect(panel.locator('.history-list > li')).toHaveCount(2);await panel.getByRole('button',{name:/ＡＢＣ重い旧稿 · 版 1/}).click();await expect(panel.getByRole('alert')).toHaveText('大きな履歴を処理できません。既存データを保持しています。',{timeout:60000});
 await expect(panel.getByRole('region',{name:'履歴の対象版',exact:true})).toHaveCount(0);await expect(panel.locator('.restore-preview')).toHaveCount(0);
 const unexpectedDownloads:string[]=[];page.on('download',download=>unexpectedDownloads.push(download.suggestedFilename()));
 await work(page,'完全保存・復元');await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();await expect(page.locator('.backup-page').getByRole('alert')).toHaveText('大きな履歴を処理できません。既存データを保持しています。',{timeout:60000});expect(unexpectedDownloads).toEqual([]);
 expect(await native(page,project.projectId)).toEqual(corrupted);
});
