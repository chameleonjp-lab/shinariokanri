import type { Entity, ID, ProjectData } from './types';
import type { ExportOptions } from './exports';
import { captureRuntimeContent } from './runtimeVersions';
import { resolveReuseContent, reuseOrigin } from './reuse';
import { resolvePinnedWorlds } from './pinnedWorlds';
import { sha256, jsonBytes } from '../storage/json';
import { collectReferences, validateProject } from './model';
import { createProjection } from './projection';
import type { ProjectedBlock, ProjectedEntity, ProjectionIssue, PublicProjection, PublicValue } from './projection';
const revisionPattern=/^(?:0|[1-9][0-9]*)$/;
const hash=(value:unknown)=>sha256(jsonBytes(value));
export type CitationSource={publicVersionId:string;profileId:string;project:ProjectData;projection:PublicProjection;idMap:Record<string,string>};
function blocks(value:PublicValue|undefined):ProjectedBlock[]{return Array.isArray(value)?value as unknown as ProjectedBlock[]:[];}
function entityDocuments(entity:ProjectedEntity):[string,ProjectedBlock[]][]{return ['body','text','summary','description','usageNotes','caption','action','tutorial','interpretation','targetAudience','experience','theme','tone','scope'].filter(field=>blocks(entity.data[field]).length).map(field=>[field,blocks(entity.data[field])]);}
export async function selectExportSource(project: ProjectData, options: ExportOptions): Promise<{ ok: true; project: ProjectData } | { ok: false; issues: ProjectionIssue[] }> {
  if ((options.targetRevision === undefined) === (options.targetVersionId === undefined)) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '出力する正本の版を一つ指定してください。' }] };
  if (options.targetRevision !== undefined) {
    if (!revisionPattern.test(options.targetRevision) || options.targetRevision !== project.revision) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '選択した版と出力元の版が一致しません。対象版を読み直してください。' }] };
    return { ok: true, project };
  }
  const snapshot = project.snapshots.find(snapshot => snapshot.id === options.targetVersionId);
  if (!snapshot || snapshot.content.projectId !== project.projectId) return { ok: false, issues: [{ code: 'REFERENCE_INVALID', message: '選択した公開版の保存内容が見つかりません。', entityId: options.targetVersionId }] };
  // Private checkpoints, reviews and anchors can reference another pinned version.
  // Keep only that immutable dependency closure for validation, never live content.
  const dependencies: ProjectData['snapshots'] = [];
  const pending = [snapshot], visited = new Set<ID>();
  while (pending.length) {
    const dependency = pending.pop()!;
    if (visited.has(dependency.id)) continue;
    visited.add(dependency.id);
    if (project.snapshots.filter(candidate => candidate.id === dependency.id).length !== 1 || dependency.content.projectId !== project.projectId) return { ok: false, issues: [{ code: 'REFERENCE_INVALID', message: '保存版の依存内容を一意に確認できません。', entityId: dependency.id }] };
    if (await hash(dependency.content) !== dependency.contentHash) return { ok: false, issues: [{ code: 'VALIDATION_FAILED', message: '保存版の内容hashが一致しないため出力を停止しました。', entityId: dependency.id }] };
    dependencies.push(dependency);
    for (const entity of dependency.content.entities) for (const reference of collectReferences(entity)) if (reference.scope === 'snapshot') {
      const target = project.snapshots.find(candidate => candidate.id === reference.id);
      if (target && !visited.has(target.id)) pending.push(target);
    }
  }
  return { ok: true, project: { ...structuredClone(snapshot.content), snapshots: dependencies, history: [] } };
}

