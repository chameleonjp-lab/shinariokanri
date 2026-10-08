import { adoptedRecord } from './adoption';
import { resolveReuseContent, reuseOrigin } from './reuse';
import { createEntity } from './model';
import { createWorldSnapshot } from './world';
import { sha256, jsonBytes } from '../storage/json';
import { forkAuthorAlternative, appendAlternativeVersion } from './writingWorkspace';
import { sealAuthorAlternative } from './authorAlternativeIntegrity';
import { createConsultationProposal } from './exports';
import { captureRuntimeContent } from './runtimeVersions';
import {resolvePinnedWorlds} from './pinnedWorlds';
import {replaySavedTraceVerified} from './runtimeVerified';
import {replayChapterReading} from './presentation';
import type { Entity, ID, ProjectData, ProjectContent, Estimate, RichText } from './types';

/** Production identity is the originating record and content, rather than each reuse site. */
function workloadView(project: ProjectData) {
 const view = resolveReuseContent(project, project.snapshots),ownById=new Map(project.entities.map(entity=>[entity.id,entity])),reverseBindings=new WeakMap<object,Map<ID,ID>>();
 const key = (id: ID) => {
  const origin = reuseOrigin(view,id),own=ownById.get(id);
  if(!origin||own?.kind==='scene'&&own.data.reuse?.mode==='override'&&own.data.reuse.overrideFields.some(field=>['body','dialogueLineIds','blockIds'].includes(field)))return id;
  let reverse=reverseBindings.get(origin.bindings);if(!reverse){reverse=new Map(Object.entries(origin.bindings).map(([source,target])=>[target,source]));reverseBindings.set(origin.bindings,reverse);}return reverse.get(id)??origin.entityId;
 };
 return { view, key };
}
export function productionWorkload(project:ProjectData,routeSceneIds:readonly ID[]=[],routeEdition:ProjectData=project) {
 const {view,key}=workloadView(project), scenes=view.entities.filter((e):e is Entity<'scene'>=>e.kind==='scene'&&adoptedRecord(e)),sceneIds=new Set(scenes.map(e=>e.id));
 const lines=view.entities.filter(e=>e.kind==='dialogue_line'&&adoptedRecord(e)),assets=view.entities.filter(e=>e.kind==='attachment'&&adoptedRecord(e)),tasks=project.entities.filter((e):e is Entity<'production_task'>=>e.kind==='production_task'&&adoptedRecord(e)),taskById=new Map(tasks.map(task=>[task.id,task]));
 const routeIds=routeEdition===project?sceneIds:new Set(workloadView(routeEdition).view.entities.filter(entity=>entity.kind==='scene'&&adoptedRecord(entity)).map(entity=>entity.id));
 return {uniqueScenes:new Set(scenes.map(e=>key(e.id))).size,uniqueLines:new Set(lines.map(e=>key(e.id))).size,uniqueAssets:new Set(assets.map(e=>key(e.id))).size,reuseSites:scenes.filter(e=>reuseOrigin(view,e.id)).length,routeOccurrences:routeSceneIds.filter(id=>routeIds.has(id)).length,unknownRouteReferences:routeSceneIds.filter(id=>!routeIds.has(id)).length,rows:tasks.map(task=>({task,dependencies:(task.data.dependsOn??[]).map(id=>({id,status:taskById.get(id)?.data.progress??'unknown'})),deadlineConflict:(task.data.dependsOn??[]).some(id=>{const before=taskById.get(id)?.data.deadline,after=task.data.deadline;return !!before&&!!after&&(before.timeZone!==after.timeZone||before.date>after.date);}),blocked:!!task.data.blockingReason||(task.data.dependsOn??[]).some(id=>taskById.get(id)?.data.progress!=='done'),estimate:task.data.estimate??null}))};
}
export async function productionTraceWorkload(input:ProjectData,traceId:ID,worldSnapshots:Record<ID,ProjectContent>={}){
 const project=structuredClone(input),registry=structuredClone(worldSnapshots),trace=project.entities.find((entity):entity is Entity<'trace'>=>entity.id===traceId&&entity.kind==='trace'&&adoptedRecord(entity));if(!trace)throw Error('REFERENCE_INVALID: 制作量を比較する保存経路がありません。');
 const captured=await captureRuntimeContent(project,trace.data.contentVersionId,{worldSnapshots:registry}),edition=resolveReuseContent(captured,captured.snapshots),sceneIds:ID[]=[];
 if(trace.data.mode==='chapters'){
  const checkpoint=project.entities.find(entity=>entity.id===trace.data.startCheckpointId);if(checkpoint?.kind!=='checkpoint')throw Error('REFERENCE_INVALID: 章経路の開始状態がありません。');const replay=await replayChapterReading(project,trace.data,checkpoint.data,{worldSnapshots:registry});if(replay.issues.length)throw Error('INTEGRITY_FAILED: 保存した章経路の再生を確認できません。');sceneIds.push(...replay.occurrences.map(occurrence=>occurrence.entityId));
 }else{const replay=await replaySavedTraceVerified(project,trace.id,registry);if(replay.status==='error'||replay.issues.length)throw Error('INTEGRITY_FAILED: 保存した分岐経路の再生を確認できません。');const nodes=[replay.startState.presentationPosition,...replay.trace.filter(step=>!step.request.stub).map(step=>step.toId)];for(const id of nodes){const node=edition.entities.find(entity=>entity.id===id&&entity.kind==='flow_node');if(node?.kind==='flow_node'&&node.data.sceneId)sceneIds.push(node.data.sceneId);}}
 return {sourceVersionId:trace.data.contentVersionId,sourceRevision:edition.revision,origin:trace.data.steps.at(-1)?.after.provenance??'partial',externalMode:trace.data.externalMode??'stub',workload:productionWorkload(project,sceneIds,edition)};
}
export function estimateProduction(project:ProjectData,task:Entity<'production_task'>,input:{speed:number;unit:string;assumptions:string[];source:string}):Estimate {
 if(!Number.isFinite(input.speed)||input.speed<=0||!input.unit.trim()||!input.source.trim()||!input.assumptions.some(value=>value.trim()))throw new Error('VALIDATION_FAILED: 速度・単位・出所・仮定を指定してください。');
 const {view,key}=workloadView(project),entityById=new Map(view.entities.filter(adoptedRecord).map(entity=>[entity.id,entity])),selected=new Set<ID>(),pending=[...task.data.targetIds],unknown=new Set<ID>();
 while(pending.length){const id=pending.pop()!;if(selected.has(id)||unknown.has(id))continue;const entity=entityById.get(id);if(!entity){unknown.add(id);continue;}selected.add(id);
  if(entity.kind==='chapter')pending.push(...entity.data.sceneIds);
  else if(entity.kind==='scene')pending.push(...entity.data.dialogueLineIds??[]);
  else if(entity.kind==='dialogue_line')pending.push(...entity.data.cueIds??[]);
  else if(entity.kind==='cue'&&entity.data.attachmentId)pending.push(entity.data.attachmentId);
  else if(entity.kind==='storyboard_frame')pending.push(...[entity.data.referenceAssetId,entity.data.finalAssetId].filter((id):id is ID=>!!id));
  else if(!['scene','dialogue_line','attachment','cue','chapter','storyboard_frame'].includes(entity.kind))unknown.add(id);
 }
 const amount=new Set(view.entities.filter(e=>selected.has(e.id)&&['scene','dialogue_line','attachment'].includes(e.kind)).map(e=>key(e.id))).size;
 return {value:amount/input.speed,unit:input.unit,assumptions:input.assumptions.filter(value=>value.trim()),scope:{projectId:project.projectId},unknownCount:unknown.size,source:input.source,speed:input.speed};
}
const capture = (project: ProjectData): ProjectData => ({...structuredClone({...project,history:[]}),history:project.history});
const digest=({history:_history,...content}:ProjectData)=>sha256(jsonBytes(content));
export async function previewMediaRevision(inputProject:ProjectData,id:ID,inputBody:RichText,options:{worldSnapshots?:Record<ID,ProjectContent>}={}){
 const project=capture(inputProject),body=structuredClone(inputBody),registry=structuredClone(options.worldSnapshots??{});
 const old=project.entities.find((e):e is Entity<'media_variant'>=>e.id===id&&e.kind==='media_variant'&&adoptedRecord(e));if(!old)throw new Error('REFERENCE_INVALID: 媒体版がありません。');const base=project.snapshots.find(s=>s.id===old.data.baseSnapshotId);if(!base||await sha256(jsonBytes(base.content))!==base.contentHash)throw new Error('INTEGRITY_FAILED: 媒体の元公開版を確認できません。');
 const pinned=await createWorldSnapshot(project,'媒体改訂候補の元設定版'),next=createEntity(project.projectId,'media_variant',`${old.name} · 改訂候補`,{...old.data,body:structuredClone(body),baseSnapshotId:pinned.snapshots.at(-1)!.id,previousVariantId:old.id,needsReview:true});next.status='provisional';next.visibility=old.visibility;
 const records=async(version:ID)=>{const captured=await captureRuntimeContent(project,version,{worldSnapshots:registry}),view=resolveReuseContent(captured,captured.snapshots),entities=[...view.entities,...resolvePinnedWorlds(view,registry).worlds.flatMap(world=>world.entities)];if(new Set(entities.map(entity=>entity.id)).size!==entities.length)throw Error('REFERENCE_INVALID: 媒体の元設定に同じIDが重複しています。');return new Map(entities.map(entity=>[entity.id,entity]));};
 const before=await records(base.id),after=await records(project.projectId);
 const differences=(old.data.sourceIds??[]).map(id=>({id,before:before.get(id)??null,after:after.get(id)??null})).filter(diff=>JSON.stringify(diff.before)!==JSON.stringify(diff.after));
 const candidate={...pinned,entities:[...pinned.entities,next]},payload={projectId:project.projectId,baseRevision:project.revision,oldId:id,newId:next.id,baseHash:base.contentHash,differencesHash:await sha256(jsonBytes(differences)),candidateHash:await digest(candidate)};return {...payload,old,base,candidate,differences,confirmationHash:await sha256(jsonBytes(payload))};
}
export async function confirmMediaRevision(inputProject:ProjectData,inputPlan:Awaited<ReturnType<typeof previewMediaRevision>>){const project=capture(inputProject),plan=structuredClone(inputPlan);const {candidate,old:_old,base:_base,differences,confirmationHash,...payload}=plan;if(project.projectId!==plan.projectId||project.revision!==plan.baseRevision||await digest(candidate)!==plan.candidateHash||await sha256(jsonBytes(differences))!==plan.differencesHash||await sha256(jsonBytes(payload))!==confirmationHash)throw new Error('REVISION_CONFLICT: 媒体比較後に作品または差分が変わりました。');return {...candidate,history:project.history};}
export async function previewConsultationImport(inputProject:ProjectData,input:{text:string;source:string;versionId:ID;targetId?:ID}){
 const project=capture(inputProject);input=structuredClone(input);
 const snapshot=input.versionId===project.projectId?undefined:project.snapshots.find(s=>s.id===input.versionId);if(input.versionId!==project.projectId&&(!snapshot||await sha256(jsonBytes(snapshot.content))!==snapshot.contentHash))throw new Error('INTEGRITY_FAILED: 相談対象版を確認できません。');
 const source=snapshot?{...snapshot.content,snapshots:project.snapshots,history:[]}:project,proposal=createConsultationProposal(source,{id:crypto.randomUUID(),blockId:crypto.randomUUID(),text:input.text,source:input.source,targetRevision:source.revision,createdAt:new Date().toISOString()});proposal.candidate.customValues.consultationTargetVersionId=input.versionId;
 const branch=forkAuthorAlternative(project,'相談からの提案',{snapshotId:snapshot?.id});let content={...source,entities:[...source.entities,{...proposal.candidate,status:'provisional' as const}]};
 if(input.targetId){const target=content.entities.find(e=>e.id===input.targetId&&adoptedRecord(e));if(!target||!['scene','dialogue_line','chapter','note'].includes(target.kind))throw new Error('REFERENCE_INVALID: 対象版内の本文を選んでください。');const field=target.kind==='dialogue_line'?'text':target.kind==='chapter'?'summary':'body';content={...content,entities:content.entities.map(e=>e.id===target.id?{...e,data:{...e.data,[field]:proposal.candidate.data.body.map(block=>({...structuredClone(block),id:crypto.randomUUID()}))}} as Entity:e)};}
 const alternative=await sealAuthorAlternative(appendAlternativeVersion(branch,content,`出所: ${input.source}`)),payload={projectId:project.projectId,baseRevision:project.revision,versionId:input.versionId,alternativeHash:await sha256(jsonBytes(alternative))};return {...payload,alternative,confirmationHash:await sha256(jsonBytes(payload))};
}
export async function confirmConsultationImport(inputProject:ProjectData,inputPlan:Awaited<ReturnType<typeof previewConsultationImport>>){const project=capture(inputProject),plan=structuredClone(inputPlan);const {alternative,confirmationHash,...payload}=plan;if(project.projectId!==plan.projectId||project.revision!==plan.baseRevision||await sha256(jsonBytes(alternative))!==plan.alternativeHash||await sha256(jsonBytes(payload))!==confirmationHash)throw new Error('REVISION_CONFLICT: 相談の確認後に作品または提案が変わりました。');return {...project,authorAlternatives:[...project.authorAlternatives??[],alternative]};}
