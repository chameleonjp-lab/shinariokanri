import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it,vi} from 'vitest';
import {ScenarioStore} from '../../src/storage/store';
import {createEntity,createProject,newId,validateProject} from '../../src/domain/model';
import {nativeDocuments} from '../../src/sync/nativeBridge';
import {valueHash} from '../../src/sync/protocol';
import {jsonBytes,sha256} from '../../src/storage/json';
import {verifySnapshotHashes,worldSnapshotContents} from '../../src/storage/archive';
import type {ProjectData} from '../../src/domain/types';
import {ownershipId,worldOwnershipFixtures} from './world-ownership-measurement-fixtures';

const stores:ScenarioStore[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const store of stores.splice(0))await store.deleteDatabase();});
const barrier=()=>{let release!:()=>void;const ready=new Promise<void>(resolve=>release=resolve);return{ready,release};};
const image=async(db:Dexie)=>Object.fromEntries(await Promise.all(db.tables.map(async table=>[table.name,await table.toArray()])));

it('atomically rejects an ACK retained-snapshot collision committed under another outer key after prevalidation',async()=>{
 const store=new ScenarioStore({databaseName:`p205-ack-collision-${newId()}`,accountId:newId()});stores.push(store);
 const state=store as unknown as {db:Dexie;guardWorldRegistry:(incoming:ProjectData[])=>Promise<void>},db=state.db;
 const project=createProject('ACK confirmed base'),note=createEntity(project.projectId,'note','shared base');note.visibility='team';project.entities=[note];
 const base=(await store.saveProject(project,{reason:'initial native base'})).project,documents=nativeDocuments(base,'1');
 await store.bindConfirmedProject({projectId:base.projectId,serverRevision:'1',documents,contentHash:await valueHash(documents),localRevision:base.revision,outboxIds:(await store.listOutbox(base.projectId)).map(row=>row.operationId)});
 await store.saveProject({...base,name:'local author input'},{reason:'local pending input'});
 const asset=new Uint8Array([1,2,3,4,5]);await store.putAsset(await sha256(asset),asset);
 const fixture=await worldOwnershipFixtures(),incoming=fixture.worlds[0],oldId=ownershipId(3000),incomingId=ownershipId(4000),competingId=ownershipId(4100);
 const competing=structuredClone(incoming),old=competing.snapshots.find(snapshot=>snapshot.id===oldId)!;
 old.content.entities[0].name='P205 competing retained H2';old.contentHash=await sha256(jsonBytes(old.content));
 const newer=competing.snapshots[0];newer.id=competingId;newer.content.entities[0].name='P205 competing retained H2';newer.contentHash=await sha256(jsonBytes(newer.content));competing.entities=structuredClone(newer.content.entities);
 expect(old.contentHash).not.toBe(incoming.snapshots.find(snapshot=>snapshot.id===oldId)!.contentHash);
 expect(validateProject(incoming,{worldSnapshots:worldSnapshotContents({[incomingId]:incoming})}).ok).toBe(true);
 expect(validateProject(competing,{worldSnapshots:worldSnapshotContents({[competingId]:competing})}).ok).toBe(true);
 await verifySnapshotHashes([incoming]);await verifySnapshotHashes([competing]);
 const received={...base,name:'received confirmed title',worldReferences:[{projectId:incoming.projectId,immutableSnapshotId:incomingId,contentHash:incoming.snapshots[0].contentHash}]},receivedDocuments=nativeDocuments(received,'2');
 let armed=false,paused=false;const captured=barrier(),resume=barrier(),guard=state.guardWorldRegistry.bind(store),transaction=db.transaction.bind(db);
 vi.spyOn(state,'guardWorldRegistry').mockImplementation(async rows=>{await guard(rows);if(rows.some(row=>row.snapshots.some(snapshot=>snapshot.id===incomingId)))armed=true;});
 vi.spyOn(db,'transaction').mockImplementation(((...args:unknown[])=>{
  if(args[0]==='rw'&&armed&&!paused){paused=true;captured.release();return resume.ready.then(()=>(transaction as (...values:unknown[])=>Promise<unknown>)(...args));}
  return (transaction as (...values:unknown[])=>Promise<unknown>)(...args);
 }) as typeof db.transaction);
 const applying=store.applyReceivedImage(base.projectId,{serverRevision:'2',documents:receivedDocuments,contentHash:await valueHash(receivedDocuments),worlds:{[incomingId]:incoming}});
 const outcome=applying.then(()=>({state:'fulfilled'}),error=>({state:'rejected',code:error.code}));
 await Promise.race([captured.ready,outcome.then(value=>{throw Error(`ACK did not reach final native barrier: ${JSON.stringify(value)}`);})]);
 expect(await db.table('worlds').count()).toBe(0);expect(await db.table('preparedSync').count()).toBe(1);
 const competitor=createProject('other project commits retained H2');competitor.worldReferences=[{projectId:competing.projectId,immutableSnapshotId:competingId,contentHash:competing.snapshots[0].contentHash}];
 await store.saveProject(competitor,{reason:'concurrent guarded pin',worldPin:{world:competing,snapshotId:competingId}});
 const before=await image(db);expect(before.assets).toHaveLength(1);expect(before.worlds).toHaveLength(1);expect(before.preparedSync).toHaveLength(1);
 resume.release();const completion=await outcome,after=await image(db);
 expect.soft(completion).toEqual({state:'rejected',code:'IMMUTABLE_SNAPSHOT'});
 // The rejected ACK changes no project/content/history/base/prepared/outbox,
 // asset, immutable row, metadata or acknowledgement evidence after the rival.
 expect(after).toEqual(before);
});
