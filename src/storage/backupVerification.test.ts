import 'fake-indexeddb/auto';
import {afterEach, describe, expect, it} from 'vitest';
import {createEntity, createProject, newId, textToRichText} from '../domain/model';
import {assetPath} from './archiveData';
import * as archive from './archive';
import {ScenarioStore, type FaultStage} from './store';
import {sha256} from './json';

const stores: ScenarioStore[] = [];
function open(faultInjector?: (stage: FaultStage) => void) {
  const store = new ScenarioStore({databaseName: `backup-check-${newId()}`, faultInjector}); stores.push(store); return store;
}
afterEach(async () => {for (const store of stores.splice(0)) await store.deleteDatabase();});
async function fixture() {
  const store = open(), project = createProject('画像・音声を持つ教材');
  project.entities.push(createEntity(project.projectId, 'scene', '教材の本文', {body: textToRichText('元作品を残す😀')}));
  const materials = [
    {name: '画像', mediaType: 'image/png', bytes: new Uint8Array([137,80,78,71,13,10,26,10])},
    {name: '音声', mediaType: 'audio/wav', bytes: new TextEncoder().encode('RIFF0000WAVE')},
  ];
  for (const material of materials) {
    const contentHash = await sha256(material.bytes), path = assetPath(contentHash, material.mediaType);
    project.entities.push(createEntity(project.projectId, 'attachment', material.name, {contentHash, mediaType: material.mediaType, byteSize: material.bytes.length, assetPath: path}));
    await store.putAsset(contentHash, material.bytes, material.mediaType);
  }
  const saved = (await store.saveProject(project, {reason: '試験元の教材'})).project;
  return {store, saved, materials};
}

describe('選んだ実ファイルと隔離した試し復元', () => {
  it('binds inspection to actual file bytes, source revision, mode and material hashes', async () => {
    expect(archive.inspectBackupFile).toBeTypeOf('function');
    const {store, saved} = await fixture(), bytes = await store.exportProject(saved.projectId);
    const result = await archive.inspectBackupFile(bytes, 'files.scenario');
    expect(result.inspection).toMatchObject({fileName: 'files.scenario', sourceHash: await sha256(bytes), projectId: saved.projectId, revision: saved.revision, assetMode: 'embedded'});
    expect(result.inspection.assets.map(asset => asset.mediaType).sort()).toEqual(['audio/wav', 'image/png']);
    expect(result.inspection.checkedAt).toMatch(/^\d{4}-/);
    expect(result.inspection).not.toHaveProperty('trial');
    await expect(archive.inspectBackupFile(bytes.slice(0, 20), 'broken.scenario')).rejects.toMatchObject({code: 'ARCHIVE_INVALID'});
    const controller = new AbortController(); controller.abort();
    await expect(archive.inspectBackupFile(bytes, 'cancel.scenario', {signal: controller.signal})).rejects.toMatchObject({code: 'CANCELLED'});
  });
  it('reads text and both material types back from a new copy while preserving original history and pending operations', async () => {
    expect(archive.restoreBackupTrial).toBeTypeOf('function');
    const {store, saved, materials} = await fixture(), bytes = await store.exportProject(saved.projectId), before = await store.getProject(saved.projectId), pending = await store.listOutbox(saved.projectId);
    const {inspection} = await archive.inspectBackupFile(bytes, 'full.scenario');
    const result = await archive.restoreBackupTrial(store, bytes, inspection);
    expect(result.project.projectId).not.toBe(saved.projectId);
    expect(result.project.entities.find(entity => entity.kind === 'scene')).toMatchObject({data: {body: [{text: '元作品を残す😀'}]}});
    expect(result.trial).toMatchObject({projectId: result.project.projectId, revision: result.project.revision, sourceHash: inspection.sourceHash, restoredAssets: 2, missingAssets: 0});
    for (const material of materials) expect(await store.getAsset(await sha256(material.bytes))).toEqual(material.bytes);
    expect(await store.getProject(saved.projectId)).toEqual(before);
    expect(await store.listOutbox(saved.projectId)).toEqual(pending);
  });
  it('never counts metadata-only recovery as restoring omitted materials, even when originals exist locally', async () => {
    expect(archive.restoreBackupTrial).toBeTypeOf('function');
    const {store, saved} = await fixture(), bytes = await store.exportProject(saved.projectId, {assetMode: 'metadata_only'}), {inspection} = await archive.inspectBackupFile(bytes, 'metadata.scenario');
    const result = await archive.restoreBackupTrial(store, bytes, inspection);
    expect(result.trial).toMatchObject({restoredAssets: 0, missingAssets: 2});
    expect(result.prepared.warnings.join('')).toContain('添付');
    expect(await store.getProject(saved.projectId)).toEqual(saved);
  });
  it('rejects another file or cancellation before any clone and rolls quota failure back atomically', async () => {
    expect(archive.restoreBackupTrial).toBeTypeOf('function');
    const {store, saved} = await fixture(), bytes = await store.exportProject(saved.projectId), {inspection} = await archive.inspectBackupFile(bytes, 'full.scenario');
    const other = await store.exportProject(saved.projectId, {assetMode: 'metadata_only'});
    await expect(archive.restoreBackupTrial(store, other, inspection)).rejects.toMatchObject({code: 'HASH_MISMATCH'});
    const controller = new AbortController(); controller.abort();
    await expect(archive.restoreBackupTrial(store, bytes, inspection, {signal: controller.signal})).rejects.toMatchObject({code: 'CANCELLED'});
    const target = open(stage => {if (stage === 'before-commit') throw new DOMException('test full', 'QuotaExceededError');});
    await expect(archive.restoreBackupTrial(target, bytes, inspection)).rejects.toMatchObject({code: 'QUOTA_EXCEEDED'});
    expect(await target.listProjectSummaries()).toEqual([]);
    expect(await store.getProject(saved.projectId)).toEqual(saved);
  });
  it('treats capacity as a dated estimate and handles unavailable, rejected or invalid estimates honestly', async () => {
    expect(archive.estimateBackupCapacity).toBeTypeOf('function');
    expect(await archive.estimateBackupCapacity(async () => ({quota: 10000, usage: 3000}))).toMatchObject({availableBytes: 7000, checkedAt: expect.any(String)});
    for (const estimator of [undefined, async () => {throw new Error('unavailable');}, async () => ({}), async () => ({quota: NaN, usage: 0}), async () => ({quota: 10, usage: -1})]) {
      expect(await archive.estimateBackupCapacity(estimator)).toEqual({checkedAt: expect.any(String)});
    }
  });
});
