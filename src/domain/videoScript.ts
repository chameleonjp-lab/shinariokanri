import { createEntity, textToRichText, validateProject } from './model';
import { adoptedRecord } from './adoption';
import { jsonBytes, sha256 } from '../storage/json';
import type { ContentAnchor, Entity, ID, ProjectData, VideoLineKind } from './types';

export const VIDEO_KIND_LABELS = { dialogue: '台詞', action: 'ト書き', subtitle: '字幕' } as const;
export function videoLines(project: ProjectData, sceneId: ID): Entity<'dialogue_line'>[] {
  const scene = sceneOf(project, sceneId), byId = new Map(project.entities.map(e => [e.id,e]));
  return (scene.data.dialogueLineIds ?? []).flatMap(id => { const line=byId.get(id); return line?.kind==='dialogue_line'&&adoptedRecord(line)?[line]:[]; });
}
function sceneOf(project: ProjectData, id: ID) { const scene=project.entities.find(e=>e.id===id); if(scene?.kind!=='scene'||!adoptedRecord(scene)) throw Error('REFERENCE_INVALID: 現在の場面を選んでください。'); return scene; }
function requireEditableScene(scene:Entity<'scene'>) {if(scene.data.reuse&&scene.data.reuse.mode!=='clone')throw Error('VALIDATION_FAILED: 共通場面は独立複製してから動画台本を編集してください。');}
export interface VideoLineInput { kind: VideoLineKind; text: string; speakerId?: ID; sourceAnchor?: ContentAnchor }
export function appendVideoLine(project: ProjectData, sceneId: ID, input: VideoLineInput): ProjectData {
  const scene=sceneOf(project,sceneId), lines=videoLines(project,sceneId);
  requireEditableScene(scene);
  if(!Object.hasOwn(VIDEO_KIND_LABELS,input.kind)||!input.text.trim()||Array.from(input.text).length>100000) throw Error('VALIDATION_FAILED: 行種と本文を入力してください（10万文字まで）。');
  const speakerId=input.kind==='dialogue'?(input.speakerId||[...lines].reverse().find(l=>(l.data.scriptKind??'dialogue')==='dialogue'&&l.data.speakerId)?.data.speakerId||null):null;
  if(speakerId&&!project.entities.some(e=>e.id===speakerId&&e.kind==='character'&&adoptedRecord(e))) throw Error('REFERENCE_INVALID: 現在の話者を選んでください。');
  if(input.sourceAnchor) {
    const a=input.sourceAnchor, target=project.entities.find(e=>e.id===a.entityId&&adoptedRecord(e));
    if(a.sourceVersionId&&a.sourceVersionId!==project.projectId||a.positionStatus||!target||target.kind!=='scene'&&target.kind!=='dialogue_line'||target.kind==='scene'&&target.id!==sceneId||target.kind==='dialogue_line'&&!lines.some(l=>l.id===target.id)||a.lineId&&a.lineId!==target.id||a.blockId&&!(target.kind==='scene'?target.data.body:target.data.text).some(b=>b.id===a.blockId)) throw Error('REFERENCE_INVALID: 同じ場面の元の行・段落を選んでください。');
  }
  const number=1+project.entities.reduce((max,e)=>e.kind==='dialogue_line'?Math.max(max,e.data.scriptNumber??0):max,0);
  const line=createEntity(project.projectId,'dialogue_line',`${VIDEO_KIND_LABELS[input.kind]} ${number}`,{scriptKind:input.kind,scriptNumber:number,text:textToRichText(input.text),speakerId,...(input.sourceAnchor?{sourceAnchor:structuredClone(input.sourceAnchor)}:{})});
  return {...project,entities:[...project.entities.map(e=>e.id===sceneId?{...scene,data:{...scene.data,dialogueLineIds:[...scene.data.dialogueLineIds??[],line.id]}}:e),line]};
}
/** Author-only subtitle output. Readers continue to use the approved projection export. */
export function subtitleText(project: ProjectData, sceneId: ID) { return videoLines(project,sceneId).filter(l=>l.data.scriptKind==='subtitle').map(l=>l.data.text.map(b=>b.text).join('\n')).join('\n\n'); }
export function createVideoFrame(project: ProjectData, sceneId: ID, lineId: ID): ProjectData {
  const line=videoLines(project,sceneId).find(l=>l.id===lineId); if(!line||line.data.scriptKind==='subtitle') throw Error('REFERENCE_INVALID: 台詞またはト書きを選んでください。');
  const frame=createEntity(project.projectId,'storyboard_frame',`${line.name} のコマ`,{anchor:{entityId:line.id,lineId:line.id,...(line.data.text[0]?{blockId:line.data.text[0].id}:{})},caption:[]});
  return {...project,entities:[...project.entities,frame]};
}
export function addSceneCue(project: ProjectData, sceneId: ID, input: {kind:'silent_character'|'environment_sound';speakerId?:ID;name?:string}): ProjectData {
  sceneOf(project,sceneId);
  if(input.kind==='silent_character'&&!project.entities.some(e=>e.kind==='character'&&e.id===input.speakerId&&adoptedRecord(e))) throw Error('REFERENCE_INVALID: 無言の人物を選んでください。');
  if(input.kind==='environment_sound'&&!input.name?.trim()) throw Error('VALIDATION_FAILED: 環境音の名前を入力してください。');
  const cue=createEntity(project.projectId,'cue',input.kind==='silent_character'?'無言の人物':input.name!.trim(),{anchor:{entityId:sceneId},cueType:input.kind,speakerId:input.kind==='silent_character'?input.speakerId:null,stage:'missing'});
  return {...project,entities:[...project.entities,cue]};
}
export type PreparationStage='temporary'|'missing'|'reviewed'|'needs_review';
export function preparationStage(project:ProjectData, e:Entity<'cue'|'storyboard_frame'>):PreparationStage {
  if(e.status==='needs_review')return 'needs_review'; if(e.status==='confirmed')return 'reviewed';
  if(e.kind==='cue'&&['temporary','reviewed','needs_review'].includes(e.data.stage??''))return e.data.stage as PreparationStage;
  const assetId=e.kind==='cue'?e.data.attachmentId:e.data.finalAssetId??e.data.referenceAssetId;
  const asset=project.entities.find(a=>a.id===assetId&&a.kind==='attachment'&&adoptedRecord(a));return asset?'temporary':'missing';
}
export function scenePreparation(project:ProjectData,sceneId:ID,stage?:PreparationStage) {
  const ids=new Set([sceneId,...videoLines(project,sceneId).map(l=>l.id)]);
  return project.entities.filter((e):e is Entity<'cue'|'storyboard_frame'>=>(e.kind==='cue'||e.kind==='storyboard_frame')&&adoptedRecord(e)&&(!e.data.anchor.sourceVersionId||e.data.anchor.sourceVersionId===project.projectId)&&ids.has(e.data.anchor.lineId??e.data.anchor.entityId)).filter(e=>!stage||preparationStage(project,e)===stage);
}
export function rehearsalTurns(project:ProjectData,lineIds:ID[],speakerId:ID) {
  const byId=new Map(project.entities.map(e=>[e.id,e]));
  const turns:{line:Entity<'dialogue_line'>;cue:Entity<'dialogue_line'>|undefined}[]=[];
  let cue:Entity<'dialogue_line'>|undefined;
  for(const id of lineIds){const line=byId.get(id);if(line?.kind!=='dialogue_line'||!adoptedRecord(line)||(line.data.scriptKind??'dialogue')!=='dialogue')continue;if(line.data.speakerId===speakerId)turns.push({line,cue});else if(line.data.speakerId)cue=line;}
  return turns;
}
export type VideoChangeRequest = {type:'append';sceneId:ID;input:VideoLineInput}|{type:'reorder';sceneId:ID;lineIds:ID[]}|{type:'frame';sceneId:ID;lineId:ID}|{type:'cue';sceneId:ID;input:Parameters<typeof addSceneCue>[2]}|{type:'review';sceneId:ID;id:ID;status:'confirmed'|'provisional'};
const hash=(project:ProjectData)=>{const {history:_history,...content}=project;return sha256(jsonBytes(content));};
export async function previewVideoChange(project:ProjectData,request:VideoChangeRequest) {
  project={...structuredClone({...project,history:[]}),history:project.history}; request=structuredClone(request); let candidate=project; requireEditableScene(sceneOf(project,request.sceneId));
  if(request.type==='append')candidate=appendVideoLine(project,request.sceneId,request.input);
  else if(request.type==='frame')candidate=createVideoFrame(project,request.sceneId,request.lineId);
  else if(request.type==='cue')candidate=addSceneCue(project,request.sceneId,request.input);
  else if(request.type==='reorder') {const ids=sceneOf(project,request.sceneId).data.dialogueLineIds??[]; if(ids.length!==request.lineIds.length||new Set(request.lineIds).size!==ids.length||request.lineIds.some(id=>!ids.includes(id)))throw Error('VALIDATION_FAILED: 場面の全行を重複せず指定してください。'); candidate={...project,entities:project.entities.map(e=>e.id===request.sceneId&&e.kind==='scene'?{...e,data:{...e.data,dialogueLineIds:[...request.lineIds]}}:e)};}
  else {if(!scenePreparation(project,request.sceneId).some(e=>e.id===request.id))throw Error('REFERENCE_INVALID: この場面の準備を選んでください。');candidate={...project,entities:project.entities.map(e=>e.id===request.id?{...e,status:request.status}:e)};}
  const result=validateProject(candidate); if(!result.ok)throw Error(`VALIDATION_FAILED: ${result.issues.map(i=>i.message).join(' ')}`);
  const payload={projectId:project.projectId,baseRevision:project.revision,baseHash:await hash(project),candidateHash:await hash(candidate),request};return {...payload,candidate,confirmationHash:await sha256(jsonBytes(payload))};
}
export type VideoChangePlan=Awaited<ReturnType<typeof previewVideoChange>>;
export async function confirmVideoChange(project:ProjectData,plan:VideoChangePlan) {const {candidate,confirmationHash,...payload}=plan;if(project.projectId!==plan.projectId||project.revision!==plan.baseRevision||await hash(project)!==plan.baseHash||await hash(candidate)!==plan.candidateHash||await sha256(jsonBytes(payload))!==confirmationHash)throw Error('REVISION_CONFLICT: 確認後に作品または差分が変わりました。再確認してください。');return {...candidate,history:project.history};}
