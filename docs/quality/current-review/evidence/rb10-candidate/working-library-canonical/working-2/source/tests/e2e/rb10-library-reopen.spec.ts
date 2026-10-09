import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createEntity,createProject,newId,textToRichText,validateProject} from '../../src/domain/model';
import type {ProjectData} from '../../src/domain/types';
import {exportScenario,inspectScenario} from '../../src/storage/archive';
import {jsonBytes,sha256} from '../../src/storage/json';

async function nav(page:Page,name:RegExp){
 const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();
 await page.locator('.sidebar').getByRole('button',{name}).first().click();
}
async function fixture(title:string){
 const p=createProject(title),character=createEntity(p.projectId,'character','人物同名'),note=createEntity(p.projectId,'note','参照を保持',{body:textToRichText('😀人物と𠮷野の固定本文')});
 note.data.body[0]!.links=[{start:1,end:3,target:{entityId:character.id}}];p.entities.push(character,note);p.entities.forEach(e=>e.status='confirmed');
 const {history:_history,snapshots:_snapshots,...content}=structuredClone(p);
 p.snapshots.push({id:newId(),createdAt:new Date().toISOString(),versionLabel:'改名前の固定版',contentHash:await sha256(jsonBytes(content)),content});
 expect(validateProject(p)).toMatchObject({ok:true});return {p,character,note};
}
async function importFile(page:Page,bytes:Uint8Array,mode='new'){
 if(await page.locator('.app-shell').isVisible()){await nav(page,/^作品/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();}
 else await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();
 await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({name:'library-reopen.scenario',mimeType:'application/zip',buffer:Buffer.from(bytes)});
 await page.getByLabel('復元方法',{exact:true}).selectOption(mode);await page.getByLabel('復元方法と対象への影響を確認しました').check();
 await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible();
}
async function selectProject(page:Page,title:string){
 const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();
 await page.locator('.project-switch').click();await page.locator('.project-card').filter({has:page.getByText(title,{exact:true})}).click();
 await expect(page.locator('.project-switch')).toContainText(title);await nav(page,/^資料/);await page.getByRole('button',{name:'人物 1',exact:true}).click();await page.locator('.entity-card').click();
}
async function canonicalRows(page:Page){
 return page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('scenario-manager-local-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise<Record<string,unknown[]>>((resolve,reject)=>{const tables=['projects','entities','relations','blocks','snapshots','commands','outbox','recordParts'],tx=db.transaction(tables,'readonly'),rows:Record<string,unknown[]>={};for(const table of tables){const r=tx.objectStore(table).getAll();r.onsuccess=()=>{rows[table]=r.result;};}tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 });
}
async function completeFile(page:Page){
 await nav(page,/^作品/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();return new Uint8Array(await readFile((await (await pending).path())!));
}
function checkEdition(p:ProjectData,expectedName:string){
 expect(validateProject(p)).toMatchObject({ok:true});expect(p).not.toHaveProperty('id');
 const character=p.entities.find(e=>e.kind==='character')!,note=p.entities.find(e=>e.kind==='note')!;
 expect(character.name).toBe(expectedName);expect(note.kind).toBe('note');if(note.kind==='note'){expect(note.data.body[0]!.text).toBe('😀人物と𠮷野の固定本文');expect(note.data.body[0]!.links![0]!.target.entityId).toBe(character.id);}
 expect(p.revision).toBe('1');expect(p.history).toHaveLength(1);expect(p.history[0]!.before.revision).toBe('0');expect(p.history[0]!.after.revision).toBe('1');expect(p.history[0]!.before.entities.find(e=>e.kind==='character')!.name).toBe('人物同名');expect(p.history[0]!.after.entities.find(e=>e.kind==='character')!.name).toBe(expectedName);
 expect(p.snapshots).toHaveLength(1);expect(p.snapshots[0]!.content.entities.find(e=>e.kind==='character')!.name).toBe('人物同名');expect(p.snapshots[0]!.content).not.toHaveProperty('id');
}

test('library selection keeps canonical projects clean and resumes a failed draft across another project, cold reload and empty new/clone restoration',async({page,browser})=>{
 test.setTimeout(120000);const a=await fixture('選び直す作品A'),b=await fixture('選び直す作品B');await page.setViewportSize({width:1440,height:1000});await page.goto('');
 await importFile(page,await exportScenario(a.p));await importFile(page,await exportScenario(b.p));await selectProject(page,a.p.name);const name=page.getByLabel('名前',{exact:true});await expect(name).toHaveValue('人物同名');
 const before=await canonicalRows(page);await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;let armed=true;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(armed&&this.name==='projects'){armed=false;throw new DOMException('synthetic quota','QuotaExceededError');}return put.apply(this,args);};});
 await name.fill('Aの未保存入力😀');await expect(page.getByRole('alert').filter({hasText:/保存できませんでした/})).toBeVisible();await expect(name).toHaveValue('Aの未保存入力😀');expect(await canonicalRows(page)).toEqual(before);
 await selectProject(page,b.p.name);await expect(name).toHaveValue('人物同名');await name.fill('Bの保存後𠮷');await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
 await selectProject(page,a.p.name);await expect(name).toHaveValue('Aの未保存入力😀');await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');await page.reload();await nav(page,/^資料/);await page.locator('.entity-card').click();await expect(name).toHaveValue('Aの未保存入力😀');
 const archive=await completeFile(page),saved=(await inspectScenario(archive,{worker:false})).project;checkEdition(saved,'Aの未保存入力😀');expect(saved.projectId).toBe(a.p.projectId);expect(saved.entities.find(e=>e.kind==='character')!.id).toBe(a.character.id);expect(saved.history).toHaveLength(1);
 await selectProject(page,b.p.name);await expect(name).toHaveValue('Bの保存後𠮷');const savedB=(await inspectScenario(await completeFile(page),{worker:false})).project;checkEdition(savedB,'Bの保存後𠮷');expect(savedB.projectId).toBe(b.p.projectId);expect(savedB.entities.find(e=>e.kind==='character')!.id).toBe(b.character.id);expect(savedB.history).toHaveLength(1);
 for(const mode of ['new','clone']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),fresh=await context.newPage();try{await fresh.goto(page.url());await importFile(fresh,archive,mode);await fresh.reload();const restored=(await inspectScenario(await completeFile(fresh),{worker:false})).project;checkEdition(restored,'Aの未保存入力😀');expect(restored.history).toHaveLength(1);if(mode==='new'){expect(restored.projectId).toBe(a.p.projectId);expect(restored.entities.find(e=>e.kind==='character')!.id).toBe(a.character.id);}else{expect(restored.projectId).not.toBe(a.p.projectId);expect(restored.entities.find(e=>e.kind==='character')!.id).not.toBe(a.character.id);}}finally{await context.close();}
 }
});
