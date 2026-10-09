import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {useAuthorScope} from './StoreContext';
import {ListPager,useListWindow} from './ListWindow';

const queryPrefix='scenario-list-query:v1:';
function readQuery(scope:string){try{const value=localStorage.getItem(queryPrefix+scope)??'';return value.length<=1000?value:'';}catch{return '';}}
export function useListQuery(scope:string){
  scope=useAuthorScope(scope);
  const [state,setState]=useState(()=>({scope,value:readQuery(scope)}));
  const value=state.scope===scope?state.value:readQuery(scope);
  useEffect(()=>{try{localStorage.setItem(queryPrefix+scope,value);}catch{/* An optional view preference cannot block editing. */}},[scope,value]);
  return [value,(next:string)=>setState({scope,value:next})] as const;
}

/** Paging changes the view, never the authored order or the complete set of IDs. */
export function WindowedList<T extends {id:string}>({items,scope,label,size=30,selectedId,searchText,render,as:Container='div',className}:{
  items:readonly T[];scope:string;label:string;size?:number;selectedId?:string|null;
  searchText?:(item:T)=>string;render:(item:T,originalIndex:number)=>ReactNode;
  as?:'div'|'ol'|'ul';className?:string;
}){
  const [query,setQuery]=useListQuery(scope),normalized=query.normalize('NFKC').toLocaleLowerCase();
  const filtered=useMemo(()=>searchText&&normalized?items.filter(item=>`${searchText(item)} ${item.id}`.normalize('NFKC').toLocaleLowerCase().includes(normalized)):items,[items,normalized,searchText]);
  const indices=useMemo(()=>new Map(items.map((item,index)=>[item.id,index])),[items]);
  const page=useListWindow({items:filtered,scope:`${scope}:${query}`,size,selectedId});
  return <>{searchText&&(items.length>size||query)&&<label className="nested-label">{label}を検索<input type="search" aria-label={`${label}を検索`} value={query} onChange={event=>setQuery(event.target.value)}/></label>}<Container className={className} data-windowed-list={label}>{page.items.map(item=>render(item,indices.get(item.id)!))}</Container><ListPager {...page} label={label}/>{normalized&&!page.total&&<p className="field-hint">一致する項目がありません。入力と選択を保持しています。</p>}</>;
}
