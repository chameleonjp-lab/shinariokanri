import {test,expect} from '@playwright/test';
import {createProject,createEntity,newId} from '../../src/domain/model';
import {createWorldSnapshot} from '../../src/domain/world';
import {exportScenario} from '../../src/storage/archive';
import {seed,navigate,backup} from './ap04-original-helpers';

test('F11/F10 phone two-edition comparison, selected restore and occurrence replacement with one undo',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:402,height:700});
 let p=createProject('F11/F10 browser fixture');const a=createEntity(p.projectId,'character','アオ'),b=createEntity(p.projectId,'character','アオ');
 const body=[{id:newId(),kind:'paragraph' as const,text:'アオとアオ。',ruby:[{start:3,end:5,text:'あお'}],links:[{start:0,end:2,target:{entityId:a.id}},{start:3,end:5,target:{entityId:b.id}}]},{id:newId(),kind:'quote' as const,text:'引用のアオ'}];
 const scene=createEntity(p.projectId,'scene','比較する場面',{body});p.entities.push(a,b,scene);p=await createWorldSnapshot(p,'初稿');
 p.entities=p.entities.map(e=>e.id===scene.id?{...scene,data:{...scene.data,body:[{...body[0],text:'アオとアオ、改稿。'},body[1]]}}:e);p=await createWorldSnapshot(p,'二稿');
 await seed(page,await exportScenario(p));
 async function history(){await navigate(page,/^作品・保存/);await page.getByRole('tab',{name:'変更履歴',exact:true}).click();}
 await history();await page.getByLabel('戻す内容の固定稿',{exact:true}).selectOption(p.snapshots[0].id);await page.getByLabel('比較する固定稿',{exact:true}).selectOption(p.snapshots[1].id);
 await page.getByLabel('比較の表示',{exact:true}).selectOption('horizontal');await expect(page.locator('.edition-comparison.horizontal').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:700,height:402});await expect(page.locator('.edition-comparison.horizontal').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.setViewportSize({width:402,height:700});
 await page.getByLabel('比較の表示',{exact:true}).selectOption('vertical');await expect(page.locator('.edition-comparison.vertical').first()).toBeVisible();
 await page.getByLabel(`段落を復元 ${body[0].id}`,{exact:true}).check();await page.getByRole('button',{name:'選択段落と現稿の復元差分を確認',exact:true}).click();await expect(page.getByLabel('現稿への段落復元差分')).toContainText('復元前の現稿');
 await page.getByRole('button',{name:'選択段落だけ現稿へ復元して保存',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'選択段落を一度に保存しました'})).toBeVisible();
 const restored=(await backup(page)).project;expect((restored.entities.find(e=>e.id===scene.id)!.data as any).body).toEqual(body);expect(restored.snapshots).toEqual(p.snapshots);
 await history();await page.getByRole('button',{name:'この変更を取り消す',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'保存した版を確認'})).toBeVisible();
 await page.getByLabel('置換する人名',{exact:true}).fill('アオ');await page.getByLabel('置換後の人名',{exact:true}).fill('アオイ');await page.getByRole('button',{name:'文章と参照先を検索',exact:true}).click();
 await expect(page.locator('[data-windowed-list="置換する一致位置"]')).toContainText(b.id);await expect(page.locator('[data-windowed-list="置換する一致位置"]')).toContainText('引用');
 await page.getByLabel(`一致位置 ${body[0].id} 0`,{exact:true}).check();await page.getByRole('button',{name:'選択位置の置換差分を確認',exact:true}).click();await page.getByRole('button',{name:'選択位置だけ置換して保存',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'選択位置だけを一度に保存しました'})).toBeVisible();
 const replaced=(await backup(page)).project;const changed=(replaced.entities.find(e=>e.id===scene.id)!.data as any).body;expect(changed[0].text).toBe('アオイとアオ、改稿。');expect(changed[0].ruby).toEqual([{start:4,end:6,text:'あお'}]);expect(changed[1]).toEqual(body[1]);expect(replaced.snapshots).toEqual(p.snapshots);
 await history();await page.getByRole('button',{name:'この変更を取り消す',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'保存した版を確認'})).toBeVisible();await page.reload();
 const undone=(await backup(page)).project;expect(undone.entities.find(e=>e.id===scene.id)!.data).toEqual(p.entities.find(e=>e.id===scene.id)!.data);expect(undone.snapshots).toEqual(p.snapshots);
});
