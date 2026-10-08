import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEntity,validateProject} from '../src/domain/model';
import {previewDialogueChange} from '../src/domain/productionWorkflow';
import type {ProjectData} from '../src/domain/types';
const root='/tmp/shinariokanri-independent-rb07-8e60239/independent/fixtures';
const fixture=()=>JSON.parse(readFileSync(root+'/original-production.json','utf8')) as {project:ProjectData;ids:Record<string,string>};
it('R7D13 dialogue preview captures its old base and source records before asynchronous hashes',async()=>{
 const {project:p,ids}=fixture(),before=structuredClone(p),pending=previewDialogueChange(p,{mode:'copy',sourceIds:[ids.line],reason:'捕捉を検査'});
 p.revision='9';const line=p.entities.find(e=>e.id===ids.line);if(line?.kind!=='dialogue_line')throw Error('fixture');line.data.text[0].text='😀鍵を閉く。';
 const plan=await pending;writeFileSync(root+'/R7D13.json',JSON.stringify({baseRevision:plan.baseRevision,candidateRevision:plan.candidate.revision,candidateSource:plan.candidate.entities.find(e=>e.id===ids.line),candidateValid:validateProject(plan.candidate).ok},null,2)+'\n');
 expect(plan.baseRevision).toBe(before.revision);expect(plan.candidate.entities.find(e=>e.id===ids.line)).toEqual(before.entities.find(e=>e.id===ids.line));
});
it('R7D14 rejected historical cue anchor stays at its original line after a live split',async()=>{
 const {project:p,ids}=fixture(),historical=createEntity(p.projectId,'cue','没の旧位置記録',{anchor:{entityId:ids.line,lineId:ids.line,blockId:ids.blockId,start:3,end:5},cueType:'sound',mediaTime:1000});historical.status='rejected';p.entities.push(historical);expect(validateProject(p).ok).toBe(true);
 const before=structuredClone(historical),plan=await previewDialogueChange(p,{mode:'split',sourceIds:[ids.line],blockId:ids.blockId,offset:3,reason:'現在台詞だけを分割'}),after=plan.candidate.entities.find(e=>e.id===historical.id);
 writeFileSync(root+'/R7D14.json',JSON.stringify({before,after},null,2)+'\n');expect(after).toEqual(before);
});
