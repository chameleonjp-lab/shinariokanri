import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {validateProject} from '../src/domain/model';
import {exportScenario,inspectScenario} from '../src/storage/archive';
import {cloneProject} from '../src/storage/store';
import {startChapterReading,presentNextChapterScene} from '../src/domain/presentation';
import type {Entity,ProjectData} from '../src/domain/types';
it('S5F13 nested body and outer disclosure survive full native restore and independent project clone without borrowed author records',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/independent-reuse-nested.json',import.meta.url),'utf8'));
 const p=fixture.project as ProjectData;
 const restored=(await inspectScenario(await exportScenario(p),{worker:false})).project;
 const{project:cloned,idMap}=await cloneProject(restored);
 const results=[];
 for(const project of[restored,cloned]){
  const owner=project.entities.find(e=>e.name==='最後の使用先') as Entity<'scene'>;
  const disclosure=project.entities.find(e=>e.name==='外側版の提示') as Entity<'disclosure'>;
  const variable=project.entities.find(e=>e.name==='提示による値') as Entity<'variable'>;
  const reading=presentNextChapterScene(project,await startChapterReading(project,{sceneIds:[owner.id]}));
  results.push({project,owner,disclosure,variable,reading});
 }
 const dir='/tmp/shinariokanri-independent-rb05-reuse-4-nested-native-fixtures';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/S5F13.json',JSON.stringify({input:p,restored,cloned,idMap,results},null,2)+'\n');
 for(const result of results){expect(validateProject(result.project).ok).toBe(true);expect(result.project.entities).toHaveLength(p.entities.length);expect(result.reading.status).toBe('terminal');expect(result.reading.state.seenIds).toContain(result.owner.data.reuse!.bindings![result.disclosure.id]);expect(result.reading.state.variableValues[result.variable.id]).toEqual({type:'integer',value:5});}
 expect(cloned.projectId).not.toBe(p.projectId);
});
