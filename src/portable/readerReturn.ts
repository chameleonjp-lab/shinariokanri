import type {PublicProjection} from '../domain/projection';
import {createReaderHesitation,readerReturnFile,type ReaderHesitation} from '../domain/sharedReviews';

/** Nothing is recorded by setShown; only a reader's explicit click creates a local row. */
export function mountReaderReturn(projection:PublicProjection,publicEdition:string,parent:HTMLElement){
 let current:{scene:string;choices:{id:string;label:string}[]}|undefined,rows:ReaderHesitation[]=[],selected=new Set<string>();
 const panel=document.createElement('section');panel.setAttribute('aria-label','読者が選んで返す控え');
 const heading=document.createElement('h3');heading.textContent='迷った場面の任意の控え';const help=document.createElement('p');help.textContent='押した時だけ表示中の公開場面・選択肢・一言を、この試読中の端末内に控えます。自動送信しません。閉じると控えは消えます。';
 const label=document.createElement('label');label.textContent='迷った理由（任意）';const note=document.createElement('textarea');note.setAttribute('aria-label','迷った理由（任意）');note.maxLength=2000;label.append(note);
 const capture=document.createElement('button');capture.textContent='ここで迷った';capture.type='button';capture.disabled=true;
 const list=document.createElement('div'),artifact=document.createElement('div'),notice=document.createElement('p');notice.setAttribute('role','status');
 const confirm=document.createElement('button');confirm.textContent='選んだ控えの返却内容を確認';confirm.type='button';
 const finish=document.createElement('button');finish.textContent='返さずに終了';finish.type='button';
 const invalidate=()=>artifact.replaceChildren();
 function renderRows(){list.replaceChildren();rows.forEach((row,index)=>{const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label',`返す控え${index+1}`);check.checked=selected.has(row.id);check.onchange=()=>{if(check.checked)selected.add(row.id);else selected.delete(row.id);invalidate();};label.append(check,document.createTextNode(`控え${index+1} · ${row.publicScene} · ${row.note}`));list.append(label,document.createElement('br'));});}
 capture.onclick=()=>{if(!current||rows.length>=10000)return;try{rows.push(createReaderHesitation(projection,publicEdition,current.scene,current.choices,note.value));note.value='';invalidate();renderRows();notice.textContent='端末内に控えました。返す行を選んで確認してください。';capture.disabled=rows.length>=10000;}catch(cause){notice.textContent=(cause as Error).message;}};
 confirm.onclick=()=>{invalidate();const file=readerReturnFile(rows,[...selected]);if(!file){notice.textContent='選択は0件です。返却ファイルは作成しません。';return;}const pre=document.createElement('pre');pre.setAttribute('aria-label','返却ファイルの内容');pre.textContent=file;const save=document.createElement('button');save.type='button';save.textContent='確認した控えをファイルに保存';save.onclick=()=>{const url=URL.createObjectURL(new Blob([file],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='reader-return.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};artifact.append(pre,save);};
 finish.onclick=()=>{rows=[];selected=new Set();note.value='';invalidate();renderRows();capture.disabled=!current;notice.textContent='控えを返さず終了しました。';};
 panel.append(heading,help,label,capture,list,confirm,artifact,finish,notice);parent.append(panel);
 return {setShown(scene:string|undefined,choices:{id:string;label:string}[]){current=scene?{scene,choices:choices.map(c=>({...c}))}:undefined;capture.disabled=!current||rows.length>=10000;}};
}
