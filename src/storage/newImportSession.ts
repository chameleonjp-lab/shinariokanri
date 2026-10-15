import {checkCancelled, saveError, StorageError} from './errors';
import type {NewImportCallbacks, NewImportInput, NewImportResult} from './newImportWork';

/** Browser-only, one operation per worker. Request IDs and termination keep
 * late callback responses from surviving a cancellation or failure. */
export function prepareNewImport(input: NewImportInput, callbacks: NewImportCallbacks, signal?: AbortSignal): Promise<NewImportResult> {
  checkCancelled(signal);
  const worker = new Worker(new URL('./archive.worker.ts', import.meta.url), {type: 'module'});
  return new Promise((resolve, reject) => {
    let live = true;
    const cancelled = () => new StorageError('CANCELLED', '復元の確認を取り消しました。既存作品と元ファイルは変更していません。');
    const finish = (error?: unknown, result?: NewImportResult) => {
      if (!live) return;
      live = false; signal?.removeEventListener('abort', abort); worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const abort = () => finish(cancelled());
    worker.onmessage = event => {
      const message = event.data;
      if (!live || message.requestId !== 1) return;
      if (message.type === 'done') {
        try { checkCancelled(signal); finish(undefined, message.result); } catch (error) { finish(error); }
      } else if (message.type === 'error') {
        finish(Object.assign(new StorageError(message.error.code, message.error.message, message.error.path), {issues: message.error.issues ?? []}));
      } else if (message.type === 'new-import-callback') {
        void Promise.resolve().then(async (): Promise<unknown> => {
          checkCancelled(signal);
          switch (message.action) {
            case 'stage': return callbacks.stage(message.input);
            case 'preview': return callbacks.preview();
            case 'assets': return callbacks.assets();
            case 'finalize': return callbacks.finalize(message.input);
            default: throw new StorageError('FORMAT_UNSUPPORTED', '読み込みの確認工程が未対応です。');
          }
        }).then(result => {
          if (!live) return;
          checkCancelled(signal); worker.postMessage({type: 'new-import-callback-result', requestId: 1, id: message.id, result});
        }).catch(cause => {
          if (!live) return;
          const error = saveError(cause);
          // Stop preparation immediately: a failed callback must never reach
          // the native transaction, even if its worker response is delayed.
          finish(Object.assign(error, {issues: (cause as {issues?: unknown[]})?.issues ?? []}));
        });
      }
    };
    worker.onerror = () => finish(new StorageError('SAVE_FAILED', '復元の確認処理を完了できませんでした。既存作品と元ファイルは保持しています。'));
    signal?.addEventListener('abort', abort, {once: true});
    try { checkCancelled(signal); worker.postMessage({type: 'new-import', requestId: 1, input}); } catch (error) { finish(error); }
  });
}
