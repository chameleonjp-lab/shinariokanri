import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {afterEach,expect,it} from 'vitest';
import {createEntity,createProject,newId,textToRichText} from '../domain/model';
import type {ContentState,Entity,ProjectData} from '../domain/types';
import {ScenarioStore,type SaveMetrics} from './store';
import {jsonBytes,sha256} from './json';
import {dialogueContentHash} from '../domain/production';
import {contentDelta,targetChanges,writeRows} from '../../tests/optimization/save-changeset-oracle';
const stores:ScenarioStore[]=[];
const open=(options:ConstructorParameters<typeof ScenarioStore>[0]={})=>{const store=new ScenarioStore({databaseName:`changeset-${newId()}`,...options});stores.push(store);return store;};
const raw=(store:ScenarioStore)=>(store as unknown as {db:Dexie}).db;
afterEach(async()=>{for(const store of stores.splice(0))await store.deleteDatabase();});
function fixture(){
 const project=createProject('changeset');
 for(let i=0;i<6;i++)project.entities.push(createEntity(project.projectId,'note',`note ${i}`,{body:textToRichText('original text')}));
 project.relations.push({id:newId(),projectId:project.projectId,revision:'0',fromId:project.entities[0].id,toId:project.entities[1].id,relationType:'related',direction:'forward',validity:{worldRange:null,routeCondition:null,presentationAnchor:null},evidenceIds:[],status:'provisional',visibility:'private'});
 return project;
}
const content=({history:_history,...project}:ProjectData):ContentState=>project;
it('matches frozen target/delta/write oracles and literal rename/reorder/tombstone/append expectations',async()=>{
 const metrics:SaveMetrics[]=[],store=open({onSaveMetrics:row=>metrics.push(row)});
 let project=(await store.saveProject(fixture(),{reason:'initial'})).project;
 const original=structuredClone(project),first=project.entities[0],second=project.entities[1];
 const appended=createEntity(project.projectId,'note','appended',{body:textToRichText('new')});
 const draft={...project,entities:[{...second,name:'second renamed'},...project.entities.slice(2),appended],relations:project.relations.map(row=>({...row,relationType:'reference'}))};
 const saved=await store.saveProject(draft,{reason:'multiple'});project=saved.project;
 const command=project.history.at(-1)!,row=await raw(store).table('commands').get(saved.operationId),outbox=(await store.listOutbox(project.projectId)).find(row=>row.operationId===saved.operationId)!;
 expect(row.delta.patch).toEqual(contentDelta(content(original),content(project)));
 expect(outbox.changes).toEqual(await targetChanges(content(original),content(project)));
 expect(command.targetIds).toEqual([first.id,second.id,project.relations[0].id,project.projectId,appended.id]);
 expect(row.delta.patch.entities.map((row:{id:string})=>row.id)).toEqual([first.id,second.id,appended.id]);
 expect(row.delta.patch.entityIds).toEqual([...draft.entities.map(row=>row.id),first.id]);
 expect(project.entities.at(-1)).toMatchObject({id:first.id,revision:'1',deletionOperationId:saved.operationId});
 expect(project.entities.find(row=>row.id===second.id)).toMatchObject({revision:'1',createdAt:second.createdAt,name:'second renamed'});
 const entityWrites=writeRows(original.entities,project.entities),relationWrites=writeRows(original.relations,project.relations);
 expect(metrics.at(-1)?.written).toMatchObject({entities:entityWrites.put.length+entityWrites.remove.length,relations:relationWrites.put.length+relationWrites.remove.length,commands:1,outbox:1});
 const name=outbox.changes.find(row=>row.targetId===second.id)!.fields.find(row=>row.field==='name')!;
 expect(name.before).toEqual({present:true,value:'note 1'});expect(name.after).toEqual({present:true,value:'second renamed'});
 expect(name.oldValueHash).toBe('3cc74e492cc610e28918bb7fe37297c3926881ac13dded36525599b97523d186');
 expect(await store.getProjectAtRevision(project.projectId,'1')).toMatchObject({entities:original.entities,relations:original.relations});
});
it('preserves exact v2 request bytes and same-ID replay after a rich-text change',async()=>{
 const store=open(),project=(await store.saveProject(fixture(),{reason:'initial'})).project;
 const note=structuredClone(project.entities[0]) as Entity<'note'>;note.data.body[0].text='edited dialogue-like text';
 const draft={...project,entities:[note,...project.entities.slice(1)]},operationId=newId(),reason='body';
 const expected=await sha256(jsonBytes({draft:content(draft),historyIds:project.history.map(row=>row.operationId),reason,assets:[],compensatesOperationId:null}));
 const saved=await store.saveProject(draft,{reason,operationId}),row=await raw(store).table('commands').get(operationId);
 expect(row.requestHashVersion).toBe(2);expect(row.requestHash).toBe(expected);
 expect(await store.saveProject(draft,{reason,operationId})).toEqual(saved);
 await expect(store.saveProject({...draft,name:'different request'},{reason,operationId})).rejects.toMatchObject({code:'OPERATION_CONFLICT'});
});

