import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { createProject, newId, textToRichText, validateProject } from '../../src/domain/model';
import { prepareAsset } from '../../src/domain/attachments';
import { exportScenario } from '../../src/storage/archive';
import { attachGiven, attachObservation, authorFingerprint, backup, clause, entity, findEntity, navigate, relation, seed } from './ap04-original-bm-helpers';

async function durableAssets(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('scenario-manager-local-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { const rows = await new Promise<unknown[]>((resolve, reject) => { const request = db.transaction('assets', 'readonly').objectStore('assets').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const normalize = (value: unknown): unknown => value instanceof ArrayBuffer ? Array.from(new Uint8Array(value)) : ArrayBuffer.isView(value) ? Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) : Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)])) : value;
      return JSON.stringify(normalize(rows));
    } finally { db.close(); }
  });
}

test('AT-B12 同じ条件・本文・関係・実素材を新規端末作品へ読み戻し四種の不正入力を原作品から拒否する', async ({ page, browser }, info) => {
  const p = createProject('AT-B12 完全保存の原条件'), a = entity(p, 'character', '保存した人物A'), b = entity(p, 'character', '保存した人物B'), state = entity(p, 'variable', '保存した条件値', { key: 'archive_flag', valueType: 'boolean', initial: { type: 'boolean', value: true }, scope: 'run' }), event = entity(p, 'event', '保存した出来事'), body = textToRichText('保存した人物Aの本文。');
  body[0].links = [{ start: 0, end: 7, target: { entityId: a.id } }];
  const scene = entity(p, 'scene', '保存した本文', { body, eventIds: [event.id] }), entry = entity(p, 'flow_node', '保存した入口条件', { nodeType: 'entry', sceneId: scene.id, gate: { op: 'compare', variableId: state.id, comparator: 'eq', value: { type: 'boolean', value: true } } }); relation(p, a.id, b.id, 'trust');
  const prepared = await prepareAsset(new Uint8Array(await readFile('tests/fixtures/media/fixture-tone.wav')), '同じ保存素材.wav', 'audio/wav'), { bytes: mediaBytes, preview: _preview, ...metadata } = prepared, attachment = entity(p, 'attachment', '完全保存の実音声', metadata), cue = entity(p, 'cue', '本文と実音声の対応', { anchor: { entityId: scene.id }, cueType: 'audio', attachmentId: attachment.id });
  let downloaded: Uint8Array = new Uint8Array();
  await clause('AT-B12', 'given', async () => { const valid = validateProject(p); if (!valid.ok) throw new Error(JSON.stringify(valid.issues)); const input = await exportScenario(p, { loadAsset: hash => hash === prepared.contentHash ? mediaBytes : undefined }); await attachGiven(info, 'AT-B12', input, { condition: entry.data.gate, bodySceneId: scene.id, bodyLinkId: a.id, relationIds: p.relations.map(r => r.id), attachmentId: attachment.id, cueId: cue.id, assetHash: prepared.contentHash }); await seed(page, input); downloaded = (await backup(page)).bytes; });
  const context = await browser.newContext({ baseURL: info.project.use.baseURL });
  try {
    const restoredPage = await context.newPage();
    await clause('AT-B12', 'when', async () => { await seed(restoredPage, downloaded); });
    await clause('AT-B12', 'then', async () => {
      const restored = await backup(restoredPage); expect(restored.project.projectId).toBe(p.projectId); expect(restored.project.entities.map(e => e.id)).toEqual(p.entities.map(e => e.id)); for (const record of p.entities) expect(findEntity(restored.project, record.id, record.kind).data).toEqual(record.data); expect(restored.project.relations).toEqual(p.relations); expect(restored.assets).toHaveLength(1); expect(restored.assets[0].contentHash).toBe(prepared.contentHash); expect(Array.from(restored.assets[0].bytes)).toEqual(Array.from(mediaBytes)); expect(findEntity(restored.project, cue.id, 'cue').data.attachmentId).toBe(attachment.id); expect(findEntity(restored.project, attachment.id, 'attachment').data.assetPath).toBe(restored.assets[0].path); await attachObservation(info, 'AT-B12-restored', { projectId: restored.project.projectId, entityIds: restored.project.entities.map(e => e.id), relations: restored.project.relations, assetHash: restored.assets[0].contentHash, bytes: restored.assets[0].bytes.length });
    });
  } finally { await context.close(); }
  await clause('AT-B12', 'negative_or_edge', async () => {
    await navigate(page, /^作品・保存/); await page.getByRole('tab', { name: '完全保存・復元', exact: true }).click(); const before = await authorFingerprint(page), assetsBefore = await durableAssets(page), original = await backup(page);
    const rewrite = (mutate: (files: Record<string, Uint8Array>) => void) => { const files = unzipSync(downloaded); mutate(files); return zipSync(files, { level: 0 }); };
    const bad: { name: string; bytes: Uint8Array; reason: RegExp }[] = [
      { name: 'payload-hash.scenario', bytes: rewrite(files => { files['data/project.json'][4] ^= 1; }), reason: /HASH_MISMATCH|SHA-256|ハッシュ/ },
      { name: 'unsupported-reader.scenario', bytes: rewrite(files => { const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])); manifest.minimumReaderVersion = '99.0.0'; files['manifest.json'] = strToU8(JSON.stringify(manifest)); }), reason: /新しいアプリ|FORMAT_UNSUPPORTED/ },
      { name: 'unsafe-path.scenario', bytes: rewrite(files => { files['../outside.json'] = strToU8('{}'); }), reason: /パス|ARCHIVE_INVALID/ },
      { name: 'broken-reference.scenario', bytes: rewrite(files => { const source = JSON.parse(new TextDecoder().decode(files['data/project.json'])); source.entities.find((e: { id: string }) => e.id === event.id).data.locationId = newId(); files['data/project.json'] = strToU8(JSON.stringify(source)); const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])); const row = manifest.files.find((f: { path: string }) => f.path === 'data/project.json'); row.byteSize = files['data/project.json'].length; row.sha256 = createHash('sha256').update(files['data/project.json']).digest('hex'); files['manifest.json'] = strToU8(JSON.stringify(manifest)); }), reason: /参照|VALIDATION_FAILED/ },
    ];
    for (const input of bad) { await page.getByLabel('保存ファイルを選ぶ', { exact: true }).setInputFiles({ name: input.name, mimeType: 'application/zip', buffer: Buffer.from(input.bytes) }); await expect(page.locator('.backup-page').getByRole('alert')).toContainText(input.reason); expect(await authorFingerprint(page)).toBe(before); expect(await durableAssets(page)).toBe(assetsBefore); await attachObservation(info, `AT-B12-rejected-${input.name}`, { archiveSha256: createHash('sha256').update(input.bytes).digest('hex'), visibleReason: await page.locator('.backup-page').getByRole('alert').textContent(), unchangedAuthorRecords: true, unchangedAssetBytes: true }); }
    await page.reload(); const after = await backup(page); expect(after.project).toEqual(original.project); expect(after.assets.map(asset => ({ path: asset.path, hash: asset.contentHash, bytes: Array.from(asset.bytes) }))).toEqual(original.assets.map(asset => ({ path: asset.path, hash: asset.contentHash, bytes: Array.from(asset.bytes) })));
  });
});
