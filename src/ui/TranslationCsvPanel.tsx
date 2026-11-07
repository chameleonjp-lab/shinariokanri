import {useAuthorScope} from './StoreContext';
import {useAuthorInput,flushAuthorDraft,AuthorDraftNotice} from './authorOperation';
import {useRef,useState} from 'react';
import type {ProjectData} from '../domain/types';
import {exportTranslationCsv,inspectTranslationCsv,previewTranslationImport,confirmTranslationImport,type TranslationReport} from '../domain/translationCsv';
import {downloadBytes} from './components';
import {ListPager,useListWindow} from './ListWindow';

type Plan=Awaited<ReturnType<typeof previewTranslationImport>>;
export function TranslationCsvPanel({project,onSaveProject}:{project:ProjectData;onSaveProject?:(p:ProjectData,reason:string)=>Promise<ProjectData>}){
  const scope=useAuthorScope(`translation-csv:${project.projectId}`);
  const [language,setLanguage]=useAuthorInput(scope,'language','en',project.projectId,project.revision),[csv,setCsv]=useAuthorInput(scope,'csv','',project.projectId,project.revision),[report,setReport]=useState<TranslationReport>(),[selected,setSelected]=useState<number[]>([]),[plan,setPlan]=useState<Plan>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const operation=useRef(false),latest=useRef(project);latest.current=project;
  const rows=useListWindow({items:(report?.rows??[]).map(row=>({...row,id:String(row.row)})),scope:`${project.projectId}:translation-csv:${report?.sourceDigest??''}`});
  async function run(action:()=>Promise<void>){if(operation.current)return;operation.current=true;setBusy(true);setError('');try{await action();}catch(cause){setError((cause as Error).message);}finally{operation.current=false;setBusy(false);}}
  async function read(file?:File){if(!file)return;await run(async()=>{if(!file.size||file.size>1024*1024)throw Error('CSVは1 byte〜1 MiBです。');const captured=structuredClone({...project,history:[]});setPlan(undefined);const next=await inspectTranslationCsv(captured,new Uint8Array(await file.arrayBuffer()));setReport(next);setCsv(next.csv);setSelected([]);setNotice('確認できた行だけを選んでください。保留の行は取り込みません。');});}
  return <section className="settings-card" aria-label="翻訳CSVの往復"><h3>翻訳CSVの往復</h3><AuthorDraftNotice scope={scope} revision={project.revision}/>
    <p>台詞番号・原文の版・照合値は保ったまま、translation_text 列を編集します。すべてのデータセルの先頭の ' は文字列用です。式に見える文も実行せず扱います。</p>
    <fieldset disabled={busy}><label className="form-field">CSVの言語コード<input value={language} onChange={e=>setLanguage(e.target.value)} placeholder="en / ja"/></label>
      <button className="button secondary" type="button" onClick={()=>void run(async()=>downloadBytes(await exportTranslationCsv(project,language),`翻訳-${language}.csv`,'text/csv;charset=utf-8'))}>翻訳CSVを書き出す</button>
      <label className="form-field">編集した翻訳CSV<input type="file" accept=".csv,text/csv" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void read(file);}}/></label>
      {csv&&!report&&<button className="button secondary" type="button" onClick={()=>void run(async()=>{setReport(await inspectTranslationCsv(project,csv));setSelected([]);setPlan(undefined);})}>端末に保管したCSVを再確認</button>}
      {report&&<><p>確認版 {report.baseRevision} · {report.rows.length}行 · 保留 {report.rows.filter(r=>!r.valid).length}行</p>
        <ul>{rows.items.map(row=><li key={row.id}><label className="check-label"><input type="checkbox" disabled={!row.valid} checked={selected.includes(row.row)} onChange={e=>{setSelected(previous=>e.target.checked?[...previous,row.row]:previous.filter(id=>id!==row.row));setPlan(undefined);}}/>行 {row.row} · {row.language} · {project.entities.find(e=>e.id===row.lineId)?.name??'不明な台詞'}</label><p style={{whiteSpace:'pre-wrap'}}>{row.translation}</p>{row.reasons.map(reason=><p key={reason} role="note">保留: {reason}</p>)}</li>)}</ul><ListPager {...rows} label="翻訳CSVの行"/>
        <button className="button secondary" type="button" disabled={!selected.length} onClick={()=>void run(async()=>setPlan(await previewTranslationImport(project,report,selected)))}>選んだ訳文の差分を確認</button>
        {plan&&<div role="region" aria-label="翻訳の保存前確認"><p>元の版 {plan.baseRevision} · 訳文 {plan.selectedRows.length}行を一度に保存します。</p><ul>{report.rows.filter(row=>plan.selectedRows.includes(row.row)).map(row=>{const old=project.entities.find(e=>e.kind==='localization'&&e.data.sourceLineId===row.lineId&&e.data.language===row.language);return <li key={row.row}><p>行 {row.row} · 変更前: {old?.kind==='localization'?old.data.text.map(b=>b.text).join('\n'):'新しい翻訳'}</p><p style={{whiteSpace:'pre-wrap'}}>変更後: {row.translation}</p></li>;})}</ul><button className="button secondary" type="button" disabled={!onSaveProject||project.revision!==plan.baseRevision} onClick={()=>void run(async()=>{await flushAuthorDraft(scope);const candidate=await confirmTranslationImport(latest.current,plan);await onSaveProject!(candidate,'確認した翻訳CSVの選択行を一括取込');setPlan(undefined);setReport(undefined);setSelected([]);setCsv('');setNotice('選択した訳文を一度だけ保存しました。変更履歴から取り消せます。');})}>確認した訳文だけを保存</button></div>}
        <button className="button secondary" type="button" onClick={()=>{setPlan(undefined);setReport(undefined);setSelected([]);setNotice('CSVの取込を中止しました。作品は変更していません。CSVは再確認用に端末へ保持しています。');}}>CSV取込を中止</button>
      </>}
    </fieldset>{busy&&<p role="status">翻訳CSVを処理中…</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  </section>;
}
