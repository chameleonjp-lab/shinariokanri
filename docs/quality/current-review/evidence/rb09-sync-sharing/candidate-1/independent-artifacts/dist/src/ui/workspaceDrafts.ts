import {useEffect,useRef} from 'react';
import type {Entity} from '../domain/types';
import type {ScenarioStore} from '../storage';
import type {ProjectSettingsDraft} from './projectSettingsDraft';
import type {AuthorAlternativeWorkspaceDraft} from './AuthorAlternativeStudio';
export interface WorkspaceDrafts {drafts:Record<string,Entity>;jsonBuffers:Record<string,Record<string,string>>;settingsDrafts:Record<string,ProjectSettingsDraft>;alternativeDrafts:Record<string,AuthorAlternativeWorkspaceDraft>}
export function workspaceDraftKey(accountId:string|null){return `scenario-workspace-input:v1:${accountId??'guest'}`;}
const empty=():WorkspaceDrafts=>({drafts:{},jsonBuffers:{},settingsDrafts:{},alternativeDrafts:{}});
export function readWorkspaceDrafts(accountId:string|null):WorkspaceDrafts{try{const parsed=JSON.parse(localStorage.getItem(workspaceDraftKey(accountId))??'null');if(parsed&&['drafts','jsonBuffers','settingsDrafts','alternativeDrafts'].every(k=>parsed[k]&&typeof parsed[k]==='object'&&!Array.isArray(parsed[k])))return parsed;}catch{}return empty();}
/** The synchronous mirror protects navigation/account changes even if IndexedDB persistence fails. */
export function useWorkspaceDraftPersistence(store:ScenarioStore,value:WorkspaceDrafts,onError:(message:string)=>void){
 const latest=useRef(value);latest.current=value;
 useEffect(()=>{const mirror=()=>{try{localStorage.setItem(workspaceDraftKey(store.accountId),JSON.stringify(latest.current));}catch{onError('作品の未保存入力を端末へ保持できません。完全保存と入力持出しを確認してください。');}};mirror();window.addEventListener('pagehide',mirror);return()=>{mirror();window.removeEventListener('pagehide',mirror);};},[store,value.drafts,value.jsonBuffers,value.settingsDrafts,value.alternativeDrafts]);
}
