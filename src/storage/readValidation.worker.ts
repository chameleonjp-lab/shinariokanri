import {validateReadImage} from './readValidationCore';
import {StorageError} from './errors';
const scope=self as unknown as {onmessage:((event:MessageEvent)=>void)|null;postMessage:(value:unknown)=>void};
scope.onmessage=event=>{
 void validateReadImage(event.data.project,event.data.worlds,stage=>scope.postMessage({type:'stage',stage}))
  .then(()=>scope.postMessage({type:'done'}))
  .catch(error=>scope.postMessage({type:'error',code:error instanceof StorageError?error.code:'SAVE_FAILED',message:error instanceof StorageError?error.message:'作品の整合確認を完了できませんでした。',issues:error.issues??[]}));
};
