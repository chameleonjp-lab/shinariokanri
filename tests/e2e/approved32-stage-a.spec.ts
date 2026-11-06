import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot } from '../../src/domain/world';
import { exportScenario } from '../../src/storage/archive';
import type { ProjectData } from '../../src/domain/types';

async function navigate(page: Page, name: RegExp) {
  const menu = page.getByRole('button', { name: 'メニューを開く' });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}
async function seed(page: Page, project: ProjectData) {
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'stage-a.scenario', mimeType: 'application/octet-stream', buffer: Buffer.from(await exportScenario(project)) });
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
}

test('新しい教材は初期値から第一場面を表示し、1/36場面に到達する', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 402, height: 700 });
  await page.goto('./');
  await page.getByRole('button', { name: '全3章のサンプルを開く', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible({ timeout: 60_000 });
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await expect(page.getByLabel('試読の開始点', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  await expect(page.locator('.reader-sheet-heading h2')).toHaveText('01　知らない星の朝');
  await expect(page.locator('.reader-sheet')).toContainText('草');
  await expect(page.locator('.reader-issue')).toHaveCount(0);
  await expect(page.locator('.coverage-cards > div').filter({ hasText: '場面の到達' }).locator('strong')).toHaveText('1 / 36');
  await expect(page.getByRole('button', { name: '進行規則に従って次へ', exact: true })).toBeEnabled();
});

test('複数入口と日時のエラーから日本語の操作で修正し、診断は詳細で読める', async ({ page }) => {
  const project = createProject('入口を選ぶ作品');
  const scene = createEntity(project.projectId, 'scene', '選んだ本文', { body: textToRichText('ここから読み始める。') });
  const a = createEntity(project.projectId, 'flow_node', '正面の入口', { nodeType: 'entry', sceneId: scene.id, gate: null });
  const b = createEntity(project.projectId, 'flow_node', '別の入口', { nodeType: 'entry', sceneId: scene.id, gate: null });
  project.entities.push(scene, a, b);
  await seed(page, project);
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
  await page.getByRole('button', { name: '試読を始める', exact: true }).click();
  const issue = page.locator('.reader-issue').first();
  await expect(issue).toContainText('開始点');
  await expect(issue.locator('code')).not.toBeVisible();
  await issue.getByRole('button', { name: '入口を選ぶ', exact: true }).click();
  const entry = page.getByLabel('試読の開始点', { exact: true });
  await expect(entry).toBeFocused();
  await entry.selectOption(b.id);
  await page.getByRole('button', { name: 'この状態から開始し直す', exact: true }).click();
  await expect(page.locator('.reader-sheet')).toContainText('ここから読み始める。');
  await page.getByLabel('試読開始時点の日時', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: 'この状態から開始し直す', exact: true }).click();
  await issue.getByRole('button', { name: '日時を入力し直す', exact: true }).click();
  await expect(page.getByLabel('試読開始時点の日時', { exact: true })).toBeFocused();
  await issue.getByText('診断の詳細', { exact: true }).click();
  await expect(issue.locator('code')).toContainText('VALIDATION_FAILED');
  await expect(issue).toContainText('worldTick');
  await page.getByLabel('試読開始時点の日時', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'この状態から開始し直す', exact: true }).click();
  await expect(page.locator('.reader-issue').getByRole('button', { name: '日時を入力し直す' })).toHaveCount(0);
});

test('出力プレビューで元にした作品の版を名前から確認できる', async ({ page }) => {
  const project = createProject('出力版の確認');
  const scene = createEntity(project.projectId, 'scene', '本文', { body: textToRichText('公開する本文。') });
  const profile = createEntity(project.projectId, 'projection_profile', '本文の公開範囲', { audience: 'reader', publicTitle: '読者向け本文', includedIds: [scene.id], allowedKinds: ['scene'], idPolicy: 'preserve', namePolicy: { defaultPolicy: { mode: 'replace', replacement: '本文' } }, publicTexts: { [scene.id]: { body: textToRichText('公開する本文。') } } });
  scene.status = profile.status = 'confirmed';
  project.entities.push(scene, profile);
  await seed(page, project);
  await navigate(page, /^作品・保存$/);
  await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
  await page.getByLabel('出力する公開範囲', { exact: true }).selectOption(profile.id);
  await page.getByRole('button', { name: '内容を検査・プレビュー', exact: true }).click();
  await expect(page.locator('.export-source-version')).toContainText('元にした作品の版：現在の編集稿');
  const source = page.locator('.export-result').getByText('元にした作品の版を確認', { exact: true });
  await source.click();
  await expect(page.locator('.export-result').getByText(project.projectId, { exact: true })).toBeVisible();
  await expect(page.locator('.export-result')).toContainText('作品の版番号');
});

