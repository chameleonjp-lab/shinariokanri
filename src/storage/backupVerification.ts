import type {PreparedScenario, InspectOptions, AssetMode} from './archiveData';
import {inspectScenario} from './archive';
import type {ScenarioStore} from './store';
import {checkCancelled, StorageError} from './errors';
import {equalJson, sha256} from './json';

/** Evidence is for these exact selected bytes, never for the current editor. */
export interface BackupInspection {
  fileName: string; sourceHash: string; projectId: string; revision: string; snapshotId: string;
  assetMode: AssetMode; exportedAt: string; checkedAt: string;
  assets: {contentHash: string; mediaType: string; byteSize: number}[];
  missingAssets: number;
}
export interface BackupTrial {
  sourceHash: string; projectId: string; revision: string; restoredAt: string;
  restoredAssets: number; missingAssets: number;
}
export interface BackupCapacity {checkedAt: string; availableBytes?: number}

export async function inspectBackupFile(bytes: Uint8Array, fileName: string, options: InspectOptions = {}) {
  const prepared = await inspectScenario(bytes, options), sourceHash = await sha256(bytes);
  checkCancelled(options.signal);
  const inspection: BackupInspection = {
    fileName, sourceHash, projectId: prepared.project.projectId, revision: prepared.project.revision,
    snapshotId: prepared.manifest.snapshotId, assetMode: prepared.manifest.assetMode,
    exportedAt: prepared.manifest.exportedAt, checkedAt: new Date().toISOString(),
    assets: prepared.assets.map(asset => ({contentHash: asset.contentHash, mediaType: asset.mediaType, byteSize: asset.bytes.byteLength})),
    missingAssets: prepared.summary.missingAssets,
  };
  return {prepared, inspection};
}

/** Reinspect the retained selected bytes; then use the existing atomic clone
 * import. No replacement/merge option or target ID can enter this operation. */
export async function restoreBackupTrial(store: ScenarioStore, bytes: Uint8Array, inspection: BackupInspection, options: InspectOptions = {}) {
  checkCancelled(options.signal);
  if (await sha256(bytes) !== inspection.sourceHash) throw new StorageError('HASH_MISMATCH', '選んだ実ファイルが検査した控えと一致しません。もう一度ファイルを選んでください。');
  const selected = await inspectBackupFile(bytes, inspection.fileName, options);
  const {checkedAt: _previous, ...previous} = inspection, {checkedAt: _current, ...current} = selected.inspection;
  if (!equalJson(previous, current)) throw new StorageError('HASH_MISMATCH', '検査した作品・版・添付内容と一致しません。もう一度ファイルを選んでください。');
  const result = await store.importScenario(selected.prepared, {mode: 'clone', signal: options.signal});
  // Once the atomic import committed, finish readback even if cancellation is
  // requested: a saved copy must not be described as a cancelled write.
  const project = await store.getProject(result.project.projectId);
  if (!project || project.projectId === inspection.projectId || !equalJson(project, result.project)) throw new StorageError('SAVE_FAILED', `試し復元コピー ${result.project.projectId} の保存した版を読み戻せませんでした。元作品は保持しています。`);
  for (const asset of selected.prepared.assets) {
    const restored = await store.getAsset(asset.contentHash);
    if (!restored || restored.byteLength !== asset.bytes.byteLength || await sha256(restored) !== asset.contentHash) throw new StorageError('ASSET_MISSING', `試し復元コピー ${project.projectId} の素材を読み戻せませんでした。元作品は保持しています。`, asset.path);
  }
  const trial: BackupTrial = {sourceHash: inspection.sourceHash, projectId: project.projectId, revision: project.revision,
    restoredAt: new Date().toISOString(), restoredAssets: selected.prepared.assets.length, missingAssets: selected.prepared.summary.missingAssets};
  return {project, prepared: selected.prepared, trial};
}

/** Browser-origin quota is a point-in-time approximation, not Files/iCloud
 * capacity and never proof that an import can commit. */
export async function estimateBackupCapacity(estimate?: () => Promise<{quota?: number; usage?: number}>): Promise<BackupCapacity> {
  const checkedAt = new Date().toISOString();
  try {
    const value = await estimate?.();
    if (typeof value?.quota === 'number' && Number.isFinite(value.quota) && value.quota >= 0 && typeof value.usage === 'number' && Number.isFinite(value.usage) && value.usage >= 0) return {checkedAt, availableBytes: Math.max(0, value.quota - value.usage)};
  } catch { /* Capacity is optional; restoration still has its atomic guards. */ }
  return {checkedAt};
}
