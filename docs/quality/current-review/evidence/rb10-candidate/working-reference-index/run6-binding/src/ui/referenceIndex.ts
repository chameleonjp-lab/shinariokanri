import {collectReferences} from '../domain/model';
import type {Entity} from '../domain/types';
// Saved UI content arrays are immutable views; edits/save/reload provide a new array.
// A draft is never indexed here. The index is weakly held with its source view.
const indexes=new WeakMap<readonly Entity[],Map<string,Entity[]>>();
function addReferences(index:Map<string,Entity[]>,entity:Entity){
 if(entity.deletedAt)return;
 for(const target of new Set(collectReferences(entity).map(ref=>ref.id))){if(target===entity.id)continue;const rows=index.get(target)??[];rows.push(entity);index.set(target,rows);}
}
export function referencesTo(entities:readonly Entity[],id:string):Entity[]{
 let index=indexes.get(entities);if(!index){index=new Map();for(const entity of entities)addReferences(index,entity);indexes.set(entities,index);}
 return index.get(id)??[];
}
// Undefined means unchecked, rather than an empty set of references.
export function cachedReferencesTo(entities:readonly Entity[],id:string):Entity[]|undefined{return indexes.get(entities)?.get(id)??(indexes.has(entities)?[]:undefined);}
const yieldToBrowser=()=>new Promise<void>(resolve=>{
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(resolve,0));else setTimeout(resolve,0);
});
export async function prepareReferenceIndex(entities:readonly Entity[],options:{signal?:AbortSignal;onProgress?:(completed:number,total:number)=>void;yieldControl?:()=>Promise<void>}={}):Promise<void>{
 const check=()=>{if(options.signal?.aborted)throw new DOMException('参照の確認を中止しました。','AbortError');};
 check();if(indexes.has(entities)){options.onProgress?.(entities.length,entities.length);return;}
 const index=new Map<string,Entity[]>(),yieldControl=options.yieldControl??yieldToBrowser;
 let completed=0;options.onProgress?.(0,entities.length);
 // Paint the editable form before starting derived reference work.
 await yieldControl();check();
 while(completed<entities.length){
  const started=performance.now();let items=0;
  while(completed<entities.length&&items<600){check();addReferences(index,entities[completed]!);completed++;items++;if(performance.now()-started>=8)break;}
  options.onProgress?.(completed,entities.length);
  if(completed<entities.length){await yieldControl();check();}
 }
 check();indexes.set(entities,index);
}
