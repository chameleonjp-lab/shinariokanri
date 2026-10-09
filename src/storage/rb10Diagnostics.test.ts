import 'fake-indexeddb/auto';
import {afterEach,expect,it,vi} from 'vitest';
import {ScenarioStore} from './store';
import {createEntity,createProject,newId,textToRichText} from '../domain/model';
import {clearDiagnostics,diagnosticRecords,createDiagnostic} from '../diagnostics';
const stores:ScenarioStore[]=[];
afterEach(async()=>{vi.restoreAllMocks();clearDiagnostics(null);for(const store of stores.splice(0))await store.deleteDatabase();});
it('records a real atomic quota failure using its operation and base version without manuscript or cause',async()=>{
 let fail=false;const store=new ScenarioStore({databaseName:'diagnostic-'+newId(),faultInjector:stage=>{if(fail&&stage==='before-commit')throw new DOMException('secret manuscript and auth token','QuotaExceededError');}});stores.push(store);
 const p=createProject('秘密の作品'),entity=createEntity(p.projectId,'note','秘密の人物',{body:textToRichText('私的本文')});p.entities.push(entity);
 const saved=(await store.saveProject(p,{reason:'作成'})).project,before=await store.getProject(p.projectId),operationId=newId();fail=true;
 await expect(store.saveProject({...saved,name:'新たな秘密'},{operationId,reason:'秘密の理由'})).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});
 expect(await store.getProject(p.projectId)).toEqual(before);const rows=diagnosticRecords(null);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({code:'QUOTA_EXCEEDED',operationId,revision:saved.revision});
 const raw=JSON.stringify(rows);for(const word of ['秘密','私的','manuscript','auth token','stack','reason'])expect(raw).not.toContain(word);
});
it('keeps only recognized environment metadata and isolates the latest twenty records by account',async()=>{
 const row=createDiagnostic('FORBIDDEN',undefined,'0',{commit:'a'.repeat(40),tree:'b'.repeat(40),base:'/shinariokanri/',browser:'Chromium',browserVersion:'153.0.0.0',width:390,online:false,os:'iOS',osVersion:'19.1',...{body:'private',token:'secret',stack:'secret'}});
 expect(row.metadata).toEqual({commit:'a'.repeat(40),tree:'b'.repeat(40),base:'/shinariokanri/',browser:'Chromium',browserVersion:'153.0.0.0',width:390,online:false,os:'iOS',osVersion:'19.1'});
 expect(createDiagnostic('FORBIDDEN',undefined,undefined,{base:'https://private.invalid/token',browserVersion:'153 secret',height:10001}).metadata).toEqual({});
 const {recordDiagnostic}=await import('../diagnostics');for(let i=0;i<25;i++)recordDiagnostic(new Error('private'),{accountId:'A',revision:String(i)});
 expect(diagnosticRecords('A')).toHaveLength(20);expect(diagnosticRecords('A')[0].revision).toBe('5');expect(diagnosticRecords('B')).toEqual([]);clearDiagnostics('A');expect(diagnosticRecords('A')).toEqual([]);
});
it('cancels a cold project enumeration without changing content, history or durable inputs and can resume',async()=>{
 const store=new ScenarioStore({databaseName:'startup-'+newId()});stores.push(store);for(const name of ['一','二','三'])await store.saveProject(createProject(name),{reason:'作成'});
 const before=await store.listProjects(),controller=new AbortController(),progress:number[]=[];
 await expect(store.listProjectsForEditing({signal:controller.signal,onProgress:done=>{progress.push(done);if(done===1)controller.abort();}})).rejects.toMatchObject({code:'CANCELLED'});
 expect(progress).toEqual([0,1]);expect(await store.listProjects()).toEqual(before);expect((await store.listProjectsForEditing()).map(p=>p.name)).toEqual(expect.arrayContaining(['一','二','三']));
});
it('keeps cached reference and structural checks correct after edit, deletion and cancellation',async()=>{
 const {referencesTo}=await import('../ui/referenceIndex'),store=new ScenarioStore({databaseName:'revalidation-'+newId()});stores.push(store);
 const p=createProject('参照の検査'),a=createEntity(p.projectId,'character','一'),b=createEntity(p.projectId,'character','二'),line=createEntity(p.projectId,'dialogue_line','台詞',{speakerId:a.id,text:textToRichText('声')});p.entities.push(a,b,line);
 let saved=(await store.saveProject(p,{reason:'作成',includeHistory:false})).project;
 expect(referencesTo(saved.entities,a.id).map(e=>e.id)).toEqual([line.id]);
 saved=(await store.saveProject({...saved,entities:saved.entities.map(e=>e.id===line.id&&e.kind==='dialogue_line'?{...e,data:{...e.data,speakerId:b.id}}:e)},{reason:'話者の変更',includeHistory:false})).project;
 expect(referencesTo(saved.entities,a.id)).toEqual([]);expect(referencesTo(saved.entities,b.id).map(e=>e.id)).toEqual([line.id]);
 const before=await store.getProject(p.projectId),outbox=await store.listOutbox(p.projectId);
 await expect(store.saveProject({...saved,entities:saved.entities.map(e=>e.id===b.id?{...e,deletedAt:new Date().toISOString()}:e)},{reason:'参照先の削除',includeHistory:false})).rejects.toMatchObject({code:'VALIDATION_FAILED'});
 expect(await store.getProject(p.projectId)).toEqual(before);expect(await store.listOutbox(p.projectId)).toEqual(outbox);
 const controller=new AbortController(),digest=crypto.subtle.digest.bind(crypto.subtle);let entered!:()=>void,release!:()=>void;
 const waiting=new Promise<void>(resolve=>entered=resolve),gate=new Promise<void>(resolve=>release=resolve);let first=true;
 vi.spyOn(crypto.subtle,'digest').mockImplementation(async(...args)=>{if(first){first=false;entered();await gate;}return digest(...args);});
 const pending=store.saveProject({...saved,name:'中止した変更'},{reason:'遅延保存',includeHistory:false,signal:controller.signal});await waiting;controller.abort();release();await expect(pending).rejects.toMatchObject({code:'CANCELLED'});
 expect(await store.getProject(p.projectId)).toEqual(before);expect(await store.listOutbox(p.projectId)).toEqual(outbox);
 expect(diagnosticRecords(null).filter(r=>r.code==='LOCAL_SAVE_FAILED')).toEqual([]);
});
