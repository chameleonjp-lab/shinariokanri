import { useSyncExternalStore } from 'react';
const states=new Map<string,Record<string,unknown>>(),listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);};
export function authorField<T>(key:string,name:string):T|undefined{return states.get(key)?.[name] as T|undefined;}
/** An operation/result belongs to its project/tool even when its view unmounts. */
export function useAuthorField<T>(key:string,name:string,initial:T|(()=>T)):[T,(value:T|((previous:T)=>T))=>void]{
 if(!states.has(key))states.set(key,{});
 if(!Object.hasOwn(states.get(key)!,name))states.get(key)![name]=typeof initial==='function'?(initial as ()=>T)():initial;
 const value=useSyncExternalStore(subscribe,()=>states.get(key)![name] as T);
 const set=(next:T|((previous:T)=>T))=>{const previous=states.get(key)!;states.set(key,{...previous,[name]:typeof next==='function'?(next as (previous:T)=>T)(previous[name] as T):next});listeners.forEach(listener=>listener());};
 return [value,set];
}
