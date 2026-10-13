import {checkCancelled, saveError, StorageError} from './errors';
import {runImportWork, type ImportWork, type ImportWorkResult} from './importWork';

type WorkOptions = {signal?: AbortSignal; loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined};

/** One operation owns one worker. Every step still captures and checks its full
 * input, and request IDs keep delayed results/assets out of subsequent steps. */
export function createImportWorkSession() {
  let worker: Worker | undefined, closed = false, sequence = 0;
  let active: {id: number; finish: (error?: unknown, result?: ImportWorkResult) => void} | undefined;
  const cancelled = () => new StorageError('CANCELLED', '復元の確認を取り消しました。既存作品と元ファイルは変更していません。');
  const dispose = () => {
    if (closed) return;
    closed = true; worker?.terminate(); active?.finish(cancelled());
  };
  const run = async (work: ImportWork, options: WorkOptions = {}): Promise<ImportWorkResult> => {
    const {signal, loadAsset} = options;
    checkCancelled(signal);
    if (closed) throw cancelled();
    if (active) throw new StorageError('SAVE_FAILED', '復元の確認処理が既に実行中です。');
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return runImportWork(structuredClone(work), signal, loadAsset);
    worker ??= new Worker(new URL('./archive.worker.ts', import.meta.url), {type: 'module'});
    const currentWorker = worker, id = ++sequence;
    return new Promise((resolve, reject) => {
      let live = true;
      const finish = (error?: unknown, result?: ImportWorkResult) => {
        if (!live) return;
        live = false; signal?.removeEventListener('abort', abort);
        if (active?.id === id) active = undefined;
        if (error) { dispose(); reject(error); } else resolve(result!);
      };
      const abort = () => finish(cancelled());
      active = {id, finish};
      currentWorker.onmessage = event => {
        const message = event.data;
        if (!live || closed || message.requestId !== id) return;
        if (message.type === 'done') {
          try { checkCancelled(signal); finish(undefined, message.result); } catch (error) { finish(error); }
        } else if (message.type === 'error') {
          finish(Object.assign(new StorageError(message.error.code, message.error.message, message.error.path), {issues: message.error.issues ?? []}));
        } else if (message.type === 'asset') {
          void Promise.resolve().then(() => { checkCancelled(signal); return loadAsset?.(message.hash); }).then(bytes => {
            if (!live || closed || signal?.aborted) return;
            const copy = bytes?.slice(); currentWorker.postMessage({type: 'import-asset', id: message.id, bytes: copy}, copy ? [copy.buffer as ArrayBuffer] : []);
          }).catch(cause => {
            if (!live || closed || signal?.aborted) return;
            const error = saveError(cause);
            currentWorker.postMessage({type: 'import-asset', id: message.id, error: {code: error.code, message: error.message, path: error.path, issues: (cause as {issues?: unknown[]})?.issues}});
          });
        }
      };
      currentWorker.onerror = () => finish(new StorageError('SAVE_FAILED', '復元の確認処理を完了できませんでした。既存作品と元ファイルは保持しています。'));
      signal?.addEventListener('abort', abort, {once: true});
      try { checkCancelled(signal); currentWorker.postMessage({type: 'import-work', requestId: id, work}); } catch (error) { finish(error); }
    });
  };
  return {run, dispose};
}
