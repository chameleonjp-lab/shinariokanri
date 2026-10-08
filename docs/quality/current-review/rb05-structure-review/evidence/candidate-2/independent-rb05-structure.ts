import 'fake-indexeddb/auto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { expect,it } from 'vitest';
import { createProject,createEntity,newId,validateProject } from '../src/domain/model';
import { prepareReactions } from '../src/domain/reactions';
import { preparePartialCheckpoint } from '../src/domain/checkpoints';
import { flowStructure,structureCounts } from '../src/domain/flowStructure';
import { startTrial,stepTrial,backTrial,restartTrial,pinTrialRecord } from '../src/domain/runtime';
import { startTrialVerified,replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { exportScenario,inspectScenario } from '../src/storage/archive';
import { cloneProject } from '../src/storage/store';
import { jsonBytes,sha256 } from '../src/storage';
import type { Entity,EntityKind,ProjectData } from '../src/domain/types';
function add<K extends EntityKind>(p:ProjectData,kind:K,data:Partial<Entity<K>['data']>={}){const e=createEntity(p.projectId,kind,kind,data);p.entities.push(e);return e as Entity<K>;}
const directory='/tmp/shinariokanri-independent-rb05-structure-2-fixtures';
function evidence(id:string,p:ProjectData,observation:unknown){mkdirSync(directory,{recursive:true});writeFileSync(`${directory}/${id}-project.json`,JSON.stringify(p,null,2)+'\n');writeFileSync(`${directory}/${id}-observation.json`,JSON.stringify(observation,null,2)+'\n');}
async function pin(p:ProjectData,session:ReturnType<typeof startTrial>){const checkpointId=newId(),snapshotId=newId(),record=pinTrialRecord(session,{checkpointId,snapshotId});p.entities.push({...createEntity(p.projectId,'checkpoint','Saved initial state',record.checkpoint),id:checkpointId});const trace=add(p,'trace',record.trace);p.snapshots.push({id:snapshotId,content:record.content,contentHash:await sha256(jsonBytes(record.content)),createdAt:new Date().toISOString(),versionLabel:'Independent fixed version'});return trace;}

it('S5D01 errors in a called lower scene remain counted at its parent chapter and graph',()=>{
 const p=createProject(),chapter=add(p,'chapter'),scene=add(p,'scene',{chapterId:chapter.id}),childScene=add(p,'scene'),line=add(p,'dialogue_line');chapter.data.sceneIds=[scene.id];childScene.data.dialogueLineIds=[line.id];line.status='rejected';
 const a=add(p,'flow_node',{nodeType:'entry',sceneId:scene.id}),call=add(p,'flow_node',{nodeType:'call',sceneId:scene.id}),end=add(p,'flow_node',{nodeType:'terminal',terminalReason:'Done'}),edge=add(p,'flow_edge',{fromId:a.id,toId:call.id}),root=add(p,'flow_graph',{nodeIds:[a.id,call.id,end.id],edgeIds:[edge.id],entryIds:[a.id],exitIds:[end.id]});
 const childEntry=add(p,'flow_node',{nodeType:'entry',sceneId:childScene.id}),childExit=add(p,'flow_node',{nodeType:'exit'}),childEdge=add(p,'flow_edge',{fromId:childEntry.id,toId:childExit.id}),child=add(p,'flow_graph',{parentGraphId:root.id,nodeIds:[childEntry.id,childExit.id],edgeIds:[childEdge.id],entryIds:[childEntry.id],exitIds:[childExit.id]});call.data.childGraphId=child.id;call.data.fallbackId=end.id;
 expect(validateProject(p).ok).toBe(true);const structure=flowStructure(p),chapterCounts=structureCounts(structure.find(e=>e.id===chapter.id)!),graphCounts=structureCounts(structure.find(e=>e.id===root.id)!),childCounts=structureCounts(structure.find(e=>e.id==='unplaced')!);
 evidence('S5D01',p,{expected:{parentChapterErrors:1,parentGraphErrors:1},actual:{chapterCounts,graphCounts,childCounts},structure});expect(chapterCounts.errors).toBeGreaterThanOrEqual(1);expect(graphCounts.errors).toBeGreaterThanOrEqual(1);
});

it('S5D02 an unknown opening never becomes principal checked regression evidence by a full origin label',async()=>{
 const p=createProject(),v=add(p,'variable',{key:'unknown_opening',initial:{type:'unknown',value:null,reason:'Missing author input'}}),s=add(p,'scene'),q=add(p,'foreshadow'),d=add(p,'disclosure',{foreshadowId:q.id,anchor:{entityId:s.id},condition:{op:'compare',variableId:v.id,comparator:'eq',value:{type:'boolean',value:true}}});q.data.clueIds=[d.id];
 const a=add(p,'flow_node',{nodeType:'entry',sceneId:s.id}),b=add(p,'flow_node',{nodeType:'terminal',terminalReason:'Done'}),edge=add(p,'flow_edge',{fromId:a.id,toId:b.id});add(p,'flow_graph',{nodeIds:[a.id,b.id],edgeIds:[edge.id],entryIds:[a.id],exitIds:[b.id]});
 const unresolved=startTrial(p,{entryId:a.id});expect(unresolved.status).toBe('unknown');const trace=await pin(p,unresolved);add(p,'collection',{mode:'fixed',purpose:'regression',memberIds:[trace.id]});expect(validateProject(p).ok).toBe(true);
 const replay=await replaySavedTraceVerified(p,trace.id);expect(replay.status).toBe('unknown');const checked=pinTrialRecord(replay,{checkpointId:newId(),snapshotId:newId()}).trace.coverage!.declaredTests;
 evidence('S5D02',p,{expected:{checked:0,total:1},actual:{status:replay.status,provenance:replay.state.provenance,coverage:checked}});expect(checked.total).toBe(1);expect(checked.checked).toBe(0);
});

it('S5D03 typed partial start with inventory and belief remains partial through native restore clone and replay',async()=>{
 const p=createProject(),key=add(p,'item'),person=add(p,'character'),belief=add(p,'assertion',{subjectId:person.id,predicate:'Knows the key',value:{type:'boolean',value:true}}),v=add(p,'variable',{key:'affinity',valueType:'integer',allowed:{min:0,max:100},initial:{type:'integer',value:0}});
 const a=add(p,'flow_node',{nodeType:'entry'}),b=add(p,'flow_node',{nodeType:'terminal',terminalReason:'Done'}),edge=add(p,'flow_edge',{fromId:a.id,toId:b.id,condition:{op:'compare',variableId:v.id,comparator:'eq',value:{type:'integer',value:5}}});add(p,'flow_graph',{nodeIds:[a.id,b.id],edgeIds:[edge.id],entryIds:[a.id],exitIds:[b.id]});
 const prepared=await preparePartialCheckpoint(p,{entryId:a.id});prepared.checkpoint.data.runtimeState.variableValues[v.id]={type:'integer',value:5};prepared.checkpoint.data.runtimeState.itemInstances.push({instanceId:newId(),typeId:key.id,ownerId:person.id,quantity:1,consumed:false});prepared.checkpoint.data.runtimeState.assertions.push({assertionId:belief.id,holderId:person.id,truth:'true'});p.entities.push(prepared.checkpoint);p.snapshots.push(...prepared.snapshots);
 const restored=(await inspectScenario(await exportScenario(p),{worker:false})).project,{project:cloned,idMap}=await cloneProject(restored),cp=cloned.entities.find((e):e is Entity<'checkpoint'>=>e.id===idMap[prepared.checkpoint.id]&&e.kind==='checkpoint')!;
 const start=await startTrialVerified(cloned,{checkpointId:cp.id,contentVersionId:cp.data.contentVersionId}),before=structuredClone(start.state),end=stepTrial(cloned,start,{edgeId:idMap[edge.id]});expect(end.status).toBe('terminal');expect(backTrial(end).state).toEqual(before);
 const trace=await pin(cloned,end),again=(await inspectScenario(await exportScenario(cloned),{worker:false})).project,replay=await replaySavedTraceVerified(again,trace.id);
 evidence('S5D03',p,{expected:{status:'terminal',provenance:'partial',itemTypeRemapped:true,beliefRemapped:true},actual:{status:replay.status,provenance:replay.state.provenance,initial:replay.startState}});expect(replay.status).toBe('terminal');expect(replay.state.provenance).toBe('partial');expect(replay.startState.itemInstances[0].typeId).toBe(idMap[key.id]);expect(replay.startState.assertions[0].assertionId).toBe(idMap[belief.id]);
});

for(const mode of ['first_revisit','sequence','random']as const)it(`S5D04 ${mode} repeated reactions save and replay seed visits undo and lifecycle state`,async()=>{
 const p=createProject(),sceneIds=[add(p,'scene').id,add(p,'scene').id,add(p,'scene').id],money=add(p,'variable',{key:'money',valueType:'integer',allowed:{min:0,max:100},scope:'run',initial:{type:'integer',value:10}}),memory=add(p,'variable',{key:'memory',valueType:'integer',allowed:{min:0,max:100},scope:'across_runs',initial:{type:'integer',value:7},resetRules:[{on:'new_loop',value:{type:'integer',value:2}}]});
 const cost=add(p,'effect',{operation:'add',targetId:money.id,value:{type:'integer',value:-1}}),remember=add(p,'effect',{operation:'set',targetId:memory.id,value:{type:'integer',value:9}});const prepared=prepareReactions(p,{name:'Reactions',mode,sceneIds:mode==='first_revisit'?sceneIds.slice(0,2):sceneIds}),project=prepared.candidate;for(const edge of project.entities.filter((e):e is Entity<'flow_edge'>=>e.kind==='flow_edge'&&e.data.fromId===prepared.entryId))edge.data.effectIds=[cost.id,remember.id];let current=startTrial(project,{entryId:prepared.entryId,seed:'Independent seed 541'});const selected:string[]=[];
 for(let visit=0;visit<5;visit++){
  const before=structuredClone(current.state),next=stepTrial(project,current,mode==='random'?{random:true}:{});expect(next.status).toBe('ready');expect(backTrial(next).state).toEqual(before);expect(stepTrial(project,backTrial(next),mode==='random'?{random:true}:{}).state).toEqual(next.state);
  const node=project.entities.find((e):e is Entity<'flow_node'>=>e.id===next.nodeId&&e.kind==='flow_node')!;selected.push(node.data.sceneId!);if(mode==='sequence')expect(node.data.sceneId).toBe(sceneIds[Math.min(visit,2)]);if(mode==='first_revisit')expect(node.data.sceneId).toBe(sceneIds[Math.min(visit,1)]);
  if(visit<4){const repeat=project.entities.find((e):e is Entity<'flow_edge'>=>e.kind==='flow_edge'&&e.data.fromId===next.nodeId&&e.data.toId===prepared.entryId)!;current=stepTrial(project,next,{edgeId:repeat.id});}else current=next;
 }
 expect(current.state.variableValues[money.id]).toEqual({type:'integer',value:5});expect(current.state.variableValues[memory.id]).toEqual({type:'integer',value:9});const exit=project.entities.find((e):e is Entity<'flow_edge'>=>e.kind==='flow_edge'&&e.data.fromId===current.nodeId&&e.data.toId!==prepared.entryId)!;current=stepTrial(project,current,{edgeId:exit.id});expect(current.status).toBe('terminal');const trace=await pin(project,current),{project:cloned,idMap}=await cloneProject((await inspectScenario(await exportScenario(project),{worker:false})).project),replay=await replaySavedTraceVerified(cloned,idMap[trace.id]);expect(replay.status).toBe('terminal');expect(replay.state.rngPosition).toBe(current.state.rngPosition);
 const loop=restartTrial(project,current,'next_run',prepared.entryId),reset=restartTrial(project,current,'full_reset',prepared.entryId);evidence('S5D04-'+mode,project,{expected:{terminal:true,replayTerminal:true,runMoney:10,newLoopMemory:2,fullResetMemory:7},actual:{selected,replayStatus:replay.status,rngPosition:replay.state.rngPosition,nextLoop:loop.state,fullReset:reset.state}});expect(loop.state.visitCounts[prepared.entryId]).toBe(1);expect(loop.state.variableValues[money.id]).toEqual({type:'integer',value:10});expect(loop.state.variableValues[memory.id]).toEqual({type:'integer',value:2});expect(reset.state.variableValues[memory.id]).toEqual({type:'integer',value:7});
});
