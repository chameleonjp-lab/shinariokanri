import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {RecordDictionaryWriter,RecordDictionaryReader,RECORD_DELTA_FEATURE,CALENDAR_RECORD_FEATURE} from './recordDictionary';
import {createHash} from 'node:crypto';
import {ARCHIVE_LIMITS,jsonBytes,parseStrictJson} from './json';
import {createProject,createEntity} from '../domain/model';

it('retains every historical record variant, order and opaque custom fields with bounded ordered deltas',()=>{
 const p=createProject('履歴');p.entities=Array.from({length:12},(_,i)=>createEntity(p.projectId,'note','項目'+i));
 // Custom opaque data must round-trip literally, including names that are
 // forbidden as wire pointers. Domain schema validation remains a later gate.
 const first=p.entities[0]!;Object.assign(first.data,{opaque:{constructor:'私的',entities:[3],relations:[4]}});
 const next={...p,entities:p.entities.map((e,i)=>i===7?{...e,name:'後の値'}:e)},last={...next,entities:[next.entities[2]!,...next.entities.filter((_,i)=>i!==2)]};
 const writer=new RecordDictionaryWriter(),encoded=writer.encode({first:p,next,last,again:p});
 expect(writer.records).toHaveLength(13);expect(writer.arrays.some(a=>'base'in a)).toBe(true);
 const budget={objects:0},pool=parseStrictJson(jsonBytes({records:writer.records,arrays:writer.arrays}),'data/records.json',ARCHIVE_LIMITS,budget),wire=parseStrictJson(jsonBytes(encoded),'data/project.json',ARCHIVE_LIMITS,budget);
 const reader=new RecordDictionaryReader(pool,ARCHIVE_LIMITS);expect(reader.decode(wire,'data/project.json')).toEqual({first:p,next,last,again:p});
});
it('rejects missing, forward, repeated and unsafe pointers before constructing an image',()=>{
 const p=createProject('検査');p.entities.push(createEntity(p.projectId,'note','一'));
 const writer=new RecordDictionaryWriter(),wire=writer.encode(p),pool={records:writer.records,arrays:writer.arrays};
 const decode=(value:unknown)=>new RecordDictionaryReader(structuredClone(pool),ARCHIVE_LIMITS).decode(structuredClone(value),'project');
 expect(()=>decode({...wire,arrays:[...wire.arrays,...wire.arrays]})).toThrow();
 expect(()=>decode({...wire,arrays:[['__proto__','entities']]})).toThrow();
 expect(()=>decode({...wire,value:{...p,entities:999}})).toThrow();
 expect(()=>new RecordDictionaryReader({records:pool.records,arrays:[{base:0,length:1,changes:[]}]},ARCHIVE_LIMITS)).toThrow();
 expect(()=>new RecordDictionaryReader({records:pool.records,arrays:[{values:[99]}]},ARCHIVE_LIMITS).decode(wire,'project')).toThrow();
 const writer2=new RecordDictionaryWriter(),wire2=writer2.encode({before:p,after:{...p,entities:[{...p.entities[0]!,name:'新'}]}});
 const pool2={records:writer2.records,arrays:[{values:[0]},{base:0,length:1,changes:[[0,1],[0,1]]}]};
 expect(()=>new RecordDictionaryReader(pool2,ARCHIVE_LIMITS).decode(wire2,'project')).toThrow();
});
it('preserves the existing quota and refuses expanded reference or decoded depth excess',()=>{
 const p=createProject('上限');p.entities.push(createEntity(p.projectId,'note','一'),createEntity(p.projectId,'note','二'));
 const writer=new RecordDictionaryWriter(),wire=writer.encode(p),pool={records:writer.records,arrays:writer.arrays};
 expect(()=>new RecordDictionaryReader(pool,{...ARCHIVE_LIMITS,expandedBytes:8}).decode(structuredClone(wire),'project')).toThrow();
 expect(()=>new RecordDictionaryReader(pool,{...ARCHIVE_LIMITS,depth:2}).decode(structuredClone(wire),'project')).toThrow();
});

it('rejects unused dictionary records and shares recursively immutable history arrays without merging changed variants',()=>{const p=createProject('履歴'),writer=new RecordDictionaryWriter();p.entities.push(createEntity(p.projectId,'note','元の名前'));const wire=writer.encode({before:p,after:{...p,entities:[{...p.entities[0]!,name:'変更後'}]},alias:p});const reader=new RecordDictionaryReader({records:writer.records,arrays:writer.arrays},ARCHIVE_LIMITS),decoded=reader.decode(structuredClone(wire),'project') as any;reader.assertComplete();expect(decoded.before.entities).toBe(decoded.alias.entities);expect(decoded.before.entities).not.toBe(decoded.after.entities);expect(()=>{decoded.before.entities[0].name='改変';}).toThrow();expect(decoded.after.entities[0].name).toBe('変更後');const extra=new RecordDictionaryReader({records:[...writer.records,createEntity(p.projectId,'note','未使用')],arrays:writer.arrays},ARCHIVE_LIMITS);extra.decode(structuredClone(wire),'project');expect(()=>extra.assertComplete()).toThrow();});

