import {collectReferences} from '../domain/model';
import {probeCount} from '../observability/probe';
import type {Entity,ProjectData} from '../domain/types';
import {beginDerivedEvaluation,type DerivedEvaluation} from '../domain/derivedIndexes';
// The weak marker records completion only; it retains no author rows or index.
const checked=new WeakSet<readonly Entity[]>();
type Index=Map<string,Entity[]>;
export type ReferenceIndexRead=(id:string)=>Entity[];
function addReferences(index:Map<string,Entity[]>,entity:Entity){
 if(entity.deletedAt)return;
 for(const target of new Set(collectReferences(entity).map(ref=>ref.id))){if(target===entity.id)continue;const rows=index.get(target)??[];rows.push(entity);index.set(target,rows);}
}
function buildIndex(entities:readonly Entity[]):Index{
 probeCount('reference.index.builds');probeCount('reference.index.rows',entities.length);
 const index:Index=new Map();for(const entity of entities)addReferences(index,entity);return index;
}
const value=(index:Index)=>({value:index,cost:{references:2*index.size+[...index.values()].reduce((n,rows)=>n+rows.length,0)}});
const evaluationFor=(entities:readonly Entity[],project?:ProjectData)=>project?.entities===entities?beginDerivedEvaluation(project):undefined;
export function referencesTo(entities:readonly Entity[],id:string,project?:ProjectData):Entity[]{
 const evaluation=evaluationFor(entities,project),index=evaluation?.get('reference.current','all',()=>value(buildIndex(entities)))??buildIndex(entities);
 checked.add(entities);return [...(index.get(id)??[])];
}
// Undefined means unchecked, rather than an empty set of references.
export function cachedReferencesTo(entities:readonly Entity[],id:string,project?:ProjectData):Entity[]|undefined{
 const index=evaluationFor(entities,project)?.peek<Index>('reference.current','all');
 if(index)return [...(index.get(id)??[])];
 return checked.has(entities)?[...(buildIndex(entities).get(id)??[])]:undefined;
}
const yieldToBrowser=()=>new Promise<void>(resolve=>{
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(resolve,0));else setTimeout(resolve,0);
});
export async function prepareReferenceIndex(entities:readonly Entity[],options:{project?:ProjectData;signal?:AbortSignal;onProgress?:(completed:number,total:number)=>void;yieldControl?:()=>Promise<void>}={}):Promise<ReferenceIndexRead>{
 const check=()=>{if(options.signal?.aborted)throw new DOMException('参照の確認を中止しました。','AbortError');};
 const read=(index:Index,evaluation?:DerivedEvaluation):ReferenceIndexRead=>id=>{
  if(evaluation&&!evaluation.isCurrent())throw new DOMException('参照の読込先が変わりました。','AbortError');
  return [...((evaluation?index:buildIndex(entities)).get(id)??[])];
 };
 check();const evaluation=evaluationFor(entities,options.project),known=evaluation?.peek<Index>('reference.current','all');
 const checkSource=()=>{check();if(evaluation&&!evaluation.isCurrent())throw new DOMException('参照の読込先が変わりました。','AbortError');};
 if(known){options.onProgress?.(entities.length,entities.length);return read(known,evaluation);}
 probeCount('reference.index.builds');probeCount('reference.index.rows',entities.length);
 const index=new Map<string,Entity[]>(),yieldControl=options.yieldControl??yieldToBrowser;
 let completed=0;options.onProgress?.(0,entities.length);
 // Paint the editable form before starting derived reference work.
 await yieldControl();checkSource();
 while(completed<entities.length){
  const started=performance.now();let items=0;
  while(completed<entities.length&&items<600){check();addReferences(index,entities[completed]!);completed++;items++;if(performance.now()-started>=8)break;}
  options.onProgress?.(completed,entities.length);
  if(completed<entities.length){await yieldControl();checkSource();}
 }
 checkSource();
 evaluation?.publish('reference.current','all',value(index));checked.add(entities);return read(index,evaluation);
}
