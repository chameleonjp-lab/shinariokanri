import type {Block,ContentAnchor,Entity,ProjectData,ProjectSnapshot,RichText} from './types';
import {restoreRichTextBlock,editRichText,remapEditedTextReferences,remapEditedTextRelationReferences} from './text';

export interface ParagraphSelection {entityId:string;field:string;blockId:string}
export interface ReplacementOccurrence extends ParagraphSelection {start:number;end:number;text:string;context:string;entityName:string;chapter:string;kind:string;quoted:boolean;referenceIds:string[];referenceDescriptions:string[];candidateIds:string[]}
export function richFields(entity:Entity):[string,RichText][]{
 return Object.entries(entity.data).filter((entry):entry is [string,RichText]=>Array.isArray(entry[1])&&entry[1].length>0&&entry[1].every(b=>b&&typeof b==='object'&&typeof b.id==='string'&&typeof b.text==='string'&&['paragraph','heading','list_item','quote'].includes(b.kind)));
}
function unique<T>(items:T[],matches:(value:T)=>boolean):T {const found=items.filter(matches);if(found.length!==1)throw new Error('対象を一意に特定できません。段落・一致位置を選び直してください。');return found[0];}
function locate(project:Pick<ProjectData,'entities'>,s:ParagraphSelection){const entity=unique(project.entities,e=>e.id===s.entityId&&!e.deletedAt),blocks=unique(richFields(entity),([field])=>field===s.field)[1],block=unique(blocks,b=>b.id===s.blockId);return {entity,blocks,block};}
export const selectionKey=(s:ParagraphSelection)=>JSON.stringify([s.entityId,s.field,s.blockId]);
export const occurrenceKey=(s:ReplacementOccurrence)=>JSON.stringify([s.entityId,s.field,s.blockId,s.start,s.end]);
export function compareEditions(left:ProjectSnapshot,right:ProjectSnapshot){
 const paragraphs:Array<ParagraphSelection&{before?:Block;after?:Block;selectable:boolean}>=[];
 const index=(content:ProjectSnapshot['content'])=>{
  const result=new Map<string,{selection:ParagraphSelection;block?:Block}>(),entityCounts=new Map<string,number>();
  for(const entity of content.entities)entityCounts.set(entity.id,(entityCounts.get(entity.id)??0)+1);
  for(const entity of content.entities)for(const [field,blocks]of richFields(entity))for(const block of blocks){const selection={entityId:entity.id,field,blockId:block.id},key=selectionKey(selection);result.set(key,{selection,block:result.has(key)||entityCounts.get(entity.id)!==1?undefined:block});}
  return result;
 };
 const a=index(left.content),b=index(right.content);
 for(const key of new Set([...a.keys(),...b.keys()])){const before=a.get(key)?.block,after=b.get(key)?.block;if(JSON.stringify(before)!==JSON.stringify(after))paragraphs.push({...((a.get(key)??b.get(key))!.selection),before,after,selectable:!!before&&!!after});}
 const records:Array<{id:string;category:string;before:unknown;after:unknown}>=[];
 for(const [category,a,b]of [['設定・状態・素材',left.content.entities,right.content.entities],['関係',left.content.relations,right.content.relations]] as const){
  const beforeById=new Map<string,unknown>(a.map(x=>[x.id,x])),afterById=new Map<string,unknown>(b.map(x=>[x.id,x]));const ids=new Set([...beforeById.keys(),...afterById.keys()]);for(const id of ids){const before=beforeById.get(id),after=afterById.get(id);if(JSON.stringify(before)!==JSON.stringify(after))records.push({id,category,before,after});}
 }
 for(const field of ['name','calendarId','mainStart','calendars','worldReferences','views'] as const)if(JSON.stringify(left.content[field])!==JSON.stringify(right.content[field]))records.push({id:field,category:'作品設定',before:left.content[field],after:right.content[field]});
 return {paragraphs,records};
}
function install(project:ProjectData,before:Entity,after:Entity):ProjectData{return {...project,entities:remapEditedTextReferences(project.entities.map(e=>e.id===before.id?after:e),before,after),relations:remapEditedTextRelationReferences(project.relations,before,after)};}
function sourceAnchorText(content:Pick<ProjectData,'entities'>,anchor:ContentAnchor):string|undefined {
 const entities=content.entities.filter(e=>e.id===(anchor.lineId??anchor.entityId)&&!e.deletedAt);
 if(entities.length!==1)return undefined;
 if(anchor.blockId){const blocks=richFields(entities[0]).flatMap(([,blocks])=>blocks).filter(b=>b.id===anchor.blockId);return blocks.length===1?blocks[0].text:undefined;}
 if(anchor.lineId){const text=richFields(entities[0]).find(([field])=>field==='text');return text?.[1].map(b=>b.text).join('\n');}
 return undefined;
}
/** Source anchors already use source coordinates. Bind changed, unselected targets
 * to that immutable edition rather than guessing a current-draft location. */
