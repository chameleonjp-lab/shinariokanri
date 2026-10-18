import {probeCount} from '../observability/probe';

export type CollectionRow<T>={state:'loaded';row:T}|{state:'absent'|'unloaded'|'stale'};
export interface CollectionPage<T>{state:'loaded'|'absent'|'unloaded'|'stale';rows:T[];missingIds:string[];unloadedIds:string[]}
export interface CollectionReadView<T>{
  readonly ids:readonly string[];
  positionOf(id:string):number;
  originalIndex(id:string):number|undefined;
  readPage(offset:number,size:number):CollectionPage<T>;
  selected(id:string):CollectionRow<T>;
}
export interface OrderedCollection<T> extends CollectionReadView<T>{beginRead():CollectionReadView<T>}
export type CollectionReader<T>=(ids:readonly string[])=>ReadonlyMap<string,CollectionRow<T>>;
export const staleCollectionPage=<T>():CollectionPage<T>=>({state:'stale',rows:[],missingIds:[],unloadedIds:[]});

/** An ID order owns navigation; row acquisition and selection are independent.
 * A missing reader result is UNLOADED. Only the reader may confirm ABSENT.
 */
export function createOrderedCollection<T extends {id:string}>(ids:readonly string[],read:CollectionReader<T>,isCurrent:()=>boolean=()=>true,isActive:()=>boolean=isCurrent):OrderedCollection<T>{
  const order=Object.freeze([...ids]),positions=new Map<string,number>();
  for(let index=0;index<order.length;index++){const id=order[index]!;if(positions.has(id))throw Error('Duplicate collection ID');positions.set(id,index);}
  probeCount('collection.order.rows',order.length);
  const matchesId=(row:unknown,id:string)=>{
    if(!row||typeof row!=='object')return false;
    const descriptor=Object.getOwnPropertyDescriptor(row,'id');return !!descriptor&&Object.hasOwn(descriptor,'value')&&descriptor.value===id;
  };
  const beginRead=():CollectionReadView<T>=>{
  let active=isCurrent();queueMicrotask(()=>{active=false;});
  const live=()=>active&&isActive(),location=(id:string)=>live()?positions.get(id):undefined;
  return {
    ids:order,positionOf:id=>location(id)??-1,originalIndex:location,
    readPage(offset,size){
      if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(size)||size<0)throw Error('Invalid collection page');
      if(!live())return staleCollectionPage();
      const requested=order.slice(offset,offset+size),rows:T[]=[],missingIds:string[]=[],unloadedIds:string[]=[];
      probeCount('collection.page.requested',requested.length);
      if(!requested.length)return {state:'loaded',rows,missingIds,unloadedIds};
      const found=read(requested);
      if(!live())return staleCollectionPage();
      for(const id of requested){
        const result=found.get(id)??{state:'unloaded'};
        if(result.state==='stale')return staleCollectionPage();
        if(result.state==='loaded'){if(matchesId(result.row,id))rows.push(result.row);else unloadedIds.push(id);}
        else if(result.state==='absent')missingIds.push(id);
        else unloadedIds.push(id);
      }
      probeCount('collection.page.rows',rows.length);
      return {state:unloadedIds.length?'unloaded':missingIds.length?'absent':'loaded',rows,missingIds,unloadedIds};
    },
    selected(id){
      if(!live())return {state:'stale'};
      probeCount('collection.selected.requested');const result=read([id]).get(id)??{state:'unloaded'};
      if(!live())return {state:'stale'};
      if(result.state==='loaded'&&!matchesId(result.row,id))return {state:'unloaded'};
      if(result.state==='loaded')probeCount('collection.selected.rows');return result;
    },
  };
  };
  // A frame is valid only for this synchronous operation/render. A later
  // task/await must obtain a fresh schema proof; lifetime fences remain live.
  return {ids:order,beginRead,positionOf:id=>beginRead().positionOf(id),originalIndex:id=>beginRead().originalIndex(id),readPage:(offset,size)=>beginRead().readPage(offset,size),selected:id=>beginRead().selected(id)};
}
