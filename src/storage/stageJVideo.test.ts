import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText, validateProject } from '../domain/model';
import { reconcileDeliverables } from '../domain/production';
import { dialogueContentHash } from '../domain/production';
import { previewDialogueChange, confirmDialogueChange } from '../domain/productionWorkflow';
import { exportScenario, inspectScenario } from './archive';
import { ScenarioStore } from './store';
import { appendVideoLine, videoLines, subtitleText, createVideoFrame, addSceneCue, scenePreparation, previewVideoChange, confirmVideoChange, rehearsalTurns } from '../domain/videoScript';
import { strFromU8, unzipSync, zipSync } from 'fflate';

const stores: ScenarioStore[] = [];
const names = new WeakMap<ScenarioStore,string>();
const open = (fault?: () => void) => { const databaseName=`stage-j-${newId()}`; const store = new ScenarioStore({ databaseName, faultInjector: stage => { if (stage === 'before-commit') fault?.(); } }); stores.push(store); names.set(store,databaseName); return store; };
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });
function fixture() { const p = createProject('動画'), a = createEntity(p.projectId, 'character', '葵'), b = createEntity(p.projectId, 'character', '蓮'), scene = createEntity(p.projectId, 'scene', '入口', { body: textToRichText('元の段落') }); p.entities.push(a, b, scene); return { p, a, b, scene }; }

it('keeps dialogue/action/subtitle IDs, last speaker, source paragraphs and subtitle pairing through reorder, cold reload and native clone', async () => {
  const f = fixture(); let p = f.p;
  p = appendVideoLine(p, f.scene.id, { kind: 'dialogue', text: '最初😀\n次の段落', speakerId: f.a.id, sourceAnchor: { entityId: f.scene.id, blockId: f.scene.data.body[0].id } });
  const first = videoLines(p, f.scene.id)[0];
  p = appendVideoLine(p, f.scene.id, { kind: 'action', text: '振り向く' });
  p = appendVideoLine(p, f.scene.id, { kind: 'subtitle', text: '字幕だけ😀', sourceAnchor: { entityId: first.id, lineId: first.id, blockId: first.data.text[1].id } });
  p = appendVideoLine(p, f.scene.id, { kind: 'dialogue', text: '同じ話者' });
  const original = videoLines(p, f.scene.id); expect(original.map(l => l.data.scriptKind)).toEqual(['dialogue','action','subtitle','dialogue']); expect(original[3].data.speakerId).toBe(f.a.id); expect(original[1].data.speakerId).toBeNull(); expect(subtitleText(p, f.scene.id)).toBe('字幕だけ😀');
  const ids = original.map(l => l.id).reverse(), plan = await previewVideoChange(p, { type: 'reorder', sceneId: f.scene.id, lineIds: ids });
  await expect(confirmVideoChange({ ...p, revision: '9' }, plan)).rejects.toThrow('REVISION_CONFLICT');
  const tampered = structuredClone(plan); tampered.candidate.name = '変更'; await expect(confirmVideoChange(p, tampered)).rejects.toThrow('REVISION_CONFLICT');
  p = await confirmVideoChange(p, plan); expect(videoLines(p, f.scene.id).map(l => l.id)).toEqual(ids); expect(videoLines(p,f.scene.id).map(l=>l.data.scriptNumber)).toEqual([4,3,2,1]);
  const db = open(), saved = (await db.saveProject(p, { reason: '四行' })).project; db.close(); stores.splice(stores.indexOf(db),1); const cold = new ScenarioStore({ databaseName: names.get(db) }); stores.push(cold);
  expect(videoLines((await cold.getProject(saved.projectId))!, f.scene.id)).toEqual(videoLines(saved, f.scene.id));
  const bytes = await cold.exportProject(saved.projectId), files = unzipSync(bytes), manifest = JSON.parse(strFromU8(files['manifest.json'])); expect(manifest.requiredFeatures).toContain('video-script-v1');
  const prepared = await inspectScenario(bytes, { worker: false });
  for (const mode of ['new','clone'] as const) { const restored = (await open().importScenario(prepared, { mode })).project; expect(validateProject(restored).ok).toBe(true); const scene = restored.entities.find(e => e.kind === 'scene')!; const lines = videoLines(restored, scene.id); expect(lines[3].data.sourceAnchor?.blockId).toBe((scene as typeof f.scene).data.body[0].id); expect(lines[1].data.sourceAnchor).toMatchObject({entityId:lines[3].id,lineId:lines[3].id,blockId:lines[3].data.text[1].id}); }
  manifest.requiredFeatures = manifest.requiredFeatures.filter((v: string) => v !== 'video-script-v1'); files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest)); await expect(inspectScenario(zipSync(files), { worker: false })).rejects.toMatchObject({ code:'FORMAT_UNSUPPORTED' });
  expect(validateProject(f.p).ok).toBe(true); expect((await inspectScenario(await exportScenario(f.p))).project.entities).toEqual(f.p.entities);
});

