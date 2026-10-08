import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { readFileSync,writeFileSync } from 'node:fs';
import { unzipSync,zipSync } from 'fflate';
import { createProject,createEntity,newId,textToRichText,validateProject } from '../src/domain/model';
import { ScenarioStore,type FaultStage } from '../src/storage/store';
import { inspectScenario,exportScenario } from '../src/storage/archive';
import { collectImportIds } from '../src/storage/importMapping';
import { projectWithRecoveryHistory } from '../src/storage/recovery';
import { jsonBytes,sha256 } from '../src/storage/json';
import { replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import type { ProjectData,Entity } from '../src/domain/types';
const root='/tmp/shinariokanri-independent-rb06-cd38e34';
const dbs:ScenarioStore[]=[];
const open=(faultInjector?:(s:FaultStage)=>void,name=`independent-${newId()}`)=>{const d=new ScenarioStore({databaseName:name,faultInjector,accountId:'test-local-no-auth'});dbs.push(d);return d;};
afterEach(async()=>{for(const d of dbs.splice(0))await d.deleteDatabase();});
const input=()=>JSON.parse(readFileSync(root+'/tests/fixtures/rb05-reader-editions.json','utf8')).project as ProjectData;
const record=(id:string,data:unknown)=>writeFileSync(root+'/independent/fixtures/'+id+'.json',JSON.stringify(data,null,2)+'\n');
const makeMap=(source:ProjectData,target:ProjectData)=>Object.fromEntries(collectImportIds(source).map(r=>[r.id,r.role==='project'?target.projectId:newId()]));
async function basic(db:ScenarioStore){const p=createProject('保存済みの統合先');p.entities.push(createEntity(p.projectId,'note','保つ単体',{body:textToRichText('残す😀内容')}));return (await db.saveProject(p,{reason:'既存を原子保存'})).project;}
async function approved(db:ScenarioStore,prepared:any,target:ProjectData,idMap:any){let q=await db.previewImport(prepared,{mode:'mapped_merge',targetProjectId:target.projectId,idMap});const resolutions=Object.fromEntries(q.conflicts.map(c=>[c.id,'existing']));q=await db.previewImport(prepared,{mode:'mapped_merge',targetProjectId:target.projectId,idMap,resolutions});return {q,resolutions};}

it('R6I01 genuine fixed child trace: empty restore and clone retain inventory ID, clock and full-origin replay',async()=>{
 const p=input(),prepared=await inspectScenario(await exportScenario(p),{worker:false}),trace=p.entities.find(e=>e.kind==='trace')!,item=p.entities.find(e=>e.kind==='item')!;
 expect(validateProject(p).ok).toBe(true);expect(collectImportIds(p).filter(x=>x.id===item.id)).toEqual([{id:item.id,role:'entity:item'}]);
 const db=open(),n=await db.importScenario(prepared,{mode:'new'}),c=await db.importScenario(prepared,{mode:'clone'}),proof=[];
 for(const result of[n,c]){const cp=(await db.getProject(result.project.projectId))!,t=result.idMap?.[trace.id]??trace.id,s=await replaySavedTraceVerified(cp,t);expect(s.status).toBe('terminal');expect(s.initialWorldTick).toBe('5');expect(s.startState.provenance).toBe('full_play');expect(s.state.itemInstances).toHaveLength(1);expect(s.state.itemInstances[0].instanceId).toBe(result.idMap?.[item.id]??item.id);const bytes=await db.exportProject(cp.projectId);const again=await inspectScenario(bytes,{worker:false});expect((await replaySavedTraceVerified(again.project,t)).status).toBe('terminal');proof.push({idMap:result.idMap,s,again});}
 expect((await db.getProject(n.project.projectId))).toEqual(p);record('R6I01',proof);
});
it('R6I02 full explicit ID merge keeps fixed child execution at the old immutable source edition',async()=>{
 const prepared=await inspectScenario(await exportScenario(input()),{worker:false}),db=open(),target=await basic(db),idMap=makeMap(prepared.project,target),{q,resolutions}=await approved(db,prepared,target,idMap),trace=prepared.project.entities.find(e=>e.kind==='trace')!;
 const result=await db.importScenario(prepared,{mode:'mapped_merge',targetProjectId:target.projectId,baseRevision:target.revision,idMap,resolutions,confirmationHash:q.confirmationHash});
 const loaded=(await db.getProject(target.projectId))!,s=await replaySavedTraceVerified(loaded,idMap[trace.id]);record('R6I02',{prepared,q,result,loaded,s});expect(s.status).toBe('terminal');expect(s.initialWorldTick).toBe('5');expect(s.state.itemInstances).toHaveLength(1);expect(loaded.name).toBe(target.name);expect(loaded.entities.some(e=>e.id===target.entities[0].id)).toBe(true);expect((await db.listRestorePoints(target.projectId))[0].project).toEqual(target);
});
it('R6I03 arbitrary old search restores one entity, then whole content, preserving all immutable versions and history',async()=>{
 const prepared=await inspectScenario(new Uint8Array(readFileSync(root+'/tests/fixtures/rb06-history.scenario')),{worker:false}),db=open();await db.importScenario(prepared,{mode:'new'});let p=(await db.getProject(prepared.project.projectId))!,first=p.history[0],scene=first.after.entities[0];expect(p.history.length).toBeGreaterThan(50);
 const match=await db.historyPage(p.projectId,{query:first.operationId}),last=await db.historyPage(p.projectId,{page:999,size:30});expect(match.total).toBe(1);expect(last.entries.some(e=>e.operationId===first.operationId)).toBe(true);
 p=(await db.restoreEntity(p.projectId,first.operationId,scene.id,'after',p.revision)).project;expect(p.name).toBe(prepared.project.name);expect(p.entities.find(e=>e.id===scene.id)?.name).toBe(scene.name);expect(p.snapshots).toEqual(prepared.project.snapshots);
 const q=await db.previewRestoreVersion(p.projectId,first.operationId,'after');p=(await db.restoreHistoryVersion(p.projectId,q)).project;expect(p.name).toBe(first.after.name);expect(p.snapshots).toEqual(prepared.project.snapshots);expect(p.history.slice(0,prepared.project.history.length)).toEqual(prepared.project.history);expect(p.history.length).toBe(prepared.project.history.length+2);
 const recovered=await inspectScenario(await db.exportProject(p.projectId),{worker:false}),empty=open();await empty.importScenario(recovered,{mode:'new'});expect(await empty.getProject(p.projectId)).toEqual(p);record('R6I03',{match,last,p,recovery:recovered.recovery});
});
it('R6I04 stale and forged old-version approvals refuse atomically without losing the original selection',async()=>{
 const d=open(),p=await basic(d),cmd=p.history[0],q=await d.previewRestoreVersion(p.projectId,cmd.operationId,'after');const next=(await d.saveProject({...p,name:'確認後の新しい変更'},{reason:'確認後保存'})).project;
 await expect(d.restoreHistoryVersion(p.projectId,q)).rejects.toMatchObject({code:'REVISION_CONFLICT'});const fresh=await d.previewRestoreVersion(p.projectId,cmd.operationId,'after');await expect(d.restoreHistoryVersion(p.projectId,{...fresh,side:'before'})).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(await d.getProject(p.projectId)).toEqual(next);expect(await d.listRestorePoints(p.projectId)).toEqual([]);expect((await d.historyCommand(p.projectId,cmd.operationId)).operationId).toBe(cmd.operationId);
});
it('R6I05 portable pending preserves exact sequence, commands and original server base; restored intents remain quarantined',async()=>{
 const source=open();let p=await basic(source);for(let i=0;i<3;i++)p=(await source.saveProject({...p,name:'確定前 '+i},{reason:'保存 '+i})).project;
 const before=await source.listOutbox(p.projectId),prepared=await inspectScenario(await source.exportProject(p.projectId),{worker:false}),target=open();expect(prepared.recovery!.pending.map(x=>x.operationId)).toEqual(before.map(x=>x.operationId));expect(JSON.stringify(prepared.recovery)).not.toContain('test-local-no-auth');await target.importScenario(prepared,{mode:'new'});
 const retained=await target.listRecoveredPending(p.projectId);expect(retained.map(x=>x.operation.command)).toEqual(before.map(x=>x.command));expect(retained.every(x=>x.status==='needs_reconnect')).toBe(true);expect(retained.map(x=>x.operation.origin?.serverRevision)).toEqual(before.map(x=>x.baseRevision));const again=await inspectScenario(await target.exportProject(p.projectId),{worker:false});expect(again.recovery!.pending.slice(0,before.length)).toEqual(prepared.recovery!.pending);record('R6I05',{prepared:prepared.recovery,retained,again:again.recovery});
});
it('R6I06 other-role inventory-ID collisions remain rejected while same declared item is accepted',async()=>{
 const p=input();const trace=p.entities.find((e):e is Entity<'trace'>=>e.kind==='trace')!,v=p.entities.find(e=>e.kind==='variable')!;for(const s of trace.data.steps)for(const state of[s.before,s.after])for(const item of state.itemInstances)item.instanceId=v.id;
 expect(()=>collectImportIds(p)).toThrow('種別・所有者');
});
it('R6I07 material bytes and old material history survive metadata warning, full import and clone without silent completion',async()=>{
 const d=open(),bytes=new TextEncoder().encode('独立素材😀\nversion1'),hash=await sha256(bytes),p=createProject('素材付き復元');p.entities.push(createEntity(p.projectId,'attachment','素材',{mediaType:'text/plain',contentHash:hash,assetPath:`assets/${hash}.txt`,byteSize:bytes.length}));const saved=(await d.saveProject(p,{reason:'素材を確定',assets:[{bytes,contentHash:hash,mediaType:'text/plain'}]})).project;
 const light=await inspectScenario(await d.exportProject(p.projectId,{assetMode:'metadata_only'}),{worker:false});expect(light.summary.missingAssets).toBe(1);expect(light.warnings.join('')).toContain('完全');const missing=open();await missing.importScenario(light,{mode:'new'});await expect(missing.exportProject(p.projectId)).rejects.toMatchObject({code:'ASSET_MISSING'});
 const full=await inspectScenario(await d.exportProject(p.projectId),{worker:false}),empty=open();for(const mode of['new','clone']as const){const result=await empty.importScenario(full,{mode});expect(await empty.getAsset(hash)).toEqual(bytes);const re=await inspectScenario(await empty.exportProject(result.project.projectId),{worker:false});expect(re.assets[0].bytes).toEqual(bytes);expect(re.summary.missingAssets).toBe(0);}expect(await d.getProject(p.projectId)).toEqual(saved);record('R6I07',{saved,light:{summary:light.summary,warnings:light.warnings},full:full.summary});
});
it.each(['after-content','after-history','after-outbox','before-commit']as const)('R6I08 %s mapped-merge quota failure leaves every prior table image unchanged and supports exact retry',async stage=>{
 let fail=false;const d=open(s=>{if(fail&&s===stage)throw new DOMException('Independent quota','QuotaExceededError');}),target=await basic(d),source=input(),prepared=await inspectScenario(await exportScenario(source),{worker:false}),idMap=makeMap(source,target),{q,resolutions}=await approved(d,prepared,target,idMap),priorOutbox=await d.listOutbox(target.projectId),options={mode:'mapped_merge' as const,targetProjectId:target.projectId,baseRevision:target.revision,idMap,resolutions,confirmationHash:q.confirmationHash};fail=true;
 await expect(d.importScenario(prepared,options)).rejects.toMatchObject({code:'QUOTA_EXCEEDED'});expect(await d.getProject(target.projectId)).toEqual(target);expect(await d.listOutbox(target.projectId)).toEqual(priorOutbox);expect(await d.listRecoveredPending(target.projectId)).toEqual([]);expect(await d.listRestorePoints(target.projectId)).toEqual([]);fail=false;const r=await d.importScenario(prepared,options);expect(r.project.revision).toBe('2');
});
it('R6I09 file corruption, required unknown feature, and small safety limit refuse before any target mutation',async()=>{
 const d=open(),target=await basic(d),original=await exportScenario(input()),entries=unzipSync(original),manifest=JSON.parse(new TextDecoder().decode(entries['manifest.json']));entries['data/project.json'][5]^=1;await expect(inspectScenario(zipSync(entries),{worker:false})).rejects.toMatchObject({code:'HASH_MISMATCH'});
 const unknown=unzipSync(original);manifest.requiredFeatures=['unknown-v999'];unknown['manifest.json']=new Uint8Array(jsonBytes(manifest));await expect(inspectScenario(zipSync(unknown),{worker:false})).rejects.toMatchObject({code:'FORMAT_UNSUPPORTED'});await expect(inspectScenario(original,{worker:false,limits:{compressedBytes:original.length-1}})).rejects.toMatchObject({code:'LIMIT_EXCEEDED'});expect(await d.getProject(target.projectId)).toEqual(target);expect((await d.listProjects()).length).toBe(1);
});
it('R6I10 cancellation after writing history rolls back mapped content, pending and restore point',async()=>{
 const abort=new AbortController();let active=false;const d=open(stage=>{if(active&&stage==='after-history')abort.abort();}),target=await basic(d),source=input(),prepared=await inspectScenario(await exportScenario(source),{worker:false}),idMap=makeMap(source,target),{q,resolutions}=await approved(d,prepared,target,idMap);active=true;
 await expect(d.importScenario(prepared,{mode:'mapped_merge',targetProjectId:target.projectId,baseRevision:target.revision,idMap,resolutions,confirmationHash:q.confirmationHash,signal:abort.signal})).rejects.toMatchObject({code:'CANCELLED'});expect(await d.getProject(target.projectId)).toEqual(target);expect(await d.listRestorePoints(target.projectId)).toEqual([]);expect(await d.listRecoveredPending(target.projectId)).toEqual([]);
});
it('R6I11 rejected migration leaves content and pending unchanged and retains the full pre-migration point',async()=>{
 const d=open(),target=await basic(d),box=await d.listOutbox(target.projectId);await expect(d.migrateProject(target.projectId,p=>({...p,mainStart:'-0'}))).rejects.toMatchObject({code:'VALIDATION_FAILED'});expect(await d.getProject(target.projectId)).toEqual(target);expect(await d.listOutbox(target.projectId)).toEqual(box);expect((await d.listRestorePoints(target.projectId))[0].project).toEqual(target);
});
it('R6I12 explicit map incomplete, duplicate-target and changed accepted payload refuse without touching saved data',async()=>{
 const d=open(),target=await basic(d),source=input(),prepared=await inspectScenario(await exportScenario(source),{worker:false}),map=makeMap(source,target),missing={...map};delete missing[source.entities[0].id];await expect(d.previewImport(prepared,{mode:'mapped_merge',targetProjectId:target.projectId,idMap:missing})).rejects.toMatchObject({code:'IMPORT_CONFLICT'});const collision={...map,[source.entities[0].id]:map[source.entities[1].id]};await expect(d.previewImport(prepared,{mode:'mapped_merge',targetProjectId:target.projectId,idMap:collision})).rejects.toMatchObject({code:'IMPORT_CONFLICT'});
 const {q,resolutions}=await approved(d,prepared,target,map),changed={...map,[source.entities[0].id]:newId()};await expect(d.importScenario(prepared,{mode:'mapped_merge',targetProjectId:target.projectId,baseRevision:target.revision,idMap:changed,resolutions,confirmationHash:q.confirmationHash})).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(await d.getProject(target.projectId)).toEqual(target);
});
it('R6I13 genuine legacy chapter and branch inputs remain fixed and maintain conservative partial coverage after recovery',async()=>{
 const output=[];for(const mode of['flow','chapter']){const path=root+`/docs/quality/current-review/evidence/legacy/3099c9d-${mode}-trace.scenario`,bytes=new Uint8Array(readFileSync(path)),p=await inspectScenario(bytes,{worker:false}),d=open();const result=await d.importScenario(p,{mode:'new'}),round=await inspectScenario(await d.exportProject(result.project.projectId),{worker:false});expect(round.project).toEqual(p.project);const trace=round.project.entities.find((e):e is Entity<'trace'>=>e.kind==='trace')!;if(mode==='flow')expect((await replaySavedTraceVerified(round.project,trace.id)).status).toBe('terminal');else expect(trace.data.startProvenance).not.toBe('full_play');output.push({mode,sourceSha256:await sha256(bytes),project:round.project});}record('R6I13',output);
});
