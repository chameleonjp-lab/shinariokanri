import type {Entity,ProjectData} from './types';
import {isImmutablePlainData} from './immutablePlainData';
import {validationSchemaSignature} from './model';
import {probeCount} from '../observability/probe';

export interface DerivedIndexLimits {entries:number;references:number;textCodeUnits:number}
export interface DerivedIndexCost {references:number;textCodeUnits?:number}
export const DEFAULT_DERIVED_INDEX_LIMITS:Readonly<DerivedIndexLimits>=Object.freeze({entries:100_000,references:500_000,textCodeUnits:8_388_608});
export interface DerivedValue<T> {value:T;cost:DerivedIndexCost}
type Entry={value:unknown;cost:DerivedIndexLimits};
const bindings=new WeakMap<ProjectData,ProjectDerivedOwner>();
const costOf=(cost:DerivedIndexCost,entries=1):DerivedIndexLimits=>({entries,references:cost.references,textCodeUnits:cost.textCodeUnits??0});

/** Logical allocation budgets, not JS heap bytes. One account store owns this budget. */
export class DerivedIndexBudget {
  private used:DerivedIndexLimits={entries:0,references:0,textCodeUnits:0};
  readonly limits:Readonly<DerivedIndexLimits>;
  constructor(limits:Partial<DerivedIndexLimits>={}){
    const next={...DEFAULT_DERIVED_INDEX_LIMITS,...limits};
    if(Object.values(next).some(value=>!Number.isSafeInteger(value)||value<0))throw new Error('Invalid derived index budget');
    this.limits=Object.freeze(next);
  }
  snapshot():DerivedIndexLimits{return {...this.used};}
  reserve(cost:DerivedIndexLimits):boolean{
    if(Object.values(cost).some(value=>!Number.isSafeInteger(value)||value<0))return false;
    if((Object.keys(cost) as (keyof DerivedIndexLimits)[]).some(key=>cost[key]>this.limits[key]-this.used[key]))return false;
    for(const key of Object.keys(cost) as (keyof DerivedIndexLimits)[])this.used[key]+=cost[key];
    return true;
  }
  release(cost:DerivedIndexLimits):void{for(const key of Object.keys(cost) as (keyof DerivedIndexLimits)[])this.used[key]-=cost[key];}
}

export interface DerivedEvaluation {
  get<T>(namespace:string,key:object|string,build:()=>DerivedValue<T>):T;
  peek<T>(namespace:string,key:object|string):T|undefined;
  publish<T>(namespace:string,key:object|string,value:DerivedValue<T>):boolean;
  ownsEntity(entity:Entity):boolean;
  /** Cheap lifetime/header fence inside an already checked synchronous operation. */
  isActive():boolean;
  /** Async work checks this before publication, not once per row. */
  isCurrent():boolean;
}

/** Revocable ownership of a private saved current image; never a validation proof.
 * History and alternative graphs are not read by these indexes and are not retained.
 * Registry bindings are weak; close drops all strong content and derived values.
 */
export class ProjectDerivedOwner {
  private source:ProjectData|undefined;
  private members:WeakSet<Entity>|undefined;
  private membershipCost:DerivedIndexLimits|undefined;
  private signature:string|undefined;
  private generation=0;
  private readonly budget:DerivedIndexBudget;
  private readonly values=new Map<string,Map<object|string,Entry>>();
  readonly identity:Readonly<{accountId:string|null;roleGeneration:number;visibilityScope:'author';normalizationVersion:number}>;
  constructor(source:ProjectData,budget:DerivedIndexBudget,identity:{accountId:string|null;roleGeneration:number}){
    this.budget=budget;
    const {history:_history,authorAlternatives:_alternatives,...current}=source;
    this.source=Object.freeze({...current,history:Object.freeze([]) as unknown as ProjectData['history']});
    this.identity=Object.freeze({...identity,visibilityScope:'author',normalizationVersion:2});
  }
  private matches(view:ProjectData):boolean{
    const source=this.source;if(!source)return false;
    const descriptors=Object.getOwnPropertyDescriptors(view),keys=Reflect.ownKeys(view).filter(key=>key!=='history'&&key!=='authorAlternatives');
    const expected=Object.keys(source).filter(key=>key!=='history');
    return keys.length===expected.length&&keys.every(key=>typeof key==='string'&&Object.hasOwn(source,key))
      &&expected.every(key=>{const descriptor=descriptors[key];return !!descriptor?.enumerable&&Object.hasOwn(descriptor,'value')&&descriptor.value===(source as unknown as Record<string,unknown>)[key];});
  }
  bind(view:ProjectData):void{if(this.matches(view))bindings.set(view,this);}
  private clearValues():void{
    for(const entries of this.values.values())for(const entry of entries.values())this.budget.release(entry.cost);
    this.values.clear();this.generation++;probeCount('derived.invalidated');
  }
  close():void{
    this.clearValues();
    if(this.membershipCost)this.budget.release(this.membershipCost);
    this.membershipCost=undefined;this.members=undefined;this.source=undefined;this.signature=undefined;
  }
  evaluate(view:ProjectData):DerivedEvaluation|undefined{
    if(!this.matches(view)){bindings.delete(view);return undefined;}
    if(!this.budget.limits.entries)return undefined;
    const signature=validationSchemaSignature();
    if(signature===undefined){this.clearValues();return undefined;}
    if(signature!==this.signature){this.clearValues();this.signature=signature;}
    const source=this.source!;
    if(!this.members){
      if(!isImmutablePlainData(source))return undefined;
      const cost=costOf({references:source.entities.length},0);
      if(!this.budget.reserve(cost))return undefined;
      this.membershipCost=cost;this.members=new WeakSet(source.entities);
    }
    const generation=this.generation;
    const live=()=>!!this.source&&generation===this.generation;
    const peek=<T>(namespace:string,key:object|string):T|undefined=>live()?this.values.get(namespace)?.get(key)?.value as T|undefined:undefined;
    const publish=<T>(namespace:string,key:object|string,value:DerivedValue<T>):boolean=>{
      if(!live())return false;
      let entries=this.values.get(namespace);
      if(entries?.has(key))return true;
      const cost=costOf(value.cost);
      // Admission stops at the budget. A full scan cannot evict its own prefix
      // and rebuild the same corpus on every subsequent query.
      if(!this.budget.reserve(cost)){probeCount('derived.rejected');return false;}
      if(!entries){entries=new Map();this.values.set(namespace,entries);}
      entries.set(key,{value:value.value,cost});probeCount('derived.admitted');return true;
    };
    return {
      peek,publish,
      get:<T>(namespace:string,key:object|string,build:()=>DerivedValue<T>):T=>{
        const known=live()?this.values.get(namespace)?.get(key):undefined;
        if(known){probeCount('derived.hit');return known.value as T;}
        probeCount('derived.miss');const built=build();publish(namespace,key,built);return built.value;
      },
      ownsEntity:entity=>live()&&this.members?.has(entity)===true,
      isActive:()=>live()&&this.matches(view),
      isCurrent:()=>live()&&this.matches(view)&&validationSchemaSignature()===signature,
    };
  }
}

/** Only saved views registered by their concrete store may share work.
 * A compilation is one synchronous evaluation, matching the existing API.
 */
export function beginDerivedEvaluation(project:ProjectData):DerivedEvaluation|undefined{return bindings.get(project)?.evaluate(project);}
