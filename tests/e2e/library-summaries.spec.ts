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

test('editable world choices include fixed editions retained only in the registry',async({page})=>{
 const world=createProject('編集できる共通世界');world.entities=[createEntity(world.projectId,'place','両版の城')];const first=await createWorldSnapshot(world,'編集作品の第一版'),second=await createWorldSnapshot(first,'レジストリだけの第二版');
 const carrier=createProject('第二版を運ぶ作品'),independent=createProject('独立した選択先');carrier.worldReferences=[{projectId:world.projectId,immutableSnapshotId:second.snapshots[1].id,contentHash:second.snapshots[1].contentHash}];
 await page.goto('./');await importWork(page,first);await importWork(page,carrier,{[second.snapshots[1].id]:second});await importWork(page,independent);await page.locator('.project-card').filter({hasText:independent.name}).click();await page.reload();await expect(page.locator('.project-switch')).toContainText(independent.name);
 await page.locator('.sidebar').getByRole('button',{name:/^年表/}).click();await page.getByRole('tab',{name:'世界・地図・履歴',exact:true}).click();await page.getByRole('tab',{name:'共通世界の固定版',exact:true}).click();await page.getByLabel('参照する共通世界',{exact:true}).selectOption(world.projectId);
 await expect(page.getByLabel('固定する共通世界版',{exact:true}).locator('option').filter({hasText:'レジストリだけの第二版'})).toHaveAttribute('value',second.snapshots[1].id);await page.getByLabel('固定する共通世界版',{exact:true}).selectOption(second.snapshots[1].id);
 await page.getByRole('checkbox',{name:'両版の城',exact:true}).check();await page.getByRole('button',{name:'適用前の差分・影響を確認',exact:true}).click();await page.getByRole('button',{name:'確認した固定版・採用設定を保存',exact:true}).click();await expect(page.getByText('参照版：レジストリだけの第二版',{exact:true})).toBeVisible();
});

test('a late pin completion cannot replace the newly selected work world registry',async({page})=>{
 const qa=createProject('Bだけの共通世界');qa.entities=[createEntity(qa.projectId,'place','Bの城')];const pair=[await createWorldSnapshot(qa,'保持された版一'),await createWorldSnapshot(createProject('別の共通世界'),'保持された版二')].sort((left,right)=>left.snapshots[0].id.localeCompare(right.snapshots[0].id)),[w,q]=pair;
 const a=createProject('遅延保存A'),b=createProject('切替後B');b.worldReferences=[{projectId:q.projectId,immutableSnapshotId:q.snapshots[0].id,contentHash:q.snapshots[0].contentHash}];
 await page.goto('./');await importWork(page,w);await importWork(page,b,{[q.snapshots[0].id]:q});await importWork(page,a);await page.locator('.project-card').filter({hasText:a.name}).click();
 const versions=async()=>{await page.locator('.sidebar').getByRole('button',{name:/^年表/}).click();await page.getByRole('tab',{name:'世界・地図・履歴',exact:true}).click();await page.getByRole('tab',{name:'共通世界の固定版',exact:true}).click();};await versions();await page.getByLabel('参照する共通世界',{exact:true}).selectOption(w.projectId);await page.getByLabel('固定する共通世界版',{exact:true}).selectOption(w.snapshots[0].id);
 await page.getByRole('button',{name:'適用前の差分・影響を確認',exact:true}).click();
 await page.evaluate(()=>{const original=crypto.subtle.digest.bind(crypto.subtle),state={entered:false,release:()=>{}};(window as unknown as {pinGate:typeof state}).pinGate=state;const held=new Promise<void>(resolve=>state.release=resolve);crypto.subtle.digest=async(...args)=>{if(!state.entered){state.entered=true;await held;}return original(...args);};});
 await page.getByRole('button',{name:'確認した固定版・採用設定を保存',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as unknown as {pinGate:{entered:boolean}}).pinGate.entered)).toBe(true);
 // Deliver the normal navigation button's event while the pin's async modal is pending.
 await page.locator('.project-switch').evaluate(button=>(button as HTMLButtonElement).click());await page.locator('.project-card').filter({hasText:b.name}).click();await expect(page.locator('.project-switch')).toContainText(b.name);await versions();await expect(page.getByText(`参照版：${q.snapshots[0].versionLabel}`,{exact:true})).toBeVisible();
 await page.evaluate(()=>(window as unknown as {pinGate:{release:()=>void}}).pinGate.release());await expect(page.getByText('作品の保存を検査しています…',{exact:false})).toHaveCount(0);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await expect(page.getByText(`参照版：${q.snapshots[0].versionLabel}`,{exact:true})).toBeVisible();await expect(page.locator('.project-switch')).toContainText(b.name);
});

test('an unrelated identified corrupt registry row does not hide an editable world own edition',async({page})=>{
 const raw=createProject('健全な編集世界');raw.entities=[createEntity(raw.projectId,'place','健全な世界の城')];const world=await createWorldSnapshot(raw,'編集世界自身の版'),work=createProject('独立した採用作品'),bad=await createWorldSnapshot(createProject('無関係な破損世界'),'破損世界の版');
 await page.goto('./');await importWork(page,world);await importWork(page,work);await page.evaluate(async bad=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('scenario-manager-local-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});await new Promise<void>((resolve,reject)=>{const tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').put({id:bad.snapshots[0].id,project:{...bad,schemaVersion:'999.0'}});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();},bad);
 await page.reload();await expect(page.locator('.project-switch')).toContainText(work.name);await page.locator('.sidebar').getByRole('button',{name:/^年表/}).click();await page.getByRole('tab',{name:'世界・地図・履歴',exact:true}).click();await page.getByRole('tab',{name:'共通世界の固定版',exact:true}).click();await page.getByLabel('参照する共通世界',{exact:true}).selectOption(world.projectId);
 await expect(page.getByLabel('固定する共通世界版',{exact:true}).locator('option').filter({hasText:'編集世界自身の版'})).toHaveAttribute('value',world.snapshots[0].id);await page.getByLabel('固定する共通世界版',{exact:true}).selectOption(world.snapshots[0].id);await page.getByRole('checkbox',{name:'健全な世界の城',exact:true}).check();await page.getByRole('button',{name:'適用前の差分・影響を確認',exact:true}).click();await page.getByRole('button',{name:'確認した固定版・採用設定を保存',exact:true}).click();await expect(page.getByText('参照版：編集世界自身の版',{exact:true})).toBeVisible();
});
