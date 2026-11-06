import {useMemo,useState} from 'react';
import {characterImpactReviews} from '../domain/changeReviews';
import {findCharacterMentionCandidates} from '../domain/linkCandidates';
import {fieldText} from './components';
import {labelOf} from './Fields';
import {PagedSelect} from './PagedSelect';
import {ListPager,useListWindow} from './ListWindow';
import type { ContentAnchor, Entity, ProjectData } from '../domain/types';
import { adoptedRecord } from '../domain/adoption';

export function ProductionSourceLinks({project,entity,onOpenTarget}:{project:ProjectData;entity:Entity;onOpenTarget:(anchor:ContentAnchor)=>void}) {
  if(entity.kind==='storyboard_frame')return <button type="button" className="button secondary" onClick={()=>onOpenTarget(entity.data.anchor)}>絵コンテの元の行へ戻る</button>;
  if(entity.kind!=='dialogue_line')return null;
  const frames=project.entities.filter((e):e is Entity<'storyboard_frame'>=>e.kind==='storyboard_frame'&&adoptedRecord(e)&&(!e.data.anchor.sourceVersionId||e.data.anchor.sourceVersionId===project.projectId)&&(e.data.anchor.lineId??e.data.anchor.entityId)===entity.id);
  return <>{entity.data.sourceAnchor&&<button type="button" className="button secondary" onClick={()=>onOpenTarget(entity.data.sourceAnchor!)}>元の段落・対応する台詞へ</button>}{frames.map(frame=><button type="button" className="button secondary" key={frame.id} onClick={()=>onOpenTarget({entityId:frame.id})}>対応する絵コンテ: {frame.name}</button>)}</>;
}


/** The diagram uses the same paged task set as the complete, keyboard-accessible list. */
export function ProductionDependencies({ tasks, onOpen }: { tasks: Entity<'production_task'>[]; onOpen: (id: string) => void }) {
  const positions = new Map(tasks.map((task, index) => [task.id, 30 + index * 58]));
  const edges = tasks.flatMap(task => (task.data.dependsOn ?? []).flatMap(id => positions.has(id) ? [{ from: id, to: task.id }] : []));
  return <details className="settings-card"><summary>制作依存図・現在のページ {tasks.length}件</summary>
    <div style={{ maxHeight: '32rem', overflow: 'auto' }}><svg role="img" aria-label="制作タスクの先行関係" viewBox={`0 0 620 ${Math.max(80, tasks.length * 58 + 20)}`} style={{ width: '100%', minWidth: 320 }}>
      <defs><marker id="production-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>
      {edges.slice(0, 120).map((edge, index) => <path key={`${edge.from}:${edge.to}`} d={`M 150 ${positions.get(edge.from)} C ${20 + index % 8 * 10} ${positions.get(edge.from)}, ${20 + index % 8 * 10} ${positions.get(edge.to)}, 150 ${positions.get(edge.to)}`} fill="none" stroke="currentColor" markerEnd="url(#production-arrow)"><title>{tasks.find(task => task.id === edge.from)?.name} → {tasks.find(task => task.id === edge.to)?.name}</title></path>)}
      {tasks.map(task => <g key={task.id}><rect x="150" y={positions.get(task.id)! - 19} width="440" height="38" rx="8" fill="var(--surface, white)" stroke="currentColor"/><text x="164" y={positions.get(task.id)! + 5} fill="currentColor">{task.name.slice(0, 28)} · {task.data.stage}/{task.data.progress}</text></g>)}
    </svg></div>
    {edges.length > 120 && <p>図は先頭120接続を表示。全先行関係は各タスクの一覧から確認できます。</p>}
    <p>別ページの先行作業は下の対象リンクから開けます。図の省略は依存完了を意味しません。</p>
    {tasks.map(task => <p key={task.id}><button onClick={() => onOpen(task.id)}>{task.name}</button>{(task.data.dependsOn ?? []).map(id => <button key={id} onClick={() => onOpen(id)}>先行 {tasks.find(target => target.id === id)?.name ?? '別ページの作業'}</button>)}</p>)}
  </details>;
}

