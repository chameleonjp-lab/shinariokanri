import 'fake-indexeddb/auto';
import {it,expect,afterEach} from 'vitest';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {ScenarioStore} from '../src/storage/store';
import {inspectScenario} from '../src/storage/archive';
import {newId} from '../src/domain/model';
import {createWorldSnapshot} from '../src/domain/world';
import {exportProject} from '../src/domain/exports';
import {receiveGamePackage,appendGameAction,buildGameReceipt,previewGameReceiptImport,confirmGameReceiptImport,verifyStoredGameEvidence} from '../src/domain/gameHandoff';
import {sha256} from '../src/storage/json';
const root='/tmp/shinariokanri-independent-rb08-bf0f6b0/independent',stores:ScenarioStore[]=[];
function store(){const s=new ScenarioStore({databaseName:'independent-final-approval-'+newId()});stores.push(s);return s;}
afterEach(async()=>{for(const s of stores.splice(0))await s.deleteDatabase();});
function proof(name:string,value:unknown){writeFileSync(root+'/fixtures/'+name+'.json',JSON.stringify(value,null,2)+'\n');}
it('R8V12 fixed approval uses its original private edition after current note changes, and a different existing snapshot anchor refuses atomically',async()=>{
 const f=JSON.parse(readFileSync(root+'/fixtures/production-handoff.json','utf8')),out=await exportProject(f.project,{profile:'runtime_json',projectionProfileId:f.ids.policy,targetRevision:f.project.revision});if(!out.ok)throw Error('fixture export');
 const pkg=await receiveGamePackage(JSON.parse(out.artifact.content)),action=await appendGameAction(pkg,[],f.ids.contract,'win'),receipt=await buildGameReceipt(pkg,{entryId:f.ids.entry,actions:[action],requests:[{}]}),plan=await previewGameReceiptImport(f.project,receipt,{projectionProfileId:f.ids.policy,targetRevision:f.project.revision}),candidate=await confirmGameReceiptImport(f.project,plan),s=store(),saved=(await s.saveProject(candidate,{reason:'固定受領'})).project;
 const later=structuredClone(saved),evidence=later.entities.find(e=>e.kind==='note'&&e.data.handoffReceipt);if(evidence?.kind!=='note'||!evidence.data.handoffReceipt)throw Error('evidence');const approval=later.entities.find(e=>e.id===evidence.data.handoffReceipt!.approval.entityId)!;approval.customValues.gamePackageHash='e'.repeat(64);approval.customValues.gameReceiptHash='e'.repeat(64);
 await expect(verifyStoredGameEvidence(later)).resolves.toBeUndefined();
 const revised=(await s.saveProject(later,{reason:'現稿メモ編集は旧承認を置換しない'})).project,before=structuredClone(revised),wrong=await createWorldSnapshot(revised,'別の既知版');for(const entity of wrong.entities)if(entity.kind==='note'&&entity.data.handoffReceipt)entity.data.handoffReceipt.approval.sourceVersionId=wrong.snapshots.at(-1)!.id;
 await expect(s.saveProject(wrong,{reason:'別版の承認は拒否'})).rejects.toThrow();expect(await s.getProject(revised.projectId)).toEqual(before);
 proof('R8V12',{originalApprovalPin:evidence.data.handoffReceipt.approval.sourceVersionId,currentNoteChanged:true,knownOtherPin:wrong.snapshots.at(-1)!.id,refusedAtomically:true,beforeRevision:revised.revision,afterRevision:(await s.getProject(revised.projectId))?.revision});
});
it('R8V13 actual production downloads restore to empty native stores in new and clone modes with exact game wire, fixed pins and old/new asset bytes',async()=>{
 const files=readdirSync(root+'/production-actual-files').filter(x=>/case-(51|64)-.*\.scenario$/.test(x)&&!x.includes('-input-')),results=[];
 expect(files).toHaveLength(2);
 const rawReceipt=readFileSync(root+'/production-actual-files/case-51-game-receipt.json','utf8');
 for(const name of files){const archive=await inspectScenario(new Uint8Array(readFileSync(root+'/production-actual-files/'+name)),{worker:false});for(const mode of ['new','clone'] as const){const s=store(),p=(await s.importScenario(archive,{mode})).project;await expect(verifyStoredGameEvidence(p)).resolves.toBeUndefined();const note=p.entities.find(e=>e.kind==='note'&&e.data.handoffReceipt);if(name.startsWith('case-51')){if(note?.kind!=='note'||!note.data.handoffReceipt)throw Error('download receipt missing');expect(JSON.parse(note.data.handoffReceipt.rawJson)).toEqual(JSON.parse(rawReceipt));const anchor=note.data.handoffReceipt.approval,pin=p.snapshots.find(x=>x.id===anchor.sourceVersionId);expect(pin?.content.entities.find(x=>x.id===anchor.entityId)).toMatchObject({kind:'note',visibility:'private',status:'confirmed',customValues:{gamePackageHash:note.data.handoffReceipt.packageHash,gameReceiptHash:note.data.handoffReceipt.receiptHash}});}
 const exported=await inspectScenario(await s.exportProject(p.projectId),{worker:false});expect(exported.assets.map(x=>x.contentHash).sort()).toEqual(archive.assets.map(x=>x.contentHash).sort());for(const asset of exported.assets)expect(await sha256(asset.bytes)).toBe(asset.contentHash);
 if(name.startsWith('case-64'))expect(exported.assets).toHaveLength(2);
 results.push({file:name,mode,sourceProjectId:archive.project.projectId,targetProjectId:p.projectId,rawWirePreserved:Boolean(note),assetHashes:exported.assets.map(x=>x.contentHash),snapshotCount:p.snapshots.length});}}
 proof('R8V13',{results,classification:'Actual Chromium production downloads; empty fakeIndexedDB restoration and re-export. Not OS Files or physical devices.'});
});