/** Resolve fixed pins in an output view, without copying borrowed data into the author's canonical document. */
export async function executionExportView(captured:ProjectData,selected:ProjectData,options:ExportOptions):Promise<ProjectData>{
 const edition=await captureRuntimeContent(captured,options.targetVersionId??captured.projectId,{worldSnapshots:options.worldSnapshots??{}}),view=resolveReuseContent(edition,edition.snapshots);
 function normalize(value:unknown,entityId:ID,path:string[]=[]):unknown{
  const origin=reuseOrigin(view,entityId);if(Array.isArray(value))return value.map((item,index)=>normalize(item,entityId,[...path,String(index)]));if(!value||typeof value!=='object')return value;
  const object=value as Record<string,unknown>,editionId=options.targetVersionId??view.projectId;
  // An explicit rich-text citation retains the original edition and its original IDs.
  if(path.includes('links')&&path.at(-1)==='target'&&typeof object.sourceVersionId==='string')return structuredClone(object);
  const mapped=Object.fromEntries(Object.entries(object).filter(([key])=>key!=='reuse').map(([key,item])=>[key,origin&&['sourceVersionId','targetSnapshotId'].includes(key)&&item===origin.sourceVersionId?editionId:normalize(item,entityId,[...path,key])]));
  if(origin&&typeof object.entityId==='string'&&object.sourceVersionId===origin.sourceVersionId)for(const key of ['entityId','blockId','lineId'])if(typeof object[key]==='string')mapped[key]=origin.bindings[object[key] as string]??object[key];
  return mapped;
 }

 const worlds=resolvePinnedWorlds(view,options.worldSnapshots??{}).worlds,entities=view.entities.map(entity=>({...entity,data:normalize(entity.data,entity.id)} as Entity)),ids=new Set(entities.map(e=>e.id)),relations=[...view.relations],relationIds=new Set(relations.map(r=>r.id)),calendars=[...view.calendars];
 for(const world of worlds){for(const entity of world.entities){if(ids.has(entity.id))throw Error('REFERENCE_INVALID: 固定世界と出力元のIDが衝突しています。');ids.add(entity.id);entities.push({...structuredClone(entity),projectId:view.projectId});}for(const relation of world.relations){if(relationIds.has(relation.id))throw Error('REFERENCE_INVALID: 固定世界の関係IDが衝突しています。');relationIds.add(relation.id);relations.push({...structuredClone(relation),projectId:view.projectId});}for(const calendar of world.calendars)if(!calendars.some(c=>c.id===calendar.id))calendars.push(structuredClone(calendar));}
 const policy=entities.find(e=>e.id===options.projectionProfileId);if(!policy&&options.targetVersionId){const approved=captured.entities.find(e=>e.id===options.projectionProfileId&&e.kind==='projection_profile'&&e.data.sourceVersionId===options.targetVersionId);if(approved)entities.push(structuredClone(approved));}
 return {...selected,entities,relations,calendars};
}
export function validatePublicPositions(projection:PublicProjection):ProjectionIssue[]{
 const editions=new Map([['public-project',projection],...(projection.versions??[]).map(version=>[version.id,version.projection] as [string,PublicProjection])]),issues:ProjectionIssue[]=[];
 for(const [version,edition]of editions){
  const inspect=(value:unknown)=>{if(Array.isArray(value)){value.forEach(inspect);return;}if(!value||typeof value!=='object')return;const object=value as Record<string,unknown>,entityId=object.entityId??object.targetId,start=object.targetId?object.targetStart:object.start,end=object.targetId?object.targetEnd:object.end;
   if(typeof entityId==='string'&&(object.blockId!=null||object.lineId!=null||start!=null||end!=null)){
    const target=editions.get(typeof object.sourceVersionId==='string'?object.sourceVersionId:version),record=target?.entities.find(entity=>entity.id===entityId),line=typeof object.lineId==='string'?target?.entities.find(entity=>entity.id===object.lineId&&entity.kind==='dialogue_line'):undefined,block=typeof object.blockId==='string'?record&&entityDocuments(record).flatMap(([,document])=>document).find(block=>block.id===object.blockId):undefined,text=block?.text??(line?blocks(line.data.text).map(block=>block.text).join('\n'):undefined);
    const missing=!record||object.blockId!=null&&!block||object.lineId!=null&&!line,hasRange=start!=null||end!=null,invalidRange=hasRange&&(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||Number(start)<0||Number(end)<Number(start)||text===undefined||Number(end)>[...text].length);
    if(missing||invalidRange)issues.push({code:'REFERENCE_INVALID',message:'公開した固定版の本文位置を確認できません。公開文と文字範囲を再確認してください。',entityId});
   }
   Object.values(object).forEach(inspect);
  };edition.entities.forEach(entity=>inspect(entity.data));
 }
 return issues;
}
/** Each historical citation has its own approved policy and immutable bytes. */
export async function prepareExportCitations(captured:ProjectData,selected:ProjectData,options:ExportOptions,strictReferences:boolean){
 type Approved={publicVersionId:string;idMap:Record<string,string>};
 const targets:Record<string,Approved>={},versions:{id:string;projection:PublicProjection}[]=[],sources:CitationSource[]=[],active=new Set<string>(),owners=new Map<string,string>(),publicOwners=new Map<string,string>();
 async function visit(edition:ProjectData,profileId:string,depth:number){
  if(depth>64)throw Error('IMPORT_LIMIT: 引用固定版の依存が64段階を超えています。');
  const policy=edition.entities.find((entity):entity is Entity<'projection_profile'>=>entity.id===profileId&&entity.kind==='projection_profile'&&entity.status==='confirmed'&&!entity.deletedAt);if(!policy)throw Error('REFERENCE_INVALID: 引用固定版の公開範囲が未確認です。');
  for(const declaration of policy.data.citedVersions??[]){
   const id=declaration.sourceVersionId,prior=targets[id];if(active.has(id))throw Error('REFERENCE_INVALID: 引用固定版の公開依存が循環しています。');
   if(prior){if(prior.publicVersionId!==declaration.publicVersionId||owners.get(id)!==declaration.profileId)throw Error('REFERENCE_INVALID: 同じ引用版に異なる公開範囲が指定されています。');continue;}
   if(versions.length+active.size>=128||publicOwners.has(declaration.publicVersionId)||!declaration.publicVersionId)throw Error('IMPORT_LIMIT: 引用固定版の上限または公開版IDが不正です。');
   publicOwners.set(declaration.publicVersionId,id);
   active.add(id);const own=captured.snapshots.find(pin=>pin.id===id),world=(options.worldPins??[]).find(pin=>pin.id===id),pin=own??world,registry=options.worldSnapshots??{};
   if(!pin||await sha256(jsonBytes(pin.content))!==pin.contentHash||world&&(!registry[id]||await sha256(jsonBytes(registry[id]))!==pin.contentHash))throw Error('INTEGRITY_FAILED: 引用版の期待hashまたは内容が一致しません。');
   const library=pin.content.projectId===captured.projectId?captured.snapshots:[...(options.worldPins??[]).filter(item=>item.content.projectId===pin.content.projectId).map(item=>({...item,createdAt:'1970-01-01T00:00:00.000Z',versionLabel:'引用する固定世界'}))];
   const original={...structuredClone(pin.content),snapshots:structuredClone(library),history:[]},inside=original.entities.find(entity=>entity.id===declaration.profileId&&entity.kind==='projection_profile'),outside=captured.entities.find((entity):entity is Entity<'projection_profile'>=>entity.id===declaration.profileId&&entity.kind==='projection_profile'&&entity.data.sourceVersionId===id);
   if(!inside&&!outside)throw Error('REFERENCE_INVALID: 引用対象版の公開文を確認した範囲がありません。');
   const view=await executionExportView(original,original,{...options,projectionProfileId:declaration.profileId,targetVersionId:id,targetRevision:undefined});
   if(!inside&&outside)view.entities.push({...structuredClone(outside),projectId:view.projectId});
   await visit(view,declaration.profileId,depth+1);
   const result=createProjection(view,declaration.profileId,{strictReferences,confirmedOnly:true,targetVersionId:id,versionTargets:targets});if(!result.ok)throw Object.assign(Error('EXPORT_UNSUPPORTED: 引用版の公開名・本文・必要参照が未確認です。'),{issues:result.issues});
   targets[id]={publicVersionId:declaration.publicVersionId,idMap:result.idMap};owners.set(id,declaration.profileId);versions.push({id:declaration.publicVersionId,projection:result.projection});sources.push({publicVersionId:declaration.publicVersionId,profileId:declaration.profileId,project:view,projection:result.projection,idMap:result.idMap});active.delete(id);
  }
 }
 await visit(selected,options.projectionProfileId,0);return {targets,versions,sources};
}