function bindRestoredSourceAnchors(block:Block,source:ProjectSnapshot,final:ProjectData):Block {
 const walk=(value:unknown):unknown=>{
  if(Array.isArray(value))return value.map(walk);
  if(!value||typeof value!=='object')return value;
  const object=value as Record<string,unknown>;
  if(typeof object.entityId==='string'){
   const anchor=object as unknown as ContentAnchor;
   if(anchor.positionStatus==='unresolved'||anchor.sourceVersionId&&anchor.sourceVersionId!==final.projectId)return structuredClone(anchor);
   const hasPosition=!!(anchor.blockId||anchor.lineId)||typeof anchor.start==='number'||typeof anchor.end==='number';
   const sourceText=sourceAnchorText(source.content,anchor),finalText=sourceAnchorText(final,anchor);
   const sameTarget=hasPosition?sourceText!==undefined&&sourceText===finalText:final.entities.some(e=>e.id===anchor.entityId&&!e.deletedAt);
   return sameTarget?structuredClone(anchor):{...structuredClone(anchor),sourceVersionId:source.id};
  }
  return Object.fromEntries(Object.entries(object).map(([key,child])=>[key,walk(child)]));
 };
 return walk(block) as Block;
}
/** Confirmation records anchor effects separately from restored text. */
export function paragraphRestoreReferenceEffects(before:ProjectData,after:ProjectData){
 const anchors=(value:unknown):ContentAnchor[]=>{
  if(Array.isArray(value))return value.flatMap(anchors);
  if(!value||typeof value!=='object')return [];
  const object=value as Record<string,unknown>;
  return [...(typeof object.entityId==='string'?[object as unknown as ContentAnchor]:[]),...Object.values(object).flatMap(anchors)];
 };
 const effects:Array<{scope:'entity'|'relation';id:string;before:ContentAnchor[];after:ContentAnchor[]}>=[];
 for(const [scope,previous,current]of [['entity',before.entities,after.entities],['relation',before.relations,after.relations]] as const){const byId=new Map<string,unknown>(previous.map(record=>[record.id,record]));for(const record of current){const oldAnchors=anchors(byId.get(record.id)),newAnchors=anchors(record);if(JSON.stringify(oldAnchors)!==JSON.stringify(newAnchors))effects.push({scope,id:record.id,before:oldAnchors,after:newAnchors});}}
 return effects;
}
export function restoreSelectedParagraphs(project:ProjectData,source:ProjectSnapshot,selected:ParagraphSelection[]):ProjectData{
 if(!selected.length||new Set(selected.map(selectionKey)).size!==selected.length)throw new Error('復元する段落を重複なく選んでください。');
 // Resolve every selection before creating any changes. Never infer positions by text.
 const resolved=selected.map(s=>({s,source:locate(source.content,s).block,current:locate(project,s).block}));
 let next=project;for(const {s,source:block}of resolved){const {entity,blocks}=locate(next,s);const after={...entity,data:{...entity.data,[s.field]:restoreRichTextBlock(blocks,block)}} as Entity;next=install(next,entity,after);}
 // Current-origin references have now traversed every current-to-restored edit.
 // Publish source-origin blocks only after all edits, independent of selection order.
 const final=next;
 for(const {s,source:block}of resolved){const {entity,blocks}=locate(next,s);next={...next,entities:next.entities.map(e=>e.id===entity.id?{...entity,data:{...entity.data,[s.field]:blocks.map(b=>b.id===s.blockId?bindRestoredSourceAnchors(block,source,final):b)}} as Entity:e)};}
 return next;
}
function quotationPositions(chars:string[]):Set<number> {
 const stack:string[]=[],positions=new Set<number>(),pairs:Record<string,string>={'「':'」','『':'』','“':'”'};
 for(let index=0;index<chars.length;index++){const char=chars[index];if(stack.length)positions.add(index);if(pairs[char])stack.push(pairs[char]);else if(char==='"'){if(stack.at(-1)==='"')stack.pop();else stack.push('"');}else if(stack.at(-1)===char)stack.pop();}
 return positions;
}
export function findReplacementOccurrences(project:ProjectData,term:string):ReplacementOccurrence[]{
 if(!term)return [];const needle=Array.from(term),rows:ReplacementOccurrence[]=[];
 const namedCandidates=project.entities.filter(e=>e.kind==='character'&&!e.deletedAt&&e.name===term).map(e=>e.id);
 const entitiesById=new Map(project.entities.map(e=>[e.id,e])),snapshotsById=new Map(project.snapshots.map(s=>[s.id,s]));
 const scenesByLine=new Map<string,Entity>(),chaptersByScene=new Map<string,Entity>();for(const e of project.entities){if(e.kind==='scene')for(const id of e.data.dialogueLineIds??[])scenesByLine.set(id,e);if(e.kind==='chapter')for(const id of e.data.sceneIds??[])chaptersByScene.set(id,e);}
 for(const entity of project.entities.filter(e=>!e.deletedAt))for(const [field,blocks]of richFields(entity))for(const block of blocks){const chars=Array.from(block.text),quoted=quotationPositions(chars);for(let start=0;start<=chars.length-needle.length;start++){if(chars.slice(start,start+needle.length).join('')!==term)continue;const end=start+needle.length;
 const scene=entity.kind==='dialogue_line'?scenesByLine.get(entity.id):entity;
 const chapter=chaptersByScene.get(scene?.id??'');
 const links=(block.links??[]).filter(l=>l.start<=start&&l.end>=end);
 rows.push({entityId:entity.id,field,blockId:block.id,start,end,text:term,context:chars.slice(Math.max(0,start-24),Math.min(chars.length,end+24)).join(''),entityName:entity.name,chapter:chapter?.name??'章未指定',kind:entity.kind,quoted:block.kind==='quote'||quoted.has(start),referenceIds:[...new Set(links.map(l=>l.target.entityId))],candidateIds:links.length?[]:namedCandidates,referenceDescriptions:links.map(l=>{const version=l.target.sourceVersionId;const target=version&&version!==project.projectId?snapshotsById.get(version)?.content.entities.find(e=>e.id===l.target.entityId):entitiesById.get(l.target.entityId);return `${target?.name??'対象版を確認できません'} · ${l.target.entityId}${version?` · 版 ${version}`:''}`;})});
 }}return rows;
}
export function replaceSelectedOccurrences(project:ProjectData,term:string,replacement:string,selected:ReplacementOccurrence[]):ProjectData{
 if(!term||!replacement||/[\r\n]/.test(replacement)||!selected.length||new Set(selected.map(occurrenceKey)).size!==selected.length)throw new Error('置換する語句と一致位置を重複なく選んでください。');
 const available=new Map(findReplacementOccurrences(project,term).map(row=>[occurrenceKey(row),row]));
 for(const row of selected){locate(project,row);if(JSON.stringify(available.get(occurrenceKey(row)))!==JSON.stringify(row))throw new Error('一致位置・参照先が変わりました。再検索してください。');}
 const ordered=[...selected].sort((a,b)=>selectionKey(a).localeCompare(selectionKey(b))||b.start-a.start);
 for(let i=1;i<ordered.length;i++)if(selectionKey(ordered[i])===selectionKey(ordered[i-1])&&ordered[i].end>ordered[i-1].start)throw new Error('重なる一致位置を選び直してください。');
 let next=project;for(const row of ordered){const {entity,blocks,block}=locate(next,row);let offset=row.start;for(const b of blocks){if(b.id===block.id)break;offset+=Array.from(b.text).length+1;}
 const chars=Array.from(blocks.map(b=>b.text).join('\n'));const text=[...chars.slice(0,offset),replacement,...chars.slice(offset+Array.from(term).length)].join('');
 const after={...entity,data:{...entity.data,[row.field]:editRichText(blocks,text,{start:offset,end:offset+Array.from(term).length})}} as Entity;next=install(next,entity,after);
 }return next;
}
