import type { ContentAnchor, Entity, ID, ProjectData, RuntimeContext, TruthValue } from './types';
import { adoptedRecord, adoptionAssessment } from './adoption';
import { assessWorldValidity, type WorldPoint } from './world';
import { sha256,jsonBytes } from '../storage/json';
import { resolveReuseContent,reuseTargetAnchor,verifyReusePins,reuseAuthorContent } from './reuse';
import { resolvePinnedWorlds,verifyPinnedWorlds } from './pinnedWorlds';
import type { ProjectContent,ProjectSnapshot } from './types';
import { evaluateScenarioException } from './stateRules';
export interface ProductionCheck { id: string; kind: 'spelling'|'reading'|'voice'|'rule_context'; lineId: ID; ruleId: ID; anchor?: ContentAnchor; value: TruthValue; message: string; reasons: string[]; exceptionReason?: string; sourceAnchor?:ContentAnchor;ruleAnchor?:ContentAnchor }
function occurrences(text: string, token: string) { const found:{start:number;end:number}[]=[];if(!token)return found;for(let at=0;at<=text.length-token.length;){const index=text.indexOf(token,at);if(index<0)break;const start=Array.from(text.slice(0,index)).length;found.push({start,end:start+Array.from(token).length});at=index+token.length;}return found; }
/** Literal candidates and authored rule applicability; free-form prose is never automatically approved. */
export function checkProductionRules(project: ProjectData, point: WorldPoint & {verifiedVersionIds?:ReadonlySet<ID>;worldContext?:{contentVersionId:ID;versionIds:ReadonlySet<ID>};mapAnchor?:(anchor:ContentAnchor)=>ContentAnchor} = {}): ProductionCheck[] {
 const output:ProductionCheck[]=[],editions=new Map<ID,ProjectContent|undefined>();
 const sourceEdition=(id:ID)=>{if(id===project.projectId)return project;if(editions.has(id))return editions.get(id);const raw=project.snapshots.find(snapshot=>snapshot.id===id)?.content;let resolved:ProjectContent|undefined;try{resolved=raw?resolveReuseContent(raw,project.snapshots):undefined;}catch{resolved=undefined;}editions.set(id,resolved);return resolved;};
 const rules=project.entities.filter((entity):entity is Entity<'terminology'|'voice_rule'>=>['terminology','voice_rule'].includes(entity.kind)&&adoptedRecord(entity));
 const subjects=project.entities.filter(adoptedRecord).flatMap(entity=>{
  if(entity.kind==='dialogue_line')return [{id:entity.id,lineId:entity.id,speakerId:entity.data.speakerId,text:entity.data.text,isLine:true,sourceProject:project,sourceVersionId:project.projectId,sourceMissing:false,sourceUnverified:false,sourceAnchor:undefined as ContentAnchor|undefined}];
  if(entity.kind==='localization'||entity.kind==='storyboard_frame'){
   const sourceId=entity.kind==='localization'?entity.data.sourceLineId:entity.data.anchor.lineId??entity.data.anchor.entityId;
   const pin=entity.kind==='storyboard_frame'?entity.data.anchor.sourceVersionId:undefined,edition=pin&&pin!==project.projectId?sourceEdition(pin):project;
   const source=edition?.entities.find(record=>record.id===sourceId&&record.kind==='dialogue_line'&&adoptedRecord(record));
   return [{id:entity.id,lineId:source?.id,speakerId:source?.kind==='dialogue_line'?source.data.speakerId:undefined,text:entity.kind==='localization'?entity.data.text:entity.data.caption??[],isLine:false,sourceProject:edition,sourceVersionId:pin??project.projectId,sourceMissing:!!pin&&!edition?.entities.some(record=>record.id===sourceId&&adoptedRecord(record)),sourceUnverified:!!pin&&pin!==project.projectId&&!point.verifiedVersionIds?.has(pin),sourceAnchor:entity.kind==='storyboard_frame'&&pin?entity.data.anchor:undefined}];
  }
  return [];
 });
 for(const line of subjects)for(const rule of line.sourceProject&&line.sourceProject.projectId!==project.projectId?[...rules.filter(rule=>rule.projectId===project.projectId),...line.sourceProject.entities.filter((entity):entity is Entity<'terminology'|'voice_rule'>=>['terminology','voice_rule'].includes(entity.kind)&&adoptedRecord(entity))]:rules){
  if(line.sourceMissing&&(rule.kind==='voice_rule'||rule.kind==='terminology'&&rule.data.voiceOwnerId)){output.push({id:`${line.id}:${rule.id}:missing-source`,kind:'rule_context',lineId:line.id,ruleId:rule.id,value:'unknown',message:'固定版の元台詞と話者を確認できません。現稿で代用しません。',reasons:['固定版を復元してから再検査してください。'],sourceAnchor:line.sourceAnchor});continue;}
  const matchingWorld=!!point.context&&point.context.state.contentVersionId===point.worldContext?.contentVersionId&&!!point.worldContext.versionIds.has(line.sourceVersionId)&&!!point.verifiedVersionIds?.has(line.sourceVersionId);
  const matchingContext=!point.context||line.sourceVersionId===project.projectId||point.context.state.contentVersionId===line.sourceVersionId||matchingWorld;const subjectPoint:WorldPoint=matchingContext?{...point,...point.context?{context:{...point.context,entities:project.entities}}:{}}:{at:point.at};
  if(rule.kind==='voice_rule'&&rule.data.characterId!==line.speakerId || rule.kind==='terminology'&&rule.data.voiceOwnerId&&rule.data.voiceOwnerId!==line.speakerId)continue;
  let validity=adoptionAssessment(rule,assessWorldValidity(rule.data.validity,subjectPoint));
  const anchor=rule.data.validity?.presentationAnchor;
  if(anchor){
   const versions=[line.sourceVersionId,project.projectId,subjectPoint.context?.state.contentVersionId,subjectPoint.context?.ruleContext?.sourceVersionId];
   if(anchor.positionStatus==='unresolved'||anchor.sourceVersionId&&!versions.includes(anchor.sourceVersionId))validity={value:'unknown',reasons:[...validity.reasons,'規則の提示位置または対象版が未確認です。']};
   else if(subjectPoint.presentationIds&&![anchor.entityId,anchor.blockId,anchor.lineId].filter(Boolean).every(id=>subjectPoint.presentationIds!.includes(id!)))validity={value:'false',reasons:['規則の提示位置に到達していません。']};
  }
  if(validity.value==='false')continue;
  if(line.sourceUnverified)validity={value:'unknown',reasons:[...validity.reasons,'元台詞の固定版hashが未検証です。']};
  const base=matchingContext?point.context:undefined;
  const chapters=[...new Set((line.sourceProject?.entities??[]).filter((entity):entity is Entity<'scene'>=>entity.kind==='scene'&&adoptedRecord(entity)&&!!entity.data.dialogueLineIds?.includes(line.lineId??'')).flatMap(scene=>scene.data.chapterId?[scene.data.chapterId]:[]))];
  const chapterId=base?.ruleContext?.chapterId??(chapters.length===1?chapters[0]:undefined);
  const context:RuntimeContext|undefined=base?{...base,entities:project.entities,ruleContext:{...base.ruleContext,projectId:project.projectId,chapterId,worldTick:point.at??base.ruleContext?.worldTick}}:undefined;
  const exceptions=(rule.data.exceptions??[]).map(exception=>({exception,result:context?evaluateScenarioException(exception,context):{value:'unknown' as const,reasons:['例外の対象経路と開始状態が未選択です。']}})),accepted=exceptions.find(item=>item.result.value==='true');
  const reasons=[...validity.reasons,...exceptions.filter(item=>item.result.value==='unknown').flatMap(item=>item.result.reasons)];
  const value=validity.value==='unknown'||exceptions.some(item=>item.result.value==='unknown')?'unknown' as const:'true' as const;
  if(validity.value==='unknown'||exceptions.some(item=>item.result.value==='unknown'))output.push({id:`${line.id}:${rule.id}:context`,kind:'rule_context',lineId:line.id,ruleId:rule.id,value:'unknown',sourceAnchor:line.sourceAnchor,message:'期間・経路・提示位置または例外が未確認です。',reasons});
  for(const block of line.text){
   if(rule.kind==='terminology'){
    const tokens=[rule.data.canonical,...rule.data.variants??[]];
    for(const token of [...new Set(tokens)])for(const range of occurrences(block.text,token)){
     const anchor={entityId:line.id,...(line.isLine?{lineId:line.id}:{}),blockId:block.id,...range};
     if(token!==rule.data.canonical)output.push({id:`${line.id}:${rule.id}:${block.id}:${range.start}:spelling`,kind:'spelling',lineId:line.id,ruleId:rule.id,sourceAnchor:line.sourceAnchor,anchor,value,message:`表記候補「${token}」・標準「${rule.data.canonical}」。許容する表記か作者が確認します。`,reasons,...accepted?{exceptionReason:accepted.exception.reason}:{}});
     const ruby=block.ruby?.find(item=>item.start===range.start&&item.end===range.end);
     if(rule.data.reading&&(!ruby||ruby.text!==rule.data.reading))output.push({id:`${line.id}:${rule.id}:${block.id}:${range.start}:reading`,kind:'reading',lineId:line.id,ruleId:rule.id,sourceAnchor:line.sourceAnchor,anchor,value,message:`読みを確認：「${token}」・用語の読み「${rule.data.reading}」・本文ルビ「${ruby?.text??'未指定'}」。`,reasons,...accepted?{exceptionReason:accepted.exception.reason}:{}});
    }
   }else if(block.text.trim())output.push({id:`${line.id}:${rule.id}:${block.id}:voice`,kind:'voice',lineId:line.id,ruleId:rule.id,sourceAnchor:line.sourceAnchor,anchor:{entityId:line.id,...(line.isLine?{lineId:line.id}:{}),blockId:block.id},value,message:`口調の作者確認：一人称「${rule.data.firstPerson??'未指定'}」・呼称「${rule.data.addressing??'未指定'}」・言い回し「${rule.data.phrasing??'未指定'}」。`,reasons,...accepted?{exceptionReason:accepted.exception.reason}:{}});
  }
 }
 const subjectsById=new Map(subjects.map(subject=>[subject.id,subject]));
 return output.map(check=>{const subject=subjectsById.get(check.lineId),ruleAnchor:ContentAnchor={entityId:check.ruleId,...subject?.sourceProject&&subject.sourceProject.projectId!==project.projectId&&subject.sourceVersionId!==project.projectId&&!rules.some(rule=>rule.id===check.ruleId&&rule.projectId===project.projectId)?{sourceVersionId:subject.sourceVersionId}:{}};return {...check,anchor:check.anchor?point.mapAnchor?.(check.anchor)??check.anchor:undefined,ruleAnchor:point.mapAnchor?.(ruleAnchor)??ruleAnchor};});
}

