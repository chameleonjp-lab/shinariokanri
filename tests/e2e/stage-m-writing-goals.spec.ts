import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createEntity,createProject,textToRichText} from '../../src/domain/model';
import {exportScenario,inspectScenario} from '../../src/storage/archive';
import {writingGoal} from '../../src/domain/production';

async function nav(page:Page,name:RegExp){await expect(page.locator('.app-shell')).toBeVisible();const menu=page.getByRole('button',{name:'メニューを開く',exact:true});if(await menu.isVisible())await menu.click();await page.locator('.sidebar').getByRole('button',{name}).click();}
async function production(page:Page){await nav(page,/^構成/);await page.getByRole('tab',{name:'制作',exact:true}).click();return page.locator('.writing-goals');}
async function backup(page:Page){await nav(page,/^作品・保存/);await page.getByRole('tab',{name:'完全保存・復元',exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'完全保存ファイルを作成',exact:true}).click();return (await inspectScenario(new Uint8Array(await readFile((await(await download).path())!)),{worker:false})).project;}

test('optional work/chapter/task goals save after quota failure, undo, cold reload and complete export at 402px',async({page})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width:402,height:700});
 const p=createProject('任意目標の旧作品'),s=createEntity(p.projectId,'scene','共通場面',{body:textToRichText('がか\u3099 漢字。'),authorNotes:textToRichText('含まない作者メモ')}),chapter=createEntity(p.projectId,'chapter','第一章',{sceneIds:[s.id]}),task=createEntity(p.projectId,'production_task','章を執筆',{targetIds:[chapter.id],stage:'writing',progress:'todo'});p.entities.push(s,chapter,task);
 await page.goto('./');await page.getByRole('button',{name:'保存ファイルを読み込む',exact:true}).click();await page.locator('input[type=file]').setInputFiles({name:'old-no-goal.scenario',mimeType:'application/zip',buffer:Buffer.from(await exportScenario(p))});await page.getByLabel('復元方法と対象への影響を確認しました').check();await page.getByRole('button',{name:'この内容で復元する',exact:true}).click();await expect(page.locator('.project-switch')).toBeVisible();
 let panel=await production(page);await expect(panel).toContainText('作品で書いた量 7文字');await expect(panel).toContainText('目標 未設定');await expect(panel).toContainText('「が」は2文字');await expect(panel.getByLabel('任意の文字数目標',{exact:true})).toHaveValue('');
 await panel.getByLabel('任意の文字数目標',{exact:true}).fill('10');await panel.getByRole('button',{name:'文字数目標を確認',exact:true}).click();
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;let once=true;IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){if(once&&this.name==='projects'){once=false;throw new DOMException('quota','QuotaExceededError');}return put.apply(this,args);};});
 await panel.getByRole('button',{name:'確認した文字数目標を保存',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('容量');await expect(panel.getByLabel('任意の文字数目標',{exact:true})).toHaveValue('10');await panel.getByRole('button',{name:'確認した文字数目標を保存',exact:true}).click();await expect(panel).toContainText('達成率 70%');
 await panel.getByLabel('文字数目標の対象',{exact:true}).selectOption(chapter.id);await panel.getByLabel('任意の文字数目標',{exact:true}).fill('7');await panel.getByRole('button',{name:'文字数目標を確認',exact:true}).click();await panel.getByRole('button',{name:'確認した文字数目標を保存',exact:true}).click();await expect(panel).toContainText('達成率 100%');
 await panel.getByLabel('文字数目標の対象',{exact:true}).selectOption(task.id);await panel.getByLabel('任意の文字数目標',{exact:true}).fill('20');await panel.getByRole('button',{name:'文字数目標を確認',exact:true}).click();await panel.getByRole('button',{name:'確認した文字数目標を保存',exact:true}).click();await expect(panel).toContainText('達成率 35%');
 await page.reload();panel=await production(page);await expect(panel.getByLabel('文字数目標の対象',{exact:true})).toHaveValue(task.id);await expect(panel).toContainText('達成率 35%');
 const restored=await backup(page);expect(writingGoal(restored)).toBe(10);expect(writingGoal(restored,chapter.id)).toBe(7);expect(writingGoal(restored,task.id)).toBe(20);expect(restored.entities).toEqual(p.entities);
 await page.getByRole('tab',{name:'変更履歴',exact:true}).click();await page.getByRole('button',{name:'この変更を取り消す',exact:true}).click();panel=await production(page);await expect(panel).toContainText('目標 未設定');
 await panel.getByLabel('文字数目標の対象',{exact:true}).selectOption(chapter.id);await panel.getByLabel('任意の文字数目標',{exact:true}).fill('');await panel.getByRole('button',{name:'文字数目標を確認',exact:true}).click();await panel.getByRole('button',{name:'確認した文字数目標を保存',exact:true}).click();await expect(panel).toContainText('目標 未設定');await page.reload();const removed=await backup(page);expect(writingGoal(removed,chapter.id)).toBe(null);expect(writingGoal(removed)).toBe(10);
});
