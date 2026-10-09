import type {ContentAnchor,Entity,ProjectContent,ProjectData,SharedReviewSource} from './types';
import {createEntity,ID_PATTERN,textToRichText} from './model';
import type {PublicProjection,ProjectedBlock} from './projection';
import {captureRuntimeContent} from './runtimeVersions';
import {resolveReuseContent,reuseTargetAnchor} from './reuse';
import type {preparePublicExecution} from './exportPreparation';
import {jsonBytes,parseStrictJson,sha256} from '../storage/json';
export type SharedReviewStage='open'|'fixed'|'verified';
export interface SharedComment{id:string;snapshot_id:string;public_entity_id?:string|null;public_block_id?:string|null;start_cp?:number|null;end_cp?:number|null;public_relation_id?:string|null;public_version_id:string;body:string;created_at:string;resolved:boolean;review_stage?:SharedReviewStage}
export interface ReviewSourceEntry{target:ContentAnchor;blocks:Record<string,ContentAnchor>}
export type ReviewSourceMap=Record<string,{entities:Record<string,ReviewSourceEntry>;relations:Record<string,{id:string;sourceVersionId:string}>}>;
export interface ReviewSourceEnvelope{snapshotId:string;projectionHash:string;sourceVersionId:string;sourceHash:string;sourceMap:ReviewSourceMap;projection:PublicProjection}
export const commentStage=(comment:SharedComment):SharedReviewStage=>comment.review_stage??(comment.resolved?'fixed':'open');
function documents(entity:Entity):{id:string;text:string}[]{const result:{id:string;text:string}[]=[];function walk(value:unknown){if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object'){const o=value as Record<string,unknown>;if(typeof o.id==='string'&&typeof o.text==='string'&&typeof o.kind==='string')result.push({id:o.id,text:o.text});else Object.values(o).forEach(walk);}}walk(entity.data);return result;}
function publicBlocks(entity:{data:Record<string,unknown>}):ProjectedBlock[]{return Object.values(entity.data).filter(Array.isArray).flat().filter((b):b is ProjectedBlock=>!!b&&typeof b==='object'&&typeof b.id==='string'&&typeof b.text==='string');}

/** Private correspondence is generated from the same frozen publication view,
 * stored atomically with publication, and never returned to a public reader. */
export async function publicationReviewSources(captured:ProjectData,prepared:Awaited<ReturnType<typeof preparePublicExecution>>,sourceVersionId:string,worlds:Record<string,ProjectContent>):Promise<ReviewSourceMap>{
 captured=structuredClone(captured);prepared=structuredClone(prepared);worlds=structuredClone(worlds);
 const output:ReviewSourceMap={};
 const sources=[{publicVersionId:'public-project',project:prepared.project,projection:prepared.projection,idMap:prepared.idMap,version:sourceVersionId},...prepared.citations.sources.map(s=>({...s,version:Object.entries(prepared.citations.targets).find(([,target])=>target.publicVersionId===s.publicVersionId)?.[0]??''}))];
 for(const source of sources){
  if(!source.version)throw Error('REVIEW_SOURCE_UNKNOWN');const edition=await captureRuntimeContent(captured,source.version,{worldSnapshots:worlds}),view=resolveReuseContent(edition,edition.snapshots),reverse=new Map(Object.entries(source.idMap).map(([privateId,publicId])=>[publicId,privateId])),entities:Record<string,ReviewSourceEntry>={},relations:Record<string,{id:string;sourceVersionId:string}>={};
  const inWorld=(id:string)=>view.worldReferences.flatMap(ref=>worlds[ref.immutableSnapshotId]?.entities.some(e=>e.id===id)||worlds[ref.immutableSnapshotId]?.relations.some(r=>r.id===id)?[{sourceVersionId:ref.immutableSnapshotId}]:[]);
  for(const entity of source.projection.entities){const id=reverse.get(entity.id);if(!id)continue;const local=view.entities.some(e=>e.id===id),world=inWorld(id);if(!local&&world.length!==1)continue;
   const resolve=(anchor:ContentAnchor)=>{const original=local?reuseTargetAnchor(view,anchor):{...anchor,sourceVersionId:world[0]!.sourceVersionId};return {...original,sourceVersionId:original.sourceVersionId??source.version};};
   const blocks:Record<string,ContentAnchor>={};for(const block of publicBlocks(entity)){const original=reverse.get(block.id);if(original)blocks[block.id]=resolve({entityId:id,blockId:original});}
   entities[entity.id]={target:resolve({entityId:id}),blocks};
  }
  for(const relation of source.projection.relations){const id=reverse.get(relation.id);if(!id)continue;const local=view.relations.some(r=>r.id===id),world=inWorld(id);if(local||world.length===1)relations[relation.id]={id,sourceVersionId:local?source.version:world[0]!.sourceVersionId};}
  output[source.publicVersionId]={entities,relations};
 }
 return output;
}
/** Original public text can differ from private text. Such positions stay
 * unresolved instead of silently copying public offsets into private content. */
export async function createSharedCommentReview(project:ProjectData,raw:ReviewSourceEnvelope,comment:SharedComment,connection:string,worlds:Record<string,ProjectContent>={}):Promise<Entity<'review'>>{
 project=structuredClone(project);comment=structuredClone(comment);worlds=structuredClone(worlds);
 const input=parseStrictJson(jsonBytes(raw),'shared-review-source.json') as ReviewSourceEnvelope,version=project.snapshots.find(s=>s.id===input.sourceVersionId);
 if(input.snapshotId!==comment.snapshot_id||!version||version.contentHash!==input.sourceHash||await sha256(jsonBytes(version.content))!==input.sourceHash||await sha256(jsonBytes(input.projection))!==input.projectionHash||!ID_PATTERN.test(comment.id)||typeof comment.body!=='string'||!comment.body.trim()||Array.from(comment.body).length>2000||!['open','fixed','verified'].includes(commentStage(comment))||typeof comment.resolved!=='boolean'||comment.review_stage!==undefined&&(comment.review_stage!=='open')!==comment.resolved)throw Error('REVIEW_SOURCE_UNKNOWN');
 const source=input.sourceMap[comment.public_version_id],projection=comment.public_version_id==='public-project'?input.projection:input.projection.versions?.find(v=>v.id===comment.public_version_id)?.projection;if(!source||!projection)throw Error('REVIEW_SOURCE_UNKNOWN');
 const url=new URL(connection);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('REVIEW_CONNECTION_UNKNOWN');
 let target:ContentAnchor|string,quote='',targetVersionId:string;
 if(comment.public_relation_id){const relation=source.relations[comment.public_relation_id],publicRelation=projection.relations.find(r=>r.id===comment.public_relation_id);if(!relation||!publicRelation)throw Error('REVIEW_SOURCE_UNKNOWN');target=relation.id;targetVersionId=relation.sourceVersionId;quote=JSON.stringify(publicRelation);}
 else{const entry=comment.public_entity_id?source.entities[comment.public_entity_id]:undefined,entity=projection.entities.find(e=>e.id===comment.public_entity_id);if(!entry||!entity)throw Error('REVIEW_SOURCE_UNKNOWN');target=structuredClone(entry.target);targetVersionId=target.sourceVersionId!;
  if(comment.public_block_id){const block=publicBlocks(entity).find(b=>b.id===comment.public_block_id),mapped=entry.blocks[comment.public_block_id];if(!block||!Number.isSafeInteger(comment.start_cp)||!Number.isSafeInteger(comment.end_cp)||comment.start_cp!<0||comment.end_cp!<=comment.start_cp!||comment.end_cp!>Array.from(block.text).length)throw Error('REVIEW_PUBLIC_POSITION_UNKNOWN');quote=Array.from(block.text).slice(comment.start_cp!,comment.end_cp!).join('');
   const fixed=project.snapshots.find(s=>s.id===mapped?.sourceVersionId)?.content??worlds[mapped?.sourceVersionId??''],privateEntity=fixed?.entities.find(e=>e.id===mapped?.entityId),privateBlock=privateEntity&&documents(privateEntity).find(b=>b.id===mapped?.blockId);
   if(mapped&&privateBlock&&Array.from(privateBlock.text).slice(comment.start_cp!,comment.end_cp!).join('')===quote)target={...mapped,start:comment.start_cp!,end:comment.end_cp!};
   else target={...target,positionStatus:'unresolved',positionReason:'公開文と私的本文の位置対応を確認できません。元の公開版の引用を保持しています。',quotedText:quote};
  }
 }
 const sharedSource:SharedReviewSource={connection:url.origin,sharedSnapshot:input.snapshotId,comment:comment.id,publicVersion:comment.public_version_id,...comment.public_entity_id?{publicEntity:comment.public_entity_id}:{},...comment.public_relation_id?{publicRelation:comment.public_relation_id}:{},...comment.public_block_id?{publicBlock:comment.public_block_id,startCp:comment.start_cp!,endCp:comment.end_cp!}:{},projectionHash:input.projectionHash,commentBodyHash:await sha256(jsonBytes(comment.body)),quotedText:quote,observedStage:commentStage(comment)};
 return createEntity(project.projectId,'review','共有指摘',{target,targetVersionId,body:textToRichText(comment.body),stage:'open',quotedText:quote,sharedSource});
}
export function reviewLatestPosition(project:ProjectData,review:Entity<'review'>):'known'|'unknown'{
 const target=review.data.target;if(typeof target==='string')return project.relations.some(r=>r.id===target&&!r.deletedAt)?'known':'unknown';
 if(target.positionStatus==='unresolved')return 'unknown';const entity=project.entities.find(e=>e.id===target.entityId&&!e.deletedAt);if(!entity)return 'unknown';if(!target.blockId)return 'known';const block=documents(entity).find(b=>b.id===target.blockId);if(!block)return 'unknown';return target.start==null||target.end==null||Array.from(block.text).slice(target.start,target.end).join('')===review.data.quotedText?'known':'unknown';
}
