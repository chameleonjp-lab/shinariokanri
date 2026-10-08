import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {newId,createEntity,validateProject} from '../src/domain/model';
import {checkProductionRules} from '../src/domain/productionChecks';
import {prepareAsset} from '../src/domain/attachments';
import {ScenarioStore} from '../src/storage/store';
import type {ProjectData} from '../src/domain/types';
const root='/tmp/shinariokanri-independent-rb07-8e60239/independent/fixtures';
it('R7D17 voice candidates for old-pin storyboard subtitles use its old source speaker after current speaker changes',async()=>{
 const path=root+'/ui-fixed-speaker-production.json';
 const {project:p,ids}=JSON.parse(readFileSync(existsSync(path)?path:root+'/ui-fixed-production.json','utf8'))as{project:ProjectData;ids:Record<string,string>};
 let rule=p.entities.find(e=>e.kind==='voice_rule'&&e.name==='旧話者の作者口調基準');
 if(!rule){rule=createEntity(p.projectId,'voice_rule','旧話者の作者口調基準',{characterId:ids.speaker,firstPerson:'私',validity:{worldRange:{start:'10',end:'20'},routeCondition:null,presentationAnchor:null}});rule.status='confirmed';p.entities.push(rule);writeFileSync(path,JSON.stringify({project:p,ids},null,2)+'\n');}expect(validateProject(p).ok).toBe(true);
 const db=new ScenarioStore({databaseName:'independent-oldspeaker-'+newId()});try{
  const before=(await db.saveProject(p,{reason:'旧話者の字幕',assets:[await prepareAsset(new Uint8Array(readFileSync('tests/fixtures/media/fixture-tone.wav')),'独立旧音声.wav')]})).project;
  const candidate:ProjectData=structuredClone({...before,history:[]});candidate.history=before.history;
  const line=candidate.entities.find(e=>e.id===ids.line);if(line?.kind!=='dialogue_line')throw Error('fixture');line.data.speakerId=ids.other;
  const saved=(await db.saveProject(candidate,{reason:'現稿だけ別話者へ改訂'})).project;
  const beforeChecks=checkProductionRules(before,{at:'10'}).filter(x=>x.lineId===ids.frame&&x.ruleId===rule.id),afterChecks=checkProductionRules(saved,{at:'10'}).filter(x=>x.lineId===ids.frame&&x.ruleId===rule.id);
  writeFileSync(root+'/R7D17.json',JSON.stringify({frame:saved.entities.find(e=>e.id===ids.frame),oldPin:saved.snapshots.find(s=>s.id===ids.pin)?.content.entities.find(e=>e.id===ids.line),currentLine:saved.entities.find(e=>e.id===ids.line),beforeChecks,afterChecks},null,2)+'\n');
  expect(beforeChecks).toHaveLength(1);expect(saved.entities.find(e=>e.id===ids.frame)?.status).toBe('confirmed');expect(afterChecks).toHaveLength(1);expect(afterChecks[0].kind).toBe('voice');
 }finally{await db.deleteDatabase();}
});
