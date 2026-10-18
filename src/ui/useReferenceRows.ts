import {useEffect,useRef,useState} from 'react';
import type {Entity,ProjectData} from '../domain/types';
import {newId} from '../domain/model';
import {recordDiagnostic} from '../diagnostics';
import {cachedReferencesTo,prepareReferenceIndex,referencesTo} from './referenceIndex';

type Phase='loading'|'ready'|'canceled'|'failed';
type ReadState={source:readonly Entity[];owner?:ProjectData;id:string;phase:Phase;completed:number;rows?:Entity[];isCurrent?:()=>boolean};
export function useReferenceRows(entities:readonly Entity[],id:string,revision?:string,project?:ProjectData){
 const [state,setState]=useState<ReadState|null>(null),[attempt,setAttempt]=useState(0);
 const controller=useRef<{source:readonly Entity[];abort:AbortController}|null>(null),large=entities.length>2500;
 const current=state?.source===entities&&state.id===id&&state.owner===project?state:null;
 const cached=large?(current?.phase==='ready'&&current.isCurrent?.()?current.rows:cachedReferencesTo(entities,id,project)):referencesTo(entities,id,project);
 useEffect(()=>{
  if(!large)return;
  let active=true;const abort=new AbortController(),operationId=newId();controller.current={source:entities,abort};
  setState({source:entities,owner:project,id,phase:'loading',completed:0});
  void prepareReferenceIndex(entities,{project,signal:abort.signal,onProgress:completed=>{if(active)setState({source:entities,owner:project,id,phase:'loading',completed});}}).then(read=>{
   if(active&&!abort.signal.aborted)setState({source:entities,owner:project,id,rows:read(id),isCurrent:read.isCurrent,phase:'ready',completed:entities.length});
  }).catch(error=>{if(active){const canceled=error instanceof DOMException&&error.name==='AbortError';if(!canceled)recordDiagnostic(error,{code:'UI_RENDER_FAILED',operationId,revision});setState({source:entities,owner:project,id,phase:canceled?'canceled':'failed',completed:0});}});
  return()=>{active=false;abort.abort();if(controller.current?.abort===abort)controller.current=null;};
 },[entities,large,attempt,revision,id,project]);
 const interrupted=current?.phase==='canceled'||current?.phase==='failed';
 const phase:Phase=!large?'ready':interrupted?current.phase:cached!==undefined?'ready':'loading';
 return {rows:phase==='ready'?cached??[]:[],phase,completed:phase==='ready'?entities.length:current?.completed??0,total:entities.length,
  cancel:()=>{if(controller.current?.source===entities){controller.current.abort.abort();setState(previous=>previous?.source===entities&&previous.id===id?{...previous,phase:'canceled'}:{source:entities,owner:project,id,phase:'canceled',completed:0});}},
  retry:()=>{setState({source:entities,owner:project,id,phase:'loading',completed:0});setAttempt(value=>value+1);}};
}
