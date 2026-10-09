import {useEffect,useRef,useState} from 'react';
import type {Entity} from '../domain/types';
import {newId} from '../domain/model';
import {recordDiagnostic} from '../diagnostics';
import {cachedReferencesTo,prepareReferenceIndex,referencesTo} from './referenceIndex';

type Phase='loading'|'ready'|'canceled'|'failed';
type ReadState={source:readonly Entity[];phase:Phase;completed:number};
export function useReferenceRows(entities:readonly Entity[],id:string,revision?:string){
 const [state,setState]=useState<ReadState|null>(null),[attempt,setAttempt]=useState(0);
 const controller=useRef<{source:readonly Entity[];abort:AbortController}|null>(null),large=entities.length>2500;
 const cached=large?cachedReferencesTo(entities,id):referencesTo(entities,id);
 const current=state?.source===entities?state:null;
 useEffect(()=>{
  if(!large)return;
  let active=true;const abort=new AbortController(),operationId=newId();controller.current={source:entities,abort};
  setState({source:entities,phase:'loading',completed:0});
  void prepareReferenceIndex(entities,{signal:abort.signal,onProgress:completed=>{if(active)setState({source:entities,phase:'loading',completed});}}).then(()=>{
   if(active&&!abort.signal.aborted)setState({source:entities,phase:'ready',completed:entities.length});
  }).catch(error=>{if(active){const canceled=error instanceof DOMException&&error.name==='AbortError';if(!canceled)recordDiagnostic(error,{code:'UI_RENDER_FAILED',operationId,revision});setState({source:entities,phase:canceled?'canceled':'failed',completed:0});}});
  return()=>{active=false;abort.abort();if(controller.current?.abort===abort)controller.current=null;};
 },[entities,large,attempt,revision]);
 const interrupted=current?.phase==='canceled'||current?.phase==='failed';
 const phase:Phase=!large?'ready':interrupted?current.phase:cached!==undefined?'ready':'loading';
 return {rows:phase==='ready'?cached??[]:[],phase,completed:phase==='ready'?entities.length:current?.completed??0,total:entities.length,
  cancel:()=>{if(controller.current?.source===entities){controller.current.abort.abort();setState(previous=>previous?.source===entities?{...previous,phase:'canceled'}:{source:entities,phase:'canceled',completed:0});}},
  retry:()=>{setState({source:entities,phase:'loading',completed:0});setAttempt(value=>value+1);}};
}
