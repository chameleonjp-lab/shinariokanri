import type {Entity,EntityKind,ProjectData,RichText} from '../domain/types';
import {createEntity,createProject,emptyValidity} from '../domain/model';
export interface PerformanceFixture {project:ProjectData;seed:string;size:'standard'|'large';counts:Record<string,number>;sha256:string;assetBytes:number}
export async function createPerformanceFixture(seed:string,size:'standard'|'large'='standard'):Promise<PerformanceFixture> {
 let hash=2166136261;for(const c of seed)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const prefix=hash.toString(16).padStart(8,'0');let counter=1;
 const id=()=>`${prefix}-0000-4000-8000-${(counter++).toString(16).padStart(12,'0')}`;
 const project=createProject('性能固定データ');project.projectId=id();
 const factor=size==='large'?10:1;
 const names=['アオ','門番','記録係','旅人','語り手'];
 const alphabet=Array.from('霧の町で古い記録を調べる。鍵はまだ見つからず、新しい手掛かりを探した。');
 const repeated=(length:number)=>Array.from({length},(_,i)=>alphabet[i%alphabet.length]).join('');
 const rich=(length:number):RichText=>[{id:id(),kind:'paragraph',text:repeated(length)}];
 const add=<K extends EntityKind>(kind:K,name:string,data?:Record<string,unknown>):Entity<K>=>{
  const e=createEntity(project.projectId,kind,name,data as never);e.id=id();e.createdAt=e.updatedAt='2026-10-05T00:00:00Z';project.entities.push(e);return e;
 };
 const characters:Entity<'character'>[]=[];
 for(let i=0;i<100*factor;i++)characters.push(add('character',`${names[i%names.length]}${i}`,{reading:`あお${i}`,body:rich(300),aliases:[{id:id(),text:`記録名${i}`,reading:`きろくめい${i}`,validity:emptyValidity(),audienceHolderIds:[],isPublicDefault:true}]}));
 const variables:Entity<'variable'>[]=[];
 for(let i=0;i<100*factor;i++)variables.push(add('variable',`状態${i}`,{key:`flag_${i}`,valueType:'boolean',scope:'run',initial:{type:'boolean',value:false},allowed:{values:[false,true]}}));
 const events:Entity<'event'>[]=[];
 for(let i=0;i<1000*factor;i++)events.push(add('event',`出来事${i}`,{summary:rich(80),time:i%7===0?{mode:'unknown',reason:'未確定'}:i%3===0?{mode:'interval',start:String(i*86400-500000),end:String(i*86400-500000+3600),calendarId:project.calendarId}:{mode:'instant',at:String(i*86400-500000),calendarId:project.calendarId},laneRole:i%4===0?'common':'participants',participants:i%4===0?[]:[{characterId:characters[i%characters.length]!.id,role:'actor'}]}));
 const scenes:Entity<'scene'>[]=[];
 for(let i=0;i<500*factor;i++) {
  const body=rich(300), character=characters[i%characters.length]!;
  body[0]!.links=[{start:0,end:1,target:{entityId:character.id,blockId:character.data.body![0]!.id}}];
  scenes.push(add('scene',`場面${i}`,{summary:rich(80),body,eventIds:[events[i%events.length]!.id],povId:character.id}));
 }
 for(let i=0;i<5000*factor;i++) {
  const text=rich(40);if(i%3===0)text[0]!.ruby=[{start:0,end:1,text:'きり'}];
  add('dialogue_line',`台詞${i}`,{text,speakerId:characters[i%characters.length]!.id});
 }
 for(let i=0;i<100*factor;i++)add('foreshadow',`伏線${i}`,{question:rich(80),intent:rich(80),resolutionPolicy:'undecided'});
 for(let i=0;i<2000*factor;i++)project.relations.push({id:id(),projectId:project.projectId,revision:'0',fromId:characters[i%characters.length]!.id,toId:characters[(i+1)%characters.length]!.id,relationType:'trust',direction:'forward',validity:{worldRange:null,routeCondition:i%2===0?{op:'compare',variableId:variables[i%variables.length]!.id,comparator:'eq',value:{type:'boolean',value:true}}:null,presentationAnchor:null},evidenceIds:[events[i%events.length]!.id],status:'provisional',visibility:'private'});
 const counts={character:characters.length,event:events.length,scene:scenes.length,dialogue_line:5000*factor,relation:project.relations.length,variable:variables.length,foreshadow:100*factor,totalRecords:project.entities.length+project.relations.length};
 const bytes=new TextEncoder().encode(JSON.stringify(project));
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 // Asset bytes are separate; never claim to measure attachments when not present.
 return {project,seed,size,counts,sha256,assetBytes:0};
}
