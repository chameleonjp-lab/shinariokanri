import { inspectScenarioData, type ArchiveProgress } from './archiveData';
import { StorageError } from './errors';
import type { LimitOverrides } from './json';
import {runImportWork, type ImportWork} from './importWork';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let nextAsset = 0;
const assets = new Map<number, {resolve: (bytes: Uint8Array | undefined) => void; reject: (cause: unknown) => void}>();
scope.onmessage = event => {
  if (event.data.type === 'import-asset') {
    const pending = assets.get(event.data.id); assets.delete(event.data.id);
    const error = event.data.error;
    if (error) pending?.reject(Object.assign(new StorageError(error.code, error.message, error.path), {issues: error.issues ?? []}));
    else pending?.resolve(event.data.bytes);
    return;
  }
  if (event.data.type === 'import-work') {
    void runImportWork(event.data.work as ImportWork, undefined, hash => new Promise((resolve, reject) => {
      const id = ++nextAsset; assets.set(id, {resolve, reject}); scope.postMessage({type: 'asset', id, hash});
    }))
      .then(result => scope.postMessage({type: 'done', result}))
      .catch(error => {
        const value = error instanceof StorageError ? error : new StorageError('SAVE_FAILED', '復元の確認処理を完了できませんでした。');
        scope.postMessage({type: 'error', error: {code: value.code, message: value.message, path: value.path, issues: error?.issues ?? []}});
      });
    return;
  }
  const { bytes, limits } = event.data as { bytes: Uint8Array; limits?: LimitOverrides };
  void inspectScenarioData(bytes, { limits, onProgress: (progress: ArchiveProgress) => scope.postMessage({ type: 'progress', progress }) })
    .then(prepared => scope.postMessage({ type: 'done', prepared }, prepared.assets.map(asset => asset.bytes.buffer as ArrayBuffer)))
    .catch(error => {
      const value = error instanceof StorageError ? error : new StorageError('ARCHIVE_INVALID', '専用ファイルの解析に失敗しました。');
      scope.postMessage({ type: 'error', error: { code: value.code, message: value.message, path: value.path } });
    });
};
