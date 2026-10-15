import {createHash} from 'node:crypto';
import {deepStrictEqual} from 'node:assert/strict';
import {afterEach,expect,it,vi} from 'vitest';
import {packWorkerRecordData} from './recordPartsCore';
import {unpackRecordData as unpack3288} from './recordPartsCore.baseline-3288.fixture';
import {partitionImportRecord} from './importRecordParts';

afterEach(()=>vi.restoreAllMocks());
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const tables=(parts:Awaited<ReturnType<typeof packWorkerRecordData>>['parts'],kind:'strings'|'nodes')=>parts.filter(part=>part.kind===kind).flatMap(part=>JSON.parse(new TextDecoder().decode(part.bytes)) as unknown[]);

it('keeps every v1 table item and alias readable by the retained old decoder while storing independent smaller native buffers',async()=>{
 const shared={id:'same',text:'😀日本語 ,[]{} " \\ \n',present:undefined,zero:-0};
 const value={shared,again:shared,history:Array.from({length:6000},(_,index)=>({operationId:`保存-${index}`,before:{shared,index},after:{shared,index:index+1},text:`${index}: , ["😀\\"]`}))};
 const original=await packWorkerRecordData(value,'import:complete'),before=original.parts.map(part=>hash(part.bytes));
 const expected=await unpack3288(original.packed,original.parts),actual=await partitionImportRecord(original);
 expect(actual.packed).toMatchObject({version:1,scope:original.packed.scope,root:original.packed.root,nodes:original.packed.nodes,strings:original.packed.strings});
 expect(actual.parts.length).toBeGreaterThan(original.parts.length);
 for(const kind of ['strings','nodes'] as const)deepStrictEqual(tables(actual.parts,kind),tables(original.parts,kind));
 for(const [index,part] of actual.parts.entries()){
  expect(part.bytes.byteLength).toBeLessThanOrEqual(128*1024);
  expect(part.bytes.byteOffset).toBe(0);expect(part.bytes.buffer.byteLength).toBe(part.bytes.byteLength);
  expect(part.key).toBe(`${original.packed.scope}:${index}`);expect(part.sequence).toBe(index);expect(hash(part.bytes)).toBe(part.sha256);
 }
 const decoded=await unpack3288(actual.packed,actual.parts) as typeof value;deepStrictEqual(decoded,expected);
 expect(decoded.shared).toBe(decoded.again);expect(decoded.history.at(-1)!.after.shared).toBe(decoded.shared);
 expect(Object.hasOwn(decoded.shared,'present')).toBe(true);
 expect(original.parts.map(part=>hash(part.bytes))).toEqual(before);
});

it('retains a legal single wide node and author string without introducing a smaller data limit',async()=>{
 const value={wide:Array.from({length:80000},(_,index)=>index),text:'😀漢字"\\,[]'.repeat(24000)};
 const original=await packWorkerRecordData(value,'import:wide'),actual=await partitionImportRecord(original);
 expect(actual.parts.some(part=>part.kind==='strings'&&part.bytes.byteLength>128*1024)).toBe(true);
 expect(actual.parts.some(part=>part.kind==='nodes'&&part.bytes.byteLength>128*1024)).toBe(true);
 deepStrictEqual(await unpack3288(actual.packed,actual.parts),await unpack3288(original.packed,original.parts));
 for(const kind of ['strings','nodes'] as const)deepStrictEqual(tables(actual.parts,kind),tables(original.parts,kind));
});

it('keeps the old decoder rejecting altered, missing and out-of-order import parts',async()=>{
 const original=await packWorkerRecordData({records:Array.from({length:7000},(_,index)=>({index,text:`完全な本文-${index}😀`}))},'import:integrity');
 const actual=await partitionImportRecord(original);expect(actual.parts.length).toBeGreaterThan(2);
 const corrupt=structuredClone(actual.parts);corrupt[1]!.bytes[10]^=1;
 await expect(unpack3288(actual.packed,corrupt)).rejects.toThrow();
 await expect(unpack3288(actual.packed,actual.parts.slice(1))).rejects.toThrow();
 const reordered=structuredClone(actual.packed);[reordered.parts[0],reordered.parts[1]]=[reordered.parts[1]!,reordered.parts[0]!];
 await expect(unpack3288(reordered,actual.parts)).rejects.toThrow();
 deepStrictEqual(await unpack3288(actual.packed,actual.parts),await unpack3288(original.packed,original.parts));
});

it('cancels during repartition hashes without changing the original parts and retries the complete same record',async()=>{
 const original=await packWorkerRecordData({records:Array.from({length:7000},(_,index)=>({index,text:`再試行する元稿-${index}😀`}))},'import:cancel');
 const before=original.parts.map(part=>hash(part.bytes)),controller=new AbortController(),digest=crypto.subtle.digest.bind(crypto.subtle);
 vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(async(...args)=>{const result=await digest(...args);controller.abort();return result;});
 await expect(partitionImportRecord(original,controller.signal)).rejects.toMatchObject({code:'CANCELLED'});
 expect(original.parts.map(part=>hash(part.bytes))).toEqual(before);vi.restoreAllMocks();
 const retry=await partitionImportRecord(original);deepStrictEqual(await unpack3288(retry.packed,retry.parts),await unpack3288(original.packed,original.parts));
});
