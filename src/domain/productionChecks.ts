import type { ContentAnchor, Entity, ID, ProjectData, RuntimeContext, TruthValue } from './types';
import { adoptedRecord, adoptionAssessment } from './adoption';
import { assessWorldValidity, type WorldPoint } from './world';
import { evaluateScenarioException } from './stateRules';
export interface ProductionCheck { id: string; kind: 'spelling'|'reading'|'voice'|'rule_context'; lineId: ID; ruleId: ID; anchor?: ContentAnchor; value: TruthValue; message: string; reasons: string[]; exceptionReason?: string }
function occurrences(text: string, token: string) { const found:{start:number;end:number}[]=[];if(!token)return found;for(let at=0;at<=text.length-token.length;){const index=text.indexOf(token,at);if(index<0)break;const start=Array.from(text.slice(0,index)).length;found.push({start,end:start+Array.from(token).length});at=index+token.length;}return found; }
/** Literal candidates and authored rule applicability; free-form prose is never automatically approved. */
export function checkProductionRules(project: ProjectData, point: WorldPoint = {}): ProductionCheck[] {
 const output:ProductionCheck[]=[];
 const rules=project.entities.filter((entity):entity is Entity<'terminology'|'voice_rule'>=>['terminology','voice_rule'].includes(entity.kind)&&adoptedRecord(entity));
 const subjects=project.entities.filter(adoptedRecord).flatMap(entity=>{
  if(entity.kind==='dialogue_line')return [{id:entity.id,lineId:entity.id,speakerId:entity.data.speakerId,text:entity.data.text,isLine:true}];
  if(entity.kind==='localization'||entity.kind==='storyboard_frame'){
   const sourceId=entity.kind==='localization'?entity.data.sourceLineId:entity.data.anchor.lineId??entity.data.anchor.entityId;
   const source=project.entities.find(record=>record.id===sourceId&&record.kind==='dialogue_line'&&adoptedRecord(record));
   return [{id:entity.id,lineId:source?.id,speakerId:source?.kind==='dialogue_line'?source.data.speakerId:undefined,text:entity.kind==='localization'?entity.data.text:entity.data.caption??[],isLine:false}];
  }
  return [];
 });
 for(const line of subjects)for(const rule of rules){
  if(rule.kind==='voice_rule'&&rule.data.characterId!==line.speakerId || rule.kind==='terminology'&&rule.data.voiceOwnerId&&rule.data.voiceOwnerId!==line.speakerId)continue;
  let validity=adoptionAssessment(rule,assessWorldValidity(rule.data.validity,point));
  const anchor=rule.data.validity?.presentationAnchor;
  if(anchor){
   const versions=[project.projectId,point.context?.state.contentVersionId,point.context?.ruleContext?.sourceVersionId];
   if(anchor.positionStatus==='unresolved'||anchor.sourceVersionId&&!versions.includes(anchor.sourceVersionId))validity={value:'unknown',reasons:[...validity.reasons,'規則の提示位置または対象版が未確認です。']};
   else if(point.presentationIds&&![anchor.entityId,anchor.blockId,anchor.lineId].filter(Boolean).every(id=>point.presentationIds!.includes(id!)))validity={value:'false',reasons:['規則の提示位置に到達していません。']};
  }
  if(validity.value==='false')continue;
  const base=point.context;
  const chapters=[...new Set(project.entities.filter((entity):entity is Entity<'scene'>=>entity.kind==='scene'&&adoptedRecord(entity)&&!!entity.data.dialogueLineIds?.includes(line.lineId??'')).flatMap(scene=>scene.data.chapterId?[scene.data.chapterId]:[]))];
  const chapterId=base?.ruleContext?.chapterId??(chapters.length===1?chapters[0]:undefined);
  const context:RuntimeContext|undefined=base?{...base,entities:project.entities,ruleContext:{...base.ruleContext,projectId:project.projectId,chapterId,worldTick:point.at??base.ruleContext?.worldTick}}:undefined;
  const exceptions=(rule.data.exceptions??[]).map(exception=>({exception,result:context?evaluateScenarioException(exception,context):{value:'unknown' as const,reasons:['例外の対象経路と開始状態が未選択です。']}})),accepted=exceptions.find(item=>item.result.value==='true');
  const reasons=[...validity.reasons,...exceptions.filter(item=>item.result.value==='unknown').flatMap(item=>item.result.reasons)];
  const value=validity.value==='unknown'||exceptions.some(item=>item.result.value==='unknown')?'unknown' as const:'true' as const;
  if(validity.value==='unknown'||exceptions.some(item=>item.result.value==='unknown'))output.push({id:`${line.id}:${rule.id}:context`,kind:'rule_context',lineId:line.id,ruleId:rule.id,value:'unknown',message:'期間・経路・提示位置または例外が未確認です。',reasons});
  for(const block of line.text){
   if(rule.kind==='terminology'){
    const tokens=[rule.data.canonical,...rule.data.variants??[]];
    for(const token of [...new Set(tokens)])for(const range of occurrences(block.text,token)){
     const anchor={entityId:line.id,...(line.isLine?{lineId:line.id}:{}),blockId:block.id,...range};
     if(token!==rule.data.canonical)output.push({id:`${line.id}:${rule.id}:${block.id}:${range.start}:spelling`,kind:'spelling',lineId:line.id,ruleId:rule.id,anchor,value,message:`表記候補「${token}」・標準「${rule.data.canonical}」。許容する表記か作者が確認します。`,reasons,...accepted?{exceptionReason:accepted.exception.reason}:{}});
     const ruby=block.ruby?.find(item=>item.start===range.start&&item.end===range.end);
     if(rule.data.reading&&(!ruby||ruby.text!==rule.data.reading))output.push({id:`${line.id}:${rule.id}:${block.id}:${range.start}:reading`,kind:'reading',lineId:line.id,ruleId:rule.id,anchor,value,message:`読みを確認：「${token}」・用語の読み「${rule.data.reading}」・本文ルビ「${ruby?.text??'未指定'}」。`,reasons,...accepted?{exceptionReason:accepted.exception.reason}:{}});
    }
   }else if(block.text.trim())output.push({id:`${line.id}:${rule.id}:${block.id}:voice`,kind:'voice',lineId:line.id,ruleId:rule.id,anchor:{entityId:line.id,...(line.isLine?{lineId:line.id}:{}),blockId:block.id},value,message:`口調の作者確認：一人称「${rule.data.firstPerson??'未指定'}」・呼称「${rule.data.addressing??'未指定'}」・言い回し「${rule.data.phrasing??'未指定'}」。`,reasons,...accepted?{exceptionReason:accepted.exception.reason}:{}});
  }
 }
 return output;
}
