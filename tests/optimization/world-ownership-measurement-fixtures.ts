import {createEntity,createProject} from '../../src/domain/model';
import type {ProjectContent,ProjectData,ProjectSnapshot} from '../../src/domain/types';
import {jsonBytes,sha256} from '../../src/storage/json';

export const WORLD_OWNERSHIP_SEED='p205-world-ownership-v1';
const epoch='2026-10-17T00:00:00.000Z';
export const ownershipId=(value:number)=>`a2050000-0000-4000-8000-${value.toString(16).padStart(12,'0')}`;
/** Extra small immutable rows, separate from unchanged original Standard/Large. */
export async function worldOwnershipFixtures(){
 const worlds:ProjectData[]=[],works:ProjectData[]=[];
 for(let index=0;index<6;index++){
  const source=createProject(`P205 source ${index}`);source.projectId=ownershipId(1000+index);
  const place=createEntity(source.projectId,'place',`P205 place ${index}`);place.id=ownershipId(2000+index);place.createdAt=place.updatedAt=epoch;source.entities=[place];
  const {history:_history,snapshots:_snapshots,authorAlternatives:_alternatives,...content}=source;
  const old:ProjectSnapshot={id:ownershipId(3000+index),createdAt:epoch,versionLabel:`P205 edition ${index}`,content,contentHash:await sha256(jsonBytes(content))};
  let current:ProjectContent=content,snapshots=[old];
  if(index===0){
   const citation=createEntity(source.projectId,'note','P205 retained old citation');citation.id=ownershipId(2100);citation.createdAt=citation.updatedAt=epoch;
   citation.data.body=[{id:ownershipId(2200),kind:'paragraph',text:'old place',links:[{start:0,end:3,target:{entityId:place.id,sourceVersionId:old.id}}]}];
   current={...content,entities:[place,citation]};
   const newer:ProjectSnapshot={id:ownershipId(4000),createdAt:epoch,versionLabel:'P205 newer retains old',content:current,contentHash:await sha256(jsonBytes(current))};snapshots=[newer,old];
  }
  const world:ProjectData={...current,snapshots,history:[]};worlds.push(world);
  const work=createProject(`P205 work ${index}`);work.projectId=ownershipId(5000+index);work.worldReferences=[{projectId:source.projectId,immutableSnapshotId:snapshots[0].id,contentHash:snapshots[0].contentHash}];
  const note=createEntity(work.projectId,'note',`P205 author note ${index}`);note.id=ownershipId(6000+index);note.createdAt=note.updatedAt=epoch;work.entities=[note];works.push(work);
 }
 return{seed:WORLD_OWNERSHIP_SEED,worlds,works};
}