/** The same saved review entities are used by catalog and production tools. */
export function CharacterImpactReviews({project,onOpen,onOpenTarget,onSave}:{project:ProjectData;onOpen:(id:string)=>void;onOpenTarget:(anchor:ContentAnchor,fieldPath?:string)=>void;onSave:(entity:Entity)=>Promise<Entity>}){
 const [characterId,setCharacterId]=useState(''),[showMentions,setShowMentions]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const reviews=useMemo(()=>characterImpactReviews(project,characterId),[project,characterId]);
 const rows=useListWindow({items:reviews,scope:`character-impact:${project.projectId}:${characterId}`});
 const mentions=useMemo(()=>showMentions&&characterId?findCharacterMentionCandidates(project,characterId):[],[showMentions,characterId,project]);
 const candidates=useListWindow({items:mentions,scope:`character-impact:${project.projectId}:${characterId}:mentions`});
 async function confirm(review:Entity<'review'>,stage:Entity<'review'>['data']['stage']){
  if(busy)return;setBusy(true);setError('');try{await onSave({...review,data:{...review.data,stage},customValues:{...review.customValues,...stage!=='open'?{'changeReview.reviewedRevision':String(review.customValues['changeReview.projectRevision']??project.revision),'changeReview.reviewedTargetRevision':String(review.customValues['changeReview.targetRevision']??'不明')}:{} }});}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
 }
 return <section aria-label="人物設定の変更による見直し"><h2>変更による見直し</h2><p>IDでつながる場面を先に表示します。確認状態と確認対象の版を保存し、本文は自動変更しません。</p>
  <PagedSelect label="変更の影響を確認する人物" scope={`character-impact:${project.projectId}:people`} value={characterId} items={project.entities.filter(entity=>entity.kind==='character'&&!entity.deletedAt).map(entity=>({id:entity.id,label:`${labelOf(entity)} · ${entity.id.slice(-6)}`}))} emptyLabel="すべての変更" onChange={id=>{setCharacterId(id);setShowMentions(false);}}/>
  {error&&<p role="alert">{error}</p>}
  {rows.items.map(review=><article key={review.id}><h3>{labelOf(review)} · {review.data.stage==='open'?'確認待ち':review.data.stage==='fixed'?'対応済み':'再確認済み'}</h3><p>{fieldText(review.data.body)}</p>{review.data.quotedText&&<blockquote>{review.data.quotedText}</blockquote>}<p>確認対象の作品改訂 {String(review.customValues['changeReview.projectRevision']??'未記録')} · 場面の改訂 {String(review.customValues['changeReview.targetRevision']??'未記録')}{review.customValues['changeReview.reviewedRevision']&&` · 前回確認した作品改訂 ${String(review.customValues['changeReview.reviewedRevision'])}`}</p>
   <button className="reference-link" onClick={()=>{const target=review.data.target;if(typeof target==='string')onOpen(target);else onOpenTarget(target);}}>見直す箇所を開く</button>
   <select aria-label={`${labelOf(review)}の対応状態`} value={review.data.stage} disabled={busy} onChange={event=>void confirm(review,event.target.value as Entity<'review'>['data']['stage'])}><option value="open">確認待ち</option><option value="fixed">対応済み</option><option value="verified">再確認済み</option></select>
   <button className="text-button" onClick={()=>onOpen(review.id)}>理由と解決内容を編集</button></article>)}<ListPager {...rows} label="変更による見直し"/>
  {!reviews.length&&<p>この人物に関係する保存済みの変更確認はありません。</p>}
  {characterId&&<><button type="button" className="button secondary" aria-expanded={showMentions} onClick={()=>setShowMentions(value=>!value)}>単語だけ一致した候補を{showMentions?'閉じる':'確認'}</button>{showMentions&&<section aria-label="単語だけ一致した候補"><p>同名の別人の可能性があります。IDによる参照や確認済みの場面とは別に扱います。</p>{candidates.items.map(hit=><article key={hit.id}><h3>{hit.sourceName||'無題'}</h3><blockquote>{hit.context}</blockquote><button className="reference-link" onClick={()=>onOpenTarget(hit.anchor,hit.fieldPath)}>候補の文章を開く</button></article>)}<ListPager {...candidates} label="単語だけ一致した候補"/>{!mentions.length&&<p>単語だけ一致した候補はありません。</p>}</section>}</>}
 </section>;
}
