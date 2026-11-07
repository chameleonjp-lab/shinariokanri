import 'fake-indexeddb/auto';
import {afterEach,expect,it} from 'vitest';
import {ScenarioStore} from './store';
import {createEntity,createProject,newId} from '../domain/model';
import {createWorldSnapshot,previewWorldVersion} from '../domain/world';
import {textToRichText} from '../domain/model';
import {resolveWorkCatalogHit} from '../domain/catalog';
import {nativeDocuments} from '../sync/nativeBridge';
import {valueHash} from '../sync/protocol';
import {searchLocalCatalog} from './crossWorkSearch';
const stores:ScenarioStore[]=[];
const open=(name=`cross-search-${newId()}`,accountId='author')=>{const store=new ScenarioStore({databaseName:name,accountId});stores.push(store);return store;};
afterEach(async()=>{for(const store of stores.splice(0))await store.deleteDatabase();});
async function save(store:ScenarioStore,name:string){const p=createProject(name);p.entities=[createEntity(p.projectId,'character','光')];return (await store.saveProject(p,{reason:'test'})).project;}
it('searches only explicitly selected local works and binds results to their revisions',async()=>{
 const store=open(),a=await save(store,'同名作品'),b=await save(store,'同名作品');await save(store,'除外した秘密');
 const hits=await searchLocalCatalog(store,[a,b],'光');expect(hits).toHaveLength(2);expect(hits.map(h=>h.workId)).toEqual([a.projectId,b.projectId]);
 expect(JSON.stringify(hits)).not.toContain('除外した秘密');expect(hits[0].workRevision).toBe(a.revision);
 expect(await searchLocalCatalog(store,[],'光')).toEqual([]);
 await store.saveProject({...a,name:'改稿'},{reason:'advance'});
 await expect(searchLocalCatalog(store,[a],'光')).rejects.toThrow();
});
it('invalidates in-flight results and emits immediate permission and lifetime changes',async()=>{
 const store=open(),a=await save(store,'作品');let changes=0;const off=store.subscribeCatalogChanges(()=>changes++),before=store.catalogGeneration;
 const pending=searchLocalCatalog(store,[a],'光');store.setAuthorAccess({});
 await expect(pending).rejects.toThrow();expect(store.catalogGeneration).toBeGreaterThan(before);expect(changes).toBe(1);
 store.close();expect(changes).toBe(2);off();
});
it('never resolves the same work ID from a different account store',async()=>{
 const one=open(),two=open(undefined,'other'),a=await save(one,'秘密');
 expect(await searchLocalCatalog(two,[a],'光')).toEqual([]);
});

it('removes revoked account work names, candidates and counts on the next search',async()=>{
 const store=open(),a=await save(store,'許可された作品'),secret=await save(store,'非公開の秘密作品');
 for(const work of [a,secret]){const documents=nativeDocuments(work,'1');await store.bindConfirmedProject({projectId:work.projectId,serverRevision:'1',documents,contentHash:await valueHash(documents),localRevision:work.revision,outboxIds:(await store.listOutbox(work.projectId)).map(row=>row.operationId)});}
 store.setAuthorAccess({[a.projectId]:'owner',[secret.projectId]:'owner'});
 expect(await searchLocalCatalog(store,[a,secret],'光')).toHaveLength(2);
 store.setAuthorAccess({[a.projectId]:'owner'});
 const hits=await searchLocalCatalog(store,[a,secret],'光');expect(hits).toHaveLength(1);expect(hits[0].workId).toBe(a.projectId);
 expect(JSON.stringify(hits)).not.toContain(secret.name);
 expect((await store.listProjectSummaries()).map(work=>work.projectId)).toEqual([a.projectId]);
 await expect(store.loadEditor(secret.projectId,{expectedRevision:secret.revision})).rejects.toThrow();
});

it('rejects a search when another store advances an earlier work during the scan',async()=>{
 const name=`cross-race-${newId()}`,reader=open(name),writer=open(name),a=await save(reader,'前の作品'),b=await save(reader,'後の作品');
 const readWorlds=reader.listEditorWorldSnapshots.bind(reader);let arrived!:()=>void,release!:()=>void;
 const entered=new Promise<void>(resolve=>arrived=resolve),resume=new Promise<void>(resolve=>release=resolve);
 reader.listEditorWorldSnapshots=async(work,options)=>{const result=await readWorlds(work,options);if(work.projectId===b.projectId){arrived();await resume;}return result;};
 const pending=searchLocalCatalog(reader,[a,b],'光');await entered;
 await writer.saveProject({...a,name:'新しい稿'},{reason:'other tab'});release();
 await expect(pending).rejects.toThrow();
});

it('opens the intended fixed edition of a same-ID person through each selected work',async()=>{
 const store=open();let world=createProject('同じ世界');const person=createEntity(world.projectId,'character','光',{summary:textToRichText('初稿だけの文章')});world.entities=[person];world=await createWorldSnapshot(world,'初稿');const old=world.snapshots[0];
 world.entities=[{...person,data:{...person.data,summary:textToRichText('改稿だけの文章')}}];world=await createWorldSnapshot(world,'改稿');const revised=world.snapshots[1];
 const selected=[];
 for(const snapshot of [old,revised]){const work=(await previewWorldVersion(createProject('同名作品'),world,snapshot.id,[person.id])).candidate;selected.push((await store.saveProject(work,{reason:'pin',worldPin:{world,snapshotId:snapshot.id}})).project);}
 const hits=await searchLocalCatalog(store,selected,'光');expect(hits).toHaveLength(2);
 expect(hits.map(hit=>hit.sourceVersionId)).toEqual([old.id,revised.id]);
 for(const [index,hit]of hits.entries()){const loaded=(await store.loadEditor(hit.workId,{expectedRevision:hit.workRevision}))!,worlds=await store.listEditorWorldSnapshots(loaded),target=resolveWorkCatalogHit(loaded,worlds,hit);expect(target?.entity).toEqual((index===0?old:revised).content.entities[0]);}
 expect(await searchLocalCatalog(store,[selected[0]],'改稿だけの文章')).toEqual([]);
});

it('cancels local search without modifying the selected work',async()=>{
 const store=open(),work=await save(store,'中止する作品'),controller=new AbortController();
 const pending=searchLocalCatalog(store,[work],'光',controller.signal);controller.abort();
 await expect(pending).rejects.toMatchObject({code:'CANCELLED'});
 expect((await store.loadEditor(work.projectId))?.revision).toBe(work.revision);
});
it('keeps a completed save successful when a catalog observer fails',async()=>{
 const store=open();store.subscribeCatalogChanges(()=>{throw new Error('observer failure');});
 const work=createProject('保存を守る');
 await expect(store.saveProject(work,{reason:'save'})).resolves.toMatchObject({localSaved:true});
});
