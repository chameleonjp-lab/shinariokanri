import {expect,it} from 'vitest';
import {createEntity,createProject,textToRichText,validateProject} from '../src/domain/model';
import {previewConsultationImport,confirmConsultationImport} from '../src/domain/productionPlanning';
import {createSharedCommentReview,reviewCurrentMatch,resolveReviewCurrentMatch,createReaderHesitation,readerReturnFile} from '../src/domain/sharedReviews';
import {sharedReviewFixture} from '../src/testing/sharedReviewFixture';
import type {PublicProjection} from '../src/domain/projection';

it('separates pasted reply reasons from proposed dialogue, retaining canonical until author adoption',async()=>{
 const p=createProject('作者稿'),line=createEntity(p.projectId,'dialogue_line','台詞',{text:textToRichText('元の台詞')});p.entities.push(line);
 const plan=await previewConsultationImport(p,{text:'## 本文\n新しい台詞\n\n## 理由\n言葉を短くした理由',source:'手動相談',versionId:p.projectId,targetId:line.id});
 const saved=await confirmConsultationImport(p,plan),head=saved.authorAlternatives![0].versions.at(-1)!.content;
 expect(head.entities.find(e=>e.id===line.id)?.data).toMatchObject({text:[{text:'新しい台詞'}]});
 expect(JSON.stringify(head.entities.find(e=>e.kind==='note'))).toContain('言葉を短くした理由');
 expect(saved.entities).toEqual(p.entities);expect(saved.authorAlternatives![0].applyReceipts).toEqual([]);expect(validateProject(saved).ok).toBe(true);
});
it('keeps received source context and never transfers a deleted duplicate automatically',async()=>{
 const f=await sharedReviewFixture(),review=await createSharedCommentReview(f.p,f.envelope,f.comment,'https://review.invalid');
 expect(review.data.receivedContext).toMatchObject({before:'',after:'本1の台詞L',sourceVersionId:f.pin.id});
 const duplicate=createEntity(f.p.projectId,'dialogue_line','別の同じ台詞',{text:textToRichText(f.line.data.text[0].text)});f.p.entities.push(duplicate);
 const original=structuredClone(review.data);f.p.entities.find(e=>e.id===f.line.id)!.deletedAt='2026-11-06T00:00:00Z';f.p.entities.find(e=>e.id===f.line.id)!.deletionOperationId=crypto.randomUUID();
 const match=reviewCurrentMatch(f.p,review);expect(match.status).toBe('deleted');expect(match.candidates).toHaveLength(1);expect(review.data).toEqual(original);
 expect(()=>resolveReviewCurrentMatch(f.p,review,match.candidates[0].target,'')).toThrow();
 const resolved=resolveReviewCurrentMatch(f.p,review,match.candidates[0].target,'作者が移動先を確認');
 expect({...resolved.data,currentMatch:undefined}).toEqual({...original,currentMatch:undefined});expect(resolved.data.currentMatch).toMatchObject({reason:'作者が移動先を確認',revision:f.p.revision});
 const validation=validateProject({...f.p,entities:[...f.p.entities,resolved]});expect(validation.ok,JSON.stringify(validation)).toBe(true);
});
it('distinguishes a changed original and multiple quote candidates without changing received anchors',async()=>{
 const f=await sharedReviewFixture(),review=await createSharedCommentReview(f.p,f.envelope,f.comment,'https://review.invalid');
 expect(reviewCurrentMatch(f.p,review).status).toBe('match');
 const line=f.p.entities.find(e=>e.id===f.line.id)! as typeof f.line;line.data.text[0].text='改稿';
 expect(reviewCurrentMatch(f.p,review).status).toBe('changed');
 for(let n=0;n<2;n++)f.p.entities.push(createEntity(f.p.projectId,'dialogue_line','候補',{text:textToRichText('😀版 再掲')}));
 expect(reviewCurrentMatch(f.p,review).status).toBe('ambiguous');
});
it('returns only selected explicitly captured public observations with no extra metadata and zero produces no artifact',()=>{
 const p:PublicProjection={format:'scenario-projection',formatVersion:'1.0.0',title:'配布稿',calendars:[],entities:[{id:'scene-public',kind:'scene',name:'場面',status:'confirmed',data:{}},{id:'choice-public',kind:'flow_edge',name:'選択',status:'confirmed',data:{label:'読者に見えた選択'}}],relations:[],searchIndex:[]};
 const row=createReaderHesitation(p,'edition-public','scene-public',[{id:'choice-public',label:'読者に見えた選択'}],'😀わからない');
 const hidden={...row,note:'UNSELECTED_NOTE',id:'other',authorMetadata:'SECRET'};
 expect(readerReturnFile([row,hidden],[])).toBeNull();
 const returned=readerReturnFile([row,hidden],[row.id])!;
 expect(JSON.parse(returned)).toEqual({format:'scenario-reader-return',formatVersion:'1.0.0',rows:[{publicEdition:'edition-public',publicScene:'scene-public',shownChoices:[{id:'choice-public',label:'読者に見えた選択'}],note:'😀わからない'}]});
 expect(returned).not.toMatch(/SECRET|UNSELECTED|author|telemetry|trace/);
 expect(()=>createReaderHesitation(p,'edition-public','private-scene',[],'')).toThrow();
});

