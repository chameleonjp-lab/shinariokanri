import {exportScenarioData} from './archiveData';
import {StorageError} from './errors';
import {freezeCapturedPlainData} from '../domain/immutablePlainData';
const scope=self as unknown as {onmessage:((event:MessageEvent)=>void)|null;postMessage:(value:unknown,transfer?:Transferable[])=>void};
let next=0;
const assets=new Map<number,(bytes:Uint8Array|undefined)=>void>();
scope.onmessage=event=>{
 if(event.data.type==='asset'){assets.get(event.data.id)?.(event.data.bytes);assets.delete(event.data.id);return;}
 // MessageEvent data is already a private structured clone owned by this
 // Worker. Prove and freeze that graph without cloning all history again.
 // Unsupported language retains the complete existing validator/encoder.
 freezeCapturedPlainData({input:event.data.input,worlds:event.data.options?.worlds??{},recovery:event.data.options?.recovery,syncRecovery:event.data.options?.syncRecovery});
 void exportScenarioData(event.data.input,{...event.data.options,onProgress:progress=>scope.postMessage({type:'progress',progress}),loadAsset:hash=>new Promise(resolve=>{const id=++next;assets.set(id,resolve);scope.postMessage({type:'asset',id,hash});})})
  .then(bytes=>scope.postMessage({type:'done',bytes},[bytes.buffer as ArrayBuffer]))
  .catch(error=>scope.postMessage({type:'error',code:error instanceof StorageError?error.code:'SAVE_FAILED',message:error instanceof StorageError?error.message:'保存ファイルを作成できませんでした。端末の作品は保持しています。',path:error instanceof StorageError?error.path:undefined}));
};
