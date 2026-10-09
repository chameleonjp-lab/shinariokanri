import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createEntity,createProject,newId,validateProject} from '../../src/domain/model';
import {exportScenario,inspectScenario} from '../../src/storage/archive';

async function nav(page:Page,name:RegExp){const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();await page.locator('.sidebar').getByRole('button',{name}).first().click();}
async function durable(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open('scenario-manager-local-v1');open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
 try{return await new Promise<Record<string,unknown[]>>((resolve,reject)=>{const names=['projects','entities','relations','blocks','commands','outbox','recordParts'],tx=db.transaction(names,'readonly'),rows:Record<string,unknown[]>={};for(const name of names){const read=tx.objectStore(name).getAll();read.onsuccess=()=>{rows[name]=read.result;};}tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 });}
test('Large references can be cancelled and retried while the current editor stays writable, with no partial or stale rows',async({page})=>{
 // Full restore, native cold restart and complete archive are functional checks.
 // Their watchdog is separate from the unchanged measured performance limits.
 test.setTimeout(240000);
 const p=createProject('参照を待たずに編集する'),a=createEntity(p.projectId,'character','索引A'),b=createEntity(p.projectId,'character','索引B');
 p.entities.push(a,b);for(let i=0;i<12000;i++){const note=createEntity(p.projectId,'note',`参照元${i}`,{convertedToIds:[i%2?a.id:b.id],body:[{id:newId(),kind:'paragraph',text:'😀参照はコードポイント位置と出所を保持する。',links:[{start:0,end:1,target:{entityId:a.id}}]}]});p.entities.push(note);}p.entities.forEach(e=>e.status='confirmed');expect(validateProject(p)).toMatchObject({ok:true});
 const before=await test.step('通常UIで12,002件を完全復元し人物一覧を開く',async()=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto('');await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({name:'reference-index.scenario',mimeType:'application/zip',buffer:Buffer.from(await exportScenario(p))});await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible({timeout:60000});await nav(page,/^資料/);await page.getByRole('button',{name:'人物 2',exact:true}).click();return durable(page);
 });
 const name=page.getByLabel('名前',{exact:true});
 await test.step('入力可能なままpointer取消し、未確認を保持する',async()=>{
 await page.locator('.entity-card').filter({has:page.getByRole('heading',{name:'索引A',exact:true})}).click();await expect(name).toBeEnabled();await expect(name).toHaveValue('索引A');await page.getByRole('button',{name:'参照の確認を中止',exact:true}).click();await expect(page.locator('.references-section')).toContainText('参照の確認を中止しました');await expect(page.locator('[data-windowed-list="この情報への参照"]')).toHaveCount(0);expect(await durable(page)).toEqual(before);
 });
 await test.step('明示再試行・別対象・末尾検索で全件一致を確認する',async()=>{
 await page.getByRole('button',{name:'参照の確認を再試行',exact:true}).click();await expect(page.getByRole('navigation',{name:'この情報への参照のページ',exact:true})).toContainText('12000件');await page.locator('.entity-card').filter({has:page.getByRole('heading',{name:'索引B',exact:true})}).click();await expect(name).toHaveValue('索引B');await expect(page.getByRole('navigation',{name:'この情報への参照のページ',exact:true})).toContainText('6000件');await expect(page.locator('[data-windowed-list="この情報への参照"] .reference-link')).toHaveCount(30);await page.getByLabel('この情報への参照を検索',{exact:true}).fill('参照元11998');await expect(page.locator('[data-windowed-list="この情報への参照"]')).toContainText('参照元11998');expect(await durable(page)).toEqual(before);
 });
 await test.step('原子保存を待ち、cold再読込で対象と参照を確認する',async()=>{
 await name.fill('索引Bを原子保存');await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み',{timeout:60000});await expect.poll(()=>durable(page),{timeout:30000}).not.toEqual(before);await page.reload();await nav(page,/^資料/);await page.locator('.entity-card').filter({hasText:'索引Bを原子保存'}).click();await expect(name).toHaveValue('索引Bを原子保存');await expect(page.locator('[data-windowed-list="この情報への参照"]')).toContainText('参照元11998');await expect(page.locator('.reference-index-progress')).toHaveCount(0);
 });
 await test.step('通常完全保存ファイルから全12,000本文と対象名を確認する',async()=>{
 await nav(page,/^作品/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();const restored=(await inspectScenario(new Uint8Array(await readFile((await (await pending).path())!)),{worker:false})).project;expect(restored.entities).toHaveLength(12002);expect(restored.entities.filter(e=>e.kind==='note')).toEqual(p.entities.filter(e=>e.kind==='note'));expect(restored.entities.find(e=>e.id===b.id)?.name).toBe('索引Bを原子保存');expect(restored.entities.find(e=>e.id===a.id)?.name).toBe('索引A');
 });
});
