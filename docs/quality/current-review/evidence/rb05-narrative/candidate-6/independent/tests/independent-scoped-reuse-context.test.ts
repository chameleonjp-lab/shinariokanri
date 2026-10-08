import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createProject, createEntity, newId, validateProject, emptyValidity } from '../src/domain/model';
import type { Entity, EntityKind, ProjectData } from '../src/domain/types';
import { prepareReuse } from '../src/domain/reuse';
import { startChapterReading, presentNextChapterScene } from '../src/domain/presentation';
import { startTrialVerified, replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { preparePartialCheckpoint, previewCheckpointMigration } from '../src/domain/checkpoints';
import { sha256, jsonBytes } from '../src/storage/json';
import { validateProjectIntegrity } from '../src/domain/projectRecordValidation';
import { exportScenario, inspectScenario } from '../src/storage/archive';
const out='/tmp/shinariokanri-independent-rb05-narrative-f51f6b9/independent/fixtures';
function save(id:string,data:unknown){mkdirSync(out,{recursive:true});writeFileSync(`${out}/${id}.json`,JSON.stringify(data,null,2)+'\n');}
function add<K extends EntityKind>(p:ProjectData,kind:K,data:Partial<Entity<K>['data']>={},name:string=kind):Entity<K>{const entity=createEntity(p.projectId,kind,name,data);p.entities.push(entity);return entity;}
async function fixedReuse(scope:'graph'|'chapter'){
 let p=createProject('有限例外付き固定共通場面');const fixed=newId(),evidence=add(p,'source',{locator:'確定根拠'});evidence.status='confirmed';
 const other=add(p,'variable',{key:'other',initial:{type:'boolean',value:true}}),v=add(p,'variable',{key:'borrowed',initial:{type:'boolean',value:true},exclusions:[{variableId:other.id,value:{type:'boolean',value:true},otherValue:{type:'boolean',value:true},reason:'限定期間に確定根拠があるときのみ同時採用',exceptions:[{reason:'固定元の限定期間',evidenceIds:[evidence.id],targetScope:{projectId:p.projectId,targetSnapshotId:fixed},validity:{...emptyValidity(),worldRange:{start:'0',end:'10'}}}]}]});
 const source=add(p,'scene',{body:[{id:newId(),kind:'paragraph',text:'限定期間内の固定本文',links:[{start:0,end:2,target:{entityId:v.id}}]}]},'固定共通元'),use=add(p,'scene',{},'使用先'),chapter=add(p,'chapter',{sceneIds:[use.id]},'使用先章');use.data.chapterId=chapter.id;
 const entry=add(p,'flow_node',{nodeType:'entry',sceneId:use.id}),end=add(p,'flow_node',{nodeType:'terminal',terminalReason:'正規終了'}),edge=add(p,'flow_edge',{fromId:entry.id,toId:end.id});const graph=add(p,'flow_graph',{nodeIds:[entry.id,end.id],edgeIds:[edge.id],entryIds:[entry.id],exitIds:[end.id]});v.data.exclusions![0].exceptions![0].targetScope[scope==='graph'?'graphId':'chapterId']=scope==='graph'?graph.id:chapter.id;
 const{snapshots:_s,history:_h,authorAlternatives:_a,...content}=structuredClone(p);p.snapshots.push({id:fixed,content,contentHash:await sha256(jsonBytes(content)),createdAt:'2026-10-08T08:00:00Z',versionLabel:'元版'});v.data.initial={type:'boolean',value:false};v.data.exclusions=[];
 const original=await startTrialVerified(p,{contentVersionId:fixed,entryId:entry.id,worldTick:'5'});p=(await prepareReuse(p,{ownerId:use.id,sourceId:source.id,snapshotId:fixed,mode:'reference'})).candidate;return{p,use,chapter,entry,fixed,original};
}

for(const scope of ['graph','chapter']as const)it(`CTX-${scope} preserves a fixed exception limited to the unchanged use-site scope`,async()=>{
 const f=await fixedReuse(scope),flow=await startTrialVerified(f.p,{entryId:f.entry.id,worldTick:'5'});let chapterStatus='',chapterError='';if(scope==='chapter'){try{chapterStatus=(await startChapterReading(f.p,{chapterIds:[f.chapter.id],worldTick:'5'})).status;}catch(e){chapterError=(e as Error).message;}}
 save(`CTX-${scope}`,{project:f.p,validation:validateProject(f.p),original:f.original,flow,chapterStatus,chapterError});expect(validateProject(f.p).ok).toBe(true);expect(f.original.status).toBe('ready');expect(flow.status).toBe('ready');if(scope==='chapter'){expect(chapterError).toBe('');expect(chapterStatus).toBe('ready');}
});
