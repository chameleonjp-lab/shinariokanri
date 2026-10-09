import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import type { AnalysisResult } from '../../src/domain/runtime';
import { exportScenario } from '../../src/storage/archive';
import { jsonBytes, sha256 } from '../../src/storage';

async function navigate(page: Page, name: RegExp) {
  await page.locator('.app-shell').waitFor();
  const menu = page.getByRole('button', { name: 'メニューを開く', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('.sidebar').getByRole('button', { name }).first().click();
}
async function reader(page: Page) {
  await navigate(page, /^構成/);
  await page.getByRole('tab', { name: '試読・検査', exact: true }).click();
}
async function native(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scenario-manager-local-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        const names = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'restorePoints', 'worlds', 'recoveredPending', 'recordParts'];
        const tx = db.transaction(names, 'readonly'), rows: Record<string, unknown> = {};
        for (const name of names) {
          const request = tx.objectStore(name).getAll();
          request.onsuccess = () => { rows[name] = request.result; };
        }
        tx.oncomplete = () => resolve(rows);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}
async function result(page: Page): Promise<AnalysisResult> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '検査結果を保存', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}

// This small regression checks the navigation contract. The original Large
// fixture, long path and real timing limits require their separate evidence.
for (const fixedEdition of [false, true]) test(`AT-N05 retains cancelled ${fixedEdition ? 'fixed-edition analysis when navigating during captured request' : 'current analysis after explicit cancellation'}, input and target edition`, async ({ page }) => {
  test.setTimeout(60_000);
  const project = createProject('取消した検査と入力を保持する作品');
  const scene = createEntity(project.projectId, 'scene', '未保存入力を保持する場面', { body: textToRichText('😀編集を続ける場面') });
  const variable = createEntity(project.projectId, 'variable', '反復回数', { key: 'loop_count', valueType: 'integer', initial: { type: 'integer', value: 0 }, scope: 'across_runs', allowed: {} });
  const effect = createEntity(project.projectId, 'effect', '回数を増やす', { operation: 'add', targetId: variable.id, value: { type: 'integer', value: 1 } });
  const entry = createEntity(project.projectId, 'flow_node', '探索の入口', { nodeType: 'entry', executionPolicy: 'first_match', sceneId: scene.id });
  const edge = createEntity(project.projectId, 'flow_edge', '上限未宣言の反復', { fromId: entry.id, toId: entry.id, label: '上限未宣言の反復', effectIds: [effect.id] });
  const graph = createEntity(project.projectId, 'flow_graph', '反復の図', { nodeIds: [entry.id], entryIds: [entry.id], exitIds: [], edgeIds: [edge.id] });
  project.entities.push(scene, variable, effect, entry, edge, graph);
  const { history: _history, snapshots: _snapshots, authorAlternatives: _alternatives, ...content } = structuredClone(project);
  const snapshotId = newId();
  project.snapshots.push({ id: snapshotId, content, contentHash: await sha256(jsonBytes(content)), createdAt: new Date().toISOString(), versionLabel: '取消前の固定版' });
  await page.goto('./');
  await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
  await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'analysis.scenario', mimeType: 'application/zip', buffer: Buffer.from(await exportScenario(project)) });
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
  await navigate(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption('scene');
  await page.locator('.entity-card').filter({ has: page.getByRole('heading', { name: scene.name, exact: true }) }).click();
  const advanced = page.locator('details.advanced-details').filter({ has: page.getByText('詳細データ・ルビ・本文リンクを編集', { exact: true }) });
  await advanced.locator('summary').click();
  const input = advanced.getByRole('textbox', { name: '詳細データ', exact: true });
  const unfinished = (await input.inputValue()).slice(0, -1);
  await input.fill(unfinished);
  await expect(page.locator('.editor-save-state')).toContainText('未保存');
  await reader(page);
  if (fixedEdition) await page.getByLabel('試読する作品版', { exact: true }).selectOption(snapshotId);
  await page.getByLabel('試読の開始点', { exact: true }).selectOption(entry.id);
  await page.getByLabel('試読開始時点の世界内tick', { exact: true }).fill('5');
  const before = await native(page);
  if (fixedEdition) await page.evaluate(() => {
    const postMessage = Worker.prototype.postMessage;
    const pending: unknown[] = [];
    let held: Worker | undefined;
    let first = true;
    // Delay the actual captured worker request, preserving its bytes and order.
    // The real worker still verifies the fixed content hash after release.
    Worker.prototype.postMessage = function(message: any, ...rest: any[]) {
      if (first && message?.type === 'start') { first = false; held = this; (window as any).__analysisWaiting = true; }
      if (this === held) {
        pending.push(structuredClone(message));
        (window as any).__releaseAnalysis = () => {
          Worker.prototype.postMessage = postMessage;
          for (const request of pending) postMessage.call(held!, request);
        };
        return;
      }
      return (postMessage as any).call(this, message, ...rest);
    };
  });
  await page.getByRole('button', { name: '到達性と行き止まりを検査', exact: true }).click();
  await expect(page.getByRole('button', { name: '探索を中止', exact: true })).toBeVisible();
  if (fixedEdition) {
    await expect.poll(() => page.evaluate(() => (window as any).__analysisWaiting)).toBe(true);
    await navigate(page, /^資料/);
    await reader(page);
    await expect(page.getByLabel('試読する作品版', { exact: true })).toBeDisabled();
    await page.evaluate(() => (window as any).__releaseAnalysis());
  } else await page.getByRole('button', { name: '探索を中止', exact: true }).click();
  await expect(page.locator('.analysis-result-heading')).toContainText('探索打切り');
  const cancelled = await result(page);
  expect(cancelled.truncated).toBe(true);
  expect(cancelled.status).not.toBe('passed_for_checked_scope');
  expect(cancelled.contentVersionId).toBe(fixedEdition ? snapshotId : project.projectId);
  expect(cancelled.limits).toEqual({ maxStates: 100000, maxTransitions: 10000, maxMs: 30000 });
  expect(await native(page)).toEqual(before);
  await navigate(page, /^資料/);
  await reader(page);
  await expect(page.locator('.analysis-result-heading')).toContainText('探索打切り');
  await expect(page.getByLabel('試読する作品版', { exact: true })).toHaveValue(fixedEdition ? snapshotId : '');
  await expect(page.getByLabel('試読開始時点の世界内tick', { exact: true })).toHaveValue('5');
  expect(await result(page)).toEqual(cancelled);
  await page.getByLabel('試読する作品版', { exact: true }).selectOption(fixedEdition ? '' : snapshotId);
  await expect(page.locator('.analysis-section')).toContainText('選択中の版とは別の版');
  expect(await result(page)).toEqual(cancelled);
  await navigate(page, /^資料/);
  await page.getByLabel('情報の種類', { exact: true }).selectOption('scene');
  await page.locator('.entity-card').filter({ has: page.getByRole('heading', { name: scene.name, exact: true }) }).click();
  const resumed = page.locator('details.advanced-details').filter({ has: page.getByText('詳細データ・ルビ・本文リンクを編集', { exact: true }) });
  if (await resumed.getAttribute('open') === null) await resumed.locator('summary').click();
  await expect(resumed.getByRole('textbox', { name: '詳細データ', exact: true })).toHaveValue(unfinished);
  expect(await native(page)).toEqual(before);
  await resumed.getByRole('textbox', { name: '詳細データ', exact: true }).fill(JSON.stringify(scene.data));
  await page.getByLabel('名前', { exact: true }).fill('通常保存で改訂した場面');
  await page.locator('.editor-footer').getByRole('button', { name: '保存する', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
  await reader(page);
  if (fixedEdition) await expect(page.locator('.analysis-section').getByRole('alert')).toHaveCount(0);
  else {
    await expect(page.locator('.analysis-section').getByRole('alert')).toContainText('現在の内容は再確認');
    const targets = page.locator('.analysis-section').getByRole('button', { name: '対象を開く', exact: true });
    for (const target of await targets.all()) await expect(target).toBeDisabled();
  }
  expect(await result(page)).toEqual(cancelled);
});
