import type { Entity, GameHandoffEvidence, ID, ProjectContent, ProjectData, NamePolicyMap } from './types';
import type { ExportOptions } from './exports';
import { preparePublicExecution } from './exportPreparation';
import { sha256, jsonBytes } from '../storage/json';
import { portableRuntimeProject } from './portableRuntimeProject';

const fail=(message:string):never=>{throw Error(`INTEGRITY_FAILED: ${message}`);};
function ids(project:ProjectContent):Set<ID>{
 const result=new Set([...project.entities.map(e=>e.id),...project.relations.map(r=>r.id)]);
 const visit=(value:unknown)=>{if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;const object=value as Record<string,unknown>;if(typeof object.id==='string')result.add(object.id);Object.values(object).forEach(visit);};
 project.entities.forEach(entity=>visit(entity.data));return result;
}
/** Only author-side ID bindings and expected world hashes are retained; no borrowed canonical records or bytes are copied. */
export async function captureGameExecutionBindings(project:ProjectData,options:ExportOptions,sourceVersionId:ID,verificationVersionId:ID){
 const prepared=await preparePublicExecution(project,options),approval=project.snapshots.find(pin=>pin.id===verificationVersionId)!.content,approvalIds=ids(approval),bindings:GameHandoffEvidence['projectionBindings']=[];
 const root={editionVersionId:sourceVersionId,project:prepared.project,idMap:prepared.idMap},sources=[root,...prepared.citations.sources.map(source=>({editionVersionId:Object.keys(prepared.citations.targets).find(id=>prepared.citations.targets[id].publicVersionId===source.publicVersionId)!,project:source.project,idMap:source.idMap}))];
 for(const source of sources){const sourceIds=ids(source.project);for(const [entityId,publicId]of Object.entries(source.idMap)){
  if(!sourceIds.has(entityId))fail('受領の公開ID対応に未知の元IDがあります。');
  // An outside historical policy owns its independently authored public blocks in the approval pin.
  const original=source.project.entities.find(e=>e.kind==='projection_profile'&&Object.values(e.data.publicTexts??{}).some(fields=>Object.values(fields).some(value=>Array.isArray(value)&&value.some(block=>block.id===entityId))));
  const ownerVersion=original&&approvalIds.has(entityId)?verificationVersionId:source.editionVersionId;
  bindings.push({entityId,publicId,sourceVersionId:ownerVersion,editionVersionId:source.editionVersionId});
 }}
 const citationBindings=Object.entries(prepared.citations.targets).map(([id,target])=>({sourceVersionId:id,publicVersionId:target.publicVersionId}));
 const referenced=new Set([...Object.keys(prepared.citations.targets),...prepared.project.worldReferences.map(ref=>ref.immutableSnapshotId)]);
 const worldVersions:GameHandoffEvidence['worldVersions']=[];
 for(const [id,content]of Object.entries(options.worldSnapshots??{}))if(referenced.has(id)||sources.some(source=>source.project.worldReferences.some(ref=>ref.immutableSnapshotId===id)))worldVersions.push({sourceVersionId:id,contentHash:await sha256(jsonBytes(content))});
 return {projectionBindings:bindings,citationBindings,worldVersions};
}

