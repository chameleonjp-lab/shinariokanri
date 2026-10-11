import { createElement, useSyncExternalStore } from 'react';
const states=new Map<string,Record<string,unknown>>(),listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);};
export function authorField<T>(key:string,name:string):T|undefined{return states.get(key)?.[name] as T|undefined;}
/** An operation/result belongs to its project/tool even when its view unmounts. */
export function useAuthorField<T>(key:string,name:string,initial:T|(()=>T)):[T,(value:T|((previous:T)=>T))=>void]{
 const epoch=authorCacheEpoch(key);
 if(!states.has(key))states.set(key,{});
 if(!Object.hasOwn(states.get(key)!,name))states.get(key)![name]=typeof initial==='function'?(initial as ()=>T)():initial;
 const value=useSyncExternalStore(subscribe,()=>states.get(key)![name] as T);
 const set=(next:T|((previous:T)=>T))=>{if(authorCacheEpoch(key)!==epoch||!states.has(key))return;const previous=states.get(key)!;states.set(key,{...previous,[name]:typeof next==='function'?(next as (previous:T)=>T)(previous[name] as T):next});listeners.forEach(listener=>listener());};
 return [value,set];
}

// Tool input is durable and edition-bound. Plans/approval are intentionally never restored.
import {authorCacheEpoch,registerAuthorBusy,registerAuthorCache,storeForAuthorScope} from './StoreContext';
interface InputDraft { key:string; projectId:string; baseRevision:string; fields:Record<string,unknown> }
const inputs=new Map<string,InputDraft>(), writes=new Map<string,Promise<void>>(),loaded=new Set<string>(),edited=new Set<string>(),pendingWrites=new Set<string>(),localPending=new Set<string>();
function persistLocalDraft(draft:InputDraft,pending:boolean):string {
 try{const json=JSON.stringify({...draft,storagePending:pending});if(new TextEncoder().encode(json).byteLength>1024*1024)throw Error('下書きは1 MiB以下で入力してください。');localStorage.setItem(`scenario-author-input:${draft.key}`,json);if(pending)localPending.add(draft.key);else localPending.delete(draft.key);return '';}catch(cause){return(cause as Error).message;}
}
function acknowledgeLocalDraft(draft:InputDraft,latest=false) {
 // An older successful write must not acknowledge newer local input.
 // The latest database success also repairs an older pending local draft when
 // writing the newer input to localStorage had failed.
 const same=(current:InputDraft|undefined)=>current?.key===draft.key&&current.projectId===draft.projectId&&current.baseRevision===draft.baseRevision&&JSON.stringify(current.fields)===JSON.stringify(draft.fields);
 try{
  const raw=localStorage.getItem(`scenario-author-input:${draft.key}`),current=raw?JSON.parse(raw):undefined;
  if(!same(current)&&!(latest&&same(inputs.get(draft.key))))return '';
  const error=persistLocalDraft(draft,false);if(!error)return '';
  if(latest&&same(inputs.get(draft.key))){
   // With a full localStorage quota, removing an obsolete pending cache still
   // lets the next cold load use the latest successfully committed DB input.
   try{localStorage.removeItem(`scenario-author-input:${draft.key}`);localPending.delete(draft.key);return '';}catch(cause){return `${error} / ${(cause as Error).message}`;}
  }
  return error;
 }catch(cause){return(cause as Error).message;}
}
function queueAuthorDraft(key:string,input:InputDraft,localError='',failurePrefix='下書き保存に失敗しました'):Promise<void> {
 const submitted=structuredClone(input);
 const scenarioStore=storeForAuthorScope(key),epoch=authorCacheEpoch(key);
 const pending=(writes.get(key)??Promise.resolve()).catch(()=>{}).then(()=>scenarioStore.saveAuthorToolDraft(submitted));writes.set(key,pending);pendingWrites.add(key);
 void pending.finally(()=>{if(writes.get(key)===pending)pendingWrites.delete(key);}).catch(()=>{});
 void pending.then(()=>{if(authorCacheEpoch(key)!==epoch)return;const ackError=acknowledgeLocalDraft(submitted,writes.get(key)===pending);if(writes.get(key)!==pending)return;states.set(key,{...states.get(key),draftError:ackError?`下書きは端末内に保存しましたが、一時キャッシュの更新に失敗しました: ${ackError}`:'',draftBase:submitted.baseRevision});listeners.forEach(listener=>listener());}).catch(cause=>{if(authorCacheEpoch(key)!==epoch||writes.get(key)!==pending)return;states.set(key,{...states.get(key),draftError:`${failurePrefix}: ${(cause as Error).message}${localError?` / ${localError}`:''}`});listeners.forEach(listener=>listener());});
 return pending;
}
function readInputs(key:string,projectId:string,revision:string):InputDraft {
 if(!inputs.has(key)){let draft:InputDraft|undefined;try{const raw=localStorage.getItem(`scenario-author-input:${key}`)??(key.startsWith('guest:')?localStorage.getItem(`scenario-author-input:${key.slice(6)}`):null);if(raw){const parsed=JSON.parse(raw);if((parsed.key===key||key.startsWith('guest:')&&parsed.key===key.slice(6))&&parsed.projectId===projectId&&/^\d+$/.test(parsed.baseRevision)&&parsed.fields&&typeof parsed.fields==='object'&&!Array.isArray(parsed.fields)){if(parsed.storagePending===true)localPending.add(key);delete parsed.storagePending;draft={...parsed,key};}}}catch{}inputs.set(key,draft??{key,projectId,baseRevision:revision,fields:{}});}
 return inputs.get(key)!;
}
export function useAuthorInput<T>(key:string,name:string,initial:T|(()=>T),projectId:string,revision:string):[T,(value:T|((previous:T)=>T))=>void] {
 const epoch=authorCacheEpoch(key),scenarioStore=storeForAuthorScope(key),draft=readInputs(key,projectId,revision),[value,setValue]=useAuthorField<T>(key,name,()=>Object.hasOwn(draft.fields,name)?draft.fields[name] as T:typeof initial==='function'?(initial as ()=>T)():initial);
 if(!loaded.has(key)){loaded.add(key);void scenarioStore.getAuthorToolDraft(key).then(async saved=>{if(!saved&&key.startsWith('guest:')){const old=await scenarioStore.getAuthorToolDraft(key.slice(6));if(old){saved={...old,key};await scenarioStore.saveAuthorToolDraft(saved);await scenarioStore.clearAuthorToolDraft(key.slice(6));}}return saved;}).then(saved=>{
  if(authorCacheEpoch(key)!==epoch||edited.has(key))return;
  if(localPending.has(key)){const retained=inputs.get(key);if(!retained)return;
   // localStorage is written before the database request. A pending marker
   // survives quota failure or reload and identifies the newer retained input.
   if(saved&&saved.baseRevision===retained.baseRevision&&JSON.stringify(saved.fields)===JSON.stringify(retained.fields))acknowledgeLocalDraft(retained);
   else{states.set(key,{...states.get(key),draftError:'一時保存できなかった入力を復元しています。入力を保持して端末内保存を再試行します。'});listeners.forEach(listener=>listener());void queueAuthorDraft(key,structuredClone(retained)).catch(()=>{});}
   return;
  }
  if(!saved)return;inputs.set(key,saved);for(const [field,item] of Object.entries(saved.fields)){const prior=states.get(key)??{};states.set(key,{...prior,[field]:item});}listeners.forEach(listener=>listener());
 }).catch(()=>{});}
 const set=(next:T|((previous:T)=>T))=>{if(authorCacheEpoch(key)!==epoch)return;const actual=typeof next==='function'?(next as (previous:T)=>T)(authorField<T>(key,name)!):next;setValue(actual);edited.add(key);const prior=readInputs(key,projectId,revision),submitted={...prior,fields:{...prior.fields,[name]:actual}};inputs.set(key,submitted);
  const localError=persistLocalDraft(submitted,true);void queueAuthorDraft(key,submitted,localError).catch(()=>{});
 };return [value,set];
}
export async function flushAuthorDraft(key:string){
 const epoch=authorCacheEpoch(key);
 try{await writes.get(key);}catch{
  const draft=inputs.get(key);if(!draft)throw Error('下書きが見つかりません。入力は画面に保持されています。');
  // A retry must not require another keystroke or silently discard the retained input.
  const retry=queueAuthorDraft(key,structuredClone(draft));
  await retry;if(authorCacheEpoch(key)!==epoch)return;
 }
}
export function authorDraftBase(key:string):string|undefined{return inputs.get(key)?.baseRevision;}

