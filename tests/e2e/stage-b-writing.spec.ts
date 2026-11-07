import {expect, test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createEntity, createProject} from '../../src/domain/model';
import {exportScenario} from '../../src/storage/archive';
import {authorFingerprint, navigate, openEntity, seed} from './ap04-original-helpers';

function fixture() {
  const project = createProject('工程B 3章36場面');
  const person = createEntity(project.projectId, 'character', '葵');
  project.entities = [person];
  for (let chapterIndex = 0; chapterIndex < 3; chapterIndex++) {
    const chapter = createEntity(project.projectId, 'chapter', `第${chapterIndex + 1}章`);
    const scenes = Array.from({length:12}, (_, index) => createEntity(project.projectId, 'scene', `${chapter.name}の場面${index + 1}`, {chapterId:chapter.id, povId:person.id, body:[]}));
    chapter.data.sceneIds = scenes.map(scene => scene.id);
    project.entities.push(chapter, ...scenes);
  }
  return project;
}

test('章選択から1操作で空の本文に入力し、同じ場面を人物別から開き直す', async ({page}, info) => {
  await page.setViewportSize({width:402, height:700});
  await seed(page, await exportScenario(fixture()));
  await navigate(page, /^構成/);
  await expect(page.getByLabel('物語の並べ方', {exact:true})).toHaveValue('chapter');
  await page.getByLabel('書く章を選ぶ', {exact:true}).selectOption({label:'第3章'});
  const row = page.locator('[data-scene-id]').filter({hasText:'第3章の場面12'});
  await row.getByRole('button', {name:'本文を書く', exact:true}).click();
  const body = page.locator('.detail-panel').getByRole('textbox', {name:'本文', exact:true});
  await expect(body).toBeFocused();
  await expect(body).toHaveValue('');
  await body.fill('葵は第十二の門を開く。');
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.getByRole('button', {name:'一覧に戻る', exact:true}).click();
  await expect(page.getByLabel('書く章を選ぶ', {exact:true})).toHaveValue(await row.locator('xpath=ancestor::section[@data-lane-id]').getAttribute('data-lane-id') ?? '');
  await expect(row).toHaveAttribute('aria-current', 'true');
  const sceneId = await row.getAttribute('data-scene-id');
  await page.getByLabel('物語の並べ方', {exact:true}).selectOption('character');
  const characterRow = page.locator(`[data-scene-id="${sceneId}"]`);
  await expect(characterRow).toHaveAttribute('aria-current', 'true');
  await characterRow.getByRole('button', {name:'本文を書く', exact:true}).click();
  await expect(body).toHaveValue('葵は第十二の門を開く。');
  await info.attach('automated-navigation.json', {body:JSON.stringify({scope:'Chromium viewport emulation; physical iPhone unverified', chapters:3, scenes:36, actionsAfterChapterSelection:1, sameSceneIdAcrossAxes:sceneId}), contentType:'application/json'});
});

test('合成IMEイベントの確定中は作品保存を抑え、確定後の本文と位置を復帰・回転・オフラインで保つ', async ({page}, info) => {
  await page.setViewportSize({width:402, height:700});
  const project = fixture();
  await seed(page, await exportScenario(project));
  await openEntity(page, 'scene', '第1章の場面1');
  await page.getByRole('tab', {name:'本文', exact:true}).click();
  const body = page.locator('.detail-panel').getByRole('textbox', {name:'本文', exact:true});
  const before = await authorFingerprint(page);
  await body.dispatchEvent('compositionstart', {data:''});
  await body.evaluate(element => {
    const input = element as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'にほんご');
    input.dispatchEvent(new InputEvent('input', {bubbles:true, data:'にほんご', inputType:'insertCompositionText', isComposing:true}));
  });
  await body.dispatchEvent('keydown', {key:'Enter', code:'Enter', isComposing:true, keyCode:229});
  await expect(body).toHaveValue('にほんご');
  await page.waitForTimeout(650); // Cross the editor's 500ms autosave boundary.
  expect(await authorFingerprint(page)).toBe(before);
  await body.evaluate(element => {
    const input = element as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '日本語が確定した。');
    input.dispatchEvent(new CompositionEvent('compositionend', {bubbles:true, data:'日本語が確定した。'}));
    input.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:'日本語が確定した。'}));
    input.focus(); input.setSelectionRange(3, 3); input.dispatchEvent(new Event('select', {bubbles:true}));
  });
  await expect(body).toHaveValue('日本語が確定した。');
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.reload();
  await expect(body).toHaveValue('日本語が確定した。');
  await page.setViewportSize({width:700, height:402});
  await expect(body).toHaveValue('日本語が確定した。');
  await page.context().setOffline(true);
  await page.reload();
  await expect(body).toHaveValue('日本語が確定した。');
  await expect(page.locator('.editor-footer').getByRole('button', {name:'保存する', exact:true})).toBeVisible();
  await info.attach('automated-ime.json', {body:JSON.stringify({scope:'Synthetic DOM composition and viewport changes only; real Japanese keyboard, app switching and physical rotation unverified', compositionEnterSaved:false, confirmedText:'日本語が確定した。', missing:0, duplicate:0}), contentType:'application/json'});
});

test('入力保管の読み込み失敗でもアカウント内の退避入力を時刻とともに持ち出せる', async ({page}) => {
  const project = fixture(), scene = project.entities.find(entity => entity.kind === 'scene')!;
  const key = `${project.projectId}:${scene.id}`, retainedAt = '2026-11-06T12:30:00.000Z';
  const inputs = {drafts:{[key]:scene}, jsonBuffers:{}, settingsDrafts:{}, alternativeDrafts:{}};
  await page.addInitScript(value => {
    localStorage.setItem('scenario-workspace-input:v1:guest', JSON.stringify(value));
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(query) {
      if (this.name === 'workspaceInputs') throw new DOMException('工程B 読込失敗', 'UnknownError');
      return get.call(this, query);
    };
  }, {...inputs, retainedAt});
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('工程B 読込失敗');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', {name:'手元の未保存入力を一時ファイルに保存', exact:true}).click();
  const downloaded = await pending;
  const recovered = JSON.parse(await readFile((await downloaded.path())!, 'utf8'));
  expect(recovered).toMatchObject({accountId:null, retainedAt, inputs});
  expect(recovered.currentInputs).toEqual(inputs);
});
