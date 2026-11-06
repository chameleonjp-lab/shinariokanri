import {adoptedRecord} from './adoption';
import {captureRuntimeContent} from './runtimeVersions';
import {resolveReuseContent} from './reuse';
import {resolveEventTimes} from './time';
import type {ContentAnchor,Entity,ProjectData} from './types';
import type {WorldPoint} from './world';

/** A scene must have one resolved instant; an unknown/ranged time never borrows today's state. */
function writingPoint(project:ProjectData,sourceId:string):WorldPoint{
 const source=project.entities.find(entity=>entity.id===sourceId&&!entity.deletedAt);
 const scenes=source?.kind==='scene'?[source]:source?.kind==='dialogue_line'?project.entities.filter((entity):entity is Entity<'scene'>=>entity.kind==='scene'&&!entity.deletedAt&&(entity.data.dialogueLineIds??[]).includes(source.id)):[];
 if(scenes.some(scene=>!scene.data.eventIds.length))return {at:null};
 const eventIds=source?.kind==='event'?[source.id]:scenes.flatMap(scene=>scene.data.eventIds);
 if(!eventIds.length)return {at:null};
 const events=project.entities.filter((entity):entity is Entity<'event'>=>entity.kind==='event'&&adoptedRecord(entity)),times=resolveEventTimes(events),points=new Set<string>();
 for(const id of eventIds){const time=times.get(id);if(!time||time.status!=='resolved'||time.earliest!==time.latest||time.earliest!==time.endLatest)return {at:null};points.add(time.earliest);}
 return {at:points.size===1?[...points][0]:null};
}
export async function resolveCharacterReference(project:ProjectData,anchor:ContentAnchor,sourceEntityId:string){
 const fixed=!!anchor.sourceVersionId&&anchor.sourceVersionId!==project.projectId;
 const snapshot=fixed?project.snapshots.find(snapshot=>snapshot.id===anchor.sourceVersionId):undefined;
 if(fixed&&!snapshot)throw Error('人物の固定版が見つかりません。参照する版を確認してください。');
 const content=fixed?resolveReuseContent(await captureRuntimeContent(project,anchor.sourceVersionId!,{worldSnapshots:Object.fromEntries(project.snapshots.map(snapshot=>[snapshot.id,snapshot.content]))}),project.snapshots):project;
 const person=content.entities.find((entity):entity is Entity<'character'>=>entity.id===anchor.entityId&&entity.kind==='character'&&adoptedRecord(entity));
 if(!person)throw Error('この版の人物情報が見つかりません。対象と参照する版を確認してください。');
 const borrowedVersion=project.worldReferences.find(reference=>reference.projectId===person.projectId)?.immutableSnapshotId;
 const versionLabel=snapshot?`固定版 ${snapshot.versionLabel}`:borrowedVersion?`共通世界の固定版 ${project.snapshots.find(snapshot=>snapshot.id===borrowedVersion)?.versionLabel??borrowedVersion}`:`作品改訂 ${project.revision}`;
 return {person,project:content,point:writingPoint(project,sourceEntityId),versionLabel};
}