it('keeps all113 complete variants, removed keys, opaque values, calendar order and full canonical SHA with explicitly enabled features',()=>{
 const project=createProject('113全値の差分');project.entities.push(createEntity(project.projectId,'character','原稿',{body:[{id:'paragraph',kind:'paragraph',text:'😀𠮷と元の本文'}]}));
 const source=Array.from({length:113},(_,i)=>({...project,revision:String(i),entities:[{...project.entities[0],name:'版'+i,revision:String(i),data:{...project.entities[0].data,opaque:{__recordBase:'作者の本文',__recordDelete:['本文'],values:[false,null,'😀']}} ,...(i%2?{temporary:'追加と削除'}:{})}]}));
 const writer=new RecordDictionaryWriter({recordDeltas:true,calendarRecords:true}),wire=writer.encode(source),budget={objects:0};
 const pool=parseStrictJson(jsonBytes({records:writer.records,arrays:writer.arrays}),'records',ARCHIVE_LIMITS,budget),encoded=parseStrictJson(jsonBytes(wire),'project',ARCHIVE_LIMITS,budget);
 expect(writer.usedFeatures).toEqual(new Set([RECORD_DELTA_FEATURE,CALENDAR_RECORD_FEATURE]));
 expect(()=>new RecordDictionaryReader(pool,ARCHIVE_LIMITS)).toThrow();
 const reader=new RecordDictionaryReader(pool,ARCHIVE_LIMITS,{recordDeltas:true,calendarRecords:true}),actual=reader.decode(encoded,'project') as typeof source;reader.assertComplete();
 const hash=(value:unknown)=>createHash('sha256').update(jsonBytes(value)).digest('hex');
 for(const [i,row]of actual.entries()){expect(hash(row)).toBe(hash(source[i]));expect(Object.hasOwn(row.entities[0],'temporary')).toBe(i%2===1);expect(row.entities[0].data).toEqual(source[i].entities[0].data);}
 expect(()=>{actual[0].entities[0].name='変更';}).toThrow();
});

it('refuses undeclared, forward, missing and ambiguous record-delta references before completing any image',()=>{
 const p=createProject('差分拒否'),original=createEntity(p.projectId,'note','元');
 for(const delta of [{__recordBase:1,name:'後'},{__recordBase:-1},{__recordBase:999},{__recordBase:0,__recordDelete:['missing']},{__recordBase:0,__recordDelete:['name','name']},{__recordBase:0,__recordDelete:['name'],name:'二重指定'},{__recordBase:0,__recordDelete:['__recordBase']},{__recordBase:0,__recordDelete:['id']}]){
  const pool={records:[original,delta],arrays:[]};expect(()=>new RecordDictionaryReader(pool,ARCHIVE_LIMITS,{recordDeltas:true})).toThrow();expect(original.name).toBe('元');
 }
 const calendarPool={records:[p.calendars[0]],arrays:[{values:[0]}]};expect(()=>new RecordDictionaryReader(calendarPool,ARCHIVE_LIMITS)).toThrow();
 expect(()=>new RecordDictionaryReader({records:[original,{__recordBase:0,name:'後'}],arrays:[]},ARCHIVE_LIMITS)).toThrow();
});

it('reduces actual serialized containers while preserving the original quotas and literal marker fields',()=>{
 const p=createProject('元の上限'),entity=createEntity(p.projectId,'note','元');p.entities.push(entity);
 const rows=Array.from({length:80},(_,i)=>({...p,entities:[{...entity,name:'後'+i,revision:String(i)}]}));
 const encode=(features:{recordDeltas?:boolean;calendarRecords?:boolean})=>{const writer=new RecordDictionaryWriter(features),wire=writer.encode(rows),budget={objects:0};const pool=parseStrictJson(jsonBytes({records:writer.records,arrays:writer.arrays}),'records',ARCHIVE_LIMITS,budget);parseStrictJson(jsonBytes(wire),'project',ARCHIVE_LIMITS,budget);return {writer,wire,pool,objects:budget.objects};};
 const old=encode({}),current=encode({recordDeltas:true,calendarRecords:true});expect(current.objects).toBeLessThan(old.objects);
 expect(()=>new RecordDictionaryReader(current.pool,{...ARCHIVE_LIMITS,expandedBytes:8},{recordDeltas:true,calendarRecords:true})).toThrow();
 const marker={...entity,__recordBase:'literal',__recordDelete:['literal']},writer=new RecordDictionaryWriter({recordDeltas:true});const wire=writer.encode([marker,{...marker,name:'別'},entity]);const reader=new RecordDictionaryReader({records:writer.records,arrays:writer.arrays},ARCHIVE_LIMITS,{recordDeltas:true});expect(reader.decode(wire,'project')).toEqual([marker,{...marker,name:'別'},entity]);reader.assertComplete();
});
