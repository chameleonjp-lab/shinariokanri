import {useMemo} from 'react';
import type {Entity,ProjectData,Relation} from '../domain/types';
import {Icon} from './components';
import {KIND_LABELS,RELATION_LABELS} from '../domain/model';
import {conditionToText} from '../domain/conditions';
import {labelOf} from './Fields';
import {WindowedList} from './WindowedList';
import {useReferenceRows} from './useReferenceRows';

/** Progress belongs to this derived view, so it cannot redraw the input form. */
export function EntityReferenceSection({project,id,related,onOpen,onTextReferences}:{project:ProjectData;id:string;related:Relation[];onOpen:(id:string)=>void;onTextReferences:()=>void}){
 const read=useReferenceRows(project.entities,id,project.revision,project);
 const hasRouteCondition=related.some(r=>!!r.validity.routeCondition);
 const relationNames=useMemo(()=>hasRouteCondition?Object.fromEntries(project.entities.map(e=>[e.id,labelOf(e)])):{},[project.entities,hasRouteCondition]);
 if(!related.length&&!read.rows.length&&read.phase==='ready')return null;
 return <section className="references-section"><h3>この情報への参照</h3>
  {read.phase!=='ready'&&<div className="reference-index-progress"><button type="button" className="text-button" onClick={read.phase==='loading'?read.cancel:read.retry}>{read.phase==='loading'?'参照の確認を中止':'参照の確認を再試行'}</button><p role="status">{read.phase==='loading'?`参照を確認中 · ${read.completed} / ${read.total}`:read.phase==='canceled'?'参照の確認を中止しました。入力は保持しています。':'参照を確認できませんでした。入力は保持しています。'}</p></div>}
  <button type="button" className="text-button" onClick={onTextReferences}>本文からの参照位置を表示</button>
  <WindowedList items={related} scope={`entity-relations:${project.projectId}:${id}`} label="この情報の関係" render={r=><p key={r.id}>{labelOf(project.entities.find(e=>e.id===r.fromId))} {r.direction==='symmetric'?'↔':'→'} {labelOf(project.entities.find(e=>e.id===r.toId))}<span className="field-hint">{RELATION_LABELS[r.relationType]??r.relationType} · 有効時期：{r.validity.worldRange?`${r.validity.worldRange.start===null?'開始指定なし':r.validity.worldRange.start+' tick'} 〜 ${r.validity.worldRange.end===null?'終了指定なし':r.validity.worldRange.end+' tick'}（開始を含み終了を含まない）`:'指定なし'}{r.validity.routeCondition&&` · 経路条件：${conditionToText(r.validity.routeCondition,relationNames)}`}</span></p>}/>
  {read.phase==='ready'&&<WindowedList items={read.rows} scope={`entity-references:${project.projectId}:${id}`} label="この情報への参照" searchText={(e:Entity)=>labelOf(e)} render={e=><button type="button" key={e.id} className="reference-link" onClick={()=>onOpen(e.id)}><Icon name="link" size={16}/>{labelOf(e)}<small>{KIND_LABELS[e.kind]}</small></button>}/>}</section>;
}
