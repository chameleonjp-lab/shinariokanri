import {canonicalJson,type ArchiveLimits} from './json';
import {StorageError} from './errors';
import {freezeCapturedPlainData} from '../domain/immutablePlainData';

/** Lossless archive encoding. Positions, IDs, all historic variants and protocol
 * hashes are unchanged after decoding; the dictionary is never an active image. */
export const RECORD_DICTIONARY_FEATURE='shared-records-v1';
export const RECORD_DELTA_FEATURE='shared-record-deltas-v1';
export const CALENDAR_RECORD_FEATURE='shared-calendar-records-v1';
export interface DictionaryFeatures {recordDeltas?:boolean;calendarRecords?:boolean}
type Path=(string|number)[];
type Envelope={version:1;value:unknown;arrays:Path[];records:Path[]};
type RecordArray={values:number[]}|{base:number;length:number;changes:[number,number][]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const record=(v:unknown)=>object(v)&&typeof v.id==='string'&&typeof v.projectId==='string'&&(
 typeof v.kind==='string'&&object(v.data)||typeof v.relationType==='string'&&typeof v.fromId==='string'&&typeof v.toId==='string'||
 typeof v.revision==='string'&&object(v.fields)&&Object.hasOwn(v,'tombstone'));
const calendar=(v:unknown)=>object(v)&&typeof v.id==='string'&&(v.kind==='gregorian'||v.kind==='repeating');
const baseKey='__recordBase',deleteKey='__recordDelete';
export class RecordDictionaryWriter{
 readonly records:unknown[]=[];
 readonly arrays:RecordArray[]=[];
 private readonly ids=new Map<string,number>();
 private readonly identities=new WeakMap<object,number>();
 private readonly arrayIds=new Map<string,number>();
 private readonly previous=new Map<number,{id:number;values:number[]}>();
 private readonly previousRecords=new Map<string,{id:number;value:Record<string,unknown>}>();
 private readonly previousKinds=new Map<string,{id:number;value:Record<string,unknown>}>();
 readonly usedFeatures=new Set<string>();
 constructor(private readonly features:DictionaryFeatures={}){}
 private eligible(value:unknown){return record(value)||!!this.features.calendarRecords&&calendar(value);}
 private add(value:Record<string,unknown>){
  const known=this.identities.get(value);if(known!==undefined)return known;
  const key=canonicalJson(value);let id=this.ids.get(key);
  if(id===undefined){
   id=this.records.length;let encoded:unknown=value;
   const category=typeof value.kind==='string'&&object(value.data)?'entity':typeof value.relationType==='string'?'relation':calendar(value)?'calendar':'shadow';
   const kindKey=JSON.stringify([category,value.projectId??null,value.kind??value.relationType??null]);
   const typedKey=JSON.stringify([kindKey,value.id]);
   // A base is an encoding choice, never a record identity. Comparing every
   // field permits repeated structure across distinct IDs without merging them.
   const previousRecord=this.previousRecords.get(typedKey),previousKind=this.previousKinds.get(kindKey);
   const candidates=previousRecord?.id===previousKind?.id?[previousRecord]:[previousRecord,previousKind];
   let encodedLength=key.length;
   if(this.features.recordDeltas&&!Object.hasOwn(value,baseKey)&&!Object.hasOwn(value,deleteKey))for(const previous of candidates){
    if(!previous||Object.hasOwn(previous.value,baseKey)||Object.hasOwn(previous.value,deleteKey))continue;
    const delta:Record<string,unknown>={[baseKey]:previous.id};const removed:string[]=[];
    for(const field of Object.keys(previous.value))if(previous.value[field]!==undefined&&(!Object.hasOwn(value,field)||value[field]===undefined))removed.push(field);
    for(const field of Object.keys(value))if(value[field]!==undefined&&(!Object.hasOwn(previous.value,field)||previous.value[field]===undefined||canonicalJson(value[field])!==canonicalJson(previous.value[field])))Object.defineProperty(delta,field,{value:value[field],enumerable:true});
    if(removed.length)delta[deleteKey]=removed;
    const length=canonicalJson(delta).length;
    if(length<encodedLength){encoded=delta;encodedLength=length;this.usedFeatures.add(RECORD_DELTA_FEATURE);}
   }
   if(!record(value)&&calendar(value))this.usedFeatures.add(CALENDAR_RECORD_FEATURE);
   this.records.push(encoded);this.ids.set(key,id);this.previousRecords.set(typedKey,{id,value});this.previousKinds.set(kindKey,{id,value});
  }
  this.identities.set(value,id);return id;
 }
 encode(value:unknown):Envelope{
  const arrays:Path[]=[],records:Path[]=[];
  const walk=(v:unknown,path:Path):unknown=>{
   if(Array.isArray(v)){if(v.length&&v.every(item=>this.eligible(item))){arrays.push(path);const values=v.map(item=>this.add(item as Record<string,unknown>)),key=values.join(',');let id=this.arrayIds.get(key);if(id===undefined){id=this.arrays.length;const previous=this.previous.get(values.length),changes=previous?values.flatMap((value,index)=>value===previous.values[index]?[]:[[index,value] as [number,number]]):undefined;this.arrays.push(previous&&changes&&changes.length*2<values.length?{base:previous.id,length:values.length,changes}:{values});this.arrayIds.set(key,id);}this.previous.set(values.length,{id,values});return id;}return v.map((item,index)=>walk(item,[...path,index]));}
   if(object(v)){if(this.eligible(v)){records.push(path);return this.add(v);}return Object.fromEntries(Object.entries(v).filter(([,item])=>item!==undefined).map(([key,item])=>[key,walk(item,[...path,key])]));}
   return v;
  };
  return {version:1,value:walk(value,[]),arrays,records};
 }
}
export class RecordDictionaryReader{
 private references=0;
 private readonly depths:number[]=[];
 private readonly records:unknown[]=[];
 private readonly arrays:RecordArray[]=[];
 private readonly arrayCache=new Map<number,unknown[]>();
 private readonly recordIds=new Map<unknown,number>();
 private readonly usedRecords=new Set<number>();
 private readonly recordBases=new Map<number,number>();
 constructor(private readonly pool:unknown,private readonly limits:ArchiveLimits,features:DictionaryFeatures={}){
  const invalid=():never=>{throw new StorageError('ARCHIVE_INVALID','共有レコード辞書の形式が不正です。','data/records.json');};
  if(!object(pool)||Object.keys(pool).some(key=>!['records','arrays'].includes(key))||!Array.isArray(pool.records)||!Array.isArray(pool.arrays)||pool.records.length>limits.objects||pool.arrays.length>limits.objects)return invalid();
  this.records=[];
  for(const [index,item]of pool.records.entries()){
   let value:unknown=item;
   if(!record(item)&&!(features.calendarRecords&&calendar(item))){
    if(!features.recordDeltas||!object(item)||!Number.isSafeInteger(item[baseKey])||Number(item[baseKey])<0||Number(item[baseKey])>=index)return invalid();
    const base=Number(item[baseKey]),previous=this.records[base] as Record<string,unknown>;
    const result:Record<string,unknown>=Object.create(Object.getPrototypeOf(previous));
    for(const [key,value]of Object.entries(previous))Object.defineProperty(result,key,{value,enumerable:true,writable:true,configurable:true});
    if(Object.hasOwn(item,deleteKey)){
     const removed=item[deleteKey];if(!Array.isArray(removed)||new Set(removed).size!==removed.length)return invalid();
     for(const key of removed){if(typeof key!=='string'||[baseKey,deleteKey].includes(key)||!Object.hasOwn(result,key)||Object.hasOwn(item,key))return invalid();delete result[key];}
    }
    for(const [key,value]of Object.entries(item))if(![baseKey,deleteKey].includes(key))Object.defineProperty(result,key,{value,enumerable:true,writable:true,configurable:true});
    value=result;this.recordBases.set(index,base);this.references++;
    if(this.references>Math.floor(limits.expandedBytes/8))throw new StorageError('LIMIT_EXCEEDED','共有レコード参照の展開が安全上限を超えています。');
    if(!record(value)&&!(features.calendarRecords&&calendar(value)))return invalid();
   }
   this.records.push(value);
  }
  this.arrays=pool.arrays as RecordArray[];this.records.forEach((value,index)=>this.recordIds.set(value,index));
  const depth=(v:unknown):number=>{if(!v||typeof v!=='object')return 0;let maximum=0;for(const child of Object.values(v))maximum=Math.max(maximum,depth(child));return maximum+1;};
  this.depths=this.records.map(depth);
  // A pooled historic record is a value, not a mutable alias between editions.
  const freeze=(v:unknown)=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}};
  this.records.forEach(value=>{freeze(value);freezeCapturedPlainData(value);});
  // Every delta must refer backwards and preserve the ordered array's length.
  for(const [index,array]of this.arrays.entries()){
   const invalid=!object(array)||('values'in array
    ?Object.keys(array).some(key=>key!=='values')||!Array.isArray(array.values)
    :Object.keys(array).some(key=>!['base','length','changes'].includes(key))||!Number.isSafeInteger(array.base)||array.base<0||array.base>=index||!Number.isSafeInteger(array.length)||array.length<0||!Array.isArray(array.changes));
   if(invalid)throw new StorageError('ARCHIVE_INVALID','共有レコード配列の基底・形式が不正です。');
  }
 }
 private values(id:unknown):unknown[]{
  const invalid=():never=>{throw new StorageError('ARCHIVE_INVALID','共有レコード配列の索引・差分が不正です。');};
  if(!Number.isSafeInteger(id)||Number(id)<0||Number(id)>=this.arrays.length)return invalid();
  const index=Number(id),ready=this.arrayCache.get(index);if(ready)return ready;
  // Materialize each immutable ordered array once. Historic/pending aliases
  // share it; numeric indices do not form a second full expansion in memory.
  const chain:number[]=[];let at=index;while(!this.arrayCache.has(at)){chain.push(at);const array=this.arrays[at]!;if('values'in array)break;at=array.base;}
  const resolve=(recordId:unknown)=>{if(!Number.isSafeInteger(recordId)||Number(recordId)<0||Number(recordId)>=this.records.length)return invalid();return this.records[Number(recordId)];};
  for(const current of chain.reverse()){
   const array=this.arrays[current]!;let values:unknown[];
   if('values'in array)values=array.values.map(resolve);else{values=this.arrayCache.get(array.base)!.slice();if(values.length!==array.length)return invalid();const seen=new Set<number>();for(const change of array.changes){if(!Array.isArray(change)||change.length!==2||!Number.isSafeInteger(change[0])||change[0]<0||change[0]>=values.length||seen.has(change[0]))return invalid();seen.add(change[0]);values[change[0]]=resolve(change[1]);}}
   if(values.length>this.limits.records)return invalid();
   this.references+=values.length;if(this.references>Math.floor(this.limits.expandedBytes/8))throw new StorageError('LIMIT_EXCEEDED','共有レコード参照の展開が安全上限を超えています。');
   Object.freeze(values);
   // Prove the entire private, frozen decoded array. A later inspection capture
   // can retain these exact values instead of copying every unchanged historic
   // array again. Unsupported own-data graphs keep the complete legacy path.
   freezeCapturedPlainData(values);this.arrayCache.set(current,values);
  }
  return this.arrayCache.get(index)!;
 }
 decode(input:unknown,path:string):unknown{
  const invalid=():never=>{throw new StorageError('ARCHIVE_INVALID','共有レコードの位置・索引・重複が不正です。',path);};
  if(!object(input)||input.version!==1||Object.keys(input).some(k=>!['version','value','arrays','records'].includes(k))||!Object.hasOwn(input,'value')||!Array.isArray(input.arrays)||!Array.isArray(input.records))return invalid();
  const paths=[...input.arrays,...input.records];if(paths.length>this.limits.objects)return invalid();
  const seen=new Set<string>(),writes:{parent:Record<string,unknown>|unknown[];key:string|number;value:unknown}[]=[];let root=input.value;
  for(const [index,raw]of paths.entries()){
   if(!Array.isArray(raw)||raw.length>this.limits.depth||raw.some(key=>!(typeof key==='string'&&!['__proto__','prototype','constructor'].includes(key)||Number.isSafeInteger(key)&&Number(key)>=0)))return invalid();
   const keys=raw as Path,keyText=JSON.stringify(keys);if(seen.has(keyText))return invalid();seen.add(keyText);
   // All pointers are checked against the encoded tree before any replacement.
   let parent:unknown=root;for(const key of keys.slice(0,-1)){if(!parent||typeof parent!=='object'||!Object.hasOwn(parent,key))return invalid();parent=(parent as Record<string,unknown>)[key];}
   const key=keys.at(-1),value=key===undefined?root:parent&&typeof parent==='object'&&Object.hasOwn(parent,key)?(parent as Record<string,unknown>)[key]:undefined;
   const isArray=index<input.arrays.length,values=isArray?this.values(value):Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<this.records.length?[this.records[Number(value)]]:invalid();
   if(!isArray){this.references++;if(this.references>Math.floor(this.limits.expandedBytes/8))throw new StorageError('LIMIT_EXCEEDED','共有レコード参照の展開が安全上限を超えています。',path);}
   for(const record of values){const id=this.recordIds.get(record)!;if(keys.length+this.depths[id]!>this.limits.depth)throw new StorageError('LIMIT_EXCEEDED','共有レコードの展開深さが安全上限を超えています。',path);let used:number|undefined=id;while(used!==undefined&&!this.usedRecords.has(used)){this.usedRecords.add(used);used=this.recordBases.get(used);}}
   const decoded=isArray?values:values[0];
   if(key===undefined){if(paths.length!==1)return invalid();root=decoded;}else{if(!parent||typeof parent!=='object'||Array.isArray(parent)&&typeof key!=='number'||!Array.isArray(parent)&&typeof key!=='string')return invalid();writes.push({parent:parent as Record<string,unknown>,key,value:decoded});}
  }
  // Ancestor pointers are forbidden, so decoded dictionary content cannot become
  // a target for a later pointer or make a cyclic, exponentially expanded tree.
  for(const keys of paths as Path[])for(let i=0;i<keys.length;i++)if(seen.has(JSON.stringify(keys.slice(0,i))))return invalid();
  for(const write of writes)(write.parent as Record<string,unknown>)[write.key]=write.value;
  return root;
 }
 assertComplete(){if(this.usedRecords.size!==this.records.length||this.arrayCache.size!==this.arrays.length)throw new StorageError('ARCHIVE_INVALID','未使用の共有レコード・配列が含まれています。','data/records.json');}
}
