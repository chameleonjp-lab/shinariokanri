import {useScenarioStore,useAuthorScope} from './StoreContext';
import { useEffect } from 'react';
import { authorField, useAuthorField } from './authorOperation';
import type { ContentAnchor, Entity, ProjectData, RuntimeContext } from '../domain/types';
import { checkProductionRules, productionCheckView, type ProductionCheck } from '../domain/productionChecks';
import { materialAvailability } from '../domain/materials';
import { adoptedRecord } from '../domain/adoption';
import { captureRuntimeContent } from '../domain/runtimeVersions';
import { replaySavedTraceVerified } from '../domain/runtimeVerified';
import { replayChapterReading } from '../domain/presentation';
import { createEntity } from '../domain/model';
import { createWorldSnapshot } from '../domain/world';
import { isTick } from '../domain/time';
import { labelOf } from './Fields';
import { PagedSelect } from './PagedSelect';
import { ListPager, useListWindow } from './ListWindow';
export function ProductionReviewPanel({project,onOpen,onOpenTarget,onSaveProject}:{project:ProjectData;onOpen:(id:string)=>void;onOpenTarget?:(anchor:ContentAnchor)=>void;onSaveProject?:(project:ProjectData,reason:string)=>Promise<ProjectData>}) {
  const scenarioStore=useScenarioStore();
 const key=useAuthorScope(`production-check:v1:${project.projectId}`);
 const [tick,setTick]=useAuthorField(key,'tick',()=>{try{return JSON.parse(localStorage.getItem(key)??'{}').tick??'';}catch{return '';}}),[traceId,setTrace]=useAuthorField(key,'traceId',()=>{try{return JSON.parse(localStorage.getItem(key)??'{}').traceId??'';}catch{return '';}});
 const [report,setReport]=useAuthorField<{source:ProjectData;sourceVersionId:string;baseRevision:string;checks:ProductionCheck[]}|null>(key,'report',null),[busy,setBusy]=useAuthorField(key,'busy',false),[error,setError]=useAuthorField(key,'error',''),[notice,setNotice]=useAuthorField(key,'notice',''),[available,setAvailable]=useAuthorField<Set<string>|null>(key,'available',null);
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify({tick,traceId}));}catch{/* Input still remains in the view. */}},[key,tick,traceId]);
 useEffect(()=>{let live=true;setAvailable(null);void scenarioStore.availableAssetHashes().then(hashes=>{if(live)setAvailable(hashes);}).catch(cause=>{if(live)setError((cause as Error).message);});return()=>{live=false;};},[project.revision]);
 const matches=useListWindow({items:report?.checks??[],scope:`${key}:checks`}),materials=useListWindow({items:available?materialAvailability(project,available).map(row=>({...row,id:row.entity.id})):[],scope:`${key}:materials`});
 const stale=!!report&&report.baseRevision!==project.revision;
 const [savedRevision,setSavedRevision]=useAuthorField<string|null>(key,'savedRevision',null);
 useEffect(()=>{if(savedRevision&&BigInt(project.revision)>=BigInt(savedRevision)){setSavedRevision(null);setBusy(false);setNotice('対象版と本文位置を保持した指摘を端末内に保存し、表示版を確認しました。');}},[key,project.revision,savedRevision]);
 async function inspect(){if(busy)return;setBusy(true);setError('');setNotice('');const captured=structuredClone({...project,history:[]});try{
  if(tick&&!isTick(tick))throw new Error('検査時点は整数の世界内tickで指定してください。');
  const worlds=await scenarioStore.listWorldSnapshots(),registry=Object.fromEntries(Object.values(worlds).flatMap(world=>world.snapshots.map(snapshot=>[snapshot.id,snapshot.content])));
  let source=await captureRuntimeContent(captured,captured.projectId,{worldSnapshots:registry}),version=source.projectId,context:RuntimeContext|undefined;
  if(traceId){const trace=captured.entities.find((entity):entity is Entity<'trace'>=>entity.id===traceId&&entity.kind==='trace'&&adoptedRecord(entity));if(!trace)throw new Error('選んだ経路がありません。');const checkpoint=captured.entities.find((entity):entity is Entity<'checkpoint'>=>entity.id===trace.data.startCheckpointId&&entity.kind==='checkpoint');if(!checkpoint)throw new Error('経路の開始状態がありません。');
   const session=trace.data.mode==='chapters'?await replayChapterReading(captured,trace.data,checkpoint.data,{worldSnapshots:registry}):await replaySavedTraceVerified(captured,trace.id,registry);
   if(session.issues.length)throw new Error(session.issues.map(issue=>issue.message).join(' '));source=session.content;version=trace.data.contentVersionId;context={state:session.state,entities:source.entities,externalValues:session.externalValues,ruleContext:{projectId:source.projectId,worldTick:tick||trace.data.initialWorldTick||undefined,sourceVersionId:version}};
  }
  const production=await productionCheckView(source,registry,Object.values(worlds).flatMap(world=>world.snapshots),version),{verifiedVersionIds,mapAnchor,worldContext}=production;source=production.project;
  if(context)context={...context,entities:source.entities};
  setReport({source,sourceVersionId:version,baseRevision:captured.revision,checks:checkProductionRules(source,{at:tick||undefined,context,presentationIds:context?.state.seenIds,verifiedVersionIds,mapAnchor,worldContext})});
 }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}}
 async function record(check:ProductionCheck){if(!report||stale||busy||!onSaveProject)return;setBusy(true);setError('');try{let candidate=project,version=report.sourceVersionId;if(version===project.projectId){candidate=await createWorldSnapshot(project,'口調・用語の指摘対象版');version=candidate.snapshots.at(-1)!.id;}const review=createEntity(project.projectId,'review','制作確認候補',{target:{...check.anchor??{entityId:check.lineId},sourceVersionId:check.anchor?.sourceVersionId??version},targetVersionId:check.anchor?.sourceVersionId??version,body:[{id:crypto.randomUUID(),kind:'paragraph',text:[check.message,...check.reasons,check.exceptionReason?`例外の理由: ${check.exceptionReason}`:''].filter(Boolean).join('\n')}],stage:'open'});const saved=await onSaveProject({...candidate,entities:[...candidate.entities,review]},'対象版付き口調・用語の指摘候補を保存');setSavedRevision(saved.revision);}catch(cause){setError((cause as Error).message);}finally{if(!authorField(key,'savedRevision'))setBusy(false);}}
 return <section className="settings-card production-review"><h3>口調・用語・読みの確認</h3><p>台詞・翻訳・字幕の候補を対象期間と経路で確認します。本文は作者が選んで修正します。</p><fieldset disabled={busy}><label>検査時点の世界内tick<input aria-label="検査時点の世界内tick" value={tick} onChange={event=>{setTick(event.target.value);setReport(null);}}/></label><PagedSelect label="検査する経路の対象版" scope={`${key}:traces`} items={project.entities.filter(entity=>entity.kind==='trace'&&adoptedRecord(entity)).map(entity=>({id:entity.id,label:labelOf(entity)}))} value={traceId} onChange={id=>{setTrace(id);setReport(null);}} emptyLabel="現在稿・経路条件は未選択"/><button type="button" className="button secondary" onClick={()=>void inspect()}>口調・用語の候補を検査</button></fieldset>
 {report&&<><p>対象作品版 {report.sourceVersionId} · revision {report.source.revision} · 候補 {report.checks.length}件 · 未確認 {report.checks.filter(check=>check.value==='unknown').length}件</p>{stale&&<p role="alert">候補検査の後に作品が更新されました。入力を保持して再検査してください。</p>}{matches.items.map(check=><article key={check.id}><p>{check.value==='unknown'?'対象条件が未確認':'対象条件を照合した作者確認候補'} · {check.message}</p>{check.reasons.map(reason=><p key={reason}>{reason}</p>)}{check.sourceAnchor&&<button type="button" className="text-button" onClick={()=>onOpenTarget?.(check.sourceAnchor!)}>固定版の元台詞を開く</button>}{check.exceptionReason&&<p>作者が宣言した例外: {check.exceptionReason}</p>}<button type="button" className="text-button" onClick={()=>onOpenTarget?onOpenTarget({...check.anchor??{entityId:check.lineId},sourceVersionId:check.anchor?.sourceVersionId??(report.sourceVersionId===project.projectId?undefined:report.sourceVersionId)}):onOpen(check.lineId)}>対象の本文位置を開く</button><button type="button" className="text-button" onClick={()=>check.ruleAnchor?.sourceVersionId?onOpenTarget?.(check.ruleAnchor):report.sourceVersionId===project.projectId?onOpen(check.ruleId):onOpenTarget?.({entityId:check.ruleId,sourceVersionId:report.sourceVersionId})}>口調・用語の根拠を開く</button>{onSaveProject&&<button type="button" className="button secondary small" disabled={busy||stale} onClick={()=>void record(check)}>候補を指摘として保存</button>}</article>)}<ListPager {...matches} label="制作確認候補"/></>}
 <h3>資料・仮素材・完成素材と不足</h3>{available===null?<p role="status">素材の取得状況を確認中…</p>:<><p>bytes不足 {materials.total?materialAvailability(project,available).filter(row=>row.bytes==='missing').length:0}件。metadataだけの素材は完全取得に数えません。</p>{materials.items.map(row=><p key={row.id}><button className="text-button" onClick={()=>onOpen(row.id)}>{labelOf(row.entity)}</button> · {row.stage==='temporary'?'仮素材':row.stage==='final'?'完成素材':'参考資料'} · {row.bytes==='available'?'bytesあり':'bytes不足'}</p>)}<ListPager {...materials} label="素材取得状況"/></>}{busy&&<p role="status">対象版と制作候補を検査・保存中…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
}
