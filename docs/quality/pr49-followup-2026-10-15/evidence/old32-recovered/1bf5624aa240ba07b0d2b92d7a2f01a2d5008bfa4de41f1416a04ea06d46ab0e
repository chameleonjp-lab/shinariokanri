export * from './readValidationCore';
import {validateReadImage,type ReadStage} from './readValidationCore';
import type {ProjectData} from '../domain/types';
import {checkCancelled,StorageError} from './errors';
type Options={signal?:AbortSignal;onStage?:(stage:ReadStage)=>void};
export async function validateColdRead(project:ProjectData,worlds:Record<string,ProjectData>,options:Options={}){
 checkCancelled(options.signal);
 if(typeof window==='undefined'||typeof Worker==='undefined'||project.entities.length+project.relations.length<5000){await validateReadImage(project,worlds,options.onStage);checkCancelled(options.signal);return;}
 await new Promise<void>((resolve,reject)=>{
  const worker=new Worker(new URL('./readValidation.worker.ts',import.meta.url),{type:'module'});
  const finish=(failure?:unknown)=>{worker.terminate();options.signal?.removeEventListener('abort',abort);failure?reject(failure):resolve();};
  const abort=()=>finish(new StorageError('CANCELLED','作品の確認を取り消しました。保存済み内容と入力は変更していません。'));
  worker.onmessage=event=>{const message=event.data;if(message.type==='stage')options.onStage?.(message.stage);else if(message.type==='done'){try{checkCancelled(options.signal);finish();}catch(error){finish(error);}}else if(message.type==='error')finish(Object.assign(new StorageError(message.code,message.message),{issues:message.issues??[]}));};
  worker.onerror=()=>finish(new StorageError('SAVE_FAILED','作品の確認処理を開始できませんでした。保存済み内容を保持しています。'));
  options.signal?.addEventListener('abort',abort,{once:true});
  try{checkCancelled(options.signal);worker.postMessage({project,worlds});}catch(error){finish(error);}
 });
}
