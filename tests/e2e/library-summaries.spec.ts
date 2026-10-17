import {expect,test,type Page} from '@playwright/test';
import {createProject,createEntity} from '../../src/domain/model';
import {forkAuthorAlternative} from '../../src/domain/writingWorkspace';
import {sealAuthorAlternative} from '../../src/domain/authorAlternativeIntegrity';
import {createWorldSnapshot} from '../../src/domain/world';
import {exportScenario} from '../../src/storage/archive';
import type {ProjectData} from '../../src/domain/types';

async function importWork(page:Page,project:ProjectData,worlds?:Record<string,ProjectData>){
 await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'summary.scenario',mimeType:'application/zip',buffer:Buffer.from(await exportScenario(project,{worlds}))});
 await page.getByLabel('復元方法と対象への影響を確認しました').check();
 await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();
 await expect(page.locator('.project-switch')).toContainText(project.name);
 await page.locator('.project-switch').click();
}
async function search(page:Page,name:string){
 await page.locator('.sidebar').getByRole('button',{name:/^検索/}).click();
 await page.getByLabel('作品内を検索').fill(name);
 await page.locator('.entity-card').filter({hasText:name}).first().click();
}
test('cold library isolates a corrupt work and preserves selected save, all restore targets and all world sources',async({page})=>{
 const a=createProject('選択して編集A'),b=createProject('未選択の復元対象B'),bad=createProject('壊れた未選択作品');
 a.entities=[createEntity(a.projectId,'note','Aのメモ')];b.entities=[createEntity(b.projectId,'note','Bの対応先')];
 const rawWorld=createProject('未選択の世界C');rawWorld.entities=[createEntity(rawWorld.projectId,'place','固定世界の城')];const world=await createWorldSnapshot(rawWorld,'世界第一版');
 await page.goto('./');for(const work of [a,b,bad,world])await importWork(page,work);
 await page.evaluate(async(id)=>{
  localStorage.removeItem('scenario-last-project:guest');localStorage.removeItem('scenario-last-project');
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('scenario-manager-local-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('projects','readwrite'),table=tx.objectStore('projects'),r=table.get(id);r.onsuccess=()=>table.put({...r.result,schemaVersion:'999.0'});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
 },bad.projectId);
 await page.reload();await expect(page.locator('.project-card')).toHaveCount(4);
 await expect(page.locator('.project-card').filter({hasText:bad.name})).toContainText('読み込みエラー');
 await page.locator('.project-card').filter({hasText:a.name}).click();await search(page,'Aのメモ');
 await page.getByLabel('名前',{exact:true}).fill('Aの保存済みメモ');await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
 await page.locator('.project-switch').click();await page.locator('.project-card').filter({hasText:b.name}).click();await search(page,'Bの対応先');await expect(page.getByLabel('名前',{exact:true})).toHaveValue('Bの対応先');
 await page.locator('.sidebar').getByRole('button',{name:/^年表/}).click();await page.getByRole('tab',{name:'世界・地図・履歴',exact:true}).click();await page.getByRole('tab',{name:'共通世界の固定版',exact:true}).click();
 await page.getByLabel('参照する共通世界',{exact:true}).selectOption(world.projectId);await page.getByLabel('固定する共通世界版',{exact:true}).selectOption(world.snapshots[0].id);
 await page.getByRole('checkbox',{name:'固定世界の城',exact:true}).check();await page.getByRole('button',{name:'適用前の差分・影響を確認',exact:true}).click();await page.getByRole('button',{name:'確認した固定版・採用設定を保存',exact:true}).click();await expect(page.getByText('参照版：世界第一版',{exact:true})).toBeVisible();
 await page.locator('.sidebar').getByRole('button',{name:/^作品/}).click();await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();
 const incoming=createProject('対応元ファイル');incoming.entities=[createEntity(incoming.projectId,'note','対応元メモ')];
 await page.locator('input[type=file]').setInputFiles({name:'mapping.scenario',mimeType:'application/zip',buffer:Buffer.from(await exportScenario(incoming))});
 await page.getByLabel('復元方法',{exact:true}).selectOption('mapped_merge');await page.getByLabel('復元する対象作品',{exact:true}).selectOption(a.projectId);
 await page.getByRole('button',{name:'全IDへ新しい対応先を用意',exact:true}).click();
 await page.getByRole('button').filter({hasText:`${incoming.entities[0].id} →`}).click();
 await expect(page.getByLabel('既存の同じ種別へ対応',{exact:true}).locator('option').filter({hasText:'Aの保存済みメモ'})).toHaveAttribute('value',a.entities[0].id);
 await page.getByLabel('既存の同じ種別へ対応',{exact:true}).selectOption(a.entities[0].id);
 expect(await page.evaluate(async(id)=>{const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('scenario-manager-local-v1');r.onsuccess=()=>resolve(r.result);});const value=await new Promise<unknown>(resolve=>{const r=db.transaction('projects').objectStore('projects').get(id);r.onsuccess=()=>resolve(r.result.schemaVersion);});db.close();return value;},bad.projectId)).toBe('999.0');
});

