import { inspectScenarioData, type ArchiveProgress } from './archiveData';
import { StorageError } from './errors';
import type { LimitOverrides } from './json';
import {createImportWorkWorkerRunner, freezeCapturedImportWork, type ImportWork} from './importWork';
import {runNewImportWork, type NewImportInput} from './newImportWork';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
let nextAsset = 0;
const assets = new Map<number, {resolve: (bytes: Uint8Array | undefined) => void; reject: (cause: unknown) => void}>();
const importWorkRunner = createImportWorkWorkerRunner();
let nextCallback = 0;
const callbacks = new Map<number, (result: any) => void>();
scope.onmessage = event => {
  if (event.data.type === 'new-import-callback-result') {
    const resolve = callbacks.get(event.data.id); callbacks.delete(event.data.id);
    resolve?.(event.data.result);
    return;
  }
  if (event.data.type === 'new-import') {
    const requestId = event.data.requestId;
    importWorkRunner.reset();
    const ask = (action: string, input?: unknown): Promise<any> => new Promise(resolve => {
      const id = ++nextCallback; callbacks.set(id, resolve);
      scope.postMessage({type: 'new-import-callback', requestId, id, action, input});
    });
    void runNewImportWork(event.data.input as NewImportInput, {
      stage: step => ask('stage', step), preview: () => ask('preview'), assets: () => ask('assets'),
      finalize: input => ask('finalize', input),
    }, work => work.step === 'ids'
      // IDs still originate solely in the native MessageEvent's captured graph.
      ? importWorkRunner.runNativeClonedInput(work) : importWorkRunner.run(work))
      .then(result => scope.postMessage({type: 'done', requestId, result}))
      .catch(error => {
        const value = error instanceof StorageError ? error : new StorageError('SAVE_FAILED', '復元の確認処理を完了できませんでした。');
        scope.postMessage({type: 'error', requestId, error: {code: value.code, message: value.message, path: value.path, issues: error?.issues ?? []}});
      });
    return;
  }
  if (event.data.type === 'import-asset') {
    const pending = assets.get(event.data.id); assets.delete(event.data.id);
    const error = event.data.error;
    if (error) pending?.reject(Object.assign(new StorageError(error.code, error.message, error.path), {issues: error.issues ?? []}));
    else pending?.resolve(event.data.bytes);
    return;
  }
  if (event.data.type === 'import-work') {
    const requestId = event.data.requestId;
    const work = freezeCapturedImportWork(event.data.work as ImportWork);
    void importWorkRunner.runNativeClonedInput(work, undefined, hash => new Promise((resolve, reject) => {
      const id = ++nextAsset; assets.set(id, {resolve, reject}); scope.postMessage({type: 'asset', requestId, id, hash});
    }))
      .then(result => scope.postMessage({type: 'done', requestId, result}))
      .catch(error => {
        const value = error instanceof StorageError ? error : new StorageError('SAVE_FAILED', '復元の確認処理を完了できませんでした。');
        scope.postMessage({type: 'error', requestId, error: {code: value.code, message: value.message, path: value.path, issues: error?.issues ?? []}});
      });
    return;
  }
  importWorkRunner.reset();
  const { bytes, limits } = event.data as { bytes: Uint8Array; limits?: LimitOverrides };
  void inspectScenarioData(bytes, { limits, onProgress: (progress: ArchiveProgress) => scope.postMessage({ type: 'progress', progress }) })
    .then(prepared => scope.postMessage({ type: 'done', prepared }, prepared.assets.map(asset => asset.bytes.buffer as ArrayBuffer)))
    .catch(error => {
      const value = error instanceof StorageError ? error : new StorageError('ARCHIVE_INVALID', '専用ファイルの解析に失敗しました。');
      scope.postMessage({ type: 'error', error: { code: value.code, message: value.message, path: value.path } });
    });
};
