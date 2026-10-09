import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {newId,validateProject} from '../src/domain/model';
import {previewMaterial,confirmMaterial} from '../src/domain/materials';
import {prepareAsset} from '../src/domain/attachments';
import {ScenarioStore} from '../src/storage/store';
import type {ProjectData} from '../src/domain/types';
const root='/tmp/shinariokanri-independent-rb07-22bd75a/independent/fixtures';
const fixture=()=>JSON.parse(readFileSync(root+'/original-production.json','utf8')) as {project:ProjectData;ids:Record<string,string>};
it('R7D15 an explicit old-pin storyboard with no live cue dependency stays confirmed after current cue replacement',async()=>{
 const {project:p,ids}=fixture(),frame=p.entities.find(e=>e.id===ids.frame);if(frame?.kind!=='storyboard_frame')throw Error('fixture');
 frame.data.anchor.sourceVersionId=ids.pin;frame.data.cueIds=[];expect(validateProject(p).ok).toBe(true);
 const db=new ScenarioStore({databaseName:'independent-fixed-'+newId()});try{
  const before=(await db.saveProject(p,{reason:'固定版コマ',assets:[await prepareAsset(new Uint8Array(readFileSync('tests/fixtures/media/fixture-tone.wav')),'独立旧音声.wav')]})).project;
  expect(before.entities.find(e=>e.id===ids.frame)?.status).toBe('confirmed');
  const asset=await prepareAsset(new Uint8Array(readFileSync(root+'/new-a.wav')),'独立新音声.wav');
  const plan=await previewMaterial(before,asset,ids.attachment,[ids.cue]),saved=(await db.saveProject(await confirmMaterial(before,plan),{reason:'現稿演出だけの素材差替え',assets:[plan.asset]})).project;
  const old=before.entities.find(e=>e.id===ids.frame),after=saved.entities.find(e=>e.id===ids.frame);
  writeFileSync(root+'/R7D15.json',JSON.stringify({before:old,after,oldPinUnchanged:JSON.stringify(before.snapshots)===JSON.stringify(saved.snapshots)},null,2)+'\n');
  expect(after?.status).toBe('confirmed');expect(after?.data).toEqual(old?.data);expect(saved.snapshots).toEqual(before.snapshots);
 }finally{await db.deleteDatabase();}
});
it('R7D16 prepared asset bytes and metadata are captured before preview yields',async()=>{
 const {project:p,ids}=fixture(),bytes=new Uint8Array(readFileSync(root+'/new-a.wav')),asset=await prepareAsset(bytes,'独立新音声.wav'),expected=structuredClone(asset);
 const pending=previewMaterial(p,asset,ids.attachment,[ids.cue]);asset.bytes[asset.bytes.length-1]^=1;asset.displayName='後発の異なる名前.wav';
 const plan=await pending;expect(plan.asset).toEqual(expected);expect(plan.candidate.entities.find(e=>e.id===plan.newAttachmentId)?.name).toBe(expected.displayName);
});
