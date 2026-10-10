export * from './archiveData';
import {inspectScenarioData,exportScenarioData,type InspectOptions,type ExportOptions,type PreparedScenario,type ArchiveProgress} from './archiveData';
import type {ProjectData} from '../domain/types';
import {checkCancelled,saveError,StorageError} from './errors';
import {resolveLimits} from './json';
import {runImportWork, type ImportWork, type ImportWorkResult} from './importWork';
export type {ImportWorkStep} from './importWork';

/** Revalidate captured import content off the UI thread; results never bypass
 * the database's final revision, operation, world and atomic commit guards. */
export async function performImportWork(work: ImportWork, options: {signal?: AbortSignal; loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined} = {}): Promise<ImportWorkResult> {
  const signal = options.signal, loadAsset = options.loadAsset;
  checkCancelled(signal);
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return runImportWork(structuredClone(work), signal, loadAsset);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./archive.worker.ts', import.meta.url), {type: 'module'});
    let live = true;
    const finish = (failure?: unknown, result?: ImportWorkResult) => {
      if (!live) return;
      live = false; worker.terminate(); signal?.removeEventListener('abort', abort);
      if (failure) reject(failure); else resolve(result!);
    };
    const abort = () => finish(new StorageError('CANCELLED', '復元の確認を取り消しました。既存作品と元ファイルは変更していません。'));
    worker.onmessage = event => {
      const message = event.data;
      if (message.type === 'done') { try { checkCancelled(signal); finish(undefined, message.result); } catch (error) { finish(error); } }
      else if (message.type === 'error') finish(Object.assign(new StorageError(message.error.code, message.error.message, message.error.path), {issues: message.error.issues ?? []}));
      else if (message.type === 'asset') {
        void Promise.resolve().then(() => { checkCancelled(signal); return loadAsset?.(message.hash); }).then(bytes => {
          if (!live || signal?.aborted) return;
          const copy = bytes?.slice(); worker.postMessage({type: 'import-asset', id: message.id, bytes: copy}, copy ? [copy.buffer as ArrayBuffer] : []);
        }).catch(cause => {
          if (!live || signal?.aborted) return;
          const error = saveError(cause);
          worker.postMessage({type: 'import-asset', id: message.id, error: {code: error.code, message: error.message, path: error.path, issues: (cause as {issues?: unknown[]})?.issues}});
        });
      }
    };
    worker.onerror = () => finish(new StorageError('SAVE_FAILED', '復元の確認処理を完了できませんでした。既存作品と元ファイルは保持しています。'));
    signal?.addEventListener('abort', abort, {once: true});
    try { checkCancelled(signal); worker.postMessage({type: 'import-work', work}); } catch (error) { finish(error); }
  });
}

/** Browser inspection runs in a worker, with progress and termination on cancellation. */
export async function inspectScenario(bytes: Uint8Array, options: InspectOptions = {}): Promise<PreparedScenario> {
  checkCancelled(options.signal);
  if (typeof Worker === 'undefined' || options.worker === false) return inspectScenarioData(bytes, options);
  if (bytes.byteLength > resolveLimits(options.limits).compressedBytes) throw new StorageError('LIMIT_EXCEEDED', '圧縮ファイルが安全上限を超えています。');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./archive.worker.ts', import.meta.url), { type: 'module' });
    const finish = (callback: () => void) => { options.signal?.removeEventListener('abort', abort); worker.terminate(); callback(); };
    const abort = () => finish(() => reject(new StorageError('CANCELLED', '読み込みを取り消しました。既存作品は変更していません。')));
    options.signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ type: string; progress?: ArchiveProgress; prepared?: PreparedScenario; error?: { code: StorageError['code']; message: string; path?: string } }>) => {
      const message = event.data;
      if (message.type === 'progress' && message.progress) options.onProgress?.(message.progress);
      else if (message.type === 'done' && message.prepared) finish(() => resolve(message.prepared!));
      else if (message.type === 'error') finish(() => reject(new StorageError(message.error!.code, message.error!.message, message.error!.path)));
    };
    worker.onerror = event => finish(() => reject(new StorageError('ARCHIVE_INVALID', '読み込み作業領域で処理に失敗しました。', undefined, { cause: event.message })));
    const copy = bytes.slice();
    worker.postMessage({ bytes: copy, limits: options.limits }, [copy.buffer]);
  });
}

/** Complete file construction runs off the main thread, with cancellable asset
 * reads; every image and hash uses the same executable export contract. */
export async function exportScenario(input:ProjectData,options:ExportOptions={}):Promise<Uint8Array>{
 checkCancelled(options.signal);
 if(options.worker===false||typeof window==='undefined'||typeof Worker==='undefined')return exportScenarioData(input,options);
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./archiveExport.worker.ts',import.meta.url),{type:'module'});let live=true;
  const finish=(error?:unknown,bytes?:Uint8Array)=>{if(!live)return;live=false;worker.terminate();options.signal?.removeEventListener('abort',abort);error?reject(error):resolve(bytes!);};
  const abort=()=>finish(new StorageError('CANCELLED','保存ファイルの作成を取り消しました。端末の作品と入力は変更していません。'));
  worker.onmessage=event=>{const message=event.data;if(message.type==='progress')options.onProgress?.(message.progress);else if(message.type==='done')finish(undefined,message.bytes);else if(message.type==='error')finish(new StorageError(message.code,message.message,message.path));else if(message.type==='asset'){
   void Promise.resolve().then(()=>options.loadAsset?.(message.hash)).then(bytes=>{if(!live)return;const copy=bytes?.slice();worker.postMessage({type:'asset',id:message.id,bytes:copy},copy?[copy.buffer as ArrayBuffer]:[]);}).catch(()=>{if(live)worker.postMessage({type:'asset',id:message.id});});
  }};
  worker.onerror=()=>finish(new StorageError('SAVE_FAILED','保存ファイルを作成できませんでした。端末の作品は保持しています。'));
  options.signal?.addEventListener('abort',abort,{once:true});const {loadAsset:_load,signal:_signal,onProgress:_progress,...portable}=options;
  try{checkCancelled(options.signal);worker.postMessage({input,options:portable});}catch(error){finish(error);}
 });
}
