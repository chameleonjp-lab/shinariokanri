import {expect, test} from '@playwright/test';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {platform, release} from 'node:os';
import {createEntity, createProject, textToRichText} from '../../src/domain/model';
import {exportScenario, inspectScenario} from '../../src/storage/archive';
import {jsonBytes, sha256} from '../../src/storage/json';

// Read every native table. Keep navigation bytes in the evidence separately:
// an actual button click may scroll, and the App remembers that reading position.
async function nativeSnapshot() {
  const names = (await indexedDB.databases()).map(item => item.name!).filter(name => name.startsWith('scenario-manager')).sort();
  return Promise.all(names.map(name => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open(name); request.onsuccess = () => {
      const db = request.result, tables = [...db.objectStoreNames], rows: Record<string, unknown[]> = {};
      const transaction = db.transaction(tables, 'readonly');
      for (const table of tables) { const read = transaction.objectStore(table).getAll(); read.onsuccess = () => { rows[table] = read.result; }; }
      transaction.oncomplete = () => {
        db.close();
        const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        void Promise.all([digest(tables.map(table => [table, rows[table]])), Promise.all(tables.map(async table => ({table, count: rows[table].length, sha256: await digest(rows[table])})))])
          .then(([hash, tableFingerprints]) => resolve({name, tables, viewStateRows: rows.viewStates, sha256: hash, tableFingerprints}), reject);
      };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  })));
}
let fixtures: {original: ReturnType<typeof createProject>; incoming: ReturnType<typeof createProject>; originalBytes: Uint8Array; bytes: Uint8Array};
test.beforeAll(async () => {
  const original = createProject('取消で保持する作品');
  original.entities.push(createEntity(original.projectId, 'note', '残す原本文', {body: textToRichText('😀保持する原本文')}));
  const incoming = createProject('Worker検査を取消・再試行する作品');
  incoming.entities = Array.from({length: 3_200}, (_, index) => createEntity(incoming.projectId, 'note', `取り込む原稿${index}`, {
    body: textToRichText(`😀𠮷野の原稿${index} ` + '境界の本文'.repeat(200)),
  }));
  fixtures = {original, incoming, originalBytes: await exportScenario(original), bytes: await exportScenario(incoming)};
});
// Supplemental production-browser evidence. The native Worker is observed,
// never replaced or paused; this does not represent a physical device check.
test('実Workerで復元検査中も画面が応答し、取消で既存データを保持して再試行・cold再読込する', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900});
  const {original, incoming, originalBytes, bytes} = fixtures;
  const originalPath = test.info().outputPath('actual-worker-existing.scenario');
  await mkdir(dirname(originalPath), {recursive: true}); await writeFile(originalPath, originalBytes);
  await test.info().attach('actual-worker-existing.scenario', {path: originalPath, contentType: 'application/zip'});
  await page.goto('./'); await page.getByRole('button', {name: '保存ファイルを読み込む', exact: true}).click();
  await page.locator('input[type=file]').setInputFiles({name: 'existing.scenario', mimeType: 'application/zip', buffer: Buffer.from(originalBytes)});
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  await page.getByRole('button', {name: 'この内容で復元する', exact: true}).click(); await expect(page.locator('.app-shell')).toBeVisible();
  await page.locator('.sidebar').getByRole('button', {name: '作品・保存', exact: true}).click();
  await page.getByRole('tab', {name: '完全保存・復元', exact: true}).click();
  const inputPath = test.info().outputPath('actual-worker-input.scenario');
  await mkdir(dirname(inputPath), {recursive: true}); await writeFile(inputPath, bytes);
  await test.info().attach('actual-worker-input.scenario', {path: inputPath, contentType: 'application/zip'});
  await page.locator('input[type=file]').setInputFiles({name: 'worker.scenario', mimeType: 'application/zip', buffer: Buffer.from(bytes)});
  await page.getByLabel('復元方法と対象への影響を確認しました').check();
  const before = await page.evaluate(nativeSnapshot);
  await page.evaluate(() => {
    const scope = window as unknown as {__importWorkObservation: {steps: {step: string; at: number}[]; terminations: number; frames: number[]; ticks: number[]; startedAt: number; endedAt?: number; active: boolean}};
    const observation: typeof scope.__importWorkObservation = {steps: [], terminations: 0, frames: [], ticks: [], startedAt: performance.now(), active: true};
    scope.__importWorkObservation = observation;
    const post = Worker.prototype.postMessage, terminate = Worker.prototype.terminate;
    Worker.prototype.postMessage = function (message: any, transferOrOptions?: Transferable[] | StructuredSerializeOptions) {
      if (message?.type === 'import-work') observation.steps.push({step: message.work.step, at: performance.now()});
      return Reflect.apply(post, this, [message, transferOrOptions]);
    };
    Worker.prototype.terminate = function () { observation.terminations++; return terminate.call(this); };
    const frame = (at: number) => { if (observation.active) { observation.frames.push(at); requestAnimationFrame(frame); } }; requestAnimationFrame(frame);
    const timer = setInterval(() => { if (observation.active) observation.ticks.push(performance.now()); else clearInterval(timer); }, 20);
  });
  await page.getByRole('button', {name: 'この内容で復元する', exact: true}).click();
  await page.waitForFunction(() => (window as any).__importWorkObservation.steps.some((item: any) => item.step === 'structure'));
  await page.locator('.backup-page [role=status]').getByRole('button', {name: '中止', exact: true}).click();
  await expect(page.locator('.backup-page').getByRole('alert')).toContainText(/取り消/);
  const observed = await page.evaluate(() => { const value = (window as any).__importWorkObservation; value.active = false; value.endedAt = performance.now(); return value; });
  const maximumGap = (samples: number[]) => Math.max(...[observed.startedAt, ...samples, observed.endedAt].slice(1).map((at, index) => at - [observed.startedAt, ...samples][index]));
  const response = {maxFrameGapMs: maximumGap(observed.frames), maxTimerGapMs: maximumGap(observed.ticks)};
  const responsePath = test.info().outputPath('actual-worker-response.json');
  await writeFile(responsePath, jsonBytes({nativeWorkerObservation: observed, supplementalResponse: response, viewport: page.viewportSize()}));
  await test.info().attach('actual-worker-response.json', {path: responsePath, contentType: 'application/json'});
  expect(observed.steps.some((item: {step: string}) => item.step === 'structure')).toBe(true);
  expect(observed.terminations).toBeGreaterThan(0); expect(observed.frames.length).toBeGreaterThan(0); expect(observed.ticks.length).toBeGreaterThan(0);
  expect(response.maxFrameGapMs).toBeLessThanOrEqual(2_000); expect(response.maxTimerGapMs).toBeLessThanOrEqual(2_000);
  const after = await page.evaluate(nativeSnapshot);
  const cancellationPath = test.info().outputPath('actual-worker-cancellation.json');
  await writeFile(cancellationPath, jsonBytes({before, after, nativeWorkerObservation: observed, supplementalResponse: response}));
  await test.info().attach('actual-worker-cancellation.json', {path: cancellationPath, contentType: 'application/json'});
  const projectTables = (snapshots: typeof before) => snapshots.map(({name, tables, tableFingerprints}) => ({name, tables, tableFingerprints: tableFingerprints.filter((table: {table: string}) => table.table !== 'viewStates')}));
  expect(projectTables(after)).toStrictEqual(projectTables(before));
  const workspaces = before.flatMap(({name, viewStateRows}) => viewStateRows.filter((row: any) => row.projectId === original.projectId && row.viewId === 'workspace' && row.deviceClass === 'desktop').map((row: any) => ({name, row})));
  expect(workspaces).toHaveLength(1); const workspace = workspaces[0];
  const expectedRow = (name: string, row: any) => name === workspace.name && row.key === workspace.row.key && row.projectId === original.projectId && row.viewId === 'workspace';
  expect(workspace.row.filters['workspace.scrollY']).toMatch(/^(?:0|[1-9]\d*)$/);
  const navigation = (snapshots: typeof before) => snapshots.map(({name, viewStateRows}) => ({name, rows: viewStateRows.map((row: any) => expectedRow(name, row) ? {...row, filters: Object.fromEntries(Object.entries(row.filters).filter(([field]) => field !== 'workspace.scrollY'))} : row)}));
  expect(navigation(after)).toStrictEqual(navigation(before));
  for (const snapshot of after) for (const row of snapshot.viewStateRows) if (expectedRow(snapshot.name, row)) expect(row.filters['workspace.scrollY']).toMatch(/^(?:0|[1-9]\d*)$/);
  await expect(page.locator('.project-switch strong')).toHaveText(original.name);
  await expect(page.getByLabel('復元方法と対象への影響を確認しました')).toBeChecked();
  await page.getByRole('button', {name: 'この内容で復元する', exact: true}).click();
  // Restore inspection and atomic import are a cancellable long operation.
  // Wait for its completion within the unchanged whole-test budget before
  // asserting the screen state and interrupting it with a cold reload.
  await page.locator('.import-preview').waitFor({state: 'hidden'});
  await expect(page.locator('.import-preview')).toBeHidden(); await page.reload(); await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.project-switch strong')).toHaveText(incoming.name);
  await page.locator('.sidebar').getByRole('button', {name: '作品・保存', exact: true}).click();
  await page.getByRole('tab', {name: '完全保存・復元', exact: true}).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', {name: '完全保存ファイルを作成', exact: true}).click();
  const output = new Uint8Array(await readFile((await (await download).path())!)), restored = await inspectScenario(output, {worker: false});
  expect(restored.project.projectId).toBe(incoming.projectId); expect(restored.project.entities).toEqual(incoming.entities);
  const outputPath = test.info().outputPath('actual-worker-output.scenario'); await writeFile(outputPath, output);
  await test.info().attach('actual-worker-output.scenario', {path: outputPath, contentType: 'application/zip'});
  const record = {scope: 'supplemental actual Linux production browser; not physical/manual/full116', engine: test.info().project.name, viewport: page.viewportSize(),
    browserVersion: page.context().browser()!.version(), userAgent: await page.evaluate(() => navigator.userAgent), hostOS: {platform: platform(), release: release()},
    input: {bytes: bytes.length, sha256: await sha256(bytes)}, output: {bytes: output.length, sha256: await sha256(output)},
    beforeCancellation: before, afterCancellation: after, nativeWorkerObservation: observed, supplementalResponse: response, coldRestoredRecords: restored.project.entities.length};
  const recordPath = test.info().outputPath('actual-worker-observation.json'); await writeFile(recordPath, jsonBytes(record));
  await test.info().attach('actual-worker-observation.json', {path: recordPath, contentType: 'application/json'});
});
