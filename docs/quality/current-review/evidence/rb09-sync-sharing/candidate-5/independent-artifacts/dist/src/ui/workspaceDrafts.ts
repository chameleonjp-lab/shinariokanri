import {useEffect,useRef} from 'react';
import type {Entity} from '../domain/types';
import type {ScenarioStore} from '../storage';
import type {ProjectSettingsDraft} from './projectSettingsDraft';
import type {AuthorAlternativeWorkspaceDraft} from './AuthorAlternativeStudio';
import {registerAuthorBusy,registerAuthorCache} from './StoreContext';
export interface WorkspaceDrafts {drafts:Record<string,Entity>;jsonBuffers:Record<string,Record<string,string>>;settingsDrafts:Record<string,ProjectSettingsDraft>;alternativeDrafts:Record<string,AuthorAlternativeWorkspaceDraft>}
export function workspaceDraftKey(accountId:string|null){return `scenario-workspace-input:v1:${accountId??'guest'}`;}
const empty=():WorkspaceDrafts=>({drafts:{},jsonBuffers:{},settingsDrafts:{},alternativeDrafts:{}});
export function readWorkspaceDrafts(accountId:string|null):WorkspaceDrafts{try{const parsed=JSON.parse(localStorage.getItem(workspaceDraftKey(accountId))??'null');if(parsed&&['drafts','jsonBuffers','settingsDrafts','alternativeDrafts'].every(k=>parsed[k]&&typeof parsed[k]==='object'&&!Array.isArray(parsed[k])))return parsed;}catch{}return empty();}
interface Persistence {base:WorkspaceDrafts|undefined;latest:WorkspaceDrafts;pending:Promise<void>;waiting:number;failed:boolean}
const persistence=new Map<ScenarioStore,Persistence>();
registerAuthorBusy(account=>[...persistence].some(([store,state])=>store.accountId===account&&state.waiting>0));
registerAuthorCache(account=>{for(const store of persistence.keys())if(store.accountId===account)persistence.delete(store);});
/** IndexedDB is authoritative. The synchronous mirror also retains input when the DB is unavailable. */
export async function loadWorkspaceDrafts(store:ScenarioStore):Promise<WorkspaceDrafts>{
 const prior=persistence.get(store);if(prior){await prior.pending.catch(()=>{});if(prior.failed)return prior.latest;}
 const base=await store.getWorkspaceInputs(),value=base??readWorkspaceDrafts(store.accountId);
 persistence.set(store,{base,latest:value,pending:Promise.resolve(),waiting:0,failed:false});return value;
}
export async function flushWorkspaceDrafts(store:ScenarioStore){const state=persistence.get(store);if(!state)return;await state.pending;}
export function useWorkspaceDraftPersistence(store:ScenarioStore,value:WorkspaceDrafts,onError:(message:string)=>void,ready:boolean){
 const latest=useRef(value);latest.current=value;
 useEffect(()=>{
  if(!ready)return;
  const mirror=()=>{try{localStorage.setItem(workspaceDraftKey(store.accountId),JSON.stringify(latest.current));return '';}catch{return '表示用キャッシュへ保持できません。';}};
  const mirrorError=mirror(),state=persistence.get(store);if(!state)return;
  const submitted=structuredClone(value);state.latest=submitted;state.waiting++;
  const pending=state.pending.catch(()=>{}).then(async()=>{await store.saveWorkspaceInputs(submitted,state.base);state.base=submitted;state.failed=false;});state.pending=pending;
  void pending.catch(cause=>{state.failed=true;onError(`作品の未保存入力の保持に失敗しました。入力は画面に残しています。${(cause as Error).message} ${mirrorError}`);}).finally(()=>{state.waiting--;});
  window.addEventListener('pagehide',mirror);return()=>{mirror();window.removeEventListener('pagehide',mirror);};
 },[store,value.drafts,value.jsonBuffers,value.settingsDrafts,value.alternativeDrafts,ready]);
}
