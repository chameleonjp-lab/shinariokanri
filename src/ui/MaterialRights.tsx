import {useRef,useState} from 'react';
import type {Entity,ProjectData} from '../domain/types';
import {approveMaterialRights,type materialCreditReview} from '../domain/materials';
import {jsonBytes,sha256} from '../storage/json';
const digest=(p:ProjectData)=>sha256(jsonBytes({...p,history:[]}));
export function MaterialRightsEditor({project,entity,disabled,onSaveProject}:{project:ProjectData;entity:Entity<'attachment'>;disabled?:boolean;onSaveProject:(p:ProjectData,reason:string)=>Promise<ProjectData>}){
 const [purpose,setPurpose]=useState(String(entity.customValues['material.rights.purpose']??'reader')),[proof,setProof]=useState(String(entity.customValues['material.rights.proof']??'')),[credit,setCredit]=useState(String(entity.customValues['material.rights.credit']??''));
 const [plan,setPlan]=useState<{candidate:ProjectData;sourceDigest:string;candidateDigest:string}>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const saving=useRef(false),latest=useRef(project);latest.current=project;
 const source=project.entities.find(e=>e.id===entity.data.provenanceId&&e.kind==='source');
 async function run(action:()=>Promise<void>){if(saving.current)return;saving.current=true;setBusy(true);setError('');try{await action();}catch(cause){setError((cause as Error).message);}finally{saving.current=false;setBusy(false);}}
 return <section aria-label="素材の用途と権利確認"><h3>素材の用途と権利確認</h3><p>既存の権利メモ: {entity.data.licenseNote||'未記入'}</p><p>出所: {source?.name||'未指定'} · 再配布: {source?.kind==='source'?(source.data.redistributionAllowed===true?'可の記録あり':source.data.redistributionAllowed===false?'不可の記録あり':'未確認'):'未確認'}</p>
 <fieldset disabled={busy||disabled}><label className="form-field">確認する用途<select value={purpose} onChange={e=>{setPurpose(e.target.value);setPlan(undefined);}}>{[['reader','読み手向け本文'],['production','制作の受渡し'],['localization','翻訳・収録'],['runtime_json','ランタイム'],['playable_preview','試遊'],['consultation','手動相談']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
 <label className="form-field">許諾を確認した根拠<textarea value={proof} maxLength={4000} onChange={e=>{setProof(e.target.value);setPlan(undefined);}}/></label><label className="form-field">必要な表記文<textarea value={credit} maxLength={4000} onChange={e=>{setCredit(e.target.value);setPlan(undefined);}} placeholder="表記が不要な場合も、確認根拠に沿って「表記不要」と記入"/></label>
 <button type="button" onClick={()=>void run(async()=>{const captured=structuredClone({...project,history:[]}),candidate=await approveMaterialRights(captured,entity.id,{purpose,proof,credit});setPlan({candidate,sourceDigest:await digest(captured),candidateDigest:await digest(candidate)});})}>素材の確認内容を比較</button>
 {plan&&<><p>この中身・出所・用途に確認根拠と表記を結び付けます。中身や条件が変わると再確認になります。</p><pre style={{whiteSpace:'pre-wrap'}}>{proof}{'\n'}{credit}</pre><button type="button" onClick={()=>void run(async()=>{const current=latest.current;if(await digest(current)!==plan.sourceDigest||await digest(plan.candidate)!==plan.candidateDigest)throw Error('確認後に素材または作品が変わりました。再比較してください。');await onSaveProject({...plan.candidate,history:current.history},'素材の用途・許諾根拠・表記を確認');setPlan(undefined);setNotice('この用途の確認を保存しました。');})}>比較した素材の確認を保存</button><button type="button" onClick={()=>setPlan(undefined)}>確認の保存を中止</button></>}
 </fieldset>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
export type CreditReview=Awaited<ReturnType<typeof materialCreditReview>>;
export function MaterialCreditSummary({review,decisions,onDecision}:{review:CreditReview;decisions:Record<string,string>;onDecision:(id:string,value:string)=>void}){
 return <section aria-label="配布する素材の表記確認"><h3>配布する素材の表記確認</h3><p>表示中の元の版・公開範囲・出力用途で照合しました。作者用の確認欄です。</p><h4>許諾を確認した表記案</h4>{review.confirmed.length?<ul>{review.confirmed.map(row=><li key={row.id}>{row.name}: {row.credit}</li>)}</ul>:<p>表記案はありません。</p>}<h4>作者の判断が必要な素材</h4>{review.unknown.length?<ul>{review.unknown.map(row=><li key={row.id}><label className="form-field">{row.name}<select value={decisions[row.id]??''} onChange={e=>onDecision(row.id,e.target.value)}><option value="">扱いを選ぶ</option><option value="separate">条件と表記を別途確認して扱う</option><option value="exclude">使わずに公開範囲を見直す</option></select></label></li>)}</ul>:<p>条件不明の素材はありません。</p>}</section>;
}
