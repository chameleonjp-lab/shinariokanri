import {useAuthorScope} from './StoreContext';
import {useAuthorInput,flushAuthorDraft,AuthorDraftNotice} from './authorOperation';
import {useRef,useState} from 'react';
import type {ProjectData} from '../domain/types';
import {parseTwee,importTweeAlternative,exportTweeAlternative,type TweePreview} from '../domain/twee';
import {headAlternativeContent,projectContent,type AuthorAlternative} from '../domain/writingWorkspace';
import {canonicalJson} from '../storage/json';
import {downloadBytes} from './components';
import {PagedSelect} from './PagedSelect';
import {ListPager,useListWindow} from './ListWindow';

type Output=ReturnType<typeof exportTweeAlternative>;
export function TweeInterchangePanel({project,alternatives,disabled,onImport}:{project:ProjectData;alternatives:AuthorAlternative[];disabled:boolean;onImport:(branch:AuthorAlternative)=>Promise<boolean>}){
 const scope=useAuthorScope(`twee:${project.projectId}`);
 const [raw,setRaw]=useAuthorInput(scope,'raw','',project.projectId,project.revision),[name,setName]=useAuthorInput(scope,'name','Twee取込案',project.projectId,project.revision),[preview,setPreview]=useState<{parsed:TweePreview;source:string}>(),[ack,setAck]=useState(false);
 const [selected,setSelected]=useState(''),[output,setOutput]=useState<{value:Output;head:string;name:string}>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const operation=useRef(false),latest=useRef(project);latest.current=project;
 const branch=alternatives.find(a=>a.id===selected)??alternatives[0];
 const issues=useListWindow({items:(preview?.parsed.issues??[]).map((issue,index)=>({...issue,id:String(index)})),scope:`${project.projectId}:twee:${preview?.source??''}`});
 async function run(action:()=>Promise<void>){if(operation.current||disabled)return;operation.current=true;setBusy(true);setError('');try{await action();}catch(cause){setError((cause as Error).message);}finally{operation.current=false;setBusy(false);}}
 return <section className="alternative-panel" aria-label="Tweeの対応範囲と別案取込"><h3>Tweeの対応範囲と別案取込</h3><AuthorDraftNotice scope={scope} revision={project.revision}/><p>Twee 3 の場面名・平文・単純リンクを作者別案へ取り込みます。命令、HTML、タグなどは実行せず原文に保管します。正本への採用は別案の比較から行います。</p>
 <fieldset disabled={disabled||busy}><label className="form-field">Twee原稿ファイル<input type="file" accept=".twee,.tw,.txt,text/plain" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>{if(!file.size||file.size>1024*1024)throw Error('Twee原稿は1 byte〜1 MiBです。');const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());setRaw(text);setPreview(undefined);setOutput(undefined);setAck(false);});}}/></label>
 <label className="form-field">Twee原稿<textarea aria-label="Twee原稿" value={raw} onChange={e=>{setRaw(e.target.value);setPreview(undefined);setAck(false);}}/></label><label className="form-field">取込先の新しい別案名<input value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></label>
 <button className="button secondary" type="button" disabled={!raw.trim()} onClick={()=>void run(async()=>{setPreview({parsed:parseTwee(raw),source:canonicalJson(projectContent(project))});setAck(false);})}>Tweeの対応範囲を確認</button>
 {preview&&<div role="region" aria-label="Twee取込前の確認"><p>場面 {preview.parsed.passages.length}件 · リンク {preview.parsed.passages.reduce((n,p)=>n+p.links.length,0)}件 · 要確認 {preview.parsed.issues.length}件</p><ol>{preview.parsed.passages.map(p=><li key={`${p.line}:${p.name}`}>{p.name} · 原文の行 {p.line} · 選択 {p.links.map(l=>`${l.label} → ${l.target}`).join(' / ')||'なし'}</li>)}</ol><ul>{issues.items.map(issue=><li key={issue.id}>行 {issue.line} · {issue.blocking?'取込を保留':'原文に保管'}: {issue.message}<pre style={{whiteSpace:'pre-wrap'}}>{issue.original}</pre></li>)}</ul><ListPager {...issues} label="Tweeの診断"/>
 <label className="check-label"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>対応範囲と原文の保管を確認した</label>
 <button className="button secondary" type="button" disabled={!ack||!name.trim()||preview.parsed.issues.some(i=>i.blocking)} onClick={()=>void run(async()=>{await flushAuthorDraft(scope);if(canonicalJson(projectContent(latest.current))!==preview.source)throw Error('確認後に作品が変わりました。原稿を保持したので再確認してください。');const created=importTweeAlternative(latest.current,preview.parsed,name);if(await onImport(created)){setRaw('');setPreview(undefined);setAck(false);setNotice('新しい作者別案に保存しました。最初の版へ戻すと取込全体を取り消せます。正本は保持しています。');}})}>対応する内容を新しい作者別案に保存</button>
 <button className="button secondary" type="button" onClick={()=>{setPreview(undefined);setAck(false);setNotice('取込を中止しました。原稿は入力欄に保持しています。');}}>Twee取込を中止</button>
 <button className="button secondary" type="button" onClick={()=>downloadBytes(preview.parsed.original,'Twee取込原文.twee','text/plain;charset=utf-8')}>確認した原文を回収</button></div>}
 <h4>保存済み別案の対応部分を書き出す</h4><PagedSelect label="Tweeへ書き出す保存済み別案" scope={`${project.projectId}:twee-export`} value={branch?.id??''} items={alternatives.map(a=>({id:a.id,label:a.name}))} onChange={id=>{setSelected(id);setOutput(undefined);}}/>
 <button className="button secondary" type="button" disabled={!branch} onClick={()=>{if(branch)setOutput({value:exportTweeAlternative(headAlternativeContent(branch)),head:branch.headVersionId,name:branch.name});}}>Twee出力の対応外を確認</button>
 {output&&<div role="region" aria-label="Twee出力前の確認"><p>{output.name} · 保存済み版 {output.head}</p><p>対応外 {output.value.omissions.length}件</p><ul>{output.value.omissions.map((message,i)=><li key={i}>{message}</li>)}</ul>{output.value.artifact&&<button className="button secondary" type="button" onClick={()=>downloadBytes(output.value.artifact!.content,output.value.artifact!.filename,output.value.artifact!.mimeType)}>対応部分をTweeで保存</button>}{output.value.originals.map(artifact=><button className="button secondary" type="button" key={artifact.filename} onClick={()=>downloadBytes(artifact.content,artifact.filename,artifact.mimeType)}>{artifact.filename} を回収</button>)}</div>}
 </fieldset>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</section>;
}
