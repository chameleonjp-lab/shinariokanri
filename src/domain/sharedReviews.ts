import type {ContentAnchor,Entity,ProjectContent,ProjectData,SharedReviewSource} from './types';
import {createEntity,ID_PATTERN,textToRichText} from './model';
import type {PublicProjection,ProjectedBlock} from './projection';
import {captureRuntimeContent} from './runtimeVersions';
import {resolveReuseContent,reuseTargetAnchor} from './reuse';
import type {preparePublicExecution} from './exportPreparation';
import {equalJson,jsonBytes,parseStrictJson,sha256} from '../storage/json';
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
 let target:ContentAnchor|string,quote='',targetVersionId:string,contextBefore='',contextAfter='';
 if(comment.public_relation_id){const relation=source.relations[comment.public_relation_id],publicRelation=projection.relations.find(r=>r.id===comment.public_relation_id);if(!relation||!publicRelation)throw Error('REVIEW_SOURCE_UNKNOWN');target=relation.id;targetVersionId=relation.sourceVersionId;quote=JSON.stringify(publicRelation);}
 else{const entry=comment.public_entity_id?source.entities[comment.public_entity_id]:undefined,entity=projection.entities.find(e=>e.id===comment.public_entity_id);if(!entry||!entity)throw Error('REVIEW_SOURCE_UNKNOWN');target=structuredClone(entry.target);targetVersionId=target.sourceVersionId!;
  if(comment.public_block_id){const block=publicBlocks(entity).find(b=>b.id===comment.public_block_id),mapped=entry.blocks[comment.public_block_id];if(!block||!Number.isSafeInteger(comment.start_cp)||!Number.isSafeInteger(comment.end_cp)||comment.start_cp!<0||comment.end_cp!<=comment.start_cp!||comment.end_cp!>Array.from(block.text).length)throw Error('REVIEW_PUBLIC_POSITION_UNKNOWN');quote=Array.from(block.text).slice(comment.start_cp!,comment.end_cp!).join('');const ordered=publicBlocks(entity),blockIndex=ordered.findIndex(candidate=>candidate.id===block.id),beforeText=[...ordered.slice(0,blockIndex).map(candidate=>candidate.text),Array.from(block.text).slice(0,comment.start_cp!).join('')].join('\n'),afterText=[Array.from(block.text).slice(comment.end_cp!).join(''),...ordered.slice(blockIndex+1).map(candidate=>candidate.text)].join('\n');contextBefore=Array.from(beforeText).slice(-80).join('');contextAfter=Array.from(afterText).slice(0,80).join('');
   const fixed=project.snapshots.find(s=>s.id===mapped?.sourceVersionId)?.content??worlds[mapped?.sourceVersionId??''],privateEntity=fixed?.entities.find(e=>e.id===mapped?.entityId),privateBlock=privateEntity&&documents(privateEntity).find(b=>b.id===mapped?.blockId);
   if(mapped&&privateBlock&&Array.from(privateBlock.text).slice(comment.start_cp!,comment.end_cp!).join('')===quote)target={...mapped,start:comment.start_cp!,end:comment.end_cp!};
   else target={...target,positionStatus:'unresolved',positionReason:'公開文と私的本文の位置対応を確認できません。元の公開版の引用を保持しています。',quotedText:quote};
  }
 }
 const sharedSource:SharedReviewSource={connection:url.origin,sharedSnapshot:input.snapshotId,comment:comment.id,publicVersion:comment.public_version_id,...comment.public_entity_id?{publicEntity:comment.public_entity_id}:{},...comment.public_relation_id?{publicRelation:comment.public_relation_id}:{},...comment.public_block_id?{publicBlock:comment.public_block_id,startCp:comment.start_cp!,endCp:comment.end_cp!}:{},projectionHash:input.projectionHash,commentBodyHash:await sha256(jsonBytes(comment.body)),quotedText:quote,observedStage:commentStage(comment)};
 return createEntity(project.projectId,'review','共有指摘',{target,targetVersionId,body:textToRichText(comment.body),stage:'open',quotedText:quote,sharedSource,receivedContext:{sourceVersionId:targetVersionId,before:contextBefore,after:contextAfter}});
}
export function reviewLatestPosition(project:ProjectData,review:Entity<'review'>):'known'|'unknown'{
 const target=review.data.target;if(typeof target==='string')return project.relations.some(r=>r.id===target&&!r.deletedAt)?'known':'unknown';
 if(target.positionStatus==='unresolved')return 'unknown';const entity=project.entities.find(e=>e.id===target.entityId&&!e.deletedAt);if(!entity)return 'unknown';if(!target.blockId)return 'known';const block=documents(entity).find(b=>b.id===target.blockId);if(!block)return 'unknown';return target.start==null||target.end==null||Array.from(block.text).slice(target.start,target.end).join('')===review.data.quotedText?'known':'unknown';
}

/** Save bookkeeping is not authored content; all other fields participate in whole-target comparison. */
function sameReceivedRecord(current:object,received:object):boolean{
 const content=(record:object)=>Object.fromEntries(Object.entries(record).filter(([key])=>!['id','projectId','revision','createdAt','updatedAt','deletedAt','deletionOperationId'].includes(key)));
 return equalJson(content(current),content(received));
}
/** The confirmation is an observation, not a live anchor. Later text edits require an explicit recheck. */
export function reviewCurrentConfirmation(project:ProjectData,review:Entity<'review'>):'current'|'stale'|'unknown'{
 const saved=review.data.currentMatch;if(!saved||saved.confirmedText===undefined)return 'unknown';
 const target=saved.target,entity=project.entities.find(e=>e.id===target.entityId&&!e.deletedAt),block=entity&&documents(entity).find(b=>b.id===target.blockId),quote=review.data.quotedText??review.data.sharedSource?.quotedText??'';
 return target.positionStatus==='unresolved'||!block||block.text!==saved.confirmedText||target.start==null||target.end==null||Array.from(block.text).slice(target.start,target.end).join('')!==quote?'stale':'current';
}

