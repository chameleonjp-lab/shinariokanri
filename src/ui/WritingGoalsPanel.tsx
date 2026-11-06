import {useEffect,useMemo} from 'react';
import {adoptedRecord} from '../domain/adoption';
import {setWritingGoal,writingCounts,writingGoal} from '../domain/production';
import type {ProjectData} from '../domain/types';
import {useAuthorScope} from './StoreContext';
import {acknowledgeAuthorDraft,AuthorDraftNotice,authorField,flushAuthorDraft,useAuthorField,useAuthorInput} from './authorOperation';
import {PagedSelect} from './PagedSelect';
import {labelOf} from './Fields';

type GoalPlan={revision:string;scopeId?:string;characters:number|null};
export function WritingGoalsPanel({project,routeCharacters,onSaveProject}:{project:ProjectData;routeCharacters:number|null;onSaveProject?:(project:ProjectData,reason:string)=>Promise<ProjectData>}) {
 const key=useAuthorScope(`writing-goals:${project.projectId}`);
 const [scope,setScope]=useAuthorInput(key,'scope','work',project.projectId,project.revision);
 const scopeId=scope==='work'?undefined:scope;
 const [value,setValue]=useAuthorInput(key,'characters',()=>String(writingGoal(project,scopeId)??''),project.projectId,project.revision);
 const [plan,setPlan]=useAuthorField<GoalPlan|null>(key,'plan',null);
 const [busy,setBusy]=useAuthorField(key,'busy',false),[error,setError]=useAuthorField(key,'error','');
 const [saved,setSaved]=useAuthorField<string|null>(key,'saved',null);
 const counts=useMemo(()=>{try{const work=writingCounts(project);return {work,selected:scopeId?writingCounts(project,scopeId):work,error:''};}catch(cause){return {work:null,selected:null,error:(cause as Error).message};}},[project,scopeId]);
 const goal=writingGoal(project,scopeId);
 const choices=[{id:'work',label:'作品全体'},...project.entities.filter(entity=>['chapter','production_task'].includes(entity.kind)&&adoptedRecord(entity)).map(entity=>({id:entity.id,label:`${entity.kind==='chapter'?'章':'作業単位'} · ${labelOf(entity)}`}))];
 const selectedLabel=choices.find(choice=>choice.id===scope)?.label??'参照先を確認できません';
 useEffect(()=>{if(saved&&BigInt(project.revision)>=BigInt(saved)){setBusy(false);setPlan(null);setSaved(null);}},[project.revision,saved]);
 function choose(id:string){const selected=id||'work';setScope(selected);setValue(String(writingGoal(project,selected==='work'?undefined:selected)??''));setPlan(null);setError('');}
 async function preview(){
  if(authorField<boolean>(key,'busy'))return;setBusy(true);setError('');setPlan(null);
  const revision=project.revision,capturedScope=scopeId,input=value.trim();
  try {
   await flushAuthorDraft(key);
   if(input&&!/^\d+$/.test(input))throw Error('文字数目標は1以上の整数で入力してください。空欄で未設定にできます。');
   const characters=input?Number(input):null;
   setWritingGoal(project,capturedScope,characters);
   setPlan({revision,scopeId:capturedScope,characters});
  }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
 }
 async function save(){
  if(!plan||!onSaveProject||authorField<boolean>(key,'busy'))return;
  if(plan.revision!==project.revision){setError('確認後に作品が更新されました。入力を保持して目標を再確認してください。');return;}
  setBusy(true);setError('');
  try {const result=await onSaveProject(setWritingGoal(project,plan.scopeId,plan.characters),'任意の文字数目標を保存');acknowledgeAuthorDraft(key,result.revision);setSaved(result.revision);}
  catch(cause){setError((cause as Error).message);setBusy(false);}
 }
 return <section className="writing-goals" aria-label="文字数と任意の目標">
  <h4>文字数と任意の目標</h4>
  <p>作品で書いた量 {counts.work?.characters??'未確認'}文字 · 選択経路で読む量 {routeCharacters===null?'未選択':`${routeCharacters}文字`}。目標なしでも通常通り執筆できます。</p>
  <p>場面本文と台詞本文を数えます。作品・章・作業単位では同じ由来と本文を一度だけ数え、独立コピー・本文上書きは別に数えます。経路では固定版の実際の通過ごとに場面と台詞を加えます。</p>
  <details><summary>文字数の数え方と例</summary>
   <p>Unicodeコードポイントで計算します。空白・句読点・本文内の改行を含み、段落間の自動の区切りは含みません。正規化せず、「が」は1文字、「か」＋結合濁点（U+3099）の「が」は2文字、「😀」は1文字です。</p>
   <p>ルビが「かんじ」の「漢字」は親文字の2文字だけ数えます。名前・要約・作者メモ・話者名・演出は含みません。不採用・別案・削除済みの本文は除きます。場面本文と台詞本文に同じ文を別々に入力すると両方を数えます。</p>
  </details>
  <fieldset disabled={busy}>
   <PagedSelect label="文字数目標の対象" scope={`${key}:targets`} items={choices} value={scope} onChange={choose}/>
   <p>{selectedLabel} · 書いた量 {counts.selected?.characters??'未確認'}文字 · 目標 {goal===null?'未設定':`${goal}文字`}{goal!==null&&counts.selected&&` · 達成率 ${Math.floor(counts.selected.characters/goal*100)}%`}</p>
   {!!counts.selected?.unknownReferences&&<p role="alert">参照不明 {counts.selected.unknownReferences}件。確認できた本文のみ集計しています。</p>}
   <label>任意の文字数目標<input aria-label="任意の文字数目標" inputMode="numeric" value={value} onChange={event=>{setValue(event.target.value);setPlan(null);setError('');}}/></label>
   <p className="field-hint">空欄で未設定にできます。確認・保存後は変更履歴から取り消せます。</p>
   <button disabled={!onSaveProject} onClick={()=>void preview()}>文字数目標を確認</button>
   {plan&&<><p>確認版 {plan.revision} · {selectedLabel} · 目標 {goal===null?'未設定':`${goal}文字`} → {plan.characters===null?'未設定':`${plan.characters}文字`}</p>{plan.revision!==project.revision&&<p role="alert">確認後に作品が更新されました。目標を再確認してください。</p>}<button disabled={!onSaveProject||plan.revision!==project.revision} onClick={()=>void save()}>確認した文字数目標を保存</button></>}
  </fieldset>
  <AuthorDraftNotice scope={key} revision={project.revision}/>
  {(error||counts.error)&&<p role="alert">{error||counts.error}</p>}
 </section>;
}