it('rechecks only linked frames and source tasks; direct review and unrelated scene preparation remain confirmed', async () => {
  const f = fixture(); let p = appendVideoLine(f.p, f.scene.id, {kind:'dialogue',text:'一',speakerId:f.a.id}); p = appendVideoLine(p,f.scene.id,{kind:'action',text:'二'});
  const [first, second] = videoLines(p,f.scene.id); p = createVideoFrame(p,f.scene.id,first.id); p = createVideoFrame(p,f.scene.id,second.id); p = addSceneCue(p,f.scene.id,{kind:'silent_character',speakerId:f.b.id}); p = addSceneCue(p,f.scene.id,{kind:'environment_sound',name:'雨'});
  const frames = p.entities.filter(e=>e.kind==='storyboard_frame'); p = {...p,entities:p.entities.map(e=>['storyboard_frame','cue'].includes(e.kind)?{...e,status:'confirmed'}:e)};
  const unrelatedCue=p.entities.find(e=>e.kind==='cue'&&e.data.cueType==='silent_character')!;
  const task = createEntity(p.projectId,'production_task','関係のない撮影準備',{targetIds:[unrelatedCue.id],stage:'implementation',progress:'done'}); task.status='confirmed'; const sceneTask=createEntity(p.projectId,'production_task','場面全体の実装',{targetIds:[f.scene.id],stage:'implementation',progress:'done'});sceneTask.status='confirmed';p.entities.push(task,sceneTask);
  expect(scenePreparation(p,f.scene.id,'reviewed')).toHaveLength(4);
  const reviewed = await reconcileDeliverables(p,{...p,entities:p.entities.map(e=>e.id===frames[0].id?{...e,status:'confirmed'}:e)}); expect(reviewed.entities.find(e=>e.id===frames[0].id)?.status).toBe('confirmed');
  const edited = await reconcileDeliverables(p,{...p,entities:p.entities.map(e=>e.id===first.id&&e.kind==='dialogue_line'?{...e,data:{...e.data,text:[{...e.data.text[0],text:'改訂'}]}}:e)});
  expect(edited.entities.find(e=>e.id===frames[0].id)?.status).toBe('needs_review'); expect(edited.entities.find(e=>e.id===frames[1].id)?.status).toBe('confirmed'); expect(edited.entities.find(e=>e.id===task.id)?.data).toMatchObject({progress:'done'}); expect(scenePreparation(edited,f.scene.id,'needs_review')).toHaveLength(1);expect(edited.entities.find(e=>e.id===sceneTask.id)?.data).toMatchObject({progress:'needs_review'});
  const marked = {...edited, entities:edited.entities.map(e=>e.id===frames[0].id?{...e,status:'confirmed' as const}:e)}; expect((await reconcileDeliverables(edited,marked)).entities.find(e=>e.id===frames[0].id)?.status).toBe('confirmed');
});

