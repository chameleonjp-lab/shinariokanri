import type { Entity, ID, ProjectData } from './types';
import { collectReferences } from './model';

function stable(value: unknown): string {
 if(value===null || typeof value!=='object') return JSON.stringify(value);
 if(Array.isArray(value)) return '['+value.map(stable).join(',')+']';
 return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';
}
/** IDs/order/author notes do not change a line's content hash. Ruby/speaker/cues do. */
export async function dialogueContentHash(project: ProjectData, line: Entity<'dialogue_line'>): Promise<string> {
 const cues=(line.data.cueIds ?? []).map(id=>project.entities.find(e=>e.id===id && e.kind==='cue' && !e.deletedAt));
 if(cues.some(cue=>!cue)) throw new Error('REFERENCE_INVALID: 台詞の演出参照が見つかりません。');
 const content={text:line.data.text.map(block=>({kind:block.kind,text:block.text,ruby:block.ruby??[]})),speakerId:line.data.speakerId??null,cues:cues.map(cue=>cue!.data)};
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
  if(!old||Boolean(old.deletedAt)!==Boolean(entity.deletedAt)||stable(old.data)!==stable(entity.data))changedData.add(id);
 }
 for(const id of previous.keys())if(!current.has(id))changedData.add(id);
 const content=(line:Entity<'dialogue_line'>, index:Map<ID,Entity>)=>stable({text:line.data.text.map(block=>({kind:block.kind,text:block.text,ruby:block.ruby??[]})),speakerId:line.data.speakerId??null,cues:(line.data.cueIds??[]).map(id=>{const cue=index.get(id);if(!cue||cue.kind!=='cue'||cue.deletedAt)throw new Error('REFERENCE_INVALID: 台詞の演出参照が見つかりません。');return cue.data;})});
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
 const entities=candidate.entities.map(entity=>{
  if(entity.deletedAt)return entity;
  if((entity.kind==='localization'||entity.kind==='recording')&&(changed.has(entity.data.sourceLineId)||staleApprovals.has(entity.id))&&entity.data.stage!=='needs_review')return {...entity,data:{...entity.data,stage:'needs_review' as const}} as Entity;
  if(entity.kind==='media_variant'&&(entity.data.sourceIds??[]).some(id=>changedData.has(id))&&!entity.data.needsReview)return {...entity,data:{...entity.data,needsReview:true}} as Entity;
  return entity;
 });
 // Follow typed production dependencies once. Historical ancestry does not change copied content.
 const reverse=new Map<ID,ID[]>();for(const entity of entities)if(!entity.deletedAt&&!['rejected','alternate'].includes(entity.status))for(const reference of collectReferences(entity))if(!reference.path.startsWith('data.lineage')&&!reference.path.startsWith('data.originLineIds')){const uses=reverse.get(reference.id);if(uses)uses.push(entity.id);else reverse.set(reference.id,[entity.id]);}
 const affected=new Set(changedData),queue=[...affected];for(let at=0;at<queue.length;at++)for(const id of reverse.get(queue[at])??[])if(!affected.has(id)){affected.add(id);queue.push(id);}
 const next={...candidate,entities:entities.map(entity=>{if(!affected.has(entity.id)||entity.deletedAt||['rejected','alternate'].includes(entity.status))return entity;
  if(entity.kind==='storyboard_frame'&&previous.has(entity.id))return {...entity,status:'needs_review' as const};
  if(entity.kind==='media_variant'&&previous.has(entity.id))return {...entity,data:{...entity.data,needsReview:true}};
  if(entity.kind==='production_task'&&previous.has(entity.id)&&entity.data.progress==='done')return {...entity,data:{...entity.data,progress:'needs_review' as const}};
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
