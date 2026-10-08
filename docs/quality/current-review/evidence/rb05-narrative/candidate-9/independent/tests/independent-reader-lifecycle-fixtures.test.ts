import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEntity,newId,validateProject} from '../src/domain/model';
import {exportScenario,inspectScenario} from '../src/storage/archive';
import {sha256,jsonBytes} from '../src/storage/json';
import {startTrialVerified} from '../src/domain/runtimeVerified';
import {stepTrial} from '../src/domain/runtime';
import type {Entity,ProjectData} from '../src/domain/types';
const out='/tmp/shinariokanri-independent-rb05-narrative-7a40c7c/independent/fixtures';
function save(id:string,x:unknown){writeFileSync(`${out}/${id}.json`,JSON.stringify(x,null,2)+'\n');}
it('RD-fixtures immutable edition and typed author guards remain valid independent inputs',async()=>{
 const f=JSON.parse(readFileSync(out+'/CTX-child-ui-source.json','utf8'));const p:ProjectData=structuredClone(f.native);p.name='独立 固定版の次回開始';p.revision='2';const {snapshots:_s,history:_h,authorAlternatives:_a,...content}=structuredClone(p),versionB=newId();p.snapshots.push({id:versionB,content,contentHash:await sha256(jsonBytes(content)),createdAt:'2026-10-08T10:00:00Z',versionLabel:'選択する別版B'});const trace=p.entities.find((e):e is Entity<'trace'>=>e.id===f.ids.trace&&e.kind==='trace')!;save('RD-version-validation-setup',{validation:validateProject(p)});expect(validateProject(p).ok).toBe(true);await inspectScenario(await exportScenario(p),{worker:false});save('RD-editions',{project:p,versionA:trace.data.contentVersionId,versionB,entry:f.ids.entry,trace:trace.id});
 const variants=[];
 for(const mode of['trigger','unknown']as const){const q:ProjectData=structuredClone(f.project),use=q.entities.find((e):e is Entity<'flow_node'>=>e.id===f.project.entities.find((x:Entity)=>x.kind==='flow_node'&&x.name==='固定呼出元').id&&e.kind==='flow_node')!;const main=q.entities.find((e):e is Entity<'flow_graph'>=>e.kind==='flow_graph'&&e.data.nodeIds.includes(f.ids.entry))!;main.data.nodeIds=main.data.nodeIds.map(id=>id===f.ids.use?use.id:id);(q.entities.find(e=>e.id===f.ids.enter) as Entity<'flow_edge'>).data.toId=use.id;(q.entities.find(e=>e.id===f.ids.leave) as Entity<'flow_edge'>).data.fromId=use.id;if(mode==='trigger')use.data.trigger={id:newId(),event:'manual',eventKey:'固定呼出しを承認',repeat:'once',scope:'run'};else{const v=createEntity(q.projectId,'variable','未取得の呼出し条件',{key:'call_guard',initial:{type:'unknown',value:null,reason:'値未取得'}});q.entities.push(v);use.data.gate={op:'compare',variableId:v.id,comparator:'eq',value:{type:'boolean',value:true}};}save('RD-'+mode+'-validation-setup',{validation:validateProject(q)});expect(validateProject(q).ok).toBe(true);await inspectScenario(await exportScenario(q),{worker:false});const initial=await startTrialVerified(q,{entryId:f.ids.entry,worldTick:'5'}),run=stepTrial(q,initial,{edgeId:f.ids.enter,worldTick:'5'});expect(run.status).toBe(mode==='trigger'?'ready':'unknown');save('RD-'+mode,{project:q,ids:f.ids,run});variants.push({mode,status:run.status});}
 save('RD-fixture-validation',{versionsValid:true,variants});
});
