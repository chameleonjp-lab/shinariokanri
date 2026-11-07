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

async function sourceAnchorFixture(){
 let p=createProject('source coordinates');
 const first=createEntity(p.projectId,'scene','一段落'),second=createEntity(p.projectId,'scene','二段落');
 const one={id:newId(),kind:'paragraph' as const,text:'アオから手紙',links:[{start:0,end:2,target:{entityId:first.id,blockId:'',start:0,end:2}},{start:0,end:2,target:{entityId:second.id,blockId:'',start:0,end:2}}]};
 const two={id:newId(),kind:'paragraph' as const,text:'手紙を読む',links:[{start:0,end:2,target:{entityId:first.id,blockId:one.id,start:0,end:2}}]};one.links[0].target.blockId=one.id;one.links[1].target.blockId=two.id;first.data.body=[one];second.data.body=[two];
 const currentRef=createEntity(p.projectId,'note','現在参照',{body:[{id:newId(),kind:'paragraph',text:'参照',links:[{start:0,end:2,target:{entityId:first.id,blockId:one.id,start:0,end:2}}]}]});p.entities.push(first,second,currentRef);p=await createWorldSnapshot(p,'参照元稿');const source=p.snapshots[0];
 p.entities=p.entities.map(e=>e.id===first.id||e.id===second.id?{...e,data:{...e.data,body:(e.data as any).body.map((b:any)=>({...b,text:`昨日${b.text}`,links:b.links.map((l:any)=>({...l,start:l.start+2,end:l.end+2,target:{...l.target,start:l.target.start+2,end:l.target.end+2}}))}))}}:e.id===currentRef.id?{...e,data:{...e.data,body:[{...(e.data as any).body[0],links:[{start:0,end:2,target:{entityId:first.id,blockId:one.id,start:2,end:4}},{start:0,end:2,target:{entityId:first.id,blockId:one.id,start:0,end:2,sourceVersionId:source.id}}]}]}}:e) as typeof p.entities;
 p=await createWorldSnapshot(p,'現在稿');return {p,source,first,second,one,two,currentRef,selections:[{entityId:first.id,field:'body',blockId:one.id},{entityId:second.id,field:'body',blockId:two.id}]};
}
describe('F11 restored anchors retain source coordinate origins',()=>{
 it.each([false,true])('keeps self and cross-selected targets in source coordinates in either selection order: reverse=%s',async(reverse)=>{
 const {p,source,first,second,one,two,currentRef,selections}=await sourceAnchorFixture();const pins=structuredClone(p.snapshots),original=structuredClone(p);
 const result=restoreSelectedParagraphs(p,source,reverse?[...selections].reverse():selections);
 expect((result.entities.find(e=>e.id===first.id)!.data as any).body[0]).toEqual(one);expect((result.entities.find(e=>e.id===second.id)!.data as any).body[0]).toEqual(two);
 const links=(result.entities.find(e=>e.id===currentRef.id)!.data as any).body[0].links;expect(links[0].target).toEqual({entityId:first.id,blockId:one.id,start:0,end:2});expect(links[1].target).toEqual({entityId:first.id,blockId:one.id,start:0,end:2,sourceVersionId:source.id});expect(result.snapshots).toEqual(pins);expect(p).toEqual(original);
 });
 it('pins a restored source link into an unselected changed paragraph to its source edition, and previews the effect',async()=>{
 const {p,source,first,second,one,two,selections}=await sourceAnchorFixture();const store=new ScenarioStore({databaseName:`stage-f-source-${newId()}`});const current=(await store.saveProject(p,{reason:'fixture'})).project;
 const preview=await store.previewParagraphRestore(p.projectId,source.id,p.snapshots[1].id,[selections[0]]);
 expect(preview.referenceEffects.find(e=>e.id===first.id)?.after).toContainEqual({entityId:second.id,blockId:two.id,start:0,end:2,sourceVersionId:source.id});
 const result=(await store.restoreParagraphs(p.projectId,preview)).project;const links=(result.entities.find(e=>e.id===first.id)!.data as any).body[0].links;
 expect(links[0].target).toEqual(one.links[0].target);expect(links[1].target).toEqual({...one.links[1].target,sourceVersionId:source.id});expect((result.entities.find(e=>e.id===second.id)!.data as any).body[0].text).toBe(`昨日${two.text}`);expect(result.snapshots).toEqual(current.snapshots);
 expect((await store.undo(p.projectId)).project.entities.find(e=>e.id===first.id)!.data).toEqual(current.entities.find(e=>e.id===first.id)!.data);
 });
});

it.each([false,true])('keeps cross-selected paragraphs in the same text field order-independent: reverse=%s',async(reverse)=>{
 let p=createProject('same field');const scene=createEntity(p.projectId,'scene','本文'),firstId=newId(),secondId=newId();
 const body=[{id:firstId,kind:'paragraph' as const,text:'アオから手紙',links:[{start:0,end:2,target:{entityId:scene.id,blockId:secondId,start:0,end:2}}]},{id:secondId,kind:'paragraph' as const,text:'手紙を読む',links:[{start:0,end:2,target:{entityId:scene.id,blockId:firstId,start:0,end:2}}]}];scene.data.body=body;p.entities.push(scene);p=await createWorldSnapshot(p,'元稿');const source=p.snapshots[0];
 p.entities=p.entities.map(e=>e.id===scene.id?{...scene,data:{...scene.data,body:body.map(b=>({...b,text:`昨日${b.text}`,links:b.links.map(l=>({...l,start:2,end:4,target:{...l.target,start:2,end:4}}))}))}}:e);
 const selected=body.map(b=>({entityId:scene.id,field:'body',blockId:b.id}));const restored=restoreSelectedParagraphs(p,source,reverse?selected.reverse():selected);expect((restored.entities.find(e=>e.id===scene.id)!.data as any).body).toEqual(body);
});

it('does not guess which repeated current occurrence survived a paragraph restore',async()=>{
 let p=createProject('ambiguous current origins');const blockId=newId(),scene=createEntity(p.projectId,'scene','本文',{body:[{id:blockId,kind:'paragraph',text:'アオ'}]});p.entities.push(scene);p=await createWorldSnapshot(p,'元稿');const source=p.snapshots[0];
 p.entities=p.entities.map(e=>e.id===scene.id?{...scene,data:{...scene.data,body:[{id:blockId,kind:'paragraph',text:'アオアオ'}]}}:e);const note=createEntity(p.projectId,'note','現在の参照',{body:[{id:newId(),kind:'paragraph',text:'参照',links:[{start:0,end:2,target:{entityId:scene.id,blockId,start:0,end:2}}]}]});p.entities.push(note);
 const result=restoreSelectedParagraphs(p,source,[{entityId:scene.id,field:'body',blockId}]);expect((result.entities.find(e=>e.id===note.id)!.data as any).body[0].links[0].target).toMatchObject({positionStatus:'unresolved',quotedText:'アオ'});
});
