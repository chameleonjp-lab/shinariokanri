import {exportScenarioData} from './archiveData';
import {StorageError} from './errors';
import {freezeCapturedPlainData} from '../domain/immutablePlainData';
import {WorkerGraphReceiver} from './workerGraph';
import {exportNativeScenarioData} from './nativeExport';
const scope=self as unknown as {onmessage:((event:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
let next=0;
const assets=new Map<number,(bytes:Uint8Array|undefined)=>void>();
let graph:WorkerGraphReceiver|undefined;
scope.onmessage=event=>{
 if(event.data.type==='asset'){assets.get(event.data.id)?.(event.data.bytes);assets.delete(event.data.id);return;}
 let data=event.data;
 try{
  if(data.type==='graph-chunk'){(graph??=new WorkerGraphReceiver()).accept(data);return;}
  if(data.type==='graph-end'){data=graph?.finish(data.root);graph=undefined;if(!data)throw new StorageError('SAVE_FAILED','保存の受渡し内容がありません。');}
 }catch(error){scope.postMessage({type:'error',code:'SAVE_FAILED',message:error instanceof Error?error.message:'保存の受渡しに失敗しました。'});return;}
 // MessageEvent data is already a private structured clone owned by this
 // Worker. Prove and freeze that graph without cloning all history again.
 // Unsupported language retains the complete existing validator/encoder.
 freezeCapturedPlainData(data.native??{input:data.input,worlds:data.options?.worlds??{},recovery:data.options?.recovery,syncRecovery:data.options?.syncRecovery});
 const options={...data.options,onProgress:(progress:import('./archiveData').ArchiveProgress)=>scope.postMessage({type:'progress',progress}),loadAsset:(hash:string)=>new Promise<Uint8Array|undefined>(resolve=>{const id=++next;assets.set(id,resolve);scope.postMessage({type:'asset',id,hash});})};
 void (data.native?exportNativeScenarioData(data.native,options):exportScenarioData(data.input,options))
  .then(bytes=>scope.postMessage({type:'done',bytes},[bytes.buffer as ArrayBuffer]))
  .catch(error=>scope.postMessage({type:'error',code:error instanceof StorageError?error.code:'SAVE_FAILED',message:error instanceof StorageError?error.message:'保存ファイルを作成できませんでした。端末の作品は保持しています。',path:error instanceof StorageError?error.path:undefined}));
};
