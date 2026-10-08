import { inspectScenarioData, type ArchiveProgress } from './archive';
import { StorageError } from './errors';
import type { LimitOverrides } from './json';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = event => {
  const { bytes, limits } = event.data as { bytes: Uint8Array; limits?: LimitOverrides };
  void inspectScenarioData(bytes, { limits, onProgress: (progress: ArchiveProgress) => scope.postMessage({ type: 'progress', progress }) })
    .then(prepared => scope.postMessage({ type: 'done', prepared }, prepared.assets.map(asset => asset.bytes.buffer as ArrayBuffer)))
    .catch(error => {
      const value = error instanceof StorageError ? error : new StorageError('ARCHIVE_INVALID', '専用ファイルの解析に失敗しました。');
      scope.postMessage({ type: 'error', error: { code: value.code, message: value.message, path: value.path } });
    });
};
