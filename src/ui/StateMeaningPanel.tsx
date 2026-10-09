import type {Entity,ProjectData} from '../domain/types';
import {stateMeaningCandidates} from '../domain/stateMeaning';
import {WindowedList} from './WindowedList';
export function StateMeaningPanel({project,variable,onOpen}:{project:ProjectData;variable:Entity<'variable'>;onOpen:(id:string)=>void}){
 const candidates=stateMeaningCandidates(project,variable);
 return <section aria-label="同義語・反対語の状態候補"><h3>同じ状態の値で表す候補</h3><p>存命／死亡などは一つの列挙状態の値で表せます。候補は自動で統合・代入しません。未設定は未設定のまま保持します。独自の用語も、同じ対象・範囲の状態と許容値を確認してください。</p>{candidates.length?<WindowedList items={candidates} scope={`state-meanings:${project.projectId}:${variable.id}`} label="状態の意味の候補" render={candidate=><p>{candidate.explanation}{candidate.variableId!==variable.id&&<button type="button" className="text-button" onClick={()=>onOpen(candidate.variableId)}>候補の状態定義を開く</button>}</p>}/>:<p>一致する既存用語は見つかりませんでした。意味の同一性を自動認定せず、既存状態の説明と許容値を確認してください。</p>}</section>;
}
