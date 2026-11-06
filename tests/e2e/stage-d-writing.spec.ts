import {expect,test} from '@playwright/test';
import {createEntity,createProject,textToRichText} from '../../src/domain/model';
import {exportScenario} from '../../src/storage/archive';
import {authorFingerprint,backup,navigate,openEntity,seed} from './ap04-original-helpers';

function fixture() {
  const project=createProject('工程D');
  for(let c=1;c<=2;c++){
    const chapter=createEntity(project.projectId,'chapter',`第${c}章`);
    const scenes=Array.from({length:12},(_,i)=>createEntity(project.projectId,'scene',`第${c}章場面${i+1}`,{chapterId:chapter.id,body:textToRichText('最初の段落\n途中の段落\n最後の段落')}));
    chapter.data.sceneIds=scenes.map(scene=>scene.id);project.entities.push(chapter,...scenes);
  }
  return project;
}
test('用途の最初の一手を閉じて選び直し、本文・二択・台詞へ進む',async({page})=>{
  await page.goto('./');await page.getByLabel('作品名',{exact:true}).fill('はじめの作品');await page.getByRole('button',{name:'作品を作成',exact:true}).click();
  await expect(page.getByRole('heading',{name:'最初の一手を選ぶ',exact:true})).toBeVisible();
  const before=await authorFingerprint(page);
  await page.getByRole('button',{name:'あとで選ぶ',exact:true}).click();
  await page.getByRole('button',{name:'用途を選び直す',exact:true}).click();
  expect(await authorFingerprint(page)).toBe(before);
  await page.getByRole('button',{name:'小説：最初の一文を書く',exact:true}).click();
  const body=page.locator('.detail-panel').getByRole('textbox',{name:'本文',exact:true});await body.fill('最初の一文は残る。');
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.getByRole('button',{name:'用途を選び直す',exact:true}).click();await page.getByRole('button',{name:'ゲーム：二択を作る',exact:true}).click();
  await expect(page.locator('.detail-panel')).toContainText('選択肢1');
  await page.getByRole('button',{name:'用途を選び直す',exact:true}).click();await page.getByRole('button',{name:'動画：最初の台詞を書く',exact:true}).click();
  await page.locator('.detail-panel').getByRole('textbox',{name:'台詞',exact:true}).fill('台詞も残る。');
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  const result=await backup(page);expect(result.project.entities.find(e=>e.kind==='scene')?.data).toMatchObject({body:[expect.objectContaining({text:'最初の一文は残る。'})]});
  expect(result.project.entities.filter(e=>e.kind==='flow_edge'&&!e.deletedAt)).toHaveLength(2);
});
test('第2章の段落を編集して第1章を見た後、作品一覧から執筆だけを再開する',async({page})=>{
  await page.setViewportSize({width:402,height:700});await seed(page,await exportScenario(fixture()));
  await openEntity(page,'scene','第2章場面1');await page.getByRole('tab',{name:'本文',exact:true}).click();
  const body=page.locator('.detail-panel').getByRole('textbox',{name:'本文',exact:true});await body.focus();await body.evaluate(element=>{const input=element as HTMLTextAreaElement;input.setSelectionRange(6,11);});await body.pressSequentially('書いていた段落');await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  const written=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('scenario-writing-resume:')));
  await openEntity(page,'scene','第1章場面1');await navigate(page,/^構成/);await page.getByRole('tab',{name:'章の試読',exact:true}).click();
  await page.getByRole('checkbox',{name:'第2章',exact:true}).uncheck();await page.getByRole('button',{name:'記録付き読書を始める',exact:true}).click();await page.getByRole('button',{name:'次の場面を提示',exact:true}).click();
  await expect(page.locator('.chapter-reading-session')).toContainText('第1章場面1');await page.getByRole('button',{name:'開始状態と経路を保存',exact:true}).click();await expect(page.getByText('開始状態と実際に提示した場面を保存しました。',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('scenario-writing-resume:')))).toEqual(written);
  await page.getByRole('button',{name:'メニューを開く',exact:true}).click();await page.getByRole('button',{name:/作品一覧へ/}).click();
  await page.getByRole('button',{name:'工程Dの執筆を続ける',exact:true}).click();
  await expect(page.locator('.detail-panel')).toContainText('第2章場面1');await expect(body).toHaveValue('最初の段落\n書いていた段落\n最後の段落');await expect(body).toBeFocused();
  await navigate(page,/^構成/);await page.getByRole('tab',{name:'章の試読',exact:true}).click();await page.locator('.saved-reading-records').getByRole('button',{name:/章読み通し経路/}).click();await expect(page.locator('.chapter-reading-session')).toContainText('第1章場面1');
});
test('オフラインで一文メモを3件残し、1件を場面へ変換して一度で取り消す',async({page})=>{
  await seed(page,await exportScenario(fixture()));await page.context().setOffline(true);
  await page.getByRole('button',{name:'アイデアを残す',exact:true}).click();
  for(const text of ['鍵を拾う。','鳥が鳴く。','朝になる。']){await page.getByRole('textbox',{name:'一文メモ',exact:true}).fill(text);await page.getByRole('button',{name:'一文を端末に保存',exact:true}).click();await expect(page.getByRole('textbox',{name:'一文メモ',exact:true})).toHaveValue('');}
  await expect(page.getByRole('heading',{name:'未整理のメモ（3件）',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'鍵を拾う。を整理',exact:true}).click();await page.getByLabel('変換先',{exact:true}).selectOption('scene');
  await page.getByRole('button',{name:'変換の差分を確認',exact:true}).click();await page.getByRole('button',{name:'確認した変換を保存',exact:true}).click();
  await expect(page.locator('.detail-panel')).toContainText('鍵を拾う。');
  await page.getByRole('button',{name:'アイデアを残す',exact:true}).click();await expect(page.getByRole('heading',{name:'未整理のメモ（2件）',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'アイデアを残す',exact:true}).click();await expect(page.getByRole('heading',{name:'未整理のメモ（2件）',exact:true})).toBeVisible();
  await page.getByRole('dialog',{name:'一文メモ・未整理',exact:true}).getByRole('button',{name:'閉じる',exact:true}).click();
  await navigate(page,/^作品・保存/);await page.getByRole('tab',{name:'変更履歴',exact:true}).click();await page.getByRole('button',{name:'この変更を取り消す',exact:true}).click();
  await page.getByRole('button',{name:'アイデアを残す',exact:true}).click();await expect(page.getByRole('heading',{name:'未整理のメモ（3件）',exact:true})).toBeVisible();
});
test('場面12を場面2の前へ直接移す予告と取消を確認する',async({page})=>{
  await page.setViewportSize({width:402,height:700});await seed(page,await exportScenario(fixture()));await navigate(page,/^構成/);
  const row=page.locator('[data-scene-id]').filter({hasText:'第1章場面12'});await row.getByRole('button',{name:'移す場所を選ぶ',exact:true}).click();
  await page.getByLabel('移動先の章',{exact:true}).selectOption({label:'第1章'});await page.getByLabel('挿入する場所',{exact:true}).selectOption({label:'第1章場面2の前'});
  await page.getByRole('button',{name:'移動を予告',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'第1章場面1'})).toContainText('第1章場面2');
  await page.getByRole('button',{name:'確認した場所へ移す',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'移しました'})).toContainText('第1章');
  await expect(row).toHaveAttribute('data-scene-number','2');await navigate(page,/^作品・保存/);await page.getByRole('tab',{name:'変更履歴',exact:true}).click();await page.getByRole('button',{name:'この変更を取り消す',exact:true}).click();await navigate(page,/^構成/);await expect(row).toHaveAttribute('data-scene-number','12');
});
