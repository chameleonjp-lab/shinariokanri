import {expect,it} from 'vitest';
import {unzipSync,zipSync} from 'fflate';
import {createEntity,createProject,newId} from '../domain/model';
import {exportScenarioData,inspectScenarioData} from './archiveData';
import {jsonBytes} from './json';
import {RECORD_DICTIONARY_FEATURE,RECORD_DELTA_FEATURE,CALENDAR_RECORD_FEATURE} from './recordDictionary';

it('declares actual dictionary capabilities, preserves every value and refuses a file missing any required capability',async()=>{
 const p=createProject('既存1.0の全値を保つ');p.entities=Array.from({length:5000},(_,i)=>createEntity(p.projectId,'note','本文'+i));
 const {history:_history,...before}=p,after={...before,revision:'1',entities:p.entities.map((e,i)=>i===0?{...e,name:'改稿',revision:'1'}:e)};
 const command={operationId:newId(),projectId:p.projectId,baseRevision:'0',revision:'1',targetIds:[p.entities[0].id],reason:'通常改稿',createdAt:'2026-10-12T00:00:00Z',before,after};
 const project={...after,history:[command]},file=await exportScenarioData(project),actual=await inspectScenarioData(file);
 expect(actual.manifest).toMatchObject({formatVersion:'1.0.0',minimumReaderVersion:'1.0.0'});
 expect(actual.manifest.requiredFeatures).toEqual(expect.arrayContaining([RECORD_DICTIONARY_FEATURE,RECORD_DELTA_FEATURE,CALENDAR_RECORD_FEATURE]));
 expect(actual.project).toEqual(project);
 for(const feature of [RECORD_DELTA_FEATURE,CALENDAR_RECORD_FEATURE]){
  const files=unzipSync(file),manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));manifest.requiredFeatures=manifest.requiredFeatures.filter((value:string)=>value!==feature);files['manifest.json']=new Uint8Array(jsonBytes(manifest));
  await expect(inspectScenarioData(zipSync(files))).rejects.toMatchObject({code:'ARCHIVE_INVALID'});
 }
 const files=unzipSync(file),manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));manifest.requiredFeatures=['future-encoding-v99'];files['manifest.json']=new Uint8Array(jsonBytes(manifest));
 await expect(inspectScenarioData(zipSync(files))).rejects.toMatchObject({code:'FORMAT_UNSUPPORTED'});
});
