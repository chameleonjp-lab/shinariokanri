import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {ScenarioStore,cloneProject} from '../src/storage/store';
import {createProject,createEntity,textToRichText,newId,validateProject} from '../src/domain/model';
import {exportTranslationCsv,translationCsvCells,encodeTranslationCsv,inspectTranslationCsv,previewTranslationImport,confirmTranslationImport} from '../src/domain/translationCsv';
import {approveMaterialRights,materialCreditReview} from '../src/domain/materials';
import {exportScenario,inspectScenario} from '../src/storage/archive';
import {prepareAsset} from '../src/domain/attachments';

it('commits a CSV batch once under duplicate submission, preserves anchors and unaffected scenes, and undoes the whole batch',async()=>{
 const p=createProject('atomic CSV'),line=createEntity(p.projectId,'dialogue_line','A',{text:textToRichText('Hello {name}')}),scene=createEntity(p.projectId,'scene','unaffected',{body:textToRichText('keep')});p.entities=[line,scene];
 const store=new ScenarioStore({databaseName:`csv-${newId()}`});try{
 const base=(await store.saveProject(p,{reason:'base'})).project,cells=translationCsvCells(await exportTranslationCsv(base,'ja'));cells[1][5]="'こんにちは {name}";const report=await inspectTranslationCsv(base,encodeTranslationCsv(cells)),plan=await previewTranslationImport(base,report,[1]),candidate=await confirmTranslationImport(base,plan);
 const attempts=await Promise.allSettled([store.saveProject(candidate,{reason:'CSV once'}),store.saveProject(candidate,{reason:'CSV once'})]);expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
 const saved=await store.getProject(p.projectId);expect(saved).toBeDefined();expect(saved!.entities.filter(e=>e.kind==='localization'&&!e.deletedAt)).toHaveLength(1);expect(saved!.entities.find(e=>e.id===scene.id)?.data).toEqual(scene.data);
 expect((await inspectScenario(await exportScenario(saved!))).project.entities.filter(e=>e.kind==='localization')).toHaveLength(1);
 const undo=(await store.undo(p.projectId)).project;expect(undo.entities.filter(e=>e.kind==='localization'&&!e.deletedAt)).toHaveLength(0);expect(undo.entities.find(e=>e.id===line.id)?.data).toEqual(line.data);
 }finally{await store.deleteDatabase();}
});
it('preserves material review in complete archive and clone, and compares the selected old bytes independently of revised current bytes',async()=>{
 const p=createProject(),asset=await prepareAsset(new TextEncoder().encode('one'),'same.txt','text/plain'),{bytes,preview:_preview,...metadata}=asset;
 const image=createEntity(p.projectId,'attachment','same.txt',metadata);p.entities=[image];const approved=await approveMaterialRights(p,image.id,{purpose:'reader',proof:'original author confirmed',credit:'Art A'});
 expect(validateProject(approved).ok).toBe(true);const restored=(await inspectScenario(await exportScenario(approved,{loadAsset:async()=>bytes}))).project,cloned=await cloneProject(restored);
 expect((await materialCreditReview(cloned.project,[cloned.idMap[image.id]],'reader')).confirmed).toHaveLength(1);
 const current=structuredClone(restored);const changed=current.entities.find(e=>e.id===image.id)!;if(changed.kind==='attachment')changed.data.contentHash='f'.repeat(64);
 expect((await materialCreditReview(current,[image.id],'reader')).unknown).toHaveLength(1);expect((await materialCreditReview(restored,[image.id],'reader')).confirmed.map(r=>r.credit)).toEqual(['Art A']);
 await expect(approveMaterialRights(p,image.id,{purpose:'reader',proof:'proof',credit:''})).rejects.toThrow();
});

it('builds author-only credits from the exact selected edition and never puts permission notes in the reader artifact',async()=>{
 const {exportProject}=await import('../src/domain/exports');const {sha256,jsonBytes}=await import('../src/storage/json');const {projectContent}=await import('../src/domain/writingWorkspace');
 const p=createProject('credits'),image=createEntity(p.projectId,'attachment','image',{contentHash:'a'.repeat(64),mediaType:'image/png',assetPath:`assets/${'a'.repeat(64)}.png`,byteSize:10});image.status='confirmed';p.entities=[image];const approved=await approveMaterialRights(p,image.id,{purpose:'reader',proof:'SECRET_permission_note',credit:'Art: A'}),policy=createEntity(p.projectId,'projection_profile','policy',{audience:'reader',publicTitle:'public',includedIds:[image.id],allowedKinds:['attachment'],approvedAttachmentIds:[image.id],namePolicy:{defaultPolicy:{mode:'replace',replacement:'public image'}}});policy.status='confirmed';approved.entities.push(policy);
 const content=projectContent(approved),pin={id:newId(),content,contentHash:await sha256(jsonBytes(content)),versionLabel:'old',createdAt:new Date().toISOString()};approved.snapshots=[pin];const changed=approved.entities.find(e=>e.id===image.id)!;if(changed.kind==='attachment'){changed.data.contentHash='b'.repeat(64);changed.data.assetPath=`assets/${'b'.repeat(64)}.png`;}
 const old=await exportProject(approved,{profile:'reader',projectionProfileId:policy.id,targetVersionId:pin.id}),current=await exportProject(approved,{profile:'reader',projectionProfileId:policy.id,targetRevision:approved.revision});
 expect(old.ok,old.ok?'':JSON.stringify(old.issues)).toBe(true);expect(current.ok,current.ok?'':JSON.stringify(current.issues)).toBe(true);if(!old.ok||!current.ok)throw Error('export');
 expect(old.preview.materialCredits?.confirmed.map(r=>r.credit)).toEqual(['Art: A']);expect(old.preview.materialCredits?.unknown).toHaveLength(0);expect(current.preview.materialCredits?.unknown).toHaveLength(1);
 expect(old.artifact.content).not.toContain('SECRET_permission_note');expect(old.artifact.content).not.toContain('material.rights');expect(old.readerOutput).toBeDefined();expect(JSON.stringify(old.readerOutput)).not.toContain('Art: A');
});
