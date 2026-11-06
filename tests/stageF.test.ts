import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {createProject,createEntity,newId} from '../src/domain/model';
import {createWorldSnapshot} from '../src/domain/world';
import {ScenarioStore} from '../src/storage/store';
import {compareEditions,replaceSelectedOccurrences,findReplacementOccurrences,restoreSelectedParagraphs} from '../src/domain/selectiveEdits';

async function fixture(){
 let p=createProject('工程F');
 const a=createEntity(p.projectId,'character','アオ'),b=createEntity(p.projectId,'character','アオ');
 const body=[{id:newId(),kind:'paragraph' as const,text:'アオとアオ。',ruby:[{start:3,end:5,text:'あお'}],links:[{start:0,end:2,target:{entityId:a.id}},{start:3,end:5,target:{entityId:b.id}}]},{id:newId(),kind:'quote' as const,text:'引用のアオ'}];
 const scene=createEntity(p.projectId,'scene','場面',{body});p.entities.push(a,b,scene);
 p=await createWorldSnapshot(p,'初稿');
 p.entities=p.entities.map(e=>e.id===scene.id?{...scene,data:{...scene.data,body:[{...body[0],text:'アオとアオ、改稿。'},body[1]]}}:e);
 p=await createWorldSnapshot(p,'二稿');
 let fail=false;const store=new ScenarioStore({databaseName:`stage-f-${newId()}`,faultInjector:()=>{if(fail)throw new DOMException('full','QuotaExceededError');}});p=(await store.saveProject(p,{reason:'fixture'})).project;
 return {p,store,scene,a,b,body,setFail:(v:boolean)=>{fail=v;}};
}
describe('F11 immutable edition selective paragraph restore',()=>{
 it('compares by IDs and restores only selected paragraph, with one undo and pins unchanged',async()=>{
 const {p,store,scene,body}=await fixture();const compared=compareEditions(p.snapshots[0],p.snapshots[1]);
 expect(compared.paragraphs.find(x=>x.blockId===body[0].id)?.after?.text).toContain('改稿');
 const selection={entityId:scene.id,field:'body',blockId:body[0].id};
 const preview=await store.previewParagraphRestore(p.projectId,p.snapshots[0].id,p.snapshots[1].id,[selection]);
 const result=await store.restoreParagraphs(p.projectId,preview);
 expect((result.project.entities.find(e=>e.id===scene.id)!.data as any).body).toEqual(body);
 expect(result.project.snapshots).toEqual(p.snapshots);expect(result.project.history.length).toBe(p.history.length+1);
 expect((await store.undo(p.projectId)).project.entities.find(e=>e.id===scene.id)!.data).toEqual(p.entities.find(e=>e.id===scene.id)!.data);
 });
 it('rejects ambiguous paragraph IDs and stale confirmation without writes',async()=>{
 const {p,store,scene,body}=await fixture();const selected=[{entityId:scene.id,field:'body',blockId:body[0].id}];
 const preview=await store.previewParagraphRestore(p.projectId,p.snapshots[0].id,p.snapshots[1].id,selected);
 await store.saveProject({...p,name:'先行編集'},{reason:'concurrent'});
 await expect(store.restoreParagraphs(p.projectId,preview)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const broken=structuredClone(p);(broken.entities.find(e=>e.id===scene.id)!.data as any).body.push(body[0]);
 expect(()=>restoreSelectedParagraphs(broken,p.snapshots[0],selected)).toThrow(/一意/);
 });
});
describe('F10 selected occurrence atomic replacement',()=>{
 it('distinguishes same-name references and quote, transforms following ruby/link, undo once',async()=>{
 const {p,store,scene,a,b}=await fixture();const rows=findReplacementOccurrences(p,'アオ');
 expect(rows).toHaveLength(3);expect(rows[0].referenceIds).toEqual([a.id]);expect(rows[1].referenceIds).toEqual([b.id]);expect(rows[2].quoted).toBe(true);
 const preview=await store.previewOccurrenceReplacement(p.projectId,'アオ','アオイ',[rows[0]]);
 const result=await store.replaceOccurrences(p.projectId,preview);
 const body=(result.project.entities.find(e=>e.id===scene.id)!.data as any).body;
 expect(body[0].text).toBe('アオイとアオ、改稿。');expect(body[0].ruby).toEqual([{start:4,end:6,text:'あお'}]);expect(body[0].links).toContainEqual({start:4,end:6,target:{entityId:b.id}});
 expect(body[1].text).toBe('引用のアオ');expect(result.project.snapshots).toEqual(p.snapshots);
 expect((await store.undo(p.projectId)).project.entities.find(e=>e.id===scene.id)!.data).toEqual(p.entities.find(e=>e.id===scene.id)!.data);
 });
 it('rechecks positions, duplicate taps and quota fault leave no partial save',async()=>{
 const {p,store,setFail}=await fixture();const rows=findReplacementOccurrences(p,'アオ');
 const forged={...rows[0],start:1};expect(()=>replaceSelectedOccurrences(p,'アオ','名前',[forged])).toThrow();
 const preview=await store.previewOccurrenceReplacement(p.projectId,'アオ','名前',[rows[0],rows[2]]);
 setFail(true);
 await expect(store.replaceOccurrences(p.projectId,preview)).rejects.toBeDefined();
 expect(await store.getProject(p.projectId)).toEqual(p);setFail(false);
 const results=await Promise.allSettled([store.replaceOccurrences(p.projectId,preview),store.replaceOccurrences(p.projectId,preview)]);
 expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
 expect((await store.getProject(p.projectId))!.history).toHaveLength(p.history.length+1);
 });
});

describe('F11 repeated stable paragraphs and F10 boundary guards',()=>{
 it('keeps an unselected duplicate paragraph anchor resolved when restoring another ID',()=>{
 const p=createProject('repeat');const one={id:newId(),kind:'paragraph' as const,text:'旧文'},two={id:newId(),kind:'paragraph' as const,text:'旧文'};
 const scene=createEntity(p.projectId,'scene','本文',{body:[one,two]});const ref=createEntity(p.projectId,'note','参照',{body:[{id:newId(),kind:'paragraph',text:'参照',links:[{start:0,end:2,target:{entityId:scene.id,blockId:two.id,start:0,end:2}}]}]});p.entities.push(scene,ref);
 const source:any={id:newId(),versionLabel:'old',content:{...p,entities:[{...scene,data:{...scene.data,body:[{...one,text:'戻す文'},two]}},ref]}};
 const result=restoreSelectedParagraphs(p,source,[{entityId:scene.id,field:'body',blockId:one.id}]);
 expect((result.entities.find(e=>e.id===ref.id)!.data as any).body[0].links[0].target).toEqual({entityId:scene.id,blockId:two.id,start:0,end:2});
 });
 it('rejects stale replacement revision and tampered paragraph confirmation, with no partial writes',async()=>{
 const {p,store}=await fixture();const rows=findReplacementOccurrences(p,'アオ');const replacement=await store.previewOccurrenceReplacement(p.projectId,'アオ','新名',[rows[0]]);
 const paragraph=await store.previewParagraphRestore(p.projectId,p.snapshots[0].id,p.snapshots[1].id,[{entityId:rows[0].entityId,field:rows[0].field,blockId:rows[0].blockId}]);
 await expect(store.restoreParagraphs(p.projectId,{...paragraph,changes:[]})).rejects.toMatchObject({code:'REVISION_CONFLICT'});
 const newer=(await store.saveProject({...p,name:'new revision'},{reason:'concurrent'})).project;
 await expect(store.replaceOccurrences(p.projectId,replacement)).rejects.toMatchObject({code:'REVISION_CONFLICT'});expect(await store.getProject(p.projectId)).toEqual(newer);
 });
});

describe('F11 atomic paragraph command failure and concurrency',()=>{
 it('rolls quota failure back and accepts only one concurrent confirmation',async()=>{
 const {p,store,scene,body,setFail}=await fixture();const preview=await store.previewParagraphRestore(p.projectId,p.snapshots[0].id,p.snapshots[1].id,[{entityId:scene.id,field:'body',blockId:body[0].id}]);
 setFail(true);await expect(store.restoreParagraphs(p.projectId,preview)).rejects.toBeDefined();expect(await store.getProject(p.projectId)).toEqual(p);setFail(false);
 const results=await Promise.allSettled([store.restoreParagraphs(p.projectId,preview),store.restoreParagraphs(p.projectId,preview)]);expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect((await store.getProject(p.projectId))!.history).toHaveLength(p.history.length+1);
 });
 it('replaces multiple selected occurrences in one paragraph from right to left with emoji positions',()=>{
 const p=createProject('positions'),scene=createEntity(p.projectId,'scene','本文',{body:[{id:newId(),kind:'paragraph',text:'😀アオとアオ、アオ。'}]});p.entities.push(scene);const rows=findReplacementOccurrences(p,'アオ');
 const result=replaceSelectedOccurrences(p,'アオ','長い名前',[rows[0],rows[2]]);expect((result.entities.find(e=>e.id===scene.id)!.data as any).body[0].text).toBe('😀長い名前とアオ、長い名前。');expect((scene.data as any).body[0].text).toBe('😀アオとアオ、アオ。');
 });
});

it('marks only the quotation occurrence and shows both same-name candidates for an unlinked mention',()=>{
 const p=createProject('quotations'),a=createEntity(p.projectId,'character','アオ'),b=createEntity(p.projectId,'character','アオ');p.entities.push(a,b,createEntity(p.projectId,'scene','引用',{body:[{id:newId(),kind:'paragraph',text:'「アオ」とアオ。'}]}));const rows=findReplacementOccurrences(p,'アオ');
 expect(rows.map(row=>row.quoted)).toEqual([true,false]);expect(rows[1].candidateIds).toEqual([a.id,b.id]);
});

it('matches settings, state and attachment metadata by stable ID despite entity order changes',async()=>{
 let p=createProject('categories');const person=createEntity(p.projectId,'character','設定'),state=createEntity(p.projectId,'variable','状態'),asset=createEntity(p.projectId,'attachment','素材',{mediaType:'image/png',contentHash:'a'.repeat(64),byteSize:1,assetPath:`assets/${'a'.repeat(64)}.png`});p.entities.push(person,state,asset);p=await createWorldSnapshot(p,'前');
 const prior=structuredClone(p.snapshots[0]);p.entities=p.entities.map(e=>e.id===person.id?{...e,status:'confirmed'}:e.id===state.id?{...state,data:{...state.data,initial:{type:'boolean',value:true}}}:e.id===asset.id?{...asset,data:{...asset.data,displayName:'変更した素材名'}}:e).reverse() as typeof p.entities;p=await createWorldSnapshot(p,'後');
 const result=compareEditions(p.snapshots[0],p.snapshots[1]);for(const id of [person.id,state.id,asset.id])expect(result.records.some(r=>r.id===id)).toBe(true);expect(result.records.find(r=>r.id===asset.id)?.after).toMatchObject({data:{displayName:'変更した素材名'}});expect(p.snapshots[0]).toEqual(prior);
});