/** Shared preparation contains no browser bundle or asset bytes. Stored evidence reuses the exact publication rules. */
export async function preparePublicExecution(input:ProjectData,inputOptions:ExportOptions){
 const captured=structuredClone(input),options=structuredClone(inputOptions),selected=await selectExportSource(captured,options);
 if(!selected.ok)throw Object.assign(Error('REFERENCE_INVALID: 出力対象版を確認できません。'),{issues:selected.issues});
 const checked=validateProject(selected.project,{worldSnapshots:options.worldSnapshots??{}});if(!checked.ok)throw Object.assign(Error('REFERENCE_INVALID: 出力対象版の参照が不正です。'),{issues:checked.issues});
 const project=await executionExportView(captured,selected.project,options),citations=await prepareExportCitations(captured,project,options,true),result=createProjection(project,options.projectionProfileId,{strictReferences:true,confirmedOnly:true,targetVersionId:options.targetVersionId,versionTargets:citations.targets});
 if(!result.ok)throw Object.assign(Error('EXPORT_UNSUPPORTED: 固定した公開範囲を再構成できません。'),{issues:result.issues});
 if(citations.versions.length)result.projection.versions=citations.versions;
 const positions=validatePublicPositions(result.projection);if(positions.length)throw Object.assign(Error('REFERENCE_INVALID: 固定した公開本文位置が不正です。'),{issues:positions});
 return {project,projection:result.projection,idMap:result.idMap,citations};
}