test('時が未定義の暦で最小単位を確認し、日時の一括移動と取消を完了できる', async ({ page }) => {
  const project = createProject('独自暦の年表');
  project.calendarId = 'fiction';
  project.calendars = [{ id: 'fiction', name: '独自暦', kind: 'repeating', originLabel: '始まり', ticksPerDay: '24', years: [{ months: [{ name: '始月', days: 30 }] }] }];
  project.entities.push(createEntity(project.projectId, 'event', '出発', { time: { mode: 'instant', at: '25', calendarId: 'fiction' }, laneRole: 'common' }));
  await seed(page, project);
  await navigate(page, /^年表/);
  await expect(page.getByLabel('年表の表示単位', { exact: true }).locator('option[value="hour"]')).toHaveAttribute('disabled', '');
  await expect(page.getByLabel('年表の表示単位', { exact: true }).locator('option[value="tick"]')).toHaveText('時間の最小単位');
  await page.getByRole('button', { name: '全出来事の日時を移動', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '全出来事の日時を移動' });
  await expect(dialog).toContainText('移動する時間差（時間の最小単位）');
  await dialog.getByLabel('全出来事を移動する時間差', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: '全出来事の変更前後を確認', exact: true }).click();
  await expect(dialog).toContainText('0年1月2日 + 時間の最小単位 1');
  await expect(dialog).toContainText('0年1月2日 + 時間の最小単位 3');
  await dialog.getByRole('button', { name: '確認した日時を一括移動', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '全出来事の日時を移動しました' })).toBeVisible();
  await page.getByRole('button', { name: '前回の日時変更を一括取消', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '日時の変更をすべて取り消しました' })).toBeVisible();
});

async function oldSourceFixture() {
  let project = createProject('以前の版と比較元を分ける');
  project.revision = '7';
  const scene = createEntity(project.projectId, 'scene', '元の場面', { body: textToRichText('以前の本文。') });
  scene.status = 'confirmed'; project.entities.push(scene);
  project = await createWorldSnapshot(project, '作品の旧版7');
  const pin = project.snapshots.at(-1)!;
  const media = createEntity(project.projectId, 'media_variant', '小説の公開稿', { medium: 'novel', baseSnapshotId: pin.id, sourceIds: [scene.id], body: textToRichText('旧版に基づく本文。') });
  media.status = 'confirmed'; project.entities.push(media); project.revision = '15';
  return { project, pin, media };
}

test('媒体の詳細で元の版番号7と比較した現在稿15を分ける', async ({ page }) => {
  const { project, pin, media } = await oldSourceFixture();
  await seed(page, project); await navigate(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption('media_variant');
  await page.locator('.entity-card').filter({ has: page.getByRole('heading', { name: media.name, exact: true }) }).click();
  const tool = page.locator('.detail-panel details').filter({ has: page.locator('summary').filter({ hasText: '媒体の旧公開版と改訂候補を比較' }) });
  await tool.locator('summary').first().click();
  await tool.getByRole('button', { name: '媒体の改訂差分を確認', exact: true }).click();
  await tool.getByText('元にした作品の版の詳細', { exact: true }).click();
  await expect(tool).toContainText('元にした作品の版番号 7');
  await expect(tool).toContainText('比較時の現在稿の版番号 15');
  await expect(tool).toContainText(pin.id);
  await expect(tool).toContainText(pin.contentHash);
});

test('相談の詳細で対象の版番号7と比較した現在稿15を分ける', async ({ page }) => {
  const { project, pin } = await oldSourceFixture();
  await seed(page, project); await navigate(page, /^作品・保存$/);
  await page.getByRole('tab', { name: '目的別出力', exact: true }).click();
  const panel = page.locator('.consultation-import'); await panel.locator('summary').first().click();
  await panel.getByLabel('提案の出所', { exact: true }).fill('相談した原稿');
  await panel.getByLabel('提案の相談対象版', { exact: true }).selectOption(pin.id);
  await panel.getByLabel('提案Markdown', { exact: true }).fill('旧版についての提案。');
  await panel.getByRole('button', { name: '提案の別案差分を確認', exact: true }).click();
  await panel.getByText('相談した作品の版の詳細', { exact: true }).click();
  await expect(panel).toContainText('相談した作品の版番号 7');
  await expect(panel).toContainText('比較時の現在稿の版番号 15');
  await expect(panel).toContainText(pin.id);
});

test('相対日時の入力は基準の24単位の日を継承して換算する', async ({ page }) => {
  const project = createProject('異なる暦の相対入力');
  project.calendars.push({ id: 'fiction', name: '一日24単位の暦', kind: 'repeating', originLabel: '原点', ticksPerDay: '24', years: [{ months: [{ name: '始月', days: 30 }] }] });
  const anchor = createEntity(project.projectId, 'event', '別暦の基準', { time: { mode: 'instant', at: '0', calendarId: 'fiction' }, laneRole: 'common' });
  const relative = createEntity(project.projectId, 'event', '翌日の出来事', { time: { mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'start', minOffset: '24', maxOffset: '24' }, laneRole: 'common' });
  project.entities.push(anchor, relative);
  await seed(page, project); await navigate(page, /^年表/);
  await page.locator(`[data-event-id="${relative.id}"]`).first().click();
  const close = page.getByRole('button', { name: '詳細を閉じる' });
  if (await close.isVisible()) await close.click();
  else await page.getByRole('button', { name: '一覧に戻る' }).click();
  await page.getByRole('button', { name: '選択した出来事の日時・制約', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `日時・前後関係 · ${relative.name}` });
  await expect(dialog).toContainText('1日 24 時間の最小単位');
  await dialog.getByLabel('相対日時の差の入力単位', { exact: true }).selectOption('day');
  await expect(dialog.getByLabel('相対日時の差の最小', { exact: true })).toHaveValue('1');
  await expect(dialog.getByLabel('相対日時の差の最大', { exact: true })).toHaveValue('1');
  await dialog.getByLabel('相対日時の差の最大', { exact: true }).fill('2');
  await dialog.getByRole('button', { name: '変更前の影響を確認', exact: true }).click();
  await expect(dialog).toContainText('0年1月2日 〜 0年1月3日');
});