it('declares received-review matching capability and remaps received/context and explicit current anchor through complete clone',async()=>{
 const {exportScenario,inspectScenario}=await import('../src/storage/archive'),{cloneProject}=await import('../src/storage/clone'),{unzipSync,zipSync}=await import('fflate');
 const f=await sharedReviewFixture(),review=await createSharedCommentReview(f.p,f.envelope,f.comment,'https://review.invalid'),candidate=reviewCurrentMatch(f.p,review).candidates[0],resolved=resolveReviewCurrentMatch(f.p,review,candidate.target,'現稿の元の場所を確認');f.p.entities.push(resolved);
 const before=await inspectScenario(await exportScenario(f.p),{worker:false});expect(before.manifest.requiredFeatures).toContain('received-review-match-v1');
 const cloned=await cloneProject(before.project),next=cloned.project.entities.find(e=>e.id===cloned.idMap[review.id])!;if(next.kind!=='review')throw Error('review absent');
 expect(next.data.receivedContext?.sourceVersionId).toBe(cloned.idMap[f.pin.id]);expect(next.data.targetVersionId).toBe(cloned.idMap[f.pin.id]);expect(typeof next.data.target!=='string'&&next.data.target.entityId).toBe(cloned.idMap[f.line.id]);expect(next.data.currentMatch?.target.entityId).toBe(cloned.idMap[f.line.id]);expect(next.data.currentMatch?.target.sourceVersionId).toBe(cloned.project.projectId);expect(next.data.currentMatch?.target.blockId).toBe(cloned.idMap[f.line.data.text[0].id]);expect(next.data.sharedSource).toEqual(review.data.sharedSource);
 expect((await inspectScenario(await exportScenario(cloned.project),{worker:false})).project).toEqual(cloned.project);
 const files=unzipSync(await exportScenario(f.p)),manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));manifest.requiredFeatures=manifest.requiredFeatures.filter((value:string)=>value!=='received-review-match-v1');files['manifest.json']=new TextEncoder().encode(JSON.stringify(manifest));await expect(inspectScenario(zipSync(files),{worker:false})).rejects.toMatchObject({code:'FORMAT_UNSUPPORTED'});
 delete resolved.data.receivedContext;delete resolved.data.currentMatch;const legacy=await inspectScenario(await exportScenario(f.p),{worker:false});expect(legacy.manifest.requiredFeatures).not.toContain('received-review-match-v1');expect(legacy.project.entities.find(e=>e.id===review.id)).toBeTruthy();
});

it('does not treat a surviving identical phrase shifted into the original offset as the received occurrence',async()=>{
 const f=await sharedReviewFixture('同文 / 同文','同文 / 同文'),review=await createSharedCommentReview(f.p,f.envelope,f.comment,'https://review.invalid');
 const line=f.p.entities.find(e=>e.id===f.line.id)! as typeof f.line;line.data.text[0].text='同文';
 expect(reviewCurrentMatch(f.p,review).status).toBe('changed');expect(review.data.receivedContext?.after).toBe(' / 同文');
});
it('retains adjacent public paragraphs when a quotation occupies an entire paragraph',async()=>{
 const f=await sharedReviewFixture('同文\n次の公開文','同文\n次の公開文'),review=await createSharedCommentReview(f.p,f.envelope,f.comment,'https://review.invalid');
 expect(review.data.receivedContext?.after).toBe('\n次の公開文');
});
it('opens the unchanged legacy production archive without requiring received-review matching',async()=>{
 const {readFile}=await import('node:fs/promises'),{inspectScenario}=await import('../src/storage/archive');
 const old=await inspectScenario(new Uint8Array(await readFile('tests/fixtures/rb07-production.scenario')),{worker:false});expect(old.project.entities.length).toBeGreaterThan(0);expect(old.manifest.requiredFeatures??[]).not.toContain('received-review-match-v1');
});
it('rejects author candidate confirmation bound to an older current revision',async()=>{
 const f=await sharedReviewFixture(),review=await createSharedCommentReview(f.p,f.envelope,f.comment,'https://review.invalid'),candidate=reviewCurrentMatch(f.p,review).candidates[0],revision=f.p.revision;f.p.revision=String(BigInt(revision)+1n);
 expect(()=>resolveReviewCurrentMatch(f.p,review,candidate.target,'前の画面で選んだ理由',revision)).toThrow('REVISION_CONFLICT');
});
