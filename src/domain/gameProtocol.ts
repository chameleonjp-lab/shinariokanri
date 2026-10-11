import type { Entity, ID, ProjectData, TypedValue } from './types';
import { startTrialVerified } from './runtimeVerified';
import { stepTrial, type TrialRequest } from './runtime';
import { canonicalJson, jsonBytes, sha256, parseStrictJson, ARCHIVE_LIMITS } from '../storage/json';
import { portableRuntimeProject } from './portableRuntimeProject';
import type { PublicProjection } from './projection';
import { buildProjectionSearchIndex, PROJECTION_FIELDS } from './projection';
import { prepareAsset } from './attachments';
import { rebuildGameExecution } from './gameEvidence';
import { validateCalendar } from './time';

export const GAME_SPEC='scenario-browser-game/1.0.0' as const;
export const GAME_FEATURES=['runtime-project-1','lifecycle-1','presentation-1','reuse-flattening-1','finite-exceptions-1'] as const;
export interface GamePackage { format:'scenario-runtime';formatVersion:'1.0.0';contentVersionId:string;profile:{profileId:string;profileVersion:string};requiredFeatures:string[];publicProjection:PublicProjection;runtimeProject:ProjectData;runtimeProjectHash:string;publicToRuntime:Record<string,string>;entities:{id:string;kind:string;data:Record<string,unknown>}[];assetData?:Record<string,{mediaType:string;base64:string}> }
type ExecutionPackage=Pick<GamePackage,'runtimeProject'|'publicToRuntime'|'entities'|'publicProjection'|'runtimeProjectHash'>;
export interface GameAction { sequence:number;id:string;contractId:string;action:'win'|'lose'|'collect'|'stub';stubIndex?:number;score:number;value:TypedValue;executedAt:string;previousHash:string;hash:string }
export interface GameReceipt { format:'scenario-game-receipt';formatVersion:'1.0.0';specification:typeof GAME_SPEC;receiverId:'independent-browser-game';sessionId:string;receivedAt:string;packageHash:string;runtimeProjectHash:string;entryId:ID;worldTick?:string;actions:GameAction[];requests:TrialRequest[];finalState:unknown;status:string;mode:'stub'|'actual'|'mixed';dialogueIds:string[];assets:{id:string;contentHash:string}[];receiptHash:string }
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const failure=(message:string):never=>{throw Error(`INTEGRITY_FAILED: ${message}`);};
function knownFields(value:unknown,allowed:readonly string[],required:readonly string[]=allowed):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))||required.some(key=>!Object.hasOwn(value,key)))failure('受取内容に未対応の項目または不足した構造があります。');
}
/** The receiver accepts one declared wire contract, including the public metadata it cannot execute. */
function checkedPublicProjection(input:unknown):asserts input is PublicProjection{
 knownFields(input,['format','formatVersion','title','mainStart','calendars','entities','relations','searchIndex','versions'],['format','formatVersion','title','calendars','entities','relations','searchIndex']);
 if(input.format!=='scenario-projection'||input.formatVersion!=='1.0.0'||typeof input.title!=='string'||!Array.isArray(input.entities)||!Array.isArray(input.relations)||!Array.isArray(input.calendars)||!Array.isArray(input.searchIndex))failure('公開内容の仕様版または構造に対応していません。');
 for(const entity of input.entities as unknown[]){
  knownFields(entity,['id','kind','name','status','data']);
  const schema=PROJECTION_FIELDS[entity.kind as keyof typeof PROJECTION_FIELDS];
  if(!schema||typeof entity.id!=='string'||typeof entity.name!=='string'||entity.status!=='confirmed')failure('公開項目の種類・ID・確認状態が不正です。');
  const assetFields=entity.kind==='attachment'?['mediaType','contentHash','byteSize','assetPath','bytesIncluded']:[];
  knownFields(entity.data,[...Object.keys(schema!),...assetFields],[]);
  for(const [field,rule]of Object.entries(schema!))if(rule.type==='rich'&&entity.data[field]!=null){
   if(!Array.isArray(entity.data[field]))failure('公開本文の構造が不正です。');
   for(const block of entity.data[field] as unknown[]){
    knownFields(block,['id','kind','text','ruby','links'],['id','kind','text']);
    if(block.ruby!=null){if(!Array.isArray(block.ruby))failure('公開ルビの構造が不正です。');for(const ruby of block.ruby as unknown[]){knownFields(ruby,['start','end','text']);if(!Number.isSafeInteger(ruby.start)||!Number.isSafeInteger(ruby.end)||Number(ruby.start)<0||Number(ruby.start)>=Number(ruby.end)||typeof ruby.text!=='string')failure('公開ルビの文字範囲・読みの型が不正です。');}}
    if(block.links!=null){if(!Array.isArray(block.links))failure('公開本文リンクの構造が不正です。');for(const link of block.links as unknown[])knownFields(link,['start','end','targetId','blockId','lineId','sourceVersionId','targetStart','targetEnd'],['start','end','targetId']);}
   }
  }
 }
 for(const relation of input.relations as unknown[]){
  knownFields(relation,['id','fromId','toId','relationType','direction','evidenceIds','validity'],['id','fromId','toId','relationType','direction','evidenceIds']);
  if(['id','fromId','toId','relationType'].some(field=>typeof relation[field]!=='string'||!relation[field])||!['forward','symmetric'].includes(String(relation.direction))||!Array.isArray(relation.evidenceIds)||(relation.evidenceIds as unknown[]).some(id=>typeof id!=='string'||!id))failure('公開関係のID・種類・方向・根拠の型が不正です。');
  if(relation.validity!=null)knownFields(relation.validity,['worldRange','routeCondition','presentationAnchor']);
 }
 // The native adapter translates public IDs and links, and uses the Gregorian
 // definition for that calendar kind. Validate metadata before that conversion;
 // all retained field values still pass portableRuntimeProject's strict schema.
 for(const calendar of input.calendars as unknown[]){const result=validateCalendar(calendar);if(!result.ok)failure(`公開暦の型・定義が不正です。${result.issues[0].message}`);}
 if(canonicalJson(input.searchIndex)!==canonicalJson(buildProjectionSearchIndex(input as unknown as PublicProjection)))failure('公開検索索引が許可された本文・項目と一致しません。');
 if(input.versions!=null){
  if(!Array.isArray(input.versions)||input.versions.length>128)failure('公開引用版の構造・上限が不正です。');
  for(const version of input.versions as unknown[]){knownFields(version,['id','projection']);if(typeof version.id!=='string')failure('公開引用版のIDが不正です。');knownFields(version.projection,['format','formatVersion','title','mainStart','calendars','entities','relations','searchIndex'],['format','formatVersion','title','calendars','entities','relations','searchIndex']);checkedPublicProjection(version.projection);}
 }
}
const gameCapabilities={
 supportedNodeTypes:['scene','choice','automatic','call','entry','exit','terminal'],
 supportedConditions:['constant','all','any','not','compare','item','known','visited','external'],
 supportedEffects:['set','add','grant','consume','move','assert','mark_seen','reset'],
 externalContracts:['boolean','integer','enum'],
 assetTypes:['image/png','image/jpeg','image/gif','image/webp','audio/wav','audio/mpeg','application/pdf','video/mp4','video/webm','video/ogg','audio/ogg','text/plain','application/json','application/octet-stream'],
};
function checkedPackageMetadata(input:unknown){
 const fields=['format','formatVersion','requiredFeatures','profile','title','versionLabel','contentVersionId','hashScope','entities','relations','calendars','flow','dialogue','scenes','characters','variables','effects','items','assertions','quests','disclosures','cues','externalContracts','assets','externalEvidence','publicProjection','assetBytesIncluded','runtimeProject','runtimeProjectHash','publicToRuntime','assetData'];
 knownFields(input,fields);
 knownFields(input.profile,['profileId','profileVersion','schemaVersion',...Object.keys(gameCapabilities),'omissions']);
 const profile=input.profile;
 if(profile.schemaVersion!=='1.0.0'||Object.entries(gameCapabilities).some(([key,values])=>!Array.isArray(profile[key])||(profile[key] as unknown[]).some(value=>typeof value!=='string'||!values.includes(value))))failure('受取profileの仕様版または能力宣言に対応していません。');
 const omissions=['author_notes','rejected_and_alternate_records','private_names_and_aliases','original_source_ids_unless_explicitly_approved',...input.assetBytesIncluded===true?[]:['asset_bytes'],'playtest_traces'];
 if(canonicalJson(profile.omissions)!==canonicalJson(omissions))failure('受取profileの除外宣言に対応していません。');
 checkedPublicProjection(input.publicProjection);
 const projection=input.publicProjection;
 if(input.title!==projection.title||typeof input.versionLabel!=='string'||input.hashScope!=='public_projection'||input.externalEvidence!=='not_included'||typeof input.assetBytesIncluded!=='boolean'||canonicalJson(input.relations)!==canonicalJson(projection.relations)||canonicalJson(input.calendars)!==canonicalJson(projection.calendars))failure('受取内容の公開metadataが一致しません。');
 knownFields(input.flow,['graphs','nodes','edges']);
 const groups={dialogue:'dialogue_line',scenes:'scene',characters:'character',variables:'variable',effects:'effect',items:'item',assertions:'assertion',quests:'quest',disclosures:'disclosure',cues:'cue',externalContracts:'external_contract',assets:'attachment'};
 for(const [field,kind]of Object.entries(groups))if(canonicalJson(input[field])!==canonicalJson(projection.entities.filter(entity=>entity.kind===kind)))failure('受取内容の種類別一覧が公開内容と一致しません。');
 for(const [field,kind]of Object.entries({graphs:'flow_graph',nodes:'flow_node',edges:'flow_edge'}))if(canonicalJson(input.flow[field])!==canonicalJson(projection.entities.filter(entity=>entity.kind===kind)))failure('受取内容の分岐一覧が公開内容と一致しません。');
 if(!input.assetData||typeof input.assetData!=='object'||Array.isArray(input.assetData))failure('受取素材bytesの構造が不正です。');
 for(const payload of Object.values(input.assetData as object))knownFields(payload,['mediaType','base64']);
}
function checkedReceiptShape(input:unknown):GameReceipt{
 const raw=input as GameReceipt,allowed=['format','formatVersion','specification','receiverId','sessionId','receivedAt','packageHash','runtimeProjectHash','entryId','worldTick','actions','requests','finalState','status','mode','dialogueIds','assets','receiptHash'],digest=/^[a-f0-9]{64}$/;
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!allowed.includes(key))||raw.format!=='scenario-game-receipt'||raw.formatVersion!=='1.0.0'||raw.specification!==GAME_SPEC||raw.receiverId!=='independent-browser-game'||(typeof raw.sessionId!=='string'||!uuid.test(raw.sessionId))||(typeof raw.entryId!=='string'||!uuid.test(raw.entryId))||(typeof raw.receivedAt!=='string'||!Number.isFinite(Date.parse(raw.receivedAt)))||![raw.packageHash,raw.runtimeProjectHash,raw.receiptHash].every(value=>typeof value==='string'&&digest.test(value))||!['stub','actual','mixed'].includes(raw.mode)||!['ready','terminal','blocked','unknown','error'].includes(raw.status)||!raw.finalState||typeof raw.finalState!=='object'||Array.isArray(raw.finalState)||raw.worldTick!=null&&(typeof raw.worldTick!=='string'||! /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(raw.worldTick))||!Array.isArray(raw.actions)||raw.actions.length>10000||!Array.isArray(raw.requests)||raw.requests.length>10000||!Array.isArray(raw.dialogueIds)||raw.dialogueIds.some(id=>typeof id!=='string')||new Set(raw.dialogueIds).size!==raw.dialogueIds.length||!Array.isArray(raw.assets)||raw.assets.some(asset=>!asset||Object.keys(asset).some(key=>!['id','contentHash'].includes(key))||typeof asset.id!=='string'||!digest.test(asset.contentHash))||new Set(raw.assets.map(asset=>asset.id)).size!==raw.assets.length||jsonBytes(raw).byteLength>1024*1024)failure('受領証跡の仕様・構造・上限が不正です。');
 for(const event of raw.actions)if(!event||typeof event!=='object'||Array.isArray(event)||Object.keys(event).some(key=>!['sequence','id','contractId','action','stubIndex','score','value','executedAt','previousHash','hash'].includes(key))||(typeof event.id!=='string'||!uuid.test(event.id))||typeof event.contractId!=='string'||(typeof event.executedAt!=='string'||!Number.isFinite(Date.parse(event.executedAt)))||!['win','lose','collect','stub'].includes(event.action)||!Number.isSafeInteger(event.score)||!Number.isSafeInteger(event.sequence)||!digest.test(event.previousHash)||!digest.test(event.hash))failure('ゲーム実行記録のID・日時・構造が不正です。');
 for(const request of raw.requests)if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(key=>!['edgeId','event','random','worldTick'].includes(key)))failure('受領証跡の進行要求が未対応です。');
 return raw;
}
export function packageAssets(pkg:Pick<GamePackage,'publicProjection'>){return [...pkg.publicProjection.entities.filter(e=>e.kind==='attachment').map(e=>({id:e.id,data:e.data})),...(pkg.publicProjection.versions??[]).flatMap(version=>version.projection.entities.filter(e=>e.kind==='attachment').map(e=>({id:`${version.id}:${e.id}`,data:e.data})))];}
function contract(pkg:ExecutionPackage,id:string){const record=pkg.runtimeProject.entities.find((e):e is Entity<'external_contract'>=>e.kind==='external_contract'&&e.id===pkg.publicToRuntime[id]);if(!record)failure('受取パッケージに外部契約がありません。');return record!;}
/** Example game mechanics produce measurements; a hand-entered actual label is never an input. */
export function gameResult(pkg:ExecutionPackage,id:string,action:GameAction['action'],oldScore:number,stubIndex?:number){const c=contract(pkg,id);if(action==='stub'){const value=c.data.stubValues?.[stubIndex??-1];if(!value)failure('宣言済み仮値がありません。');return {score:oldScore,value:structuredClone(value!)};}if(c.data.owner!=='game')failure('ゲーム管理以外の外部契約を実測にできません。');const score=action==='win'?oldScore+3:action==='collect'?oldScore+1:Math.max(0,oldScore-1);let value:TypedValue;if(c.data.outputType==='boolean')value={type:'boolean',value:action!=='lose'};else if(c.data.outputType==='integer')value={type:'integer',value:score};else if(c.data.outputType==='enum'){const values=(c.data.stubValues??[]).filter((v):v is Extract<TypedValue,{type:'enum'}>=>v.type==='enum');if(!values.length)failure('列挙結果の宣言がありません。');value=structuredClone(values[action==='lose'?values.length-1:action==='win'?0:Math.min(1,values.length-1)]);}else return failure('受取例が未対応の結果型です。');return {score,value};}
export async function receiveGamePackage(input:unknown):Promise<GamePackage>{
 checkedPackageMetadata(input);
 const p=structuredClone(input) as GamePackage;
 if(p?.format!=='scenario-runtime'||p.formatVersion!=='1.0.0'||p.profile?.profileId!=='scenario-runtime'||p.profile.profileVersion!=='1.1.0'||!p.runtimeProject||!p.publicToRuntime||!Array.isArray(p.entities)||!p.publicProjection||!Array.isArray(p.requiredFeatures)||p.requiredFeatures.length!==GAME_FEATURES.length||new Set(p.requiredFeatures).size!==p.requiredFeatures.length||p.requiredFeatures.some(feature=>!(GAME_FEATURES as readonly string[]).includes(feature)))failure('受取仕様版または必須機能に対応していません。');
 if(await sha256(jsonBytes(p.runtimeProject))!==p.runtimeProjectHash||p.contentVersionId!==`sha256:${await sha256(jsonBytes(p.publicProjection))}`||canonicalJson(p.entities)!==canonicalJson(p.publicProjection.entities))failure('受領内容hashまたは公開内容が一致しません。');
 const expected=await portableRuntimeProject(p.publicProjection);
 if(canonicalJson(expected.project)!==canonicalJson(p.runtimeProject)||canonicalJson(expected.publicToRuntime)!==canonicalJson(p.publicToRuntime))failure('公開内容・実行内容・ID対応が一致しません。');
 const assets=packageAssets(p),known=new Set(assets.map(e=>e.id));if(known.size!==assets.length||new Set(p.entities.map(e=>e.id)).size!==p.entities.length||Object.keys(p.assetData??{}).some(id=>!known.has(id)))failure('素材または公開ID対応が重複・範囲外です。');
 for(const entity of assets){
  const payload=p.assetData?.[entity.id];if(!payload||payload.mediaType!==entity.data.mediaType||typeof payload.base64!=='string'||payload.base64.length>Math.ceil(32*1024*1024/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.base64))failure('受取素材bytesがないか形式・上限が不正です。');
  const bytes=Uint8Array.from(atob(payload!.base64),char=>char.charCodeAt(0)),asset=await prepareAsset(bytes,'受取素材',payload!.mediaType);
  if(asset.contentHash!==entity.data.contentHash||asset.byteSize!==entity.data.byteSize||asset.mediaType!==payload!.mediaType||entity.data.bytesIncluded!==true)failure('受取素材の署名・hash・サイズが一致しません。');
 }
 return p;
}
export async function appendGameAction(pkg:GamePackage,actions:readonly GameAction[],id:string,action:GameAction['action'],stubIndex?:number):Promise<GameAction>{if(actions.length>=10000)failure('実行記録の上限10,000回に到達しました。');const previous=actions.filter(event=>event.contractId===id).at(-1),result=gameResult(pkg,id,action,previous?.score??0,stubIndex),record={sequence:actions.length+1,id:crypto.randomUUID(),contractId:id,action,...stubIndex!==undefined?{stubIndex}:{},...result,executedAt:new Date().toISOString(),previousHash:actions.at(-1)?.hash??await sha256(jsonBytes(pkg))};return {...record,hash:await sha256(jsonBytes(record))};}
export function gameMode(actions:readonly GameAction[]):GameReceipt['mode']{const stub=actions.some(e=>e.action==='stub'),actual=actions.some(e=>e.action!=='stub');return actual?stub?'mixed':'actual':'stub';}
export function gameValues(pkg:Pick<GamePackage,'publicToRuntime'>,actions:readonly GameAction[]):Record<ID,TypedValue>{return Object.fromEntries(actions.map(event=>[pkg.publicToRuntime[event.contractId],event.value]));}
export async function buildGameReceipt(pkg:GamePackage,input:{entryId:ID;worldTick?:string;actions:GameAction[];requests:TrialRequest[];sessionId?:string}):Promise<GameReceipt>{const capturedInput=structuredClone(input);pkg=await receiveGamePackage(pkg);input=capturedInput;let session=await startTrialVerified(pkg.runtimeProject,{entryId:input.entryId,worldTick:input.worldTick,externalValues:gameValues(pkg,input.actions)});for(const request of input.requests)session=stepTrial(pkg.runtimeProject,session,request);const payload={format:'scenario-game-receipt' as const,formatVersion:'1.0.0' as const,specification:GAME_SPEC,receiverId:'independent-browser-game' as const,sessionId:input.sessionId??crypto.randomUUID(),receivedAt:new Date().toISOString(),packageHash:await sha256(jsonBytes(pkg)),runtimeProjectHash:pkg.runtimeProjectHash,entryId:input.entryId,...input.worldTick?{worldTick:input.worldTick}:{},actions:input.actions,requests:input.requests,finalState:session.state,status:session.status,mode:gameMode(input.actions),dialogueIds:pkg.entities.filter(e=>e.kind==='dialogue_line').map(e=>e.id),assets:packageAssets(pkg).map(e=>({id:e.id,contentHash:String(e.data.contentHash)}))};const receipt={...payload,receiptHash:await sha256(jsonBytes(payload))};await verifyGameReceipt(pkg,receipt);return receipt;}
export async function verifyGameReceipt(pkg:GamePackage,input:unknown):Promise<GameReceipt>{const raw=checkedReceiptShape(structuredClone(input));pkg=await receiveGamePackage(pkg);if(!raw||raw.format!=='scenario-game-receipt'||raw.formatVersion!=='1.0.0'||raw.specification!==GAME_SPEC||raw.receiverId!=='independent-browser-game'||(typeof raw.sessionId!=='string'||!uuid.test(raw.sessionId))||(typeof raw.receivedAt!=='string'||!Number.isFinite(Date.parse(raw.receivedAt)))||!Array.isArray(raw.actions)||raw.actions.length>10000||!Array.isArray(raw.requests)||raw.requests.length>10000)failure('受領証跡の仕様・構造・上限が不正です。');const allowed=['format','formatVersion','specification','receiverId','sessionId','receivedAt','packageHash','runtimeProjectHash','entryId','worldTick','actions','requests','finalState','status','mode','dialogueIds','assets','receiptHash'];if(Object.keys(raw).some(key=>!allowed.includes(key)))failure('未対応の受領証跡項目があります。');const {receiptHash,...payload}=raw;if(await sha256(jsonBytes(payload))!==receiptHash||raw.packageHash!==await sha256(jsonBytes(pkg))||raw.runtimeProjectHash!==pkg.runtimeProjectHash)failure('受領証跡または受取パッケージのhashが一致しません。');await verifyExecutionReceipt(pkg,raw);return raw;}
async function verifyExecutionReceipt(pkg:ExecutionPackage,raw:GameReceipt):Promise<void>{let previousHash=raw.packageHash;const scores=new Map<string,number>(),ids=new Set<string>();for(const [index,event]of raw.actions.entries()){if(!event||(typeof event.id!=='string'||!uuid.test(event.id))||ids.has(event.id)||event.sequence!==index+1||event.previousHash!==previousHash||(typeof event.executedAt!=='string'||!Number.isFinite(Date.parse(event.executedAt)))||!['win','lose','collect','stub'].includes(event.action))failure('ゲーム実行記録の順序・ID・日時が不正です。');ids.add(event.id);if(Object.keys(event).some(key=>!['sequence','id','contractId','action','stubIndex','score','value','executedAt','previousHash','hash'].includes(key)))failure('未対応のゲーム実行項目があります。');const expected=gameResult(pkg,event.contractId,event.action,scores.get(event.contractId)??0,event.stubIndex),{hash,...action}=event;if(canonicalJson(expected.value)!==canonicalJson(event.value)||expected.score!==event.score||await sha256(jsonBytes(action))!==hash)failure('ゲーム処理の実結果・hashが一致しません。');scores.set(event.contractId,event.score);previousHash=hash;}if(raw.mode!==gameMode(raw.actions))failure('stub/actual/mixedの表示が実行証跡と一致しません。');if(canonicalJson(raw.dialogueIds)!==canonicalJson(pkg.entities.filter(e=>e.kind==='dialogue_line').map(e=>e.id))||canonicalJson(raw.assets)!==canonicalJson(packageAssets(pkg).map(e=>({id:e.id,contentHash:String(e.data.contentHash)}))))failure('台詞・素材ID対応または素材hashが一致しません。');let session=await startTrialVerified(pkg.runtimeProject,{entryId:raw.entryId,worldTick:raw.worldTick,externalValues:gameValues(pkg,raw.actions)});for(const request of raw.requests){if(!request||Object.keys(request).some(key=>!['edgeId','event','random','worldTick'].includes(key)))failure('受領証跡の進行要求が未対応です。');session=stepTrial(pkg.runtimeProject,session,request);}if(canonicalJson(session.state)!==canonicalJson(raw.finalState)||session.status!==raw.status)failure('受取ゲームの経路・最終結果を再生できません。');}
export function parseGameReceipt(bytes:Uint8Array){return parseStrictJson(bytes,'game-receipt.json',{...ARCHIVE_LIMITS,jsonBytes:1024*1024});}

