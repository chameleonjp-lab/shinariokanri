import type { Entity, ID, ProjectData } from './types';

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
 const next=structuredClone(candidate);
 const changed=new Set<ID>();
 const lines=next.entities.filter((e):e is Entity<'dialogue_line'>=>e.kind==='dialogue_line'&&!e.deletedAt);
 for(const line of lines) {
  const old=before.entities.find((e):e is Entity<'dialogue_line'>=>e.id===line.id&&e.kind==='dialogue_line'&&!e.deletedAt);
  if(!old || await dialogueContentHash(before,old)!==await dialogueContentHash(next,line)) changed.add(line.id);
 }
 for(const old of before.entities) if(old.kind==='dialogue_line'&&!old.deletedAt&&!lines.some(line=>line.id===old.id))changed.add(old.id);
 for(const entity of next.entities) {
  if(entity.deletedAt)continue;
  if((entity.kind==='localization'||entity.kind==='recording')&&changed.has(entity.data.sourceLineId))entity.data.stage='needs_review';
  if(entity.kind==='media_variant'&&(entity.data.sourceIds??[]).some(id=>{
   const a=before.entities.find(e=>e.id===id),b=next.entities.find(e=>e.id===id);
   return !a||!b||stable(a.data)!==stable(b.data)||Boolean(a.deletedAt)!==Boolean(b.deletedAt);
  }))entity.data.needsReview=true;
 }
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
  const line=project.entities.find((e):e is Entity<'dialogue_line'>=>e.kind==='dialogue_line'&&e.id===entity.data.sourceLineId&&!e.deletedAt);
  return {id:entity.id,sourceLineId:entity.data.sourceLineId,stale:!line||entity.data.sourceHash!==await dialogueContentHash(project,line)};
 }));
}
