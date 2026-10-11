import { expect, test, type Page } from '@playwright/test';
import { createEntity, createProject, newId, textToRichText } from '../../src/domain/model';
import type { ProjectData } from '../../src/domain/types';
import { exportScenario } from '../../src/storage/archive';
import { nativeDocuments } from '../../src/sync/nativeBridge';
import { valueHash } from '../../src/sync/protocol';
import { createHttpContract } from './httpContract';
import { attachGiven, attachObservation, backup, navigate, openEntity } from './ap04-original-helpers';

// Original AT-N18 clauses remain not_run. Dedicated local HTTP responses prove
// only browser error/retry handling; they do not establish real Auth/RLS/sync.
const accountId = 'a1800000-0000-4000-8000-000000000001';

async function canonical(page: Page) {
  return page.evaluate(async accountId => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`scenario-manager-account-${accountId}`);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const names = ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'recordParts', 'historyKeyframes', 'historyDeltas', 'syncBases', 'syncAcks'].filter(name => db.objectStoreNames.contains(name));
      const tx = db.transaction(names, 'readonly');
      const rows = await Promise.all(names.map(name => new Promise<[string, unknown[]]>((resolve, reject) => {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => resolve([name, request.result]); request.onerror = () => reject(request.error);
      })));
      return Object.fromEntries(rows);
    } finally { db.close(); }
  }, accountId);
}

