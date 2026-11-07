import {expect,test} from '@playwright/test';
import {createWorldSnapshot} from '../../src/domain/world';
import {createEntity,createProject,textToRichText} from '../../src/domain/model';
import {exportScenario} from '../../src/storage/archive';
import {seed} from './ap04-original-helpers';

test('selected local works distinguish same-name people and open the exact work revision',async({page})=>{
  test.setTimeout(120_000);page.setDefaultTimeout(15_000);
  await page.addInitScript(()=>{for(const key of ['scenario-last-project:guest','scenario-last-project','scenario-opening-project:guest'])localStorage.removeItem(key);});
  const a=createProject('同名の作品'),b=createProject('同名の作品'),excluded=createProject('除外した作品');
  const personA=createEntity(a.projectId,'character','光'),personB=createEntity(b.projectId,'character','光');
  a.entities=[personA];b.entities=[personB];excluded.entities=[createEntity(excluded.projectId,'character','秘密候補')];
  for(const work of [a,b,excluded]){
    await seed(page,await exportScenario(work));
    await page.evaluate(()=>{localStorage.removeItem('scenario-last-project:guest');localStorage.removeItem('scenario-last-project');});
  }
  await page.goto('./');
  const panel=page.getByRole('region',{name:'作品をまたいで検索'});
  await expect(panel).toBeVisible();
  await panel.getByRole('checkbox',{name:new RegExp(a.projectId)}).check();
  await panel.getByRole('checkbox',{name:new RegExp(b.projectId)}).check();
  await panel.getByRole('searchbox',{name:'作品をまたぐ検索語'}).fill('光');
  await panel.getByRole('button',{name:'選んだ作品を検索',exact:true}).click();
  await expect(panel.getByRole('status')).toContainText('2件');
  const results=panel.getByRole('list',{name:'作品をまたぐ検索結果'});
  await expect(results).not.toContainText('秘密候補');
  await expect(results.locator('li')).toHaveCount(2);
  await panel.getByRole('checkbox',{name:new RegExp(a.projectId)}).uncheck();
  await expect(results).toHaveCount(0);
  await panel.getByRole('button',{name:'選んだ作品を検索',exact:true}).click();
  await expect(panel.getByRole('status')).toContainText('1件');
  const target=results.locator('li').filter({hasText:b.projectId});
  await expect(target).toContainText(personB.id);
  await target.getByRole('button',{name:'この稿の情報を開く'}).click();
  await expect(page.locator('.detail-panel')).toBeVisible();
  const meta=page.locator('.detail-panel details').filter({has:page.locator('summary').filter({hasText:'IDと履歴情報'})});
  await meta.locator('summary').click();
  await expect(meta).toContainText(personB.id);await expect(meta).not.toContainText(personA.id);
  await page.evaluate(()=>{localStorage.removeItem('scenario-last-project:guest');localStorage.removeItem('scenario-last-project');});
  await page.goto('./');
  await expect(panel.getByRole('checkbox',{checked:true})).toHaveCount(0);
  await expect(panel.getByRole('list',{name:'作品をまたぐ検索結果'})).toHaveCount(0);
  await page.setViewportSize({width:402,height:700});
  await expect(panel).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const choice=panel.getByRole('checkbox',{name:new RegExp(b.projectId)});await choice.focus();await page.keyboard.press('Space');await expect(choice).toBeChecked();
  const targetSize=await choice.locator('..').boundingBox();expect(targetSize?.height).toBeGreaterThanOrEqual(48);
  await page.evaluate(()=>{document.documentElement.style.fontSize='125%';});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.setViewportSize({width:700,height:402});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('fixed world search opens each selected work’s exact old or revised edition at mobile width',async({page})=>{
 test.setTimeout(120_000);page.setDefaultTimeout(15_000);await page.setViewportSize({width:402,height:700});
 await page.addInitScript(()=>{for(const key of ['scenario-last-project:guest','scenario-last-project','scenario-opening-project:guest'])localStorage.removeItem(key);});
 let world=createProject('同名世界');const person=createEntity(world.projectId,'character','光',{summary:textToRichText('古い世界だけの文章')});world.entities=[person];world=await createWorldSnapshot(world,'初稿');const old=world.snapshots[0];
 world.entities=[{...person,data:{...person.data,summary:textToRichText('新しい世界だけの文章')}}];world=await createWorldSnapshot(world,'改稿');const revised=world.snapshots[1];
 const works=[createProject('同名作品'),createProject('同名作品')];
 for(const [index,work]of works.entries()){const snapshot=index===0?old:revised;work.worldReferences=[{projectId:world.projectId,immutableSnapshotId:snapshot.id,contentHash:snapshot.contentHash}];await seed(page,await exportScenario(work,{worlds:{[snapshot.id]:world}}));}
 for(const [index,work]of works.entries()){
   await page.goto('./');const panel=page.getByRole('region',{name:'作品をまたいで検索'});
   for(const selected of works)await panel.getByRole('checkbox',{name:new RegExp(selected.projectId)}).check();
   await panel.getByRole('searchbox',{name:'作品をまたぐ検索語'}).fill('光');await panel.getByRole('button',{name:'選んだ作品を検索',exact:true}).click();
   await expect(panel.getByRole('status')).toContainText('2件');
   const target=panel.getByRole('listitem').filter({hasText:work.projectId});
   await expect(target).toContainText(index===0?old.id:revised.id);
   await target.getByRole('button',{name:'この稿の情報を開く'}).click();
   const preview=page.getByRole('dialog',{name:'固定版の参照先',exact:true});await expect(preview).toContainText(index===0?'古い世界だけの文章':'新しい世界だけの文章');
   await expect(preview).not.toContainText(index===0?'新しい世界だけの文章':'古い世界だけの文章');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
});
