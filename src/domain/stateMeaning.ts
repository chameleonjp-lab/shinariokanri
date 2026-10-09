import type {Entity,ProjectData,TypedValue} from './types';

/** Suggestions are editorial evidence, never assignments or an automatic merge. */
const families=[
 {name:'生存',groups:[['存命','生存','生きている','alive'],['死亡','死去','死んでいる','dead']]},
 {name:'解錠',groups:[['解錠','開錠','unlocked'],['施錠','locked']]},
 {name:'完了',groups:[['完了','達成','completed'],['未完了','未達成','incomplete']]},
 {name:'認知',groups:[['既知','知っている','known'],['未知','知らない','unknown']]},
];
const normalized=(text:string)=>text.normalize('NFKC').trim().toLocaleLowerCase();
function meanings(text:string){return families.flatMap(family=>family.groups.flatMap((group,index)=>group.some(term=>normalized(term)===normalized(text))?[{family:family.name,group:index}]:[]));}
export interface StateMeaningCandidate {id:string;variableId:string;value?:TypedValue;relationship:'synonym'|'opposite'|'same_state';explanation:string}
export function stateMeaningCandidates(project:ProjectData,draft:Entity<'variable'>):StateMeaningCandidate[]{
 const terms=[draft.name,draft.data.key,...(draft.data.valueType==='enum'?(draft.data.allowed.values??[]).filter((value):value is string=>typeof value==='string'):[])],current=terms.flatMap(term=>meanings(term));
 const result:StateMeaningCandidate[]=[];
 if(draft.data.valueType==='enum')for(const family of families){const present=(draft.data.allowed.values??[]).filter((value):value is string=>typeof value==='string'&&family.groups.some(group=>group.some(term=>normalized(term)===normalized(value))));if(present.length>1)result.push({id:`own:${family.name}`,variableId:draft.id,relationship:'same_state',explanation:`${present.join('／')}は「${draft.name}」の選択値で表せます。別々の真偽状態を作る前に、同じ状態の値として扱う候補を確認してください。`});}
 for(const candidate of project.entities){
  if(candidate.kind!=='variable'||candidate.id===draft.id||candidate.deletedAt||candidate.status==='rejected'||(candidate.data.ownerId??null)!==(draft.data.ownerId??null)||candidate.data.scope!==draft.data.scope)continue;
  const nameMeanings=[candidate.name,candidate.data.key].flatMap(term=>meanings(term)),same=current.find(a=>nameMeanings.some(b=>a.family===b.family));
  if(same){const match=nameMeanings.find(a=>a.family===same.family)!,opposite=same.group!==match.group;result.push({id:`name:${candidate.id}`,variableId:candidate.id,relationship:opposite?'opposite':'synonym',explanation:`「${draft.name}」と「${candidate.name}」は${opposite?'反対語':'同義語'}の候補です。同じ状態の異なる値で表せるか、対象人物・型・許容値を確認してください。`});}
  if(candidate.data.valueType==='enum')for(const value of candidate.data.allowed.values??[]){if(typeof value!=='string')continue;const matching=meanings(value).find(a=>current.some(b=>a.family===b.family));if(matching)result.push({id:`value:${candidate.id}:${value}`,variableId:candidate.id,value:{type:'enum',value},relationship:terms.some(term=>normalized(term)===normalized(value))?'same_state':current.some(a=>a.family===matching.family&&a.group===matching.group)?'synonym':'opposite',explanation:`「${candidate.name}」の値「${value}」として表す候補です。別の状態を増やす前に既存の定義を確認できます。`});}
 }
 return result;
}
