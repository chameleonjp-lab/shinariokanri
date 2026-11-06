import type { Entity, ID, ProjectData } from './types';
import { collectReferences, newId } from './model';
import { adoptedRecord } from './adoption';
import { resolveReuseContent, reuseFieldOrigin, reuseOrigin } from './reuse';
import { measureText } from './textMetrics';

function stable(value: unknown): string {
 if(value===null || typeof value!=='object') return JSON.stringify(value);
 if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
 return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
}
/** IDs/order/author notes do not change a line's content hash. Ruby/speaker/cues do. */
export async function dialogueContentHash(project: ProjectData, line: Entity<'dialogue_line'>): Promise<string> {
 const cues=(line.data.cueIds ?? []).map(id=>project.entities.find(e=>e.id===id && e.kind==='cue' && !e.deletedAt));
 if(cues.some(cue=>!cue)) throw new Error('REFERENCE_INVALID: 台詞の演出参照が見つかりません。');
 const content={...(line.data.scriptKind&&line.data.scriptKind!=='dialogue'?{scriptKind:line.data.scriptKind}:{}),text:line.data.text.map(block=>({kind:block.kind,text:block.text,ruby:block.ruby??[]})),speakerId:line.data.speakerId??null,cues:cues.map(cue=>cue!.data)};
 const bytes=new TextEncoder().encode(stable(content));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
/** Called on the candidate before commit: all changed deliverables join the same transaction. */
export async function reconcileDeliverables(before: ProjectData, candidate: ProjectData): Promise<ProjectData> {
 const previous=new Map(before.entities.map(entity=>[entity.id,entity]));
 const current=new Map(candidate.entities.map(entity=>[entity.id,entity]));
 const changed=new Set<ID>();
 const changedData=new Set<ID>();
 for(const [id,entity] of current) {
  const old=previous.get(id);
  if(old===entity)continue;
  if(!old||Boolean(old.deletedAt)!==Boolean(entity.deletedAt)||stable(old.data)!==stable(entity.data))changedData.add(id);
 }
 for(const id of previous.keys())if(!current.has(id))changedData.add(id);
 const content=(line:Entity<'dialogue_line'>, index:Map<ID,Entity>)=>stable({...(line.data.scriptKind&&line.data.scriptKind!=='dialogue'?{scriptKind:line.data.scriptKind}:{}),text:line.data.text.map(block=>({kind:block.kind,text:block.text,ruby:block.ruby??[]})),speakerId:line.data.speakerId??null,cues:(line.data.cueIds??[]).map(id=>{const cue=index.get(id);if(!cue||cue.kind!=='cue'||cue.deletedAt)throw new Error('REFERENCE_INVALID: 台詞の演出参照が見つかりません。');return cue.data;})});
 for(const entity of candidate.entities) {
  if(entity.kind!=='dialogue_line'||entity.deletedAt)continue;
  const old=previous.get(entity.id);
  if(!old||old.kind!=='dialogue_line'||old.deletedAt||['rejected','alternate'].includes(old.status)!==['rejected','alternate'].includes(entity.status))changed.add(entity.id);
  else if((changedData.has(entity.id)||(entity.data.cueIds??[]).some(id=>changedData.has(id)))&&content(old,previous)!==content(entity,current))changed.add(entity.id);
 }
 for(const old of before.entities)if(old.kind==='dialogue_line'&&!old.deletedAt){const line=current.get(old.id);if(!line||line.deletedAt||line.kind!=='dialogue_line')changed.add(old.id);}
 // A manual stage change cannot approve an old or retired source hash.
 const staleApprovals=new Set<ID>();
 for(const entity of candidate.entities)if(!entity.deletedAt&&(entity.kind==='localization'||entity.kind==='recording')&&['reviewed','recorded'].includes(entity.data.stage??'')&&!changed.has(entity.data.sourceLineId)&&changedData.has(entity.id)){
  const line=current.get(entity.data.sourceLineId);
  if(!line||line.kind!=='dialogue_line'||line.deletedAt||['rejected','alternate'].includes(line.status)||entity.data.sourceHash!==await dialogueContentHash(candidate,line))staleApprovals.add(entity.id);
 }
 if(!changedData.size&&!changed.size&&!staleApprovals.size)return candidate;
 const entities=candidate.entities.map(entity=>{
  if(entity.deletedAt)return entity;
  if((entity.kind==='localization'||entity.kind==='recording')&&(changed.has(entity.data.sourceLineId)||staleApprovals.has(entity.id))&&entity.data.stage!=='needs_review')return {...entity,data:{...entity.data,stage:'needs_review' as const}} as Entity;
  if(entity.kind==='media_variant'&&(entity.data.sourceIds??[]).some(id=>changedData.has(id))&&!entity.data.needsReview)return {...entity,data:{...entity.data,needsReview:true}} as Entity;
  return entity;
 });
 // A fixed edition owns its anchor IDs. A live edit cannot invalidate that unchanged edition.
 const liveReference=(entity:Entity,path:string)=>{let value:unknown=entity;for(const part of path.split(/[.\[\]]+/).filter(Boolean)){if(value&&typeof value==='object'){const object=value as Record<string,unknown>,version=object.sourceVersionId??object.targetSnapshotId??((entity.kind==='trace'||entity.kind==='checkpoint')?object.contentVersionId:undefined);if(typeof version==='string'&&version!==candidate.projectId)return false;value=object[part];}else return true;}return true;};
 // Scene containment must not invalidate sibling frames/cues. A task explicitly
 // targeting the whole scene still owns every contained line, at every stage.
 // Historical ancestry does not change copied content.
 const reverse=new Map<ID,ID[]>();for(const entity of entities)if(!entity.deletedAt&&!['rejected','alternate'].includes(entity.status))for(const reference of collectReferences(entity))if(!(entity.kind==='scene'&&reference.path.startsWith('data.dialogueLineIds'))&&!reference.path.startsWith('data.lineage')&&!reference.path.startsWith('data.originLineIds')&&liveReference(entity,reference.path)){const uses=reverse.get(reference.id);if(uses)uses.push(entity.id);else reverse.set(reference.id,[entity.id]);}
 for(const task of entities)if(task.kind==='production_task'&&!task.deletedAt&&!['rejected','alternate'].includes(task.status))for(const id of task.data.targetIds){const scene=current.get(id);if(scene?.kind==='scene'&&!scene.deletedAt&&!['rejected','alternate'].includes(scene.status))for(const lineId of scene.data.dialogueLineIds??[]){const uses=reverse.get(lineId);if(uses)uses.push(task.id);else reverse.set(lineId,[task.id]);}}
 const affected=new Set(changedData),sourceAffected=new Set<ID>(),queue=[...affected];for(let at=0;at<queue.length;at++)for(const id of reverse.get(queue[at])??[]){sourceAffected.add(id);if(!affected.has(id)){affected.add(id);queue.push(id);}}
 const next={...candidate,entities:entities.map(entity=>{if(!affected.has(entity.id)||entity.deletedAt||['rejected','alternate'].includes(entity.status))return entity;
  if(entity.kind==='storyboard_frame'&&previous.has(entity.id))return {...entity,status:'needs_review' as const};
  if(entity.kind==='media_variant'&&previous.has(entity.id))return {...entity,data:{...entity.data,needsReview:true}};
  if(entity.kind==='production_task'&&previous.has(entity.id)&&sourceAffected.has(entity.id)&&entity.data.progress==='done')return {...entity,data:{...entity.data,progress:'needs_review' as const}};
  return entity;
 })};
 return next;
}
export function productionCounts(project: ProjectData, routeSceneIds: readonly ID[] = []) {
 const scenes=project.entities.filter(e=>e.kind==='scene'&&!e.deletedAt&&e.status!=='rejected');
 const ids=new Set(scenes.map(e=>e.id));
 const tasks=project.entities.filter((e):e is Entity<'production_task'>=>e.kind==='production_task'&&!e.deletedAt);
 const stages=['writing','review','implementation','translation','recording','verification','publication'] as const;
 return {uniqueSceneCount:ids.size,routeOccurrences:routeSceneIds.filter(id=>ids.has(id)).length,unknownRouteReferences:routeSceneIds.filter(id=>!ids.has(id)).length,byStage:Object.fromEntries(stages.map(stage=>[stage,{total:tasks.filter(e=>e.data.stage===stage).length,done:tasks.filter(e=>e.data.stage===stage&&e.data.progress==='done').length}]))};
}
export function pendingSourceHashes(project: ProjectData) {
 return Promise.all(project.entities.filter((e):e is Entity<'localization'|'recording'>=>(e.kind==='localization'||e.kind==='recording')&&!e.deletedAt).map(async entity=>{
  const line=project.entities.find((e):e is Entity<'dialogue_line'>=>e.kind==='dialogue_line'&&e.id===entity.data.sourceLineId&&!e.deletedAt&&!['rejected','alternate'].includes(e.status));
  return {id:entity.id,sourceLineId:entity.data.sourceLineId,stale:!line||entity.data.sourceHash!==await dialogueContentHash(project,line)};
 }));
}

/** Production identity is the originating record and content, rather than each reuse site. */
export function productionContentView(project: ProjectData) {
 const view = resolveReuseContent(project, project.snapshots),ownById=new Map(project.entities.map(entity=>[entity.id,entity])),reverseBindings=new WeakMap<object,Map<ID,ID>>();
 const key = (id: ID) => {
  const origin = reuseOrigin(view,id),own=ownById.get(id);
  if(!origin||own?.kind==='scene'&&own.data.reuse?.mode==='override'&&own.data.reuse.overrideFields.some(field=>['body','dialogueLineIds','blockIds'].includes(field)))return id;
  let reverse=reverseBindings.get(origin.bindings);if(!reverse){reverse=new Map(Object.entries(origin.bindings).map(([source,target])=>[target,source]));reverseBindings.set(origin.bindings,reverse);}return reverse.get(id)??origin.entityId;
 };
 return { view, key };
}

/** Counts actual block text as Unicode code points, without ruby readings or implicit separators. */
function writingCountView(project: ProjectData) {
 const {view,key}=productionContentView(project);
 const byId=new Map(view.entities.filter(adoptedRecord).map(entity=>[entity.id,entity]));
 const count=(targetIds:readonly ID[])=>{
  const pending=[...targetIds],visited=new Set<ID>(),content=new Set<string>(),unknown=new Set<ID>();let characters=0;
  while(pending.length){
   const id=pending.pop()!;if(visited.has(id))continue;visited.add(id);
   const entity=byId.get(id);if(!entity){unknown.add(id);continue;}
   if(entity.kind==='chapter'){pending.push(...entity.data.sceneIds);continue;}
   if(entity.kind==='production_task'){pending.push(...entity.data.targetIds);continue;}
   if(entity.kind!=='scene'&&entity.kind!=='dialogue_line'){unknown.add(id);continue;}
   if(entity.kind==='scene')pending.push(...entity.data.dialogueLineIds??[]);
   const blocks=entity.kind==='scene'?entity.data.body:entity.data.text;
   // Body ownership follows that field through reuse, independently of scene/link overrides.
   const contentId=entity.kind==='scene'?(reuseFieldOrigin(view,id,'body')?.entityId??id):key(id);
   // Remapped block IDs and ruby do not change authored text; changed fixed source text does.
   const identity=JSON.stringify([entity.kind,contentId,blocks.map(block=>block.text)]);
   if(content.has(identity))continue;content.add(identity);
   for(const block of blocks)characters+=measureText(block.text).codePoints;
  }
  return {characters,unknownReferences:unknown.size};
 };
 return {byId,count};
}
/** Work includes all active scene bodies and dialogue; a chapter/task follows only its targets. */
export function writingCounts(project: ProjectData, scopeId?: ID) {
 const {byId,count}=writingCountView(project);
 if(scopeId){const scope=byId.get(scopeId);if(!scope||!['chapter','production_task'].includes(scope.kind))throw Error('REFERENCE_INVALID: 文字数目標の対象の章・作業単位がありません。');}
 return count(scopeId?[scopeId]:[...byId.values()].filter(entity=>entity.kind==='scene'||entity.kind==='dialogue_line').map(entity=>entity.id));
}
/** Route visits are measured independently, including another reading of the same scene/line. */
export function writingRouteCounts(project: ProjectData, sceneIds: readonly ID[]) {
 if(!sceneIds.length)return {characters:0,unknownReferences:0};
 const {byId,count}=writingCountView(project);let characters=0,unknownReferences=0;
 const perScene=new Map<ID,ReturnType<typeof count>>();
 for(const id of sceneIds){if(byId.get(id)?.kind!=='scene'){unknownReferences++;continue;}let measured=perScene.get(id);if(!measured){measured=count([id]);perScene.set(id,measured);}characters+=measured.characters;unknownReferences+=measured.unknownReferences;}
 return {characters,unknownReferences};
}
const goalView='writing-goal';
const goalMatches=(view:ProjectData['views'][number],scopeId?:ID)=>view.view===goalView&&view.entityIds.length===(scopeId?1:0)&&(!scopeId||view.entityIds[0]===scopeId);
export function writingGoal(project:ProjectData,scopeId?:ID):number|null {
 const value=project.views.find(view=>goalMatches(view,scopeId))?.settings.characters;
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:null;
}
/** Optional goals use the existing saved-view contract and ordinary project save/undo. */
export function setWritingGoal(project:ProjectData,scopeId:ID|undefined,characters:number|null):ProjectData {
 if(characters!==null&&(!Number.isSafeInteger(characters)||characters<=0))throw Error('VALIDATION_FAILED: 文字数目標は1以上の安全な整数、または未設定にしてください。');
 if(scopeId&&!project.entities.some(entity=>entity.id===scopeId&&['chapter','production_task'].includes(entity.kind)&&adoptedRecord(entity)))throw Error('REFERENCE_INVALID: 文字数目標の対象の章・作業単位がありません。');
 const old=project.views.find(view=>goalMatches(view,scopeId));
 if(!old&&characters===null)return project;
 if(old&&writingGoal(project,scopeId)===characters&&characters!==null)return project;
 const views=project.views.filter(view=>!goalMatches(view,scopeId));
 if(characters!==null)views.push({...old,id:old?.id??newId(),name:old?.name??'任意の文字数目標',view:goalView,entityIds:scopeId?[scopeId]:[],settings:{...old?.settings,characters,countingRule:'code-points-v1'}});
 return {...project,views};
}
