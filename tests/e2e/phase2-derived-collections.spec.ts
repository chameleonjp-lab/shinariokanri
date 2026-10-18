import {expect,test} from '@playwright/test';
import {createEntity,createProject,textToRichText,validateProject} from '../../src/domain/model';
import {exportScenario} from '../../src/storage/archive';
import {jsonBytes,sha256} from '../../src/storage/json';
import {seed,navigate,authorFingerprint} from './ap04-original-helpers';

test('derived author search excludes formal IDs and keeps tail pages, hidden selection and cold return position',async({page},info)=>{
  test.setTimeout(120_000); // Additional synthetic UI check; no changed original watchdog or latency threshold.
  const p=createProject('P2-06/07 検索と画面取得'),person=createEntity(p.projectId,'character','参照する人物');
  const goal=createEntity(p.projectId,'goal','正式な目標',{ownerId:person.id,description:textToRichText('扉を開く')});person.data.goals=[goal.id];
  const group=createEntity(p.projectId,'group','作者の分類',{groupType:'category',members:[person.id]});
  const scene=createEntity(p.projectId,'scene','本文中の識別子',{goals:textToRichText('作者が書いた識別子 '+goal.id)});
  p.entities.push(person,goal,group,scene);
  const notes=Array.from({length:125},(_,index)=>createEntity(p.projectId,'note',`項目${index}`,{body:textToRichText(`保存した本文${index}😀`)}));p.entities.push(...notes);
  expect(validateProject(p)).toMatchObject({ok:true});
  const bytes=await exportScenario(p);
  await info.attach('p206-p207-synthetic-input.json',{body:JSON.stringify({scope:'Additional counterexample, not an original acceptance replacement',engine:info.project.name,records:p.entities.length,projectSHA256:await sha256(jsonBytes(p)),archiveBytes:bytes.byteLength,archiveSHA256:await sha256(bytes),personId:person.id,goalId:goal.id,tailId:notes[124]!.id}),contentType:'application/json'});
  await page.setViewportSize({width:1440,height:1000});await seed(page,bytes);await navigate(page,/^検索/);
  const panel=page.locator('.search-page'),query=panel.getByLabel('作品内を検索',{exact:true}),count=panel.locator('.list-heading span');
  const before=await authorFingerprint(page);
  await query.fill(goal.id);await expect(count).toHaveText('1件');await expect(panel.locator('.entity-card h3')).toHaveText('本文中の識別子');
  await query.fill(person.id);await expect(count).toHaveText('0件');await expect(panel.locator('.entity-card')).toHaveCount(0);
  await query.fill('項目');await expect(count).toHaveText('125件');
  await panel.getByRole('button',{name:'表',exact:true}).click();
  const table=panel.getByRole('table',{name:'同じ検索結果の一覧',exact:true}),pager=panel.getByRole('navigation',{name:'検索結果表のページ',exact:true});
  await expect(table.locator('tbody tr')).toHaveCount(60);await pager.getByRole('button',{name:'次のページ',exact:true}).click();await pager.getByRole('button',{name:'次のページ',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(5);await expect(pager).toContainText('3 / 3');
  await table.locator('tbody tr').filter({has:page.getByRole('cell',{name:'項目124',exact:true})}).getByRole('button',{name:'詳細を開く',exact:true}).click();
  const detail=page.locator('.detail-panel');await expect(detail.getByLabel('名前',{exact:true})).toHaveValue('項目124');
  await query.fill('項目0');await expect(table.locator('tbody tr')).toHaveCount(1);await expect(detail.getByLabel('名前',{exact:true})).toHaveValue('項目124');
  await query.fill('項目');await expect(pager).toContainText('3 / 3');await expect(table.locator('tbody tr')).toHaveCount(5);
  await detail.getByRole('button',{name:'詳細を閉じる',exact:true}).click();expect(await authorFingerprint(page)).toBe(before);
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible();await navigate(page,/^検索/);await expect(query).toHaveValue('項目');
  await panel.getByRole('button',{name:'表',exact:true}).click();await expect(pager).toContainText('3 / 3');await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.getByRole('cell',{name:'項目124',exact:true})).toBeVisible();expect(await authorFingerprint(page)).toBe(before);
});
