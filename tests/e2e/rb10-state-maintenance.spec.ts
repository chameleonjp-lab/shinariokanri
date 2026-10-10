import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createEntity,createProject,newId,validateProject} from '../../src/domain/model';
import type {Entity} from '../../src/domain/types';
import {prepareReuse} from '../../src/domain/reuse';
import {exportScenario,inspectScenario,verifySnapshotHashes} from '../../src/storage/archive';
async function nav(page:Page,name:RegExp){const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();await page.locator('.sidebar').getByRole('button',{name}).click();}
async function load(page:Page,bytes:Uint8Array){await page.goto('');await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({name:'state-maintenance.scenario',mimeType:'application/zip',buffer:Buffer.from(bytes)});await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible();}

test('maintenance verifies the original fixed gate without declaring its variable unused after save and cold reload',async({page})=>{
  let project=createProject('固定状態を見直す');
  const y=createEntity(project.projectId,'variable','固定入口のY',{key:'fixed-y',initial:{type:'boolean',value:false},externalUseDeclared:true}),z=createEntity(project.projectId,'variable','未使用のZ',{key:'unused-z',initial:{type:'boolean',value:false},externalUseDeclared:true});
  const source=createEntity(project.projectId,'flow_node','元の固定入口C',{nodeType:'entry',gate:{op:'compare',variableId:y.id,comparator:'eq',value:{type:'boolean',value:false}}}),owner=createEntity(project.projectId,'flow_node','借用入口S',{nodeType:'entry'});
  const end=createEntity(project.projectId,'flow_node','完了',{nodeType:'terminal',terminalReason:'確認完了'}),edge=createEntity(project.projectId,'flow_edge','進む',{fromId:owner.id,toId:end.id}),graph=createEntity(project.projectId,'flow_graph','固定入口の経路',{nodeIds:[owner.id,end.id],edgeIds:[edge.id],entryIds:[owner.id],exitIds:[end.id]});
  project.entities.push(y,z,source,owner,end,edge,graph);project=(await prepareReuse(project,{ownerId:owner.id,sourceId:source.id,mode:'reference'})).candidate;
  (project.entities.find(e=>e.id===source.id) as Entity<'flow_node'>).data.gate={op:'constant',value:true};expect(validateProject(project)).toMatchObject({ok:true});await verifySnapshotHashes([project]);const oldHash=project.snapshots[0]!.contentHash;
  await load(page,await exportScenario(project,{worker:false}));await nav(page,/^検索/);await page.getByRole('tab',{name:'見直しと統合',exact:true}).click();
  const pending=page.locator('.search-page article').filter({hasText:'未判定'});await expect(pending).toHaveCount(0);
  const candidates=page.locator('.search-page article').filter({hasText:'作品外から使う状態として宣言'});await expect(candidates).toHaveCount(1);await expect(candidates).toContainText('未使用のZ');await expect(candidates).not.toContainText('固定入口のY');
  await candidates.getByRole('button',{name:'未使用のZ',exact:true}).click();await page.getByLabel('名前',{exact:true}).fill('未使用のZを保存');await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');await page.getByRole('button',{name:'詳細を閉じる',exact:true}).click();
  await expect(pending).toHaveCount(0);await expect(candidates).toContainText('未使用のZを保存');await expect(candidates).toHaveCount(1);
  await page.reload();await nav(page,/^検索/);await page.getByRole('tab',{name:'見直しと統合',exact:true}).click();await expect(pending).toHaveCount(0);await expect(candidates).toHaveCount(1);await expect(candidates).toContainText('未使用のZを保存');
  await nav(page,/^作品/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();const restored=(await inspectScenario(new Uint8Array(await readFile((await (await download).path())!)),{worker:false})).project;
  await verifySnapshotHashes([restored]);expect(restored.snapshots[0]!.contentHash).toBe(oldHash);expect(restored.entities.find(e=>e.id===z.id)?.name).toBe('未使用のZを保存');expect(restored.entities.find(e=>e.id===y.id)).toEqual(y);expect(restored.snapshots).toEqual(project.snapshots);
});

test('merge choices bound their DOM and retain selected IDs and the chosen page through tabs and cancellation',async({page})=>{
  const project=createProject('全件選択を分割する');project.entities=Array.from({length:125},(_,index)=>createEntity(project.projectId,'note',`統合資料${String(index+1).padStart(3,'0')}`,{body:[{id:newId(),kind:'paragraph',text:`😀元本文${index+1}`}]}));expect(validateProject(project)).toMatchObject({ok:true});
  await load(page,await exportScenario(project,{worker:false}));await nav(page,/^検索/);await page.getByRole('tab',{name:'見直しと統合',exact:true}).click();
  const source=page.getByLabel('統合する情報',{exact:true}),target=page.getByLabel('統合後に残す情報',{exact:true}),pager=page.getByRole('navigation',{name:'統合する情報のページ',exact:true});
  expect(await source.locator('option').count()).toBeLessThanOrEqual(62);await pager.getByRole('button',{name:'次のページ',exact:true}).click();await source.selectOption(project.entities[65]!.id);
  await page.getByLabel('統合後に残す情報を検索',{exact:true}).fill('統合資料125');await target.selectOption(project.entities[124]!.id);await page.getByLabel('統合後に残す情報を検索',{exact:true}).fill('');
  expect(await target.locator('option').count()).toBeLessThanOrEqual(62);await pager.getByRole('button',{name:'前のページ',exact:true}).click();await expect(pager).toContainText('1 / 3');await expect(source).toHaveValue(project.entities[65]!.id);
  await page.getByRole('tab',{name:'複合検索・一覧',exact:true}).click();await page.getByRole('tab',{name:'見直しと統合',exact:true}).click();await expect(source).toHaveValue(project.entities[65]!.id);await expect(target).toHaveValue(project.entities[124]!.id);await expect(pager).toContainText('1 / 3');
  await page.getByRole('button',{name:'統合差分を確認',exact:true}).click();await expect(page.getByRole('dialog',{name:'変更差分の確認',exact:true})).toContainText(project.entities[124]!.id);await page.getByRole('button',{name:'中止',exact:true}).click();await expect(source).toHaveValue(project.entities[65]!.id);await expect(target).toHaveValue(project.entities[124]!.id);
  await nav(page,/^作品/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();const restored=(await inspectScenario(new Uint8Array(await readFile((await (await download).path())!)),{worker:false})).project;expect(restored.entities).toEqual(project.entities);
});
