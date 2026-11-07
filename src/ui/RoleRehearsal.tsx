import { useMemo, useState } from 'react';
import type { ContentAnchor, ProjectData } from '../domain/types';
import { rehearsalTurns } from '../domain/videoScript';
import { adoptedRecord } from '../domain/adoption';
import { labelOf, RichTextView } from './Fields';
import { PagedSelect } from './PagedSelect';

/** All practice state belongs to this view, never a project, recording or author draft. */
export function RoleRehearsal({project,lineIds,vertical=false,onOpenTarget}:{project:ProjectData;lineIds:string[];vertical?:boolean;onOpenTarget:(anchor:ContentAnchor)=>void}) {
  const [speaker,setSpeaker]=useState(''),[position,setPosition]=useState(0),[revealed,setRevealed]=useState(false);
  const byId=useMemo(()=>new Map(project.entities.map(e=>[e.id,e])),[project]);
  const speakers=useMemo(()=>[...new Set(lineIds.flatMap(id=>{const e=byId.get(id);return e?.kind==='dialogue_line'&&adoptedRecord(e)&&(e.data.scriptKind??'dialogue')==='dialogue'&&e.data.speakerId?[e.data.speakerId]:[];}))],[byId,lineIds]);
  const turns=useMemo(()=>rehearsalTurns(project,lineIds,speaker),[project,lineIds,speaker]), current=Math.min(position,Math.max(0,turns.length-1)), turn=turns[current];
  const move=(index:number)=>{setPosition(index);setRevealed(false);};
  return <section className="role-rehearsal" aria-label="役の練習"><h4>役の練習</h4><p className="field-hint">練習位置と答えの表示はこの画面だけに保持します。作品や収録の印は変更しません。</p><PagedSelect label="練習する役" scope={`rehearsal:${project.projectId}`} items={speakers.map(id=>({id,label:labelOf(byId.get(id))}))} value={speaker} onChange={id=>{setSpeaker(id);move(0);}}/>{turn&&<><p>練習 {current+1} / {turns.length}</p><div aria-label="直前の相手の一言">{turn.cue?<><strong>{labelOf(byId.get(turn.cue!.data.speakerId??''))}</strong><RichTextView value={turn.cue.data.text} vertical={vertical} onOpenTarget={onOpenTarget}/></>:<p>直前の相手の台詞はありません。</p>}</div><article aria-label="自分の台詞">{revealed?<RichTextView value={turn.line.data.text} vertical={vertical} onOpenTarget={onOpenTarget}/>:<button type="button" className="button primary" onClick={()=>setRevealed(true)}>タップして自分の台詞を表示</button>}</article><div className="pagination"><button type="button" className="button secondary" disabled={current===0} onClick={()=>move(current-1)}>前の練習</button><button type="button" className="button secondary" disabled={current+1>=turns.length} onClick={()=>move(current+1)}>次の練習</button><button type="button" className="button secondary" onClick={()=>move(0)}>最初から練習</button></div></>}{speaker&&!turn&&<p>この役の台詞はありません。</p>}</section>;
}