it('derives three selected-role turns and preceding partner cues without altering project or recording state', () => {
  const f = fixture(); let p = f.p;
  for (let n=0;n<6;n++) p = appendVideoLine(p,f.scene.id,{kind:'dialogue',text:`台詞${n+1}`,speakerId:n%2?f.b.id:f.a.id});
  p = appendVideoLine(p,f.scene.id,{kind:'subtitle',text:'練習では隠さない'});
  const before=JSON.stringify(p), turns=rehearsalTurns(p,videoLines(p,f.scene.id).map(l=>l.id),f.b.id);
  expect(turns).toHaveLength(3); expect(turns.map(t=>t.line.data.text[0].text)).toEqual(['台詞2','台詞4','台詞6']); expect(turns.map(t=>t.cue?.data.text[0].text)).toEqual(['台詞1','台詞3','台詞5']); expect(JSON.stringify(p)).toBe(before);
});

it('rejects missing sources, duplicate reorder IDs and stale unrevisioned edits; quota failure leaves the work unchanged', async () => {
  const f=fixture(); expect(()=>appendVideoLine(f.p,f.scene.id,{kind:'subtitle',text:'字幕',sourceAnchor:{entityId:'missing'}})).toThrow();
  const p=appendVideoLine(f.p,f.scene.id,{kind:'dialogue',text:'元',speakerId:f.a.id}), line=videoLines(p,f.scene.id)[0]; await expect(previewVideoChange(p,{type:'reorder',sceneId:f.scene.id,lineIds:[line.id,line.id]})).rejects.toThrow();
  const plan=await previewVideoChange(p,{type:'append',sceneId:f.scene.id,input:{kind:'action',text:'候補'}}); const stale=structuredClone(p); stale.name='別変更'; await expect(confirmVideoChange(stale,plan)).rejects.toThrow('REVISION_CONFLICT');
  let fail=false; const db=open(()=>{if(fail)throw new DOMException('quota','QuotaExceededError');}),saved=(await db.saveProject(p,{reason:'元'})).project, fresh=await previewVideoChange(saved,{type:'append',sceneId:f.scene.id,input:{kind:'action',text:'保存候補'}}); fail=true; await expect(db.saveProject(await confirmVideoChange(saved,fresh),{reason:'追加'})).rejects.toMatchObject({code:'QUOTA_EXCEEDED'}); expect(await db.getProject(p.projectId)).toEqual(saved);
});

it('retains legacy source hashes and remaps subtitle anchors when a multiline source is explicitly split', async () => {
  const f=fixture(), legacy=createEntity(f.p.projectId,'dialogue_line','従来の台詞',{text:textToRichText('従来')});
  expect(await dialogueContentHash(f.p,legacy)).toBe(await dialogueContentHash(f.p,{...legacy,data:{...legacy.data,scriptKind:'dialogue'}}));
  let p=appendVideoLine(f.p,f.scene.id,{kind:'dialogue',text:'前半\n後半',speakerId:f.a.id}); const line=videoLines(p,f.scene.id)[0];p=appendVideoLine(p,f.scene.id,{kind:'subtitle',text:'後半の字幕',sourceAnchor:{entityId:line.id,lineId:line.id,blockId:line.data.text[1].id}});
  const plan=await previewDialogueChange(p,{mode:'split',sourceIds:[line.id],blockId:line.data.text[1].id,offset:0,reason:'前後の収録単位'}); const candidate=await confirmDialogueChange(p,plan),lines=videoLines(candidate,f.scene.id);expect(lines.map(l=>l.data.scriptNumber)).toEqual([3,4,2]);expect(lines[2].data.sourceAnchor).toMatchObject({entityId:lines[1].id,lineId:lines[1].id,blockId:lines[1].data.text[0].id});expect(validateProject(candidate).ok).toBe(true);
  await expect(previewDialogueChange(candidate,{mode:'merge',sourceIds:[lines[1].id,lines[2].id],reason:'異なる行種は拒否'})).rejects.toThrow('VALIDATION_FAILED');
});