test('AT-N18 同じ作品の保存・参照・同期失敗を通常 UI で修正または再試行し、成功後だけ完了を表示する', async ({ page }, info) => {
  const p = createProject('AT-N18 同じ入力の復帰');
  const scene = createEntity(p.projectId, 'scene', '保持する本文', { body: textToRichText('失敗しても黙って削除しない本文😀') });
  const entry = createEntity(p.projectId, 'flow_node', '保持する入口', { nodeType: 'entry', sceneId: scene.id });
  const end = createEntity(p.projectId, 'flow_node', '保持する終端', { nodeType: 'terminal', terminalReason: '確認終了' });
  const edge = createEntity(p.projectId, 'flow_edge', '修正する参照', { fromId: entry.id, toId: end.id, label: '参照先へ進む' });
  p.entities.push(scene, entry, end, edge);
  const bytes = await exportScenario(p), unavailableId = newId();
  await attachGiven(info, 'AT-N18', bytes, { accountId, projectId: p.projectId, originalEntityIds: p.entities.map(entity => entity.id), sourceBlockId: scene.data.body[0].id, missingReferenceId: unavailableId, failures: ['native projects put quota once', 'normal JSON edit uses absent reference UUID', 'local dedicated sync bootstrap response is 503 then succeeds'], remoteEvidenceScope: 'local_http_contract_only' });
  let failSync = true;
  const bootstrapRequests: ProjectData[] = [];
  const contract = await createHttpContract(async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (new URL(request.url()).pathname.includes('/auth/v1/token')) return route.fulfill({ json: { access_token: 'fixture-only-memory-token-18', user: { id: accountId }, expires_in: 3600 } });
    const body = request.postDataJSON() as { action?: string; project?: ProjectData } | null;
    if (body?.action === 'bootstrap') {
      if (!body.project) throw new Error('通常同期の登録入力に作品がありません');
      bootstrapRequests.push(structuredClone(body.project));
      if (failSync) return route.fulfill({ status: 503, json: { code: 'TRANSPORT_UNAVAILABLE' } });
      const documents = nativeDocuments(body.project, body.project.revision);
      return route.fulfill({ json: { serverRevision: body.project.revision, documents, contentHash: await valueHash(documents) } });
    }
    return route.fulfill({ json: [] });
  });
  try {
    await page.goto('./');
    await page.getByRole('button', { name: 'アカウント・専用同期', exact: true }).click();
    await page.getByLabel('専用Supabase URL', { exact: true }).fill(contract.url);
    await page.getByLabel('公開用APIキー', { exact: true }).fill('sb_publishable_ap04_retry_fixture');
    await page.getByRole('button', { name: '接続設定を保持', exact: true }).click();
    await page.getByLabel('メール', { exact: true }).fill('ap04-retry@example.invalid');
    await page.getByLabel('パスワード', { exact: true }).fill('fixture-only');
    await page.getByRole('button', { name: '認証してアカウント領域を開く', exact: true }).click();
    await expect(page.getByRole('button', { name: '限定版の閲覧・指摘', exact: true })).toBeVisible();
    // Import into this authenticated fixture scope without reloading the token.
    await page.getByRole('button', { name: '保存ファイルを読み込む', exact: true }).click();
    await page.locator('input[type=file][accept*=".scenario"]').setInputFiles({ name: 'AT-N18.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
    await page.getByLabel('復元方法と対象への影響を確認しました').check();
    await page.getByRole('button', { name: 'この内容で復元する', exact: true }).click();
    await expect(page.locator('.app-shell')).toBeVisible();

    // Save failure keeps the exact same draft and every durable author record.
    await openEntity(page, 'scene', scene.name);
    const beforeSave = await canonical(page);
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put; let armed = true;
      IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        if (armed && this.name === 'projects') { armed = false; throw new DOMException('AT-N18 save quota', 'QuotaExceededError'); }
        return put.apply(this, args);
      };
    });
    await page.getByLabel('名前', { exact: true }).fill('同じ入力から保存を再試行');
    await expect(page.locator('.detail-panel').getByRole('alert')).toContainText('容量');
    await expect(page.locator('.editor-save-state')).toContainText('未保存');
    await expect(page.getByLabel('名前', { exact: true })).toHaveValue('同じ入力から保存を再試行');
    expect(await canonical(page)).toEqual(beforeSave);
    await page.locator('.editor-footer').getByRole('button', { name: '保存を再試行', exact: true }).click();
    await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');
    await expect(page.locator('.detail-heading')).toContainText('同じ入力から保存を再試行');

    // Reference failure comes from a real author edit, not fabricated alert DOM.
    await openEntity(page, 'flow_edge', edge.name);
    const details = page.locator('.detail-panel details.advanced-details').filter({ has: page.locator('summary').filter({ hasText: '詳細データ・ルビ・本文リンクを編集' }) });
    await details.locator('summary').click();
    const raw = details.getByRole('textbox', { name: '詳細データ', exact: true });
    const original = JSON.parse(await raw.inputValue()), invalid = { ...original, toId: unavailableId };
    const beforeReference = await canonical(page);
    await raw.fill(JSON.stringify(invalid, null, 2));
    await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
    await expect(page.locator('.detail-panel').getByRole('alert')).toContainText(/参照|存在/);
    await expect(page.locator('.editor-save-state')).toContainText('未保存');
    await expect(raw).toHaveValue(JSON.stringify(invalid, null, 2));
    expect(await canonical(page)).toEqual(beforeReference);
    await raw.fill(JSON.stringify(original, null, 2));
    await page.locator('.editor-footer').getByRole('button', { name: /保存する|保存を再試行/ }).click();
    await expect(page.locator('.editor-save-state')).toContainText('端末内保存済み');

    // The ordinary sync registration fails visibly and retries the same image.
    await navigate(page, /^作品・保存/);
    await page.getByRole('tab', { name: '同期・限定共有', exact: true }).click();
    const sync = page.getByRole('region', { name: '端末間同期と競合', exact: true });
    const beforeSync = await canonical(page);
    await sync.getByRole('button', { name: 'この作品を専用接続先へ新規登録', exact: true }).click();
    await expect(sync.getByRole('alert')).toContainText('TRANSPORT_UNAVAILABLE');
    await expect(sync).not.toContainText('新しいサーバー正本と確定共通元を保存しました');
    expect(await canonical(page)).toEqual(beforeSync);
    await expect(sync.getByRole('button', { name: 'この作品を専用接続先へ新規登録', exact: true })).toBeEnabled();
    failSync = false;
    await sync.getByRole('button', { name: 'この作品を専用接続先へ新規登録', exact: true }).click();
    await expect(sync).toContainText('新しいサーバー正本と確定共通元を保存しました');
    await expect(sync.getByRole('alert')).toHaveCount(0);
    expect(bootstrapRequests).toHaveLength(2);
    expect(bootstrapRequests[1]).toEqual(bootstrapRequests[0]);
    const savedFile = await backup(page);
    expect(savedFile.project.entities.map(entity => entity.id).sort()).toEqual(p.entities.map(entity => entity.id).sort());
    expect(savedFile.project.entities.find(entity => entity.id === scene.id)?.data).toEqual(scene.data);
    expect(savedFile.project.entities.find(entity => entity.id === scene.id)?.name).toBe('同じ入力から保存を再試行');
    expect(savedFile.project.entities.find(entity => entity.id === edge.id)?.data).toEqual(original);
    expect(savedFile.project.history.length).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: '画面を表示できませんでした', exact: true })).toHaveCount(0);
    await attachObservation(info, 'AT-N18-observation', { saveFailureNativeUnchanged: true, referenceFailureNativeUnchanged: true, syncFailureNativeUnchanged: true, syncRetryImageIdentical: true, completedOnlyAfterSuccess: true, preservedEntityIds: savedFile.project.entities.map(entity => entity.id), retainedBodyBlockId: scene.data.body[0].id, revision: savedFile.project.revision, realAuthOrRemoteSyncObserved: false });
  } finally { await contract.close(); }
});
