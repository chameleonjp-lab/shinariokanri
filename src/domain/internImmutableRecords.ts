import {freezeCapturedPlainData,freezeCapturedPlainDataAsync,isImmutablePlainData} from './immutablePlainData';
import {checkCancelled} from '../storage/errors';

/** This scope owns immutable input. A typed ID only chooses candidates; every
 * own value, prototype, undefined property and signed zero must match before
 * records share identity. No digest or previous validation result is trusted. */
function recordInterner() {
  const copied = new WeakMap<object, unknown>(), candidates = new Map<string, object[]>();
  let count = 0;
  const equal = (left: unknown, right: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean => {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
      || Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
    if (seen.get(left)?.has(right)) return true;
    const keys = Reflect.ownKeys(left);
    if (keys.length !== Reflect.ownKeys(right).length || keys.some(key => !Object.hasOwn(right, key))) return false;
    let pairs = seen.get(left); if (!pairs) { pairs = new WeakSet(); seen.set(left, pairs); } pairs.add(right);
    return keys.every(key => equal((left as Record<PropertyKey, unknown>)[key], (right as Record<PropertyKey, unknown>)[key], seen));
  };
  const visit = (value: unknown, depth = 0): unknown => {
    if (!value || typeof value !== 'object' || depth > 128) return value;
    if (copied.has(value)) return copied.get(value);
    const row = value as Record<string, unknown>;
    const record = typeof row.id === 'string' && typeof row.projectId === 'string'
      && (typeof row.kind === 'string' && !!row.data && typeof row.data === 'object'
        || typeof row.relationType === 'string' && typeof row.fromId === 'string' && typeof row.toId === 'string');
    if (record) {
      const key = `${row.projectId}:${row.kind ?? row.relationType}:${row.id}`, bucket = candidates.get(key);
      const previous = bucket?.find(candidate => equal(value, candidate));
      if (previous) { copied.set(value, previous); return previous; }
      // Bound additional retained references. Overflow resumes exact uncached
      // comparison in a new scope; it does not change any data or format limit.
      if (count >= 100_000) { candidates.clear(); count = 0; }
      if (candidates.has(key)) candidates.get(key)!.unshift(value);
      else candidates.set(key, [value]);
      count++; copied.set(value, value); return value;
    }
    const keys = Object.keys(value);
    let replacements: Map<string, unknown> | undefined;
    for (const key of keys) {
      const previous = row[key], next = visit(previous, depth + 1);
      if (!Object.is(next, previous)) { replacements ??= new Map(); replacements.set(key, next); }
    }
    if (!replacements) { copied.set(value, value); return value; }
    const result: unknown[] | Record<string, unknown> = Array.isArray(value) ? new Array(value.length) : Object.create(Object.getPrototypeOf(value));
    for (const key of keys) Object.defineProperty(result, key, {value: replacements.has(key) ? replacements.get(key) : row[key], enumerable: true, writable: true, configurable: true});
    copied.set(value, result);
    return result;
  };
  return <T>(input: T): T => {
    const result = visit(input) as T;
    return freezeCapturedPlainData(result) ? result : input;
  };
}

export function internImmutableRecords<T>(input: T): T {
  if (!isImmutablePlainData(input)) return input;
  return recordInterner()(input);
}

// A worker owns these intrinsics and its captured graphs. If another module
// changes traversal behavior, discard the memo and retain the fresh path.
const interningIntrinsics = () => [Object.keys, Object.getPrototypeOf, Object.hasOwn, Object.defineProperty,
  Object.create, Object.freeze, Object.is, Reflect.ownKeys, Array.isArray,
  Array.prototype.every, Array.prototype.some, Array.prototype.find, Array.prototype.unshift,
  Map.prototype.get, Map.prototype.set, Map.prototype.has, Map.prototype.clear,
  WeakMap.prototype.get, WeakMap.prototype.set, WeakMap.prototype.has,
  WeakSet.prototype.has, WeakSet.prototype.add];
const originalInterningIntrinsics = interningIntrinsics();

/** @internal Reuse only equality/canonicalization of complete immutable own
 * data, never a schema/reference/hash/permission result. The caller owns one
 * sequential worker operation; unsupported graphs retain the fresh path. */
export function createImmutableRecordInterningSession() {
  let intern = recordInterner();
  return {
    clear: () => { intern = recordInterner(); },
    intern<T>(input: T): T {
      const current = interningIntrinsics();
      let stable = current.length === originalInterningIntrinsics.length;
      for (let index = 0; stable && index < current.length; index++) stable = current[index] === originalInterningIntrinsics[index];
      if (!stable) {
        intern = recordInterner(); return internImmutableRecords(input);
      }
      if (!isImmutablePlainData(input)) return internImmutableRecords(input);
      try { return intern(input); } catch (error) { intern = recordInterner(); throw error; }
    },
  };
}

/** Same complete own-value comparison for a private main-thread capture, with
 * real task yields inside large comparisons and ordered-array traversal. */
export async function internImmutableRecordsAsync<T>(input:T,signal?:AbortSignal):Promise<T>{
  checkCancelled(signal);if(!isImmutablePlainData(input))return input;
  const copied=new WeakMap<object,unknown>(),candidates=new Map<string,object[]>();let count=0,operations=0,deadline=performance.now()+8;
  const yieldIfNeeded=async()=>{if(++operations%128===0&&performance.now()>=deadline){checkCancelled(signal);await new Promise<void>(resolve=>setTimeout(resolve,0));checkCancelled(signal);deadline=performance.now()+8;}};
  const equal=async(left:object,right:object)=>{
    const pairs=new WeakMap<object,WeakSet<object>>(),stack:[unknown,unknown][]=[[left,right]];
    while(stack.length){
      const [a,b]=stack.pop()!;if(Object.is(a,b))continue;
      if(!a||!b||typeof a!=='object'||typeof b!=='object'||Object.getPrototypeOf(a)!==Object.getPrototypeOf(b))return false;
      if(pairs.get(a)?.has(b))continue;const keys=Reflect.ownKeys(a);
      if(keys.length!==Reflect.ownKeys(b).length)return false;
      let matched=pairs.get(a);if(!matched){matched=new WeakSet();pairs.set(a,matched);}matched.add(b);
      for(const key of keys){if(!Object.hasOwn(b,key))return false;stack.push([(a as Record<PropertyKey,unknown>)[key],(b as Record<PropertyKey,unknown>)[key]]);await yieldIfNeeded();}
      await yieldIfNeeded();
    }return true;
  };
  type Frame={input:object;output:unknown[]|Record<string,unknown>;keys:string[]|undefined;index:number};
  const frames:Frame[]=[];
  const reference=async(value:unknown):Promise<unknown>=>{
    if(!value||typeof value!=='object')return value;if(copied.has(value))return copied.get(value);
    const row=value as Record<string,unknown>,record=typeof row.id==='string'&&typeof row.projectId==='string'
      &&(typeof row.kind==='string'&&!!row.data&&typeof row.data==='object'||typeof row.relationType==='string'&&typeof row.fromId==='string'&&typeof row.toId==='string');
    if(record){
      const key=`${row.projectId}:${row.kind??row.relationType}:${row.id}`;
      for(const candidate of candidates.get(key)??[])if(await equal(value,candidate)){copied.set(value,candidate);return candidate;}
      if(count>=100_000){candidates.clear();count=0;}
      if(candidates.has(key))candidates.get(key)!.unshift(value);else candidates.set(key,[value]);count++;copied.set(value,value);return value;
    }
    const output=Array.isArray(value)?new Array(value.length):Object.create(Object.getPrototypeOf(value));copied.set(value,output);
    frames.push({input:value,output,keys:Array.isArray(value)?undefined:Object.keys(value),index:0});return output;
  };
  const result=await reference(input) as T;
  while(frames.length){
    const frame=frames.at(-1)!,length=frame.keys?.length??(frame.input as unknown[]).length;
    if(frame.index>=length){frames.pop();continue;}
    const key=frame.keys?.[frame.index]??String(frame.index);frame.index++;
    const value=await reference((frame.input as Record<string,unknown>)[key]);Object.defineProperty(frame.output,key,{value,enumerable:true,writable:true,configurable:true});await yieldIfNeeded();
  }
  checkCancelled(signal);return await freezeCapturedPlainDataAsync(result,signal)?result:input;
}
