import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {KIND_LABELS} from '../domain/model';
import type {WorkCatalogHit} from '../domain/catalog';
import type {ProjectSummary} from '../storage';
import {searchLocalCatalog} from '../storage/crossWorkSearch';
import {useScenarioStore} from './StoreContext';
import {ListPager,useListWindow} from './ListWindow';

export function CrossWorkCatalogPanel({onOpen}:{onOpen:(hit:WorkCatalogHit)=>Promise<void>}){
  const store=useScenarioStore(),epoch=useSyncExternalStore(store.subscribeCatalogChanges,()=>store.catalogGeneration);
  const [refresh,setRefresh]=useState(0);
  const [catalog,setCatalog]=useState<{store:typeof store;epoch:number;refresh:number;works:ProjectSummary[]}|null>(null);
  const [selected,setSelected]=useState<string[]>([]),[text,setText]=useState('');
  const [hits,setHits]=useState<WorkCatalogHit[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null);
  const live=useRef({store,epoch,refresh});live.current={store,epoch,refresh};
  const ready=catalog?.store===store&&catalog.epoch===epoch&&catalog.refresh===refresh;
  const scope=`${store.accountId??'guest'}:cross-work:${epoch}:${refresh}`;
  const page=useListWindow({items:ready?hits??[]:[],scope});
  useEffect(()=>{
    const recheck=()=>setRefresh(value=>value+1);
    window.addEventListener('focus',recheck);window.addEventListener('pageshow',recheck);
    return ()=>{window.removeEventListener('focus',recheck);window.removeEventListener('pageshow',recheck);};
  },[]);
  useEffect(()=>{
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setSelected([]);setText('');setHits(null);setBusy(false);setError('');
    void store.listProjectSummaries({signal:controller.signal}).then(works=>{
      if(!controller.signal.aborted)setCatalog({store,epoch,refresh,works});
    }).catch(()=>{if(!controller.signal.aborted)setError('作品一覧を確認できませんでした。再確認してください。');});
    return ()=>controller.abort();
  },[store,epoch,refresh]);
  const current=()=>live.current.store===store&&live.current.epoch===epoch&&live.current.refresh===refresh&&store.catalogGeneration===epoch;
  const search=async()=>{
    if(!ready||busy)return;
    request.current?.abort();const controller=new AbortController();request.current=controller;setHits(null);setError('');setBusy(true);
    try{
      const result=await searchLocalCatalog(store,catalog.works.filter(work=>selected.includes(work.projectId)),text,controller.signal);
      if(current()&&!controller.signal.aborted)setHits(result);
    }catch{if(current()&&!controller.signal.aborted){setHits(null);setError('作品または権限が変わった可能性があります。一覧を再確認し、対象を選び直してください。');}}
    finally{if(current()&&!controller.signal.aborted)setBusy(false);}
  };
  return <section className="cross-work-catalog" aria-label="作品をまたいで検索">
    <h2>作品をまたいで検索</h2>
    <p>この端末の作品を選んで本文や設定を探します。選んだ作品が使う固定世界版も対象です。共有相手の作品は検索しません。</p>
    <button type="button" className="text-button" onClick={()=>setRefresh(value=>value+1)}>作品一覧を再確認</button>
    {!ready&&!error&&<p role="status">作品の権限と版を確認中…</p>}
    {ready&&<form onSubmit={event=>{event.preventDefault();void search();}}>
      <fieldset disabled={busy}><legend>検索する端末内の作品</legend>
        {catalog.works.map(work=><label className="cross-work-choice" key={work.projectId}>
          <input type="checkbox" checked={selected.includes(work.projectId)} onChange={event=>{setSelected(previous=>event.target.checked?[...previous,work.projectId]:previous.filter(id=>id!==work.projectId));setHits(null);}}/>
          <span>{work.name}<small>作品ID {work.projectId} · 稿 {work.revision}</small></span>
        </label>)}
        {!catalog.works.length&&<p>検索できる端末内の作品はありません。</p>}
      </fieldset>
      <label className="form-field">作品をまたぐ検索語<input type="search" value={text} onChange={event=>{request.current?.abort();setBusy(false);setText(event.target.value);setHits(null);}}/></label>
      <button type="submit" className="button primary" disabled={busy||!selected.length||!text.trim()}>選んだ作品を検索</button>
      {busy&&<button type="button" className="button secondary" onClick={()=>{request.current?.abort();setBusy(false);setHits(null);}}>検索を中止</button>}
    </form>}
    {error&&<p role="alert">{error}</p>}
    {ready&&busy&&<p role="status">選んだ作品を検索中…</p>}
    {ready&&hits!==null&&<><p role="status">検索結果 {hits.length}件</p><ul aria-label="作品をまたぐ検索結果">
      {page.items.map(hit=><li key={hit.id}><strong>{hit.name||'無題'} · {KIND_LABELS[hit.kind]}</strong>
        <p>{hit.workName} · 稿 {hit.workRevision}<br/>作品ID {hit.workId}<br/>
          {hit.sourceVersionId&&<>{hit.sourceName} · 固定版 {hit.versionLabel} · 稿 {hit.sourceRevision}<br/>世界作品ID {hit.sourceProjectId}<br/>固定版ID {hit.sourceVersionId}<br/></>}
          情報ID {hit.entityId}</p>
        <button type="button" className="button secondary" disabled={busy} onClick={()=>{
          if(!current())return;setBusy(true);void onOpen(hit).catch(()=>{if(current()){setHits(null);setError('この版を開けませんでした。一覧を再確認して検索し直してください。');}}).finally(()=>{if(current())setBusy(false);});
        }}>この稿の情報を開く</button>
      </li>)}
    </ul><ListPager {...page} label="作品をまたぐ検索結果"/></>}
  </section>;
}
