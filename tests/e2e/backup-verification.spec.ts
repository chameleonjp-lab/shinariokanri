import {expect, test, type Page} from '@playwright/test';
import {readFile} from './downloadEvidence';
import {createEntity, createProject, textToRichText} from '../../src/domain/model';
import {exportScenario, inspectScenario, sha256} from '../../src/storage';
import {assetPath} from '../../src/storage/archiveData';

// This flow performs several real archive exports/imports, media playback and cold reloads.
test.setTimeout(120_000);
async function work(page: Page) {
  const menu = page.getByRole('button', {name: 'メニューを開く'}); if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', {name: /^作品・保存/}).first().click();
  await page.getByRole('tab', {name: '完全保存・復元', exact: true}).click();
}
async function fixture() {
  const project = createProject('控え確認用の教材😀');
  project.entities.push(createEntity(project.projectId, 'scene', '確認する本文', {body: textToRichText('元作品の本文を残す😀')}));
  const assets = [
    {name: '一枚の画像', mediaType: 'image/png', bytes: new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1cAAAAASUVORK5CYII=', 'base64'))},
    {name: '短い音声', mediaType: 'audio/wav', bytes: new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav'))},
  ];
  for (const asset of assets) {
    const contentHash = await sha256(asset.bytes);
    project.entities.push(createEntity(project.projectId, 'attachment', asset.name, {contentHash, mediaType: asset.mediaType, byteSize: asset.bytes.length, assetPath: assetPath(contentHash, asset.mediaType)}));
  }
  const bytes = await exportScenario(project, {loadAsset: async hash => assets.find(asset => project.entities.some(entity => entity.kind === 'attachment' && entity.name === asset.name && entity.data.contentHash === hash))?.bytes});
  return {project, bytes};
}
async function seed(page: Page, bytes: Uint8Array) {
  await page.goto('./');
  await page.getByRole('button', {name: '保存ファイルを読み込む', exact: true}).click();
  await page.locator('input[type=file]').setInputFiles({name: 'seed.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes)});
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', {name: 'この内容で復元する', exact: true}).click();
  await page.getByRole('dialog', {name: '作品ファイルを読み込む', exact: true}).waitFor({state: 'hidden'});
  await work(page);
}
async function download(page: Page, light = false) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', {name: light ? '素材bytesを除いて保存' : '完全保存ファイルを作成', exact: true}).click();
  return new Uint8Array(await readFile((await (await event).path())!));
}

test('作成・実ファイル検査・隔離コピーの読み戻しを分け、本文画像音声と元作品を保持する', async ({page}) => {
  await page.addInitScript(() => Object.defineProperty(navigator.storage, 'estimate', {configurable: true, value: async () => ({quota: 100000000, usage: 1000000})}));
  const f = await fixture(); await seed(page, f.bytes);
  await page.setViewportSize({width: 402, height: 700});
  const panel = page.locator('.backup-page');
  await expect(panel).toContainText('この端末に保存');
  await expect(panel).toContainText('画像・音声も同梱する控え');
  await expect(panel).toContainText('画像・音声を別に用意する控え');
  const bytes = await download(page), original = (await inspectScenario(bytes, {worker: false})).project;
  await expect(panel.getByLabel('控えの確認記録')).toContainText('作成時刻');
  await expect(panel.getByLabel('控えの確認記録')).toContainText('実ファイルは未検査');
  await page.locator('input[type=file]').setInputFiles({name: 'Filesから選んだ実物.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes)});
  const check = panel.getByLabel('控えの確認記録');
  await expect(check).toContainText('ファイル検査に成功');
  await expect(check).toContainText('試し復元は未実施');
  await expect(check).toContainText('空き容量の概算');
  await check.getByRole('button', {name: '元作品を残して別コピーへ試し復元', exact: true}).click();
  await expect(check).toContainText('この端末の別コピーへ読み戻しました');
  await expect(check).toContainText('元作品の本文を残す😀');
  await expect(check.locator('img')).toHaveJSProperty('naturalWidth', 1);
  await expect.poll(() => check.locator('audio').evaluate((audio: HTMLAudioElement) => Number.isFinite(audio.duration) && audio.duration > 0)).toBe(true);
  await check.locator('audio').evaluate((audio: HTMLAudioElement) => audio.play());
  await expect(check.locator('audio')).toHaveJSProperty('paused', false);
  await expect(page.locator('.project-switch strong')).toHaveText(f.project.name);
  expect((await inspectScenario(await download(page), {worker: false})).project).toEqual(original);
  await page.reload(); await expect(panel).toBeVisible();
  await expect(page.getByLabel('控えの確認記録')).toContainText('試し復元したコピーの版');
  await page.locator('input[type=file]').setInputFiles({name: 'broken.scenario', mimeType: 'application/zip', buffer: Buffer.from('broken')});
  await expect(page.getByLabel('控えの確認記録')).toContainText('ファイル検査に失敗');
  await expect(page.getByRole('button', {name: '元作品を残して別コピーへ試し復元', exact: true})).toBeDisabled();
  await page.locator('input[type=file]').setInputFiles([]);
  await expect(page.getByLabel('控えの確認記録')).toContainText('ファイルの選択を取り消しました');
  await expect(page.getByLabel('控えの確認記録')).not.toContainText('ファイル検査に成功');
});

test('容量不明と素材なしを明記し、容量不足の試し復元を確認済みにしない', async ({page}) => {
  await page.addInitScript(() => Object.defineProperty(navigator.storage, 'estimate', {configurable: true, value: async () => {throw new Error('unavailable');}}));
  const f = await fixture(); await seed(page, f.bytes);
  const bytes = await download(page, true);
  await page.locator('input[type=file]').setInputFiles({name: '素材なし.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes)});
  const check = page.getByLabel('控えの確認記録');
  await expect(check).toContainText('容量は確認できません');
  await expect(check).toContainText('素材を別に用意');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put; let fail = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (fail && this.name === 'projects') {fail = false; throw new DOMException('fixture full', 'QuotaExceededError');}
      return put.apply(this, args);
    };
  });
  await check.getByRole('button', {name: '元作品を残して別コピーへ試し復元', exact: true}).click();
  await expect(page.locator('.backup-page').getByRole('alert')).toContainText('容量');
  await expect(check).toContainText('試し復元は未実施');
  await check.getByRole('button', {name: '元作品を残して別コピーへ試し復元', exact: true}).click();
  await expect(check).toContainText('素材を別に用意');
  await expect(check).toContainText('読み戻した同梱素材 0件');
  await expect(check).not.toContainText('全素材を復元しました');
  await expect(check.locator('img, audio')).toHaveCount(0);
  await expect(page.locator('.project-switch strong')).toHaveText(f.project.name);
});


test('ファイル選択の取消を記録し、再起動後も成功扱いに戻さない', async ({page}) => {
  const f = await fixture();
  await page.goto('./');
  await page.getByRole('button', {name: '保存ファイルを読み込む', exact: true}).click();
  await page.locator('input[type=file]').setInputFiles({name: '選択後に取消.scenario', mimeType: 'application/zip', buffer: Buffer.from(f.bytes)});
  const check = page.getByLabel('控えの確認記録');
  await expect(check).toContainText('ファイル検査に成功');
  await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeEnabled();
  await page.locator('input[type=file]').dispatchEvent('cancel');
  await expect(check).toContainText('ファイルの選択を取り消しました');
  await page.reload();
  await page.getByRole('button', {name: '保存ファイルを読み込む', exact: true}).click();
  await expect(check).toContainText('ファイルの選択を取り消しました');
  await expect(check).not.toContainText('ファイル検査に成功');
  await expect(check.getByRole('button', {name: '元作品を残して別コピーへ試し復元', exact: true})).toBeDisabled();
});

async function storedLibrarySelection(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scenario-manager-local-v1');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<string | undefined>((resolve, reject) => {
        const request = db.transaction('authorToolDrafts').objectStore('authorToolDrafts').get('guest:library:backup-verification');
        request.onsuccess = () => resolve(request.result?.fields?.verification?.selection); request.onerror = () => reject(request.error);
      });
    } finally {db.close();}
  });
}

