import {useEffect,useState} from 'react';
import {authorAlternativeSha256} from '../domain/authorAlternativeIntegrity';
import type {AuthorAlternativeWorkspaceDraft} from './AuthorAlternativeStudio';
import type {AlternativeHeadSummary,ProjectSummary} from '../storage/projectSummary';
export type AlternativeDraftStatus='clean'|'dirty'|'unknown';
/** The sealed digest covers exactly the content + nullable structurePlan compared
 * by the original full-project oracle. Other editable fields keep its semantics. */
export async function alternativeDraftStatus(draft:AuthorAlternativeWorkspaceDraft,heads:readonly AlternativeHeadSummary[]|undefined):Promise<AlternativeDraftStatus>{
 if(draft.newBranchName.trim())return 'dirty';
 for(const [id,editor]of Object.entries(draft.branches)){
  if(editor.newEntityName?.trim()||editor.invalidFieldKeys?.length||Object.values(editor.jsonBuffers??{}).some(fields=>Object.keys(fields).length))return 'dirty';
  if(!editor.content)continue;
  if(!heads)return 'unknown';
  const head=heads.find(item=>item.id===id);
  if(!head||editor.headVersionId!==head.headVersionId||editor.branchName!==head.name)return 'dirty';
  if(!head.contentHash)return 'unknown';
  try{if(await authorAlternativeSha256({content:editor.content,structurePlan:editor.structurePlan??null})!==head.contentHash)return 'dirty';}catch{return 'unknown';}
 }
 return 'clean';
}
/** A late clean result can only classify its exact draft input/signature. Project
 * selection and unchanged summary refreshes do not rehash retained content. */
export function useAlternativeDraftStatus(drafts:Record<string,AuthorAlternativeWorkspaceDraft>,summaries:ProjectSummary[]):AlternativeDraftStatus{
 const signature=JSON.stringify(summaries.map(row=>[row.projectId,row.contentState,row.alternativeHeads]));
 const [proof,setProof]=useState<{drafts:typeof drafts;signature:string;status:AlternativeDraftStatus}>();
 useEffect(()=>{
  let live=true;
  const heads=new Map(summaries.map(row=>[row.projectId,row.contentState==='unloaded'?row.alternativeHeads:undefined]));
  void Promise.all(Object.entries(drafts).map(([id,draft])=>alternativeDraftStatus(draft,heads.get(id)))).then(states=>{
   if(live)setProof({drafts,signature,status:states.includes('dirty')?'dirty':states.includes('unknown')?'unknown':'clean'});
  });
  return()=>{live=false;};
 },[drafts,signature]);
 if(!Object.keys(drafts).length)return 'clean';
 return proof?.drafts===drafts&&proof.signature===signature?proof.status:'unknown';
}
