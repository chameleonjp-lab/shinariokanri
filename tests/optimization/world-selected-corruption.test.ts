import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it} from 'vitest';
import {ScenarioStore} from '../../src/storage/store';
import {newId,validateProject} from '../../src/domain/model';
import {validateColdRead} from '../../src/storage/readValidation';
import {verifySnapshotHashes} from '../../src/storage/archive';
import {jsonBytes,sha256} from '../../src/storage/json';
import {ownershipId,worldOwnershipFixtures} from './world-ownership-measurement-fixtures';

const stores:ScenarioStore[]=[];
afterEach(async()=>{for(const store of stores.splice(0))await store.deleteDatabase();});
const image=async(db:Dexie)=>Object.fromEntries(await Promise.all(db.tables.map(async table=>[table.name,await table.toArray()])));

it.each(['loadEditor','getProjectForEditing','getProject','saveProject'] as const)('rejects a selected conflicting direct old edition in %s even when the newer row retains a healthy copy',async method=>{
 const fixture=await worldOwnershipFixtures(),world=fixture.worlds[0],work=fixture.works[0],oldId=ownershipId(3000),newIdLiteral=ownershipId(4000);
 const note=work.entities[0];if(note.kind!=='note')throw Error('literal fixture note');
 note.data.body=[{id:ownershipId(2300),kind:'paragraph',text:'old',links:[{start:0,end:3,target:{entityId:ownershipId(2000),sourceVersionId:oldId}}]}];
 const store=new ScenarioStore({databaseName:`p205-selected-corruption-${newId()}`});stores.push(store);
 const saved=(await store.saveProject(work,{reason:'valid new row with typed old citation',worldPin:{world,snapshotId:newIdLiteral}})).project;
 const db=(store as unknown as {db:Dexie}).db;
 const selected=(await db.table('worlds').get(newIdLiteral)).project;
 expect(selected.snapshots.map((snapshot:{id:string})=>snapshot.id)).toEqual([newIdLiteral,oldId]);
 await validateColdRead(saved,{[newIdLiteral]:selected});
 const old=structuredClone(world.snapshots.find(snapshot=>snapshot.id===oldId)!);old.content.entities[0].name='P205 conflicting direct old body';old.contentHash=await sha256(jsonBytes(old.content));
 const conflicting={...old.content,snapshots:[old],history:[]};
 expect(validateProject(conflicting).ok).toBe(true);await verifySnapshotHashes([conflicting]);
 expect(old.contentHash).not.toBe(world.snapshots.find(snapshot=>snapshot.id===oldId)!.contentHash);
 // Native corruption is isolated to the directly selected old outer row.
 await db.table('worlds').put({id:oldId,project:conflicting});
 const all=Object.fromEntries((await db.table('worlds').toArray()).map(row=>[row.id,row.project]));
 expect(Object.keys(all).sort()).toEqual([oldId,newIdLiteral].sort());
 await expect(validateColdRead(saved,all)).rejects.toMatchObject({code:'IMMUTABLE_SNAPSHOT'});
 store.releaseEditor(saved.projectId);const before=await image(db);
 const action=method==='saveProject'?store.saveProject({...saved,name:'must stay uncommitted'},{reason:'reject selected conflicting old outer'}):store[method](saved.projectId);
 const outcome=await action.then(()=>({state:'fulfilled'}),error=>({state:'rejected',code:error.code}));
 const after=await image(db);
 expect.soft(outcome).toEqual({state:'rejected',code:'IMMUTABLE_SNAPSHOT'});
 expect(after).toEqual(before);
});