/** Fixed source subjects use only digest-verified immutable editions in the normal UI. */
export async function verifyProductionSources(input:ProjectData):Promise<Set<ID>>{const project=structuredClone({...input,history:[]}),ids=new Set(project.entities.filter((entity):entity is Entity<'storyboard_frame'>=>entity.kind==='storyboard_frame'&&adoptedRecord(entity)).flatMap(entity=>entity.data.anchor.sourceVersionId&&entity.data.anchor.sourceVersionId!==project.projectId?[entity.data.anchor.sourceVersionId]:[]));for(const id of ids){const snapshot=project.snapshots.find(item=>item.id===id);if(!snapshot||await sha256(jsonBytes(snapshot.content))!==snapshot.contentHash)throw new Error('INTEGRITY_FAILED: 制作検査の元台詞の固定版hashを確認できません。現稿で代用しません。');await verifyReusePins(snapshot.content,project.snapshots);}return ids;}

/** A read-only production view resolves reuse and the same verified fixed world registry as trials. */
export async function productionCheckView(input:ProjectData,worldSnapshots:Record<ID,ProjectContent>={},worldPins:readonly Pick<ProjectSnapshot,'id'|'contentHash'|'content'>[]=[],contentVersionId:ID=input.projectId){
 const author=structuredClone({...reuseAuthorContent(input),history:[]}),source=structuredClone({...input,history:[]}),registry=structuredClone(worldSnapshots),provided=structuredClone(worldPins);
 if(contentVersionId!==source.projectId){const pin=source.snapshots.find(pin=>pin.id===contentVersionId),{history:_history,snapshots:_snapshots,authorAlternatives:_alternatives,...content}=author;if(!pin||await sha256(jsonBytes(pin.content))!==pin.contentHash||await sha256(jsonBytes(content))!==pin.contentHash)throw new Error('INTEGRITY_FAILED: 制作検査の経路状態と採用世界を同じ固定作品版へ結合できません。');}
 await verifyReusePins(source,source.snapshots);
 const view=resolveReuseContent(source,source.snapshots),issues=await verifyPinnedWorlds(view,registry);if(issues.length)throw new Error(issues.map(issue=>issue.message).join(' '));
 const closure=resolvePinnedWorlds(view,registry),worldVersion=new Map<ID,ID>();for(const reference of closure.references)for(const entity of registry[reference.immutableSnapshotId].entities)worldVersion.set(entity.id,reference.immutableSnapshotId);
 const pins=[...view.snapshots,...closure.references.filter(reference=>!view.snapshots.some(pin=>pin.id===reference.immutableSnapshotId)).map(reference=>({id:reference.immutableSnapshotId,versionLabel:'制作確認の固定共通世界',createdAt:'1970-01-01T00:00:00.000Z',contentHash:reference.contentHash,content:registry[reference.immutableSnapshotId]}))];
 // Historical caption editions are citation sources, not additional current world records.
 for(const entity of view.entities)if(entity.kind==='storyboard_frame'&&adoptedRecord(entity)){const id=entity.data.anchor.sourceVersionId;if(!id||id===view.projectId||pins.some(pin=>pin.id===id))continue;const pin=provided.find(pin=>pin.id===id),content=registry[id];if(!pin||!content||await sha256(jsonBytes(content))!==pin.contentHash||await sha256(jsonBytes(pin.content))!==pin.contentHash)throw new Error('INTEGRITY_FAILED: 字幕が参照する旧世界版の期待hashがないか一致しません。現行世界版で代用しません。');const dependencyIssues=await verifyPinnedWorlds(content,registry);if(dependencyIssues.length)throw new Error(dependencyIssues.map(issue=>issue.message).join(' '));pins.push({...pin,content,versionLabel:'字幕の固定旧世界版',createdAt:'1970-01-01T00:00:00.000Z'});}
 const ids=new Set(view.entities.map(entity=>entity.id)),entities=[...view.entities];for(const world of closure.worlds)for(const entity of world.entities){if(ids.has(entity.id))throw new Error('REFERENCE_INVALID: 制作対象と固定世界のIDが衝突しています。');ids.add(entity.id);entities.push(entity);}
 const project={...view,entities,snapshots:pins},verifiedVersionIds=await verifyProductionSources(project);closure.references.forEach(reference=>verifiedVersionIds.add(reference.immutableSnapshotId));
 const mapAnchor=(anchor:ContentAnchor)=>anchor.sourceVersionId?anchor:worldVersion.has(anchor.entityId)?{...anchor,sourceVersionId:worldVersion.get(anchor.entityId)}:reuseTargetAnchor(view,anchor);
 return {project,verifiedVersionIds,mapAnchor,worldContext:{contentVersionId,versionIds:new Set(closure.references.map(reference=>reference.immutableSnapshotId))}};
}