/** Durable records replay from an immutable private approval, including stable public IDs and pinned citations. */
export async function verifyStoredGameEvidence(input:ProjectData,inputWorlds:Record<ID,import('./types').ProjectContent>={}) {
 const imagesFor=(p:ProjectData)=>[p,...p.snapshots.map(pin=>pin.content),...p.history.flatMap(command=>[command.before,command.after]),...p.authorAlternatives?.flatMap(alternative=>[alternative.baseContent,...alternative.versions.map(version=>version.content)])??[]];
 // This scan is synchronous and covers every image checked below. A private
 // clone is needed only when there are receipts whose async hashes/replay run.
 if(!imagesFor(input).some(image=>image.entities.some(note=>note.kind==='note'&&note.data.handoffReceipt)))return;
 const project=structuredClone(input),worldSnapshots=structuredClone(inputWorlds);
 const images=imagesFor(project),seen=new Set<string>();
 for(const image of images)for(const note of image.entities){
  if(note.kind!=='note'||!note.data.handoffReceipt)continue;
  const identity=canonicalJson(note.data.handoffReceipt);if(seen.has(identity))continue;seen.add(identity);
  const evidence=note.data.handoffReceipt,receipt=checkedReceiptShape(parseGameReceipt(new TextEncoder().encode(evidence.rawJson))),{receiptHash,...payload}=receipt;
  if(await sha256(jsonBytes(payload))!==receiptHash||receiptHash!==evidence.receiptHash||receipt.packageHash!==evidence.packageHash||receipt.mode!==evidence.mode||gameMode(receipt.actions)!==evidence.mode)failure('保存したゲーム受領のhash・実行分類が元証跡と一致しません。');
  const execution=await rebuildGameExecution(project,evidence,worldSnapshots),pkg=execution;
  if(receipt.runtimeProjectHash!==execution.runtimeProjectHash)failure('保存したゲーム受領の実行内容が元の固定公開版と一致しません。');
  await verifyExecutionReceipt(pkg,receipt);
 }
}
