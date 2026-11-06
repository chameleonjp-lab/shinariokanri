import {createEntity,textToRichText} from './model';
import {appendAlternativeVersion,forkAuthorAlternative,projectContent,orderedScenes} from './writingWorkspace';
import {adoptedRecord} from './adoption';
import {canonicalJson} from '../storage/json';
import type {ProjectContent,ProjectData,Entity} from './types';
const LIMIT=1024*1024;
export interface TweeIssue {line:number;original:string;message:string;blocking:boolean}
export interface TweePassage {name:string;body:string;line:number;links:{label:string;target:string;line:number}[]}
export interface TweePreview {original:string;passages:TweePassage[];issues:TweeIssue[]}
export function parseTwee(original:string):TweePreview {
 if(!original.trim()||new TextEncoder().encode(original).length>LIMIT)throw Error('Twee原稿は空でないUTF-8文字列で1 MiB以下にしてください。');
 const passages:TweePassage[]=[],issues:TweeIssue[]=[];let current:TweePassage|undefined;const bodies=new Map<TweePassage,string[]>();
 original.replace(/^\uFEFF/,'').split(/\r?\n/).forEach((line,index)=>{const number=index+1;
  if(line.startsWith('::')){const header=/^::\s+([^\[\]{}]+?)(?:\s*(\[[^\]]*\]|\{.*\}).*)?$/.exec(line);if(!header){issues.push({line:number,original:line,message:'未対応の場面見出しです。',blocking:true});current=undefined;return;}current={name:header[1].trim(),body:'',line:number,links:[]};passages.push(current);bodies.set(current,[]);if(header[2])issues.push({line:number,original:line,message:'タグ・位置などの見出し情報は原文に保管します。',blocking:false});return;}
  if(!current){if(line.trim())issues.push({line:number,original:line,message:'場面外の文字を原文に保管します。',blocking:false});return;}
  if(/<<|<\/?[a-z!]|\([\w-]+\s*:|\]\[|\{\{|\$[A-Za-z_]/i.test(line)){issues.push({line:number,original:line,message:'未対応の命令・マークアップは実行せず原文に保管します。',blocking:false});return;}
  const plain=line.replace(/\[\[([^\[\]\n]+)\]\]/g,(_all,inside:string)=>{let label=inside,target=inside;if(inside.includes('->'))[label,target]=inside.split('->');else if(inside.includes('<-'))[target,label]=inside.split('<-');else if(inside.includes('|'))[label,target]=inside.split('|');if(!label?.trim()||!target?.trim()||/[\[\]{}$<>]/.test(target)||/->|<-|\|/.test(target)){issues.push({line:number,original:line,message:'動的・複雑なリンクは未対応です。',blocking:true});return '';}current!.links.push({label:label.trim(),target:target.trim(),line:number});return '';});
  if(/\[\[|\]\]/.test(plain)){issues.push({line:number,original:line,message:'未対応のリンク記法です。',blocking:false});return;}bodies.get(current)!.push(plain);
 });
 if(!passages.length||passages.length>500)throw Error('場面見出しは1〜500件です。');
 for(const passage of passages){passage.body=bodies.get(passage)!.join('\n').trim();if(!passage.name||passages.filter(p=>p.name===passage.name).length>1)issues.push({line:passage.line,original:passage.name,message:'場面名が空または重複しています。',blocking:true});for(const link of passage.links)if(passages.filter(p=>p.name===link.target).length!==1)issues.push({line:link.line,original:link.target,message:'リンク先が不明または重複しています。',blocking:true});}
 return {original,passages,issues};
}
export function importTweeAlternative(project:ProjectData,preview:TweePreview,name:string){
 const checked=parseTwee(preview.original);if(canonicalJson(checked)!==canonicalJson(preview)||checked.issues.some(issue=>issue.blocking))throw Error('原文と確認結果が変わったか、未解決の場面・リンクがあります。');
 const branch=forkAuthorAlternative(project,name),content=projectContent(project),chapter=createEntity(project.projectId,'chapter',name),nodes:Entity<'flow_node'>[]=[],edges:Entity<'flow_edge'>[]=[],scenes=preview.passages.map(p=>createEntity(project.projectId,'scene',p.name,{body:textToRichText(p.body),chapterId:chapter.id}));
 chapter.data.sceneIds=scenes.map(scene=>scene.id);
 for(let i=0;i<scenes.length;i++)nodes.push(createEntity(project.projectId,'flow_node',scenes[i].name,{nodeType:i===0&&preview.passages[i].links.length?'entry':preview.passages[i].links.length?'scene':'terminal',sceneId:scenes[i].id,executionPolicy:preview.passages[i].links.length>1?'manual_choice':'first_match',terminalReason:preview.passages[i].links.length?null:'Twee原稿の終端'}));
 for(let i=0;i<nodes.length;i++)for(const [priority,link] of preview.passages[i].links.entries())edges.push(createEntity(project.projectId,'flow_edge',link.label,{fromId:nodes[i].id,toId:nodes[preview.passages.findIndex(p=>p.name===link.target)].id,label:link.label,edgeType:'choice',priority}));
 let entry=nodes[0];if(entry.data.nodeType!=='entry'){entry=createEntity(project.projectId,'flow_node','Twee開始',{nodeType:'entry',executionPolicy:'first_match'});entry.customValues.tweeSyntheticEntry=true;edges.unshift(createEntity(project.projectId,'flow_edge','開始',{fromId:entry.id,toId:nodes[0].id,edgeType:'automatic'}));nodes.unshift(entry);}
 const graph=createEntity(project.projectId,'flow_graph',name,{nodeIds:nodes.map(n=>n.id),edgeIds:edges.map(e=>e.id),entryIds:[entry.id],exitIds:nodes.filter(n=>n.data.nodeType==='terminal').map(n=>n.id)});
 const recovery=createEntity(project.projectId,'note','Twee原文の保管');recovery.visibility='private';recovery.customValues.tweeOriginal=preview.original;recovery.customValues.tweeIssues=preview.issues.map(i=>`${i.line}: ${i.message}`).join('\n');
 return appendAlternativeVersion(branch,{...content,entities:[...content.entities,chapter,...scenes,...nodes,...edges,graph,recovery]},'Twee原稿を取り込んだ版');
}
export function exportTweeAlternative(content:ProjectContent){
 const scenes=orderedScenes({...content,history:[],snapshots:[]}).filter(adoptedRecord),nodes=content.entities.filter((e):e is Entity<'flow_node'>=>e.kind==='flow_node'&&adoptedRecord(e)),byNode=new Map(nodes.map(n=>[n.id,n])),omissions:string[]=[];
 const originals=content.entities.flatMap(e=>typeof e.customValues.tweeOriginal==='string'?[{filename:`Twee原文-${e.id}.twee`,mimeType:'text/plain;charset=utf-8',content:e.customValues.tweeOriginal}]:[]);
 for(const e of content.entities){if(typeof e.customValues.tweeIssues==='string'&&e.customValues.tweeIssues)omissions.push('未対応記法: '+e.customValues.tweeIssues);if(e.kind==='dialogue_line'&&(e.data.scriptKind||e.data.scriptNumber))omissions.push(`${e.name}: scriptKind/scriptNumber はTweeの対応範囲外です。`);if(e.kind==='flow_edge'&&(e.data.condition||e.data.effectIds?.length))omissions.push(`${e.name}: 条件・効果は出力しません。`);if(e.kind==='scene'&&e.data.body.some(b=>b.ruby?.length||b.links?.length||b.kind!=='paragraph'))omissions.push(`${e.name}: ルビ・注記・段落種は平文にします。`);}
 for(const entity of content.entities.filter(adoptedRecord)){if(!['chapter','scene','flow_node','flow_edge','flow_graph'].includes(entity.kind))omissions.push(`${entity.name}: ${entity.kind} の設定はTwee本文へ含めません。`);if(entity.kind==='flow_node'&&(entity.data.gate||entity.data.trigger||entity.data.childGraphId||entity.data.fallbackId))omissions.push(`${entity.name}: ノード条件・効果は出力しません。`);}
 for(const node of nodes)if(!node.data.sceneId&&!node.customValues.tweeSyntheticEntry)omissions.push(`${node.name}: 場面を持たないノードの開始・呼出し規則は出力しません。`);
 const unsafe=scenes.some(s=>!s.name||/[\n\r\[\]{}<>|]/.test(s.name)||s.name.includes('->')||s.name.includes('<-')||scenes.filter(other=>other.name===s.name).length>1);
 if(unsafe||!scenes.length)return {omissions:[...omissions,'場面名が空・重複・未対応文字のため出力できません。'],originals,artifact:undefined};
 const parts=scenes.map(scene=>{const own=nodes.filter(n=>n.data.sceneId===scene.id);if(own.length>1)omissions.push(`${scene.name}: 複数ノードのリンクは省きます。`);const node=own.length===1?own[0]:undefined;const links=node?content.entities.filter((e):e is Entity<'flow_edge'>=>e.kind==='flow_edge'&&adoptedRecord(e)&&e.data.fromId===node.id).sort((a,b)=>(a.data.priority??0)-(b.data.priority??0)).flatMap(edge=>{const target=typeof edge.data.toId==='string'?byNode.get(edge.data.toId):undefined,destination=scenes.find(s=>s.id===target?.data.sceneId),label=edge.data.label||edge.name||destination?.name;if(!destination||!label||/[\[\]\n\r|]/.test(label)||label.includes('->')||label.includes('<-')){omissions.push(`${edge.name}: 未対応・不明なリンクを省きます。`);return [];}return [`[[${label}->${destination.name}]]`];}):[];const body=scene.data.body.map(b=>b.text).join('\n').split('\n').filter(line=>{if(/^::|<<|<\/?[a-z!]|\([\w-]+\s*:|\[\[|\]\]|\{\{|\$[A-Za-z_]/i.test(line)){omissions.push(`${scene.name}: 対応外の本文記法を原文回収へ分けます。`);return false;}return true;}).join('\n');return `:: ${scene.name}\n${body}${links.length?'\n'+links.join('\n'):''}`;});
 if(omissions.length)originals.push({filename:'Twee対応外情報.json',mimeType:'application/json',content:JSON.stringify(content,null,2)});
 return {omissions,originals,artifact:{filename:'原稿.twee',mimeType:'text/plain;charset=utf-8',content:parts.join('\n\n')}};
}