for (const outcome of ['corrupt', 'abort', 'native-cancel'] as const) {
  test(`ライブラリーの再検査の終端を保持する · ${outcome}`, async ({page}) => {
    const f = await fixture();
    await page.goto('./');
    await page.getByRole('button', {name: '保存ファイルを読み込む', exact: true}).click();
    const input = page.locator('input[type=file]'), check = page.getByLabel('控えの確認記録');
    await input.setInputFiles({name: '最初の正常な控え.scenario', mimeType: 'application/zip', buffer: Buffer.from(f.bytes)});
    await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeEnabled();
    await expect.poll(() => storedLibrarySelection(page)).toBe('checked');
    await page.evaluate(() => {
      const read = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = async function () {
        if (this.name === '再検査.scenario') {
          (window as any).__backupReadStarted = true;
          await new Promise<void>(resolve => {(window as any).__releaseBackupRead = resolve;});
        }
        return read.call(this);
      };
    });
    await input.setInputFiles({name: '再検査.scenario', mimeType: 'application/zip', buffer: outcome === 'corrupt' ? Buffer.from('broken') : Buffer.from(f.bytes)});
    await expect.poll(() => page.evaluate(() => (window as any).__backupReadStarted)).toBe(true);
    await expect.poll(() => storedLibrarySelection(page)).toBe('checking');
    if (outcome === 'abort') await page.locator('.backup-page > p[role="status"]').getByRole('button', {name: '中止', exact: true}).click();
    if (outcome === 'native-cancel') await input.dispatchEvent('cancel');
    await page.evaluate(() => (window as any).__releaseBackupRead());
    await expect(input).toBeEnabled();
    const terminal = outcome === 'corrupt' ? 'ファイル検査に失敗しました' : 'ファイルの選択を取り消しました';
    await expect(check).toContainText(terminal);
    await page.reload();
    await page.getByRole('button', {name: '保存ファイルを読み込む', exact: true}).click();
    await expect(input).toBeEnabled();
    await expect(check).toContainText(terminal);
    await expect(check).not.toContainText('実ファイルを検査中');
    await expect(check).not.toContainText('ファイル検査に成功');
    await expect(check.getByRole('button', {name: '元作品を残して別コピーへ試し復元', exact: true})).toBeDisabled();
    await expect.poll(() => storedLibrarySelection(page)).toBe(outcome === 'corrupt' ? 'failed' : 'cancelled');
  });
}