export interface ReviewCurrentCandidate {target:ContentAnchor;label:string}
/** Search results are suggestions only. An identical quote elsewhere never changes the received anchor. */
export function reviewCurrentMatch(project:ProjectData,review:Entity<'review'>):{status:'match'|'changed'|'ambiguous'|'deleted'|'unknown';candidates:ReviewCurrentCandidate[]}{
 const target=review.data.target,quote=review.data.quotedText??review.data.sharedSource?.quotedText??'',candidates:ReviewCurrentCandidate[]=[];
 const receivedEdition=project.snapshots.find(snapshot=>snapshot.id===(typeof target==='string'?review.data.targetVersionId:target.sourceVersionId??review.data.targetVersionId))?.content;
 if(typeof target==='string'){const current=project.relations.find(r=>r.id===target&&!r.deletedAt),received=receivedEdition?.relations.find(r=>r.id===target);return {status:!current?'deleted':!received?'unknown':sameReceivedRecord(current,received)?'match':'changed',candidates};}
 const original=project.entities.find(e=>e.id===target.entityId&&!e.deletedAt),block=original&&documents(original).find(b=>b.id===target.blockId);
 if(quote)for(const entity of project.entities.filter(e=>['scene','dialogue_line','chapter','note'].includes(e.kind)&&!e.deletedAt&&!['alternate','rejected'].includes(e.status)))for(const doc of documents(entity)){
  const letters=Array.from(doc.text),needle=Array.from(quote);for(let start=0;start<=letters.length-needle.length;start++)if(needle.every((letter,index)=>letters[start+index]===letter))candidates.push({target:{entityId:entity.id,blockId:doc.id,start,end:start+needle.length,sourceVersionId:project.projectId},label:`${entity.name} · ${start}–${start+needle.length}`});
 }
 const receivedEntity=receivedEdition?.entities.find(entity=>entity.id===target.entityId),receivedBlock=receivedEntity&&documents(receivedEntity).find(doc=>doc.id===target.blockId);
 // Equality at an offset alone cannot distinguish a repeated phrase that slid into a deleted occurrence's place.
 const unchangedBlock=target.blockId?!!block&&!!receivedBlock&&block.text===receivedBlock.text:!!original&&!!receivedEntity&&sameReceivedRecord(original,receivedEntity);
 const exact=unchangedBlock&&original&&target.positionStatus!=='unresolved'&&(!target.blockId||block&&(target.start==null||target.end==null||Array.from(block.text).slice(target.start,target.end).join('')===quote));
 return {status:!original||target.blockId&&!block?'deleted':!receivedEntity||target.blockId&&!receivedBlock?'unknown':exact?'match':candidates.length>1?'ambiguous':'changed',candidates};
}
export function resolveReviewCurrentMatch(project:ProjectData,review:Entity<'review'>,target:ContentAnchor,reason:string,expectedRevision=project.revision):Entity<'review'>{
 if(project.revision!==expectedRevision)throw Error('REVISION_CONFLICT: 現稿が変わりました。照合先と理由を確認し直してください。');
 if(!reason.trim()||Array.from(reason).length>2000||!reviewCurrentMatch(project,review).candidates.some(c=>JSON.stringify(c.target)===JSON.stringify(target)))throw Error('REVIEW_MATCH_CONFIRMATION_REQUIRED');
 return {...review,data:{...review.data,currentMatch:{target:structuredClone(target),revision:project.revision,reason:reason.trim(),confirmedText:documents(project.entities.find(e=>e.id===target.entityId)!).find(b=>b.id===target.blockId)!.text}}};
}

export interface ReaderHesitation {id:string;publicEdition:string;publicScene:string;shownChoices:{id:string;label:string}[];note:string}
/** Call only from an explicit opt-in control, passing the choices actually rendered now. */
export function createReaderHesitation(projection:PublicProjection,publicEdition:string,publicScene:string,shownChoices:{id:string;label:string}[],note=''):ReaderHesitation{
 if(!publicEdition||!projection.entities.some(e=>e.id===publicScene&&['scene','flow_node','chapter'].includes(e.kind))||Array.from(note).length>2000||shownChoices.length>10000||shownChoices.some(c=>!projection.entities.some(e=>e.id===c.id&&e.kind==='flow_edge')||typeof c.label!=='string'))throw Error('READER_OBSERVATION_UNKNOWN');
 return {id:crypto.randomUUID(),publicEdition,publicScene,shownChoices:shownChoices.map(c=>({id:c.id,label:c.label})),note};
}
/** Reconstruct an allowlisted payload; local row IDs, unselected rows and operation history never leave. */
export function readerReturnFile(rows:ReaderHesitation[],selectedIds:readonly string[]):string|null{
 const selected=new Set(selectedIds),approved=rows.filter(row=>selected.has(row.id));if(!approved.length)return null;
 if(approved.length>10000)throw Error('READER_RETURN_LIMIT');
 return JSON.stringify({format:'scenario-reader-return',formatVersion:'1.0.0',rows:approved.map(row=>({publicEdition:row.publicEdition,publicScene:row.publicScene,shownChoices:row.shownChoices.map(c=>({id:c.id,label:c.label})),note:row.note}))},null,2);
}