test('registry-only imported worlds remain selectable from an unrelated work',async({page})=>{
 const world=createProject('共有された世界だけ');world.entities=[createEntity(world.projectId,'place','共有世界の城')];const fixed=await createWorldSnapshot(world,'保持された世界版');
 const a=createProject('世界を運んだ作品A'),b=createProject('独立した作品B'),c=createProject('先頭の独立作品C');a.projectId='ffffffff-0000-4000-8000-000000000001';c.projectId='00000001-0000-4000-8000-000000000001';a.worldReferences=[{projectId:fixed.projectId,immutableSnapshotId:fixed.snapshots[0].id,contentHash:fixed.snapshots[0].contentHash}];
 await page.goto('./');await importWork(page,c);await importWork(page,a,{[fixed.snapshots[0].id]:fixed});await importWork(page,b);
 await page.locator('.project-card').filter({hasText:b.name}).click();await expect(page.locator('.project-switch')).toContainText(b.name);await page.reload();await expect(page.locator('.project-switch')).toContainText(b.name);await page.locator('.sidebar').getByRole('button',{name:/^年表/}).click();await page.getByRole('tab',{name:'世界・地図・履歴',exact:true}).click();await page.getByRole('tab',{name:'共通世界の固定版',exact:true}).click();
 await expect(page.getByLabel('参照する共通世界',{exact:true}).locator('option').filter({hasText:world.name})).toHaveAttribute('value',world.projectId);
 await page.getByLabel('参照する共通世界',{exact:true}).selectOption(world.projectId);await page.getByLabel('固定する共通世界版',{exact:true}).selectOption(fixed.snapshots[0].id);
 await page.getByRole('checkbox',{name:'共有世界の城',exact:true}).check();await page.getByRole('button',{name:'適用前の差分・影響を確認',exact:true}).click();await page.getByRole('button',{name:'確認した固定版・採用設定を保存',exact:true}).click();await expect(page.getByText('参照版：保持された世界版',{exact:true})).toBeVisible();
});
test('clean and dirty alternative drafts retain their unload meaning after switching works and reloading',async({page})=>{
 const a=createProject('別案を持つ作品A'),b=createProject('切替先B');a.authorAlternatives=[await sealAuthorAlternative(forkAuthorAlternative(a,'保存された別案'))];
 await page.goto('./');await importWork(page,a);await importWork(page,b);
 const warned=()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
 const openA=async()=>{await page.locator('.project-card').filter({hasText:a.name}).click();await page.locator('.sidebar').getByRole('button',{name:/^構成/}).click();await page.getByRole('tab',{name:'作者別案',exact:true}).click();await expect(page.getByLabel('別案の名前',{exact:true})).toHaveValue('保存された別案');};
 await openA();await expect.poll(warned).toBe(false);await page.locator('.project-switch').click();await page.locator('.project-card').filter({hasText:b.name}).click();await expect(page.locator('.project-switch')).toContainText(b.name);await expect.poll(warned).toBe(false);
 await page.reload();await expect(page.locator('.project-switch')).toContainText(b.name);await expect.poll(warned).toBe(false);
 await page.locator('.project-switch').click();await openA();await page.getByLabel('別案の名前',{exact:true}).fill('未保存の別案名');await expect.poll(warned).toBe(true);await page.locator('.project-switch').click();await page.locator('.project-card').filter({hasText:b.name}).click();await expect(page.locator('.project-switch')).toContainText(b.name);await expect.poll(warned).toBe(true);
 await page.reload();await expect(page.locator('.project-switch')).toContainText(b.name);await expect.poll(warned).toBe(true);
});

test('a delayed clean alternative hash cannot suppress newer dirty input',async({page})=>{
 const work=createProject('遅い別案確認');work.authorAlternatives=[await sealAuthorAlternative(forkAuthorAlternative(work,'保存された別案'))];
 await page.goto('./');await importWork(page,work);await page.locator('.project-card').filter({hasText:work.name}).click();await page.locator('.sidebar').getByRole('button',{name:/^構成/}).click();await page.getByRole('tab',{name:'作者別案',exact:true}).click();
 const name=page.getByLabel('別案の名前',{exact:true}),warned=()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
 await expect(name).toHaveValue('保存された別案');await expect.poll(warned).toBe(false);await name.fill('一時変更');await expect.poll(warned).toBe(true);
 await page.evaluate(()=>{const original=crypto.subtle.digest.bind(crypto.subtle);const state={waiting:0,release:()=>{}};(window as unknown as {draftHashGate:typeof state}).draftHashGate=state;const held=new Promise<void>(resolve=>state.release=resolve);crypto.subtle.digest=async(...args)=>{state.waiting++;await held;return original(...args);};});
 await name.fill('保存された別案');await expect.poll(()=>page.evaluate(()=>(window as unknown as {draftHashGate:{waiting:number}}).draftHashGate.waiting)).toBeGreaterThan(0);await expect.poll(warned).toBe(true);
 await name.fill('後から入力した未保存名');await page.evaluate(()=>(window as unknown as {draftHashGate:{release:()=>void}}).draftHashGate.release());await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect.poll(warned).toBe(true);await expect(name).toHaveValue('後から入力した未保存名');
});
