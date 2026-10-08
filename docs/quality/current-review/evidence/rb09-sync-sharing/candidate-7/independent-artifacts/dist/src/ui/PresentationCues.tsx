import { useState } from 'react';
import type { ContentAnchor, Entity, ProjectData, RuntimeState } from '../domain/types';
import { adoptedRecord } from '../domain/adoption';
import { presentationAnchorApplies, type PresentationTarget } from '../domain/presentation';
import { reuseExecutionAnchor } from '../domain/reuse';
import { AssetPreview } from './AssetPreview';
import { labelOf, RichTextView } from './Fields';
import { ListPager, useListWindow } from './ListWindow';

/** Display follows the shared presentation contract; it never fires runtime/game effects. */
export function PresentationCues({project,state,target,onOpenTarget}:{project:ProjectData;state:RuntimeState;target:PresentationTarget;onOpenTarget:(anchor:ContentAnchor)=>void}) {
 const key=`scenario-show-cues:v1:${project.projectId}`;
 const [visible,setVisible]=useState(()=>{try{return localStorage.getItem(key)==='true';}catch{return false;}});
 const records=project.entities.filter((entity):entity is Entity<'cue'|'storyboard_frame'>=>['cue','storyboard_frame'].includes(entity.kind)&&adoptedRecord(entity)).filter(entity=>presentationAnchorApplies(project,state,reuseExecutionAnchor(project,entity.data.anchor,entity.id),target,entity.id));
 const page=useListWindow({items:records,scope:`${key}:${target.nodeId??target.sceneId}`});
 return <section className="presentation-cues"><label className="check-label"><input type="checkbox" checked={visible} onChange={event=>{setVisible(event.target.checked);try{localStorage.setItem(key,String(event.target.checked));}catch{/* The display choice is still kept during this view. */}}}/>演出・絵コンテを表示</label>{visible&&<><p>この提示位置の演出 {records.length}件。再生は各素材の操作で行います。</p>{page.items.map(entity=>{
  const anchor=reuseExecutionAnchor(project,entity.data.anchor,entity.id),ids=entity.kind==='cue'?[entity.data.attachmentId]:[entity.data.referenceAssetId,entity.data.finalAssetId],assets=ids.filter((id):id is string=>!!id).map(id=>project.entities.find((record):record is Entity<'attachment'>=>record.id===id&&record.kind==='attachment'&&adoptedRecord(record)));
  return <article key={entity.id}><h4>{labelOf(entity)}</h4><button type="button" className="text-button" onClick={()=>onOpenTarget(anchor)}>演出の本文位置を開く</button>{entity.kind==='cue'?<><p>{entity.data.cueType} · 話者 {entity.data.speakerId?labelOf(project.entities.find(record=>record.id===entity.data.speakerId)):'未指定'} · 演出 {entity.data.mediaTime??0} ms · 間 {entity.data.waitMs??0} ms</p>{entity.data.expression&&<p>表情 {entity.data.expression}</p>}{entity.data.camera!=null&&<p>カメラ {JSON.stringify(entity.data.camera)}</p>}{!entity.data.attachmentId&&<p className="field-hint">素材は未指定です。本文は引き続き読めます。</p>}</>:<><p>絵コンテ {entity.data.mediaStartMs}〜{entity.data.mediaEndMs??'未定'} ms</p><RichTextView value={entity.data.caption??[]} onOpenTarget={onOpenTarget}/></>}{assets.map((asset,index)=>asset?<div key={asset.id}><p>{asset.data.stage==='temporary'?'仮素材':asset.data.stage==='final'?'完成素材':'参考資料'}</p><AssetPreview entity={asset}/></div>:<p key={index} role="status">参照した素材の情報がありません。本文は引き続き読めます。</p>)}</article>;
 })}<ListPager {...page} label="提示演出"/></>}</section>;
}