it('keeps reorder-only writes empty and preserves record revisions',async()=>{
 const reports:SaveMetrics[]=[],store=open({onSaveMetrics:row=>reports.push(row)}),project=(await store.saveProject(fixture(),{reason:'initial'})).project;
 const saved=(await store.saveProject({...project,entities:[...project.entities].reverse()},{reason:'order'})).project;
 expect(reports.at(-1)?.written).toMatchObject({entities:0,relations:0,blocks:0});
 expect(saved!.entities).toEqual([...project.entities].reverse());
 const row=await raw(store).table('commands').get(saved!.history.at(-1)!.operationId);
 expect(row.delta.patch.entities).toEqual([]);expect(row.delta.patch.entityIds).toEqual([...project.entities].reverse().map(row=>row.id));
});
it('keeps absent versus present-undefined target fields and original compact header semantics',async()=>{
 const store=open(),project=(await store.saveProject(fixture(),{reason:'initial'})).project;
 const saved=(await store.saveProject({...project,entities:project.entities.map((row,index)=>index?row:{...row,name:'presence rename',deletedAt:undefined})},{reason:'presence'})).project;
 const changes=(await store.listOutbox(project.projectId)).find(row=>row.operationId===saved.history.at(-1)!.operationId)!.changes;
 expect(changes).toEqual(await targetChanges(content(project),content(saved)));
 expect(changes[0].fields).toContainEqual({field:'deletedAt',before:{present:false},after:{present:true,value:undefined},oldValueHash:await sha256(jsonBytes({present:false}))});
 expect((await raw(store).table('commands').get(saved.history.at(-1)!.operationId)).delta.patch).toEqual(contentDelta(content(project),content(saved)));
});
it.each(['duplicate','deleted-duplicate','kind','createdAt','global-reference'] as const)('rejects %s outside the edited record without committing',async mode=>{
 const store=open(),project=(await store.saveProject(fixture(),{reason:'initial'})).project;
 const entities=structuredClone(project.entities);entities[0].name='legitimate rename';
 if(mode==='duplicate')entities.push({...entities[4]});
 if(mode==='deleted-duplicate')entities.push({...entities[4],deletedAt:'2026-01-01T00:00:00.000Z',deletionOperationId:newId()});
 if(mode==='kind')entities[4]={...createEntity(project.projectId,'character','wrong kind'),id:entities[4].id,createdAt:entities[4].createdAt};
 if(mode==='createdAt')entities[4].createdAt='2020-01-01T00:00:00.000Z';
 if(mode==='global-reference')entities.push(createEntity(project.projectId,'effect','invalid target',{targetId:entities[4].id}));
 await expect(store.saveProject({...project,entities},{reason:'invalid'})).rejects.toMatchObject({code:mode==='kind'||mode==='createdAt'?'OPERATION_CONFLICT':'VALIDATION_FAILED'});
 expect(await store.getProject(project.projectId)).toEqual(project);expect(await raw(store).table('commands').count()).toBe(1);expect(await raw(store).table('outbox').count()).toBe(1);
});

it('derives final deltas after dialogue approval propagation and second revision normalization',async()=>{
 const store=open(),input=createProject('production');
 const speaker=createEntity(input.projectId,'character','speaker'),line=createEntity(input.projectId,'dialogue_line','line',{speakerId:speaker.id,text:textToRichText('before')});
 input.entities=[speaker,line];
 const sourceHash=await dialogueContentHash(input,line),translation=createEntity(input.projectId,'localization','translation',{sourceLineId:line.id,language:'en',sourceHash,text:textToRichText('translation'),stage:'reviewed'});
 input.entities.push(translation);
 const before=(await store.saveProject(input,{reason:'initial'})).project;
 const edited=structuredClone(before.entities[1]) as Entity<'dialogue_line'>;edited.data.text[0].text='after';
 const saved=(await store.saveProject({...before,entities:[before.entities[0],edited,before.entities[2]]},{reason:'text'})).project;
 expect(saved.entities[2]).toMatchObject({revision:'1',data:{stage:'needs_review'}});
 const command=saved.history.at(-1)!,row=await raw(store).table('commands').get(command.operationId);
 expect(command.targetIds).toEqual([line.id,translation.id,saved.projectId]);
 expect(row.delta.patch).toEqual(contentDelta(content(before),content(saved)));
 expect((await store.listOutbox(saved.projectId)).find(row=>row.operationId===command.operationId)!.changes).toEqual(await targetChanges(content(before),content(saved)));
 store.close();const cold=open({databaseName:raw(store).name});expect(await cold.getProject(saved.projectId)).toEqual(saved);
});