export function acknowledgeAuthorDraft(key:string,revision:string){const draft=inputs.get(key);if(!draft)return;const submitted={...draft,baseRevision:revision};inputs.set(key,submitted);const localError=persistLocalDraft(submitted,true);void queueAuthorDraft(key,submitted,localError,'作品は保存済みですが下書き基底の更新に失敗しました').catch(()=>{});states.set(key,{...states.get(key),draftBase:revision});listeners.forEach(listener=>listener());}

export function AuthorDraftNotice({scope,revision}:{scope:string;revision:string}){const [error]=useAuthorField(scope,'draftError',''),[base]=useAuthorField(scope,'draftBase',()=>authorDraftBase(scope)??revision);return createElement('p',{className:error?'error-notice':'field-hint',...(error?{role:'alert'}:{})},error||`下書き基底revision ${base}。入力を保持し、差分を確認してから保存します。`);}

registerAuthorCache(account=>{const prefix=account+':';for(const map of [states,inputs,writes])for(const key of map.keys())if(key.startsWith(prefix))map.delete(key);for(const set of [loaded,edited,pendingWrites,localPending])for(const key of set)if(key.startsWith(prefix))set.delete(key);});
registerAuthorBusy(account=>[...pendingWrites].some(key=>key.startsWith(account+':'))||[...states].some(([key,state])=>key.startsWith(account+':')&&state.busy===true));