/** Rebuild from the original immutable author approval, using stable public IDs after native clone ID rewrites. */
export async function rebuildGameExecution(input:ProjectData,evidence:GameHandoffEvidence,inputWorlds:Record<ID,ProjectContent>){
 evidence=structuredClone(evidence);
 const project=structuredClone(input),worlds=structuredClone(inputWorlds),pin=project.snapshots.find(pin=>pin.id===evidence.verificationVersionId);
 if(!pin||await sha256(jsonBytes(pin.content))!==pin.contentHash)fail('保存したゲーム受領の公開確認版を検証できません。');
 const approval=pin!.content.entities.find(entity=>entity.id===evidence.approval.entityId);
 if(evidence.approval.sourceVersionId!==pin!.id||approval?.kind!=='note'||approval.visibility!=='private'||approval.status!=='confirmed'||approval.customValues.gamePackageHash!==evidence.packageHash||approval.customValues.gameReceiptHash!==evidence.receiptHash)fail('保存したゲーム受領hashが固定承認と一致しません。');
 const source=project.snapshots.find(pin=>pin.id===evidence.sourceVersionId)?.content;
 if(!source||source.revision!==evidence.sourceRevision)fail('保存したゲーム受領の対象revisionが一致しません。');
 const captured:ProjectData={...structuredClone(pin!.content),snapshots:project.snapshots,history:[]};
 const byEdition=new Map<ID,Record<ID,ID>>();
 for(const mapping of evidence.projectionBindings){let values=byEdition.get(mapping.editionVersionId);if(!values){values={};byEdition.set(mapping.editionVersionId,values);}if(values[mapping.entityId]&&values[mapping.entityId]!==mapping.publicId)fail('保存した公開ID対応が重複しています。');values[mapping.entityId]=mapping.publicId;}
 const cited=new Map(evidence.citationBindings.map(item=>[item.sourceVersionId,item.publicVersionId]));if(cited.size!==evidence.citationBindings.length)fail('保存した引用版対応が重複しています。');
 const restorePolicy=(entity:Entity,editionVersionId:ID):Entity=>{
  if(entity.kind!=='projection_profile')return entity;
  const edition=entity.id===evidence.profileId?evidence.sourceVersionId:entity.data.sourceVersionId??editionVersionId,publicIds=byEdition.get(edition)??{},names=structuredClone(entity.data.namePolicy);
  for(const [id,policy]of Object.entries((names as NamePolicyMap).byEntityId??{}))if(policy.mode==='anonymize'&&publicIds[id])policy.publicId=publicIds[id];
  return {...entity,data:{...entity.data,publicIds:{...entity.data.publicIds,...publicIds},namePolicy:names,citedVersions:entity.data.citedVersions?.map(declaration=>({...declaration,publicVersionId:cited.get(declaration.sourceVersionId)??declaration.publicVersionId}))}};
 };
 captured.entities=captured.entities.map(e=>restorePolicy(e,evidence.sourceVersionId));
 captured.snapshots=await Promise.all(captured.snapshots.map(async snapshot=>{if(await sha256(jsonBytes(snapshot.content))!==snapshot.contentHash)fail('保存したゲーム受領の元版hashが一致しません。');const content={...snapshot.content,entities:snapshot.content.entities.map(e=>restorePolicy(e,snapshot.id))};return {...snapshot,content,contentHash:await sha256(jsonBytes(content))};}));
 const worldPins=[];
 for(const expected of evidence.worldVersions){const content=worlds[expected.sourceVersionId];if(!content||await sha256(jsonBytes(content))!==expected.contentHash)fail('保存したゲーム受領の固定世界hashが一致しません。');worldPins.push({id:expected.sourceVersionId,content,contentHash:expected.contentHash});}
 // The approval image is read through its own revision. Its private provenance selector
 // is normalized to the original work edition; it never reads the current draft policy.
 const current=evidence.sourceVersionId===evidence.verificationVersionId;
 const prepared=await preparePublicExecution(captured,{profile:'runtime_json',projectionProfileId:evidence.profileId,...current?{targetRevision:captured.revision}:{targetVersionId:evidence.sourceVersionId},worldSnapshots:worlds,worldPins});
 const expectedRecords=Object.entries(prepared.idMap).filter(([,publicId])=>prepared.projection.entities.some(entity=>entity.id===publicId));
 if(expectedRecords.length!==evidence.idMappings.length||expectedRecords.some(([entityId,publicId])=>!evidence.idMappings.some(mapping=>mapping.entityId===entityId&&mapping.publicId===publicId&&mapping.sourceVersionId===evidence.sourceVersionId)))fail('保存したゲーム受領の元ID・公開ID対応が一致しません。');
 for(const edition of [prepared.projection,...prepared.projection.versions?.map(version=>version.projection)??[]])for(const entity of edition.entities)if(entity.kind==='attachment')entity.data.bytesIncluded=true;
 const portable=await portableRuntimeProject(prepared.projection);
 return {publicProjection:prepared.projection,runtimeProject:portable.project,publicToRuntime:portable.publicToRuntime,runtimeProjectHash:await sha256(jsonBytes(portable.project)),entities:prepared.projection.entities};
}
