import 'fake-indexeddb/auto';
import {beforeAll,afterEach,describe,it,expect} from 'vitest';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createProject,createEntity,newId,textToRichText,validateProject,emptyRuntimeState} from '../src/domain/model';
import {createWorldSnapshot} from '../src/domain/world';
import {previewDialogueChange,confirmDialogueChange,previewSourceApproval,confirmSourceApproval} from '../src/domain/productionWorkflow';
import {dialogueContentHash,pendingSourceHashes} from '../src/domain/production';
import {previewMaterial,confirmMaterial,materialUsers} from '../src/domain/materials';
import {prepareAsset} from '../src/domain/attachments';
import {checkProductionRules} from '../src/domain/productionChecks';
import {exportProject} from '../src/domain/exports';
import {ScenarioStore} from '../src/storage/store';
import {inspectScenario} from '../src/storage/archive';
import type {ProjectData,Entity} from '../src/domain/types';
const output='/tmp/shinariokanri-independent-rb07-297f19a/independent/fixtures',stores:ScenarioStore[]=[],names=new Map<ScenarioStore,string>();
const wav=new Uint8Array(readFileSync('tests/fixtures/media/fixture-tone.wav'));
const nextWav=new Uint8Array(wav);nextWav[nextWav.length-1]^=1;
const db=(fault?:()=>void)=>{const databaseName='independent-rb07-'+newId(),store=new ScenarioStore({databaseName,faultInjector:stage=>{if(stage==='before-commit')fault?.();}});stores.push(store);names.set(store,databaseName);return store;};
afterEach(async()=>{for(const store of stores.splice(0))await store.deleteDatabase();});
let base:{project:ProjectData;ids:Record<string,string>};
const get=<K extends Entity['kind']>(p:ProjectData,key:string,kind:K):Entity<K>=>{const e=p.entities.find(e=>e.id===base.ids[key]);if(e?.kind!==kind)throw Error('invalid fixture '+key);return e as Entity<K>;};
const fresh=()=>structuredClone(base.project);
const report=(id:string,actual:unknown)=>writeFileSync(output+'/'+id+'.json',JSON.stringify(actual,null,2)+'\n');
const copyProject=(p:ProjectData)=>{const candidate:ProjectData=structuredClone({...p,history:[]});candidate.history=p.history;return candidate;};
beforeAll(async()=>{
 const path=output+'/original-production.json';
 if(existsSync(path)){base=JSON.parse(readFileSync(path,'utf8'));return;}
 let p=createProject('独立RB07 境界と旧対応');
 const speaker=createEntity(p.projectId,'character','話者ヒカリ'),other=createEntity(p.projectId,'character','話者ユキ');
 const chapter=createEntity(p.projectId,'chapter','独立章'),blockId=newId();
 const line=createEntity(p.projectId,'dialogue_line','独立原台詞',{speakerId:speaker.id,text:[{id:blockId,kind:'paragraph',text:'😀鍵を開く。',ruby:[{start:1,end:2,text:'かぎ'}],links:[{start:3,end:5,target:{entityId:other.id}}]}]});
 const second=createEntity(p.projectId,'dialogue_line','独立次台詞',{speakerId:speaker.id,text:textToRichText('また後で。')});
 const scene=createEntity(p.projectId,'scene','独立使用場面A',{chapterId:chapter.id,body:textToRichText('A本文'),dialogueLineIds:[line.id,second.id]});
 const otherScene=createEntity(p.projectId,'scene','独立使用場面B',{chapterId:chapter.id,body:textToRichText('B本文'),dialogueLineIds:[line.id,second.id]});chapter.data.sceneIds=[scene.id,otherScene.id];
 const source=createEntity(p.projectId,'source','独立音声資料',{sourceType:'file',locator:'作者が作成した短いPCM',accessedAt:'2026-10-08T11:00:00Z',excerptLocation:'0〜250ms',interpretation:textToRichText('作者の解釈'),redistributionAllowed:true});
 const asset=await prepareAsset(wav,'独立旧音声.wav'),attachment=createEntity(p.projectId,'attachment','独立旧音声',{mediaType:asset.mediaType,contentHash:asset.contentHash,byteSize:asset.byteSize,assetPath:asset.assetPath,displayName:asset.displayName,stage:'temporary',provenanceId:source.id,licenseNote:'作者作成'});source.data.attachmentId=attachment.id;
 const cue=createEntity(p.projectId,'cue','独立右位置演出',{anchor:{entityId:line.id,lineId:line.id,blockId,start:3,end:5},cueType:'sound',attachmentId:attachment.id,speakerId:speaker.id,mediaTime:1000,waitMs:250,stage:'reviewed',camera:'固定カメラ'});line.data.cueIds=[cue.id];
 const frame=createEntity(p.projectId,'storyboard_frame','独立演出依存コマ',{anchor:{entityId:line.id,lineId:line.id,blockId,start:3,end:5},mediaStartMs:1000,mediaEndMs:1200,cueIds:[cue.id],caption:textToRichText('😀カギを開く')});
 p.entities.push(speaker,other,chapter,line,second,scene,otherScene,source,attachment,cue,frame);p.entities.forEach(e=>e.status='confirmed');
 const sourceHash=await dialogueContentHash(p,line),reviewerId=newId();
 const loc=createEntity(p.projectId,'localization','独立翻訳',{sourceLineId:line.id,language:'en',sourceHash,text:textToRichText('😀カギを開く translated.'),stage:'reviewed',reviewedBy:reviewerId});
 const recording=createEntity(p.projectId,'recording','独立収録',{sourceLineId:line.id,language:'ja',sourceHash,attachmentId:attachment.id,stage:'reviewed',reviewedBy:reviewerId});loc.status=recording.status='confirmed';p.entities.push(loc,recording);
 p=await createWorldSnapshot(p,'独立変更前固定版');
 const pin=p.snapshots.at(-1)!.id,review=createEntity(p.projectId,'review','独立旧pin引用',{target:{entityId:line.id,lineId:line.id,blockId,start:3,end:5,sourceVersionId:pin},targetVersionId:pin,body:textToRichText('旧版への指摘'),stage:'open'});review.status='confirmed';p.entities.push(review);
 base={project:p,ids:Object.fromEntries(Object.entries({speaker,other,chapter,line,second,scene,otherScene,source,attachment,cue,frame,loc,recording,review}).map(([k,e])=>[k,e.id]).concat([['blockId',blockId],['pin',pin],['reviewerId',reviewerId]]))};
 const check=validateProject(p);if(!check.ok)throw Error(JSON.stringify(check.issues));expect(check.ok).toBe(true);writeFileSync(path,JSON.stringify(base,null,2)+'\n');
});
describe('Independent RB07 semantic boundaries, original contract retained',()=>{
 it('R7D01 split updates every ordinary use, relocates Unicode cue once, quota refuses atomically; cold/archive/clone keep old pin and lineage',async()=>{
  let fail=false;const store=db(()=>{if(fail)throw new DOMException('independent quota','QuotaExceededError');});let p=(await store.saveProject(fresh(),{reason:'独立元保存',assets:[await prepareAsset(wav,'独立旧音声.wav')]})).project;
  const plan=await previewDialogueChange(p,{mode:'split',sourceIds:[base.ids.line],blockId:base.ids.blockId,offset:3,reason:'独立Unicode分割'}),candidate=await confirmDialogueChange(p,plan);
  const parts=plan.newLineIds.map(id=>candidate.entities.find(e=>e.id===id)!);expect(parts.map(e=>e.kind==='dialogue_line'&&e.data.text[0].text)).toEqual(['😀鍵を','開く。']);
  for(const key of ['scene','otherScene'])expect(get(candidate,key,'scene').data.dialogueLineIds).toEqual([...plan.newLineIds,base.ids.second]);
  expect(parts.map(e=>e.kind==='dialogue_line'&&e.data.cueIds)).toEqual([[],[base.ids.cue]]);expect(get(candidate,'cue','cue').data.anchor).toMatchObject({lineId:plan.newLineIds[1],start:0,end:2});expect(get(candidate,'review','review')).toEqual(get(p,'review','review'));
  fail=true;const outbox=await store.listOutbox(p.projectId);await expect(store.saveProject(candidate,{reason:'分割保存'})).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});expect(await store.getProject(p.projectId)).toEqual(p);expect(await store.listOutbox(p.projectId)).toEqual(outbox);fail=false;
  const saved=(await store.saveProject(candidate,{reason:'分割再試行'})).project;for(const key of ['loc','recording'])expect(get(saved,key,key==='loc'?'localization':'recording').data).toMatchObject({stage:'needs_review',reviewedBy:base.ids.reviewerId});expect(saved.snapshots).toEqual(p.snapshots);
  store.close();const cold=new ScenarioStore({databaseName:names.get(store)!});stores.push(cold);expect(await cold.getProject(p.projectId)).toEqual(saved);
  const bytes=await cold.exportProject(saved.projectId),prepared=await inspectScenario(bytes,{worker:false}),target=db(),restored=(await target.importScenario(prepared,{mode:'new'})).project;expect(restored).toEqual(saved);const clone=(await db().importScenario(prepared,{mode:'clone'})).project;expect(validateProject(clone).ok).toBe(true);const cloned=clone.entities.find(e=>e.kind==='dialogue_line'&&e.data.lineage?.mode==='split');expect(cloned?.kind==='dialogue_line'&&cloned.data.lineage?.segments[0].source.entityId).not.toBe(base.ids.line);
  report('R7D01',{parts:parts.map(e=>({id:e.id,data:e.data})),savedRevision:saved.revision,cloneValid:validateProject(clone).ok,oldSnapshotsUnchanged:true});writeFileSync(output+'/split-saved.scenario',bytes);
 });
 it('R7D02 previous copy lineage retains its original source after originals are merged',async()=>{
  const store=db();let p=(await store.saveProject(fresh(),{reason:'原台詞',assets:[await prepareAsset(wav,'独立旧音声.wav')]})).project;
  const copied=await previewDialogueChange(p,{mode:'copy',sourceIds:[base.ids.line],reason:'独立コピー'});p=(await store.saveProject(await confirmDialogueChange(p,copied),{reason:'独立コピー保存'})).project;
  const before=p.entities.find(e=>e.id===copied.newLineIds[0])!;const source=before.kind==='dialogue_line'?before.data.lineage?.segments[0].source:undefined;
  const merged=await previewDialogueChange(p,{mode:'merge',sourceIds:[base.ids.line,base.ids.second],reason:'元台詞の統合'}),candidate=await confirmDialogueChange(p,merged),after=candidate.entities.find(e=>e.id===before.id)!;
  report('R7D02',{oldSource:source,newSource:after.kind==='dialogue_line'?after.data.lineage?.segments[0].source:undefined,newMergedLine:merged.newLineIds[0],candidateValid:validateProject(candidate).ok});
  expect(after.kind==='dialogue_line'&&after.data.lineage?.segments[0].source).toEqual(source);
 });
 it('R7D03 all-use adjacency and ruby/link interior/empty/bounds are safe refusals',async()=>{
  const p=fresh();for(const offset of [-1,0,4,6,100,NaN])await expect(previewDialogueChange(p,{mode:'split',sourceIds:[base.ids.line],blockId:base.ids.blockId,offset,reason:'境界'})).rejects.toThrow();
  get(p,'otherScene','scene').data.dialogueLineIds=[base.ids.second,base.ids.line];await expect(previewDialogueChange(p,{mode:'merge',sourceIds:[base.ids.line,base.ids.second],reason:'全使用先不一致'})).rejects.toThrow('隣接');
  await expect(previewDialogueChange(fresh(),{mode:'merge',sourceIds:[base.ids.line,base.ids.line],reason:'重複'})).rejects.toThrow('重複');
 });
 it('R7D04 rename/order alone keep hash; text/ruby/speaker/cue and entity restore require review without changing IDs/reviewer',async()=>{
  const store=db();let p=(await store.saveProject(fresh(),{reason:'基底',assets:[await prepareAsset(wav,'独立旧音声.wav')]})).project;const originalOp=p.history[0].operationId;
  const renamed=copyProject(p);get(renamed,'speaker','character').name='話者改名';renamed.entities.reverse();p=(await store.saveProject(renamed,{reason:'改名・並替え'})).project;expect((await pendingSourceHashes(p)).every(x=>!x.stale)).toBe(true);expect(get(p,'loc','localization').data.stage).toBe('reviewed');
  for(const mode of ['text','ruby','speaker','cue']as const){const edited=copyProject(p),line=get(edited,'line','dialogue_line');if(mode==='text')line.data.text[0].text='😀鍵を閉く。';if(mode==='ruby')line.data.text[0].ruby![0].text='けん';if(mode==='speaker')line.data.speakerId=base.ids.other;if(mode==='cue')get(edited,'cue','cue').data.waitMs=500;p=(await store.saveProject(edited,{reason:'変更 '+mode})).project;expect(get(p,'loc','localization').data.stage).toBe('needs_review');expect(get(p,'recording','recording').data.stage).toBe('needs_review');const plan=await previewSourceApproval(p,base.ids.loc);p=(await store.saveProject(await confirmSourceApproval(p,plan),{reason:'原文を確認'})).project;expect(get(p,'loc','localization').data.stage).toBe('reviewed');}
  p=(await store.restoreEntity(p.projectId,originalOp,base.ids.line,'after',p.revision)).project;expect(get(p,'loc','localization').data.stage).toBe('needs_review');expect(get(p,'loc','localization').data.reviewedBy).toBe(base.ids.reviewerId);expect(get(p,'line','dialogue_line').id).toBe(base.ids.line);
 });
 it('R7D05 fresh hash approval accepts only exact source/deliverable/revision; stage-only old hash remains review',async()=>{
  const store=db();let p=(await store.saveProject(fresh(),{reason:'基底',assets:[await prepareAsset(wav,'独立旧音声.wav')]})).project;const next=copyProject(p);get(next,'line','dialogue_line').data.text[0].text='😀鍵を閉く。';p=(await store.saveProject(next,{reason:'本文改訂'})).project;const plan=await previewSourceApproval(p,base.ids.loc);
  await expect(confirmSourceApproval({...p,revision:'999'},plan)).rejects.toThrow('確認後');await expect(confirmSourceApproval(p,{...plan,sourceHash:'0'.repeat(64)})).rejects.toThrow('確認後');const changed=copyProject(p);get(changed,'loc','localization').data.text[0].text='Later translation';await expect(confirmSourceApproval(changed,plan)).rejects.toThrow('確認後');
  const raw=copyProject(p);get(raw,'loc','localization').data.stage='reviewed';p=(await store.saveProject(raw,{reason:'旧hash手動承認'})).project;expect(get(p,'loc','localization').data.stage).toBe('needs_review');const current=await previewSourceApproval(p,base.ids.loc);p=(await store.saveProject(await confirmSourceApproval(p,current),{reason:'現在hash承認'})).project;expect(get(p,'loc','localization').data).toMatchObject({stage:'reviewed',sourceHash:await dialogueContentHash(p,get(p,'line','dialogue_line'))});
 });
 it('R7D06 replacing a cue material also marks the dependent storyboard frame for review',async()=>{
  const store=db();const p=(await store.saveProject(fresh(),{reason:'素材基底',assets:[await prepareAsset(wav,'独立旧音声.wav')]})).project;
  const plan=await previewMaterial(p,await prepareAsset(nextWav,'独立新音声.wav'),base.ids.attachment,[base.ids.cue]),saved=(await store.saveProject(await confirmMaterial(p,plan),{reason:'演出素材差替え',assets:[plan.asset]})).project;
  report('R7D06',{users:materialUsers(p,base.ids.attachment).map(e=>({id:e.id,kind:e.kind})),cue:get(saved,'cue','cue'),frame:get(saved,'frame','storyboard_frame'),translationStage:get(saved,'loc','localization').data.stage,oldPinUnchanged:JSON.stringify(saved.snapshots)===JSON.stringify(p.snapshots)});
  expect(get(saved,'frame','storyboard_frame').status).toBe('needs_review');expect(saved.snapshots).toEqual(p.snapshots);
 });
 it('R7D07 selected recording only retains all other old references and both versions/bytes in empty archive/clone',async()=>{
  const store=db();const p=(await store.saveProject(fresh(),{reason:'素材基底',assets:[await prepareAsset(wav,'独立旧音声.wav')]})).project;const plan=await previewMaterial(p,await prepareAsset(nextWav,'独立新音声.wav'),base.ids.attachment,[base.ids.recording]);const saved=(await store.saveProject(await confirmMaterial(p,plan),{reason:'録音だけ差替え',assets:[plan.asset]})).project;
  expect(get(saved,'recording','recording').data).toMatchObject({stage:'needs_review',attachmentId:plan.newAttachmentId});expect(get(saved,'cue','cue').data.attachmentId).toBe(base.ids.attachment);expect(get(saved,'source','source').data.attachmentId).toBe(base.ids.attachment);expect(get(saved,'loc','localization').data.stage).toBe('reviewed');expect(saved.snapshots).toEqual(p.snapshots);
  const prepared=await inspectScenario(await store.exportProject(p.projectId),{worker:false});expect(prepared.assets).toHaveLength(2);const empty=db();const restored=(await empty.importScenario(prepared,{mode:'new'})).project;expect(restored).toEqual(saved);expect(await empty.getAsset(plan.asset.contentHash)).toEqual(nextWav);expect(validateProject((await db().importScenario(prepared,{mode:'clone'})).project).ok).toBe(true);
 });
 it('R7D08 material plan captures base/content/replacement input before hashing yields',async()=>{
  const p=fresh();const asset=await prepareAsset(nextWav,'独立新音声.wav'),ids=[base.ids.cue];const pending=previewMaterial(p,asset,base.ids.attachment,ids);
  p.revision='9';p.name='後発変更';ids.push(base.ids.recording);const plan=await pending;report('R7D08',{baseRevision:plan.baseRevision,candidateName:plan.candidate.name,replacementIds:plan.replacementIds});expect(plan.baseRevision).toBe('0');expect(plan.candidate.name).toBe(base.project.name);expect(plan.replacementIds).toEqual([base.ids.cue]);
 });
 it('R7D09 source-approval preview captures its initial revision before awaiting source hash',async()=>{
  const p=fresh();const pending=previewSourceApproval(p,base.ids.loc);p.revision='9';const plan=await pending;report('R7D09',{baseRevision:plan.baseRevision});expect(plan.baseRevision).toBe('0');
 });
 it('R7D10 expired/rejected/unknown rules, literal Unicode and finite exceptions remain author candidates and never rewrite text',()=>{
  const p=fresh(),before=JSON.stringify(p);const term=createEntity(p.projectId,'terminology','独立表記',{canonical:'鍵',variants:['カギ'],reading:'かぎ',validity:{worldRange:{start:'10',end:'20'},routeCondition:null,presentationAnchor:null}});term.status='confirmed';p.entities.push(term);
  expect(checkProductionRules(p,{at:'9'})).toEqual([]);expect(checkProductionRules(p,{at:'20'})).toEqual([]);expect(checkProductionRules(p).some(c=>c.value==='unknown')).toBe(true);const rows=checkProductionRules(p,{at:'10'});expect(rows.find(c=>c.lineId===base.ids.loc&&c.kind==='spelling')?.anchor).toMatchObject({start:1,end:3});term.status='rejected';expect(checkProductionRules(p,{at:'10'})).toEqual([]);term.status='confirmed';
  term.data.validity!.worldRange!.end='30';term.data.exceptions=[{reason:'この章の引用に限る',targetScope:{projectId:p.projectId,chapterId:base.ids.chapter},validity:{worldRange:{start:'10',end:'20'},routeCondition:null,presentationAnchor:{entityId:base.ids.line,blockId:base.ids.blockId}},evidenceIds:[base.ids.source]}];
  const state=emptyRuntimeState(p.projectId);state.seenIds=[base.ids.line,base.ids.blockId];const context={state,entities:p.entities,ruleContext:{projectId:p.projectId,chapterId:base.ids.chapter,worldTick:'15'}};
  expect(checkProductionRules(p,{at:'15',context}).some(c=>c.exceptionReason==='この章の引用に限る')).toBe(true);context.ruleContext.worldTick='20';expect(checkProductionRules(p,{at:'20',context}).some(c=>c.exceptionReason)).toBe(false);get(p,'source','source').status='rejected';expect(checkProductionRules(p,{at:'15',context}).some(c=>c.value==='unknown')).toBe(true);p.entities=p.entities.filter(e=>e.id!==term.id);get(p,'source','source').status='confirmed';expect(JSON.stringify(p)).toBe(before);
 });
 it('R7D11 assignee export uses public text/IDs and does not expose reviewer, identity or author hash; forbidden source redistribution stops assets',async()=>{
  const p=fresh(),assignee=newId(),task=createEntity(p.projectId,'production_task','独立翻訳担当',{targetIds:[base.ids.loc],assigneeId:assignee,stage:'translation',progress:'doing'});task.status='confirmed';p.entities.push(task);
  const include=['speaker','other','line','second','cue','attachment','source','loc','recording'].map(k=>base.ids[k]),profile=createEntity(p.projectId,'projection_profile','独立公開',{audience:'public',publicTitle:'公開翻訳',allowedKinds:['character','dialogue_line','cue','attachment','source','localization','recording'],includedIds:include,idPolicy:'preserve',namePolicy:{defaultPolicy:{mode:'replace',replacement:'公開項目'}},approvedAttachmentIds:[base.ids.attachment],publicTexts:{[base.ids.line]:{text:textToRichText('公開原文')},[base.ids.second]:{text:textToRichText('公開次原文')},[base.ids.loc]:{text:textToRichText('Public translation'),language:'en'},[base.ids.recording]:{language:'ja'},[base.ids.cue]:{cueType:'sound'},[base.ids.attachment]:{displayName:'public.wav'},[base.ids.source]:{locator:'https://example.test/credit',interpretation:[]}}});p.entities.push(profile);expect(validateProject(p).ok).toBe(true);
  const result=await exportProject(p,{profile:'localization',projectionProfileId:profile.id,targetRevision:p.revision,assigneeId:assignee});if(!result.ok)throw Error(JSON.stringify(result.issues));const payload=JSON.parse(result.artifacts[0].content);expect(payload.lines).toHaveLength(1);expect(payload.lines[0].translations).toHaveLength(1);expect(payload.lines[0].recordings).toHaveLength(0);const encoded=JSON.stringify(payload);expect(encoded).not.toContain(assignee);expect(encoded).not.toContain(base.ids.reviewerId);expect(encoded).not.toContain(await dialogueContentHash(p,get(p,'line','dialogue_line')));expect(encoded).not.toContain('😀鍵を開く。');
  expect((await exportProject(p,{profile:'localization',projectionProfileId:profile.id,targetRevision:p.revision,assigneeId:newId()})).ok).toBe(false);get(p,'source','source').data.redistributionAllowed=false;const forbidden=await exportProject(p,{profile:'localization',projectionProfileId:profile.id,targetRevision:p.revision,assigneeId:assignee});report('R7D11',{payload,forbidden});expect(forbidden.ok).toBe(false);
 });
 it('R7D12 stale/hash-forged material approvals and active/oversized files stop without author mutation',async()=>{
  const p=fresh(),before=JSON.stringify(p),asset=await prepareAsset(nextWav,'独立新音声.wav'),plan=await previewMaterial(p,asset,base.ids.attachment,[base.ids.cue]);await expect(confirmMaterial({...p,revision:'999'},plan)).rejects.toThrow('確認後');const forged=structuredClone(plan);forged.asset.bytes[20]^=1;await expect(confirmMaterial(p,forged)).rejects.toThrow();await expect(previewMaterial(p,asset,base.ids.attachment,[base.ids.frame])).rejects.toThrow('参照一覧');
  for(const text of ['<svg onload="x()"></svg>','<!doctype html><script>x()</script>','MZ executable'])await expect(prepareAsset(new TextEncoder().encode(text),'unsafe','application/octet-stream')).rejects.toThrow();await expect(prepareAsset(new Uint8Array(32*1024*1024+1),'oversize')).rejects.toThrow();expect(JSON.stringify(p)).toBe(before);
 });
});
