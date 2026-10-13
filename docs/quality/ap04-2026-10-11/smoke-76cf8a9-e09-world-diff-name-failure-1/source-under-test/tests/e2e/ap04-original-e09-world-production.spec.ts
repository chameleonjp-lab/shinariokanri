import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, textToRichText } from '../../src/domain/model';
import { createWorldSnapshot, previewWorldVersion } from '../../src/domain/world';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, editData, navigate, openEntity, seed } from './ap04-original-helpers';

async function worlds(page: Page) {
  await navigate(page, /^年表/); await page.getByRole('tab', { name: '世界・地図・履歴', exact: true }).click();
  await page.getByRole('tab', { name: '共通世界の固定版', exact: true }).click();
}
async function switchWork(page: Page, name: string) {
  await page.locator('.project-switch').click(); await page.locator('.project-card').filter({ hasText: name }).click();
}
async function production(page: Page) {
  await navigate(page, /^構成/); await page.getByRole('tab', { name: '制作', exact: true }).click();
}

test('AT-E09 二経路の同じ場面と公開済み小説を世界改訂・制作集計・日付変更で保ち、未設定時間と実装未完了を区別する', async ({ page }, info) => {
  let world = createProject('AT-E09 改訂する共通世界');
  const place = createEntity(world.projectId, 'place', '旧世界設定の城', { body: textToRichText('公開済み小説が参照した旧世界設定。') });
  place.status = 'confirmed'; world.entities.push(place); world = await createWorldSnapshot(world, '小説公開時の旧世界版');
  const worldPin = world.snapshots.at(-1)!;
  let p = createProject('AT-E09 二経路で同じ場面を再利用する作品');
  const event = createEntity(p.projectId, 'event', '再利用場面の世界日付', { time: { mode: 'instant', at: '5', calendarId: p.calendarId }, locationId: place.id });
  const scene = createEntity(p.projectId, 'scene', '二経路で使う一つの制作場面', { body: textToRichText('城の門を開く共通場面。'), eventIds: [event.id] });
  const a = createEntity(p.projectId, 'flow_node', '再利用経路A', { nodeType: 'entry', sceneId: scene.id });
  const b = createEntity(p.projectId, 'flow_node', '再利用経路B', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '二経路の終端', { nodeType: 'terminal', terminalReason: '同じ場面を体験して終了' });
  const ea = createEntity(p.projectId, 'flow_edge', '経路Aを終える', { fromId: a.id, toId: end.id, label: '経路Aを終える' });
  const eb = createEntity(p.projectId, 'flow_edge', '経路Bを終える', { fromId: b.id, toId: end.id, label: '経路Bを終える' });
  const graph = createEntity(p.projectId, 'flow_graph', '同じ場面の二経路', { nodeIds: [a.id, b.id, end.id], edgeIds: [ea.id, eb.id], entryIds: [a.id, b.id], exitIds: [end.id] });
  const deadline = { date: '2026-12-31', timeZone: 'Asia/Tokyo' };
  const written = createEntity(p.projectId, 'production_task', '同じ場面の執筆完了', { targetIds: [scene.id], stage: 'writing', progress: 'done', deadline });
  const implementation = createEntity(p.projectId, 'production_task', '執筆済み場面の実装未完了', { targetIds: [scene.id], stage: 'implementation', progress: 'todo', dependsOn: [written.id], deadline });
  p.entities.push(event, scene, a, b, end, ea, eb, graph, written, implementation); p.entities.forEach(entity => { entity.status = 'confirmed'; });
  p = (await previewWorldVersion(p, world, worldPin.id, [place.id], [world])).candidate;
  p = await createWorldSnapshot(p, '公開済み小説の元設定版'); const oldEdition = p.snapshots.at(-1)!;
  const novel = createEntity(p.projectId, 'media_variant', '公開済み小説旧版', { medium: 'novel', baseSnapshotId: oldEdition.id, body: textToRichText('旧世界の城を描いた公開済み小説本文。'), sourceIds: [scene.id, place.id], releaseAt: '2026-10-01T00:00:00Z', needsReview: false });
  novel.status = 'confirmed'; p.entities.push(novel);
  const bytes = await exportScenario(p, { worlds: { [worldPin.id]: world } });
  await test.step('AT-E09 given: 二経路で再利用する場面と公開済み小説版', async () => {
    await attachGiven(info, 'AT-E09', bytes, { sceneId: scene.id, routes: [a.id, b.id], novelId: novel.id, publishedEdition: oldEdition.id, oldWorldPin: worldPin.id, deadline, missingSpeed: null });
    await seed(page, await exportScenario(world)); await page.locator('.project-switch').click();
    await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
    await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'AT-E09.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
    await page.getByLabel('復元方法と対象への影響を確認しました').check(); await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
    await expect(page.locator('.app-shell')).toBeVisible();
  });
  await test.step('AT-E09 when: 世界設定改訂と制作集計、場面の日付変更を行う', async () => {
    await switchWork(page, world.name); await openEntity(page, 'place', place.name);
    await editData(page, { ...place.data, body: textToRichText('新たに改訂した世界設定。旧公開本文へは自動反映しない。') });
    await worlds(page); await page.getByLabel('新しい共通世界版の名称', { exact: true }).fill('通常画面で改訂した新世界版');
    await page.getByRole('button', { name: 'この内容を確定版として保存', exact: true }).click();
    await expect(page.getByLabel('新しい共通世界版の名称', { exact: true })).toHaveValue('');
    await switchWork(page, p.name); await worlds(page);
    await page.getByLabel('参照する共通世界', { exact: true }).selectOption(world.projectId);
    const newWorldPin = await page.getByLabel('固定する共通世界版', { exact: true }).locator('option').filter({ hasText: '通常画面で改訂した新世界版' }).getAttribute('value');
    expect(newWorldPin).toBeTruthy();
    await page.getByLabel('固定する共通世界版', { exact: true }).selectOption(newWorldPin!);
    await page.getByRole('button', { name: '適用前の差分・影響を確認', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '共通世界版の変更前の影響', exact: true })).toContainText('新たに改訂した世界設定');
    await page.getByRole('button', { name: '確認した固定版・採用設定を保存', exact: true }).click();
    await openEntity(page, 'event', event.name); await editData(page, { ...event.data, time: { mode: 'instant', at: '15', calendarId: p.calendarId } });
    await navigate(page, /^構成/); await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
    for (const [entry, edge] of [[a, ea], [b, eb]]) {
      await page.getByLabel('試読する作品版', { exact: true }).selectOption(''); await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
      await page.getByRole('button', { name: /^(試読を始める|この状態から開始し直す)$/ }).click();
      await page.getByRole('button', { name: edge.name, exact: true }).click(); await page.getByRole('button', { name: '経路を記録', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: '開始状態と経路を端末内に保存しました' })).toBeVisible();
    }
    await production(page);
    await expect(page.locator('.production-planning')).toContainText('固有場面 1');
    const route = page.getByLabel('制作量を比較する経路', { exact: true });
    const ids = await route.locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean)); expect(ids).toHaveLength(2);
    for (const id of ids) { await route.selectOption(id); await expect(page.locator('.production-planning')).toContainText('選択経路の提示量 1'); }
  });
  await test.step('AT-E09 then: 固有制作数は一回、体験量は各経路で算出し、小説旧版と実期限は不変', async () => {
    const saved = await backup(page);
    expect(saved.project.entities.filter(entity => entity.kind === 'scene')).toHaveLength(1);
    expect(saved.project.entities.find(entity => entity.id === novel.id)).toMatchObject({ data: { body: novel.data.body, baseSnapshotId: oldEdition.id, releaseAt: novel.data.releaseAt } });
    expect(saved.project.snapshots.find(pin => pin.id === oldEdition.id)).toEqual(oldEdition);
    for (const id of [written.id, implementation.id]) expect(saved.project.entities.find(entity => entity.id === id)).toMatchObject({ data: { deadline } });
    expect(saved.project.worldReferences[0].immutableSnapshotId).not.toBe(worldPin.id);
  });
  await test.step('AT-E09 negative_or_edge: 未設定速度の所要時間は不明とし、執筆済でも実装未完了を抽出する', async () => {
    await production(page); const panel = page.locator('.production-planning');
    // A changed world/date may require review of the completed writing task.
    // The authored text remains complete; it does not complete implementation.
    await expect(panel.locator('article').filter({ hasText: written.name })).toContainText(/writing · (done|needs_review)/);
    const implementationRow = panel.locator('article').filter({ hasText: implementation.name });
    await expect(implementationRow).toContainText('implementation · todo');
    await expect(implementationRow).toContainText('所要時間 不明');
    await expect(implementationRow).toContainText('速度 未設定');
    const pending = page.locator('.production-column').filter({ has: page.getByRole('heading', { name: /^未着手/ }) });
    await expect(pending.locator('.task-card').filter({ hasText: implementation.name })).toContainText(scene.name);
    await expect(pending.locator('.task-card').filter({ hasText: written.name })).toHaveCount(0);
    await panel.getByLabel('見積する制作タスク', { exact: true }).selectOption(implementation.id);
    await expect(panel.getByLabel('一作業日の固有件数', { exact: true })).toHaveValue('');
    const unset = await backup(page);
    const unsetTask = unset.project.entities.find(entity => entity.id === implementation.id);
    expect(unsetTask).toMatchObject({ kind: 'production_task', data: { stage: 'implementation', progress: 'todo', estimate: null } });
    expect(unset.project.entities.find(entity => entity.id === scene.id)).toMatchObject({ data: { body: scene.data.body } });
    // An omitted speed is unknown. A supplied zero is separately invalid.
    await production(page); await panel.getByLabel('見積する制作タスク', { exact: true }).selectOption(implementation.id);
    await panel.getByLabel('一作業日の固有件数', { exact: true }).fill('0'); await panel.getByLabel('見積の仮定', { exact: true }).fill('明示した速度0は有効な所要時間に換算しない');
    const before = await authorFingerprint(page); await panel.getByRole('button', { name: '制作見積を確認', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('速度');
    await expect(panel.getByRole('button', { name: '確認した制作見積を保存', exact: true })).toHaveCount(0);
    expect(await authorFingerprint(page)).toBe(before);
    await page.reload(); const saved = await backup(page);
    expect(saved.project.entities.find(entity => entity.id === implementation.id)).toMatchObject({ data: { estimate: null } });
    await production(page); await expect(panel.locator('article').filter({ hasText: implementation.name })).toContainText('所要時間 不明');
    await attachObservation(info, 'AT-E09-observed', { currentWorld: saved.project.worldReferences, oldWorldPin: worldPin.id, preservedPublishedEdition: oldEdition.id, novelBody: novel.data.body, productionSceneCount: 1, perRouteOccurrences: [1, 1], deadline, unsetEstimateExport: unsetTask, durationWithoutSpeed: { value: null, observedDisplay: '所要時間 不明 · 速度 未設定' }, invalidDefinedSpeed: { value: 0, rejected: true, authorRecordsUnchanged: true }, authoredSceneBody: scene.data.body, writingReviewState: saved.project.entities.find(entity => entity.id === written.id)?.data, implementationPending: saved.project.entities.find(entity => entity.id === implementation.id)?.data });
  });
});
