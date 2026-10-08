import {createContext,useContext,type ReactNode} from 'react';
import {scenarioStore,type ScenarioStore} from '../storage';
const StoreContext=createContext<ScenarioStore>(scenarioStore);
const scopedStores=new Map<string,ScenarioStore>();
const purgeCallbacks=new Set<(accountId:string)=>void>();
const busyCallbacks=new Set<(accountId:string)=>boolean>(),epochs=new Map<string,number>();
export function registerAuthorCache(purge:(accountId:string)=>void){purgeCallbacks.add(purge);}
export function registerAuthorBusy(busy:(accountId:string)=>boolean){busyCallbacks.add(busy);}
export function authorBusy(accountId:string){return [...busyCallbacks].some(fn=>fn(accountId));}
export function authorCacheEpoch(scope:string){return epochs.get(scope.split(':')[0])??0;}
export function purgeAuthorMemory(accountId:string){epochs.set(accountId,(epochs.get(accountId)??0)+1);purgeCallbacks.forEach(fn=>fn(accountId));purgeAuthorScopeBindings(accountId);}
/** Each async operation captures a permanently account-bound store; there is no mutable global DB switch. */
export function ScenarioStoreProvider({store,children}:{store:ScenarioStore;children:ReactNode}){return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;}
export function useScenarioStore(){return useContext(StoreContext);}
export function useAuthorScope(raw:string){const store=useScenarioStore(),prefix=`${store.accountId??'guest'}:`,scope=raw.startsWith(prefix)?raw:prefix+raw;scopedStores.set(scope,store);return scope;}
export function storeForAuthorScope(scope:string){const store=scopedStores.get(scope);if(store)return store;if(scope.startsWith('guest:')||!scope.includes(':'))return scenarioStore;throw Error('ACCOUNT_SCOPE_UNAVAILABLE');}
export function purgeAuthorScopeBindings(accountId:string){for(const key of scopedStores.keys())if(key.startsWith(`${accountId}:`))scopedStores.delete(key);}
