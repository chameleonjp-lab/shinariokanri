import {it,expect} from 'vitest';
import {writeFileSync} from 'node:fs';
import {createProject,createEntity,textToRichText} from '../src/domain/model';
import {exportScenario,inspectScenario} from '../src/storage/archive';
const root='/tmp/shinariokanri-independent-rb06-cd38e34/independent/fixtures';
it('valid frozen input archives for normal UI file selection',async()=>{for(const name of['独立 取り込みC','独立 次の選択D']){const p=createProject(name);p.entities.push(createEntity(p.projectId,'scene',name+'場面',{body:textToRichText(name+'😀独立段落')}));const bytes=await exportScenario(p);expect((await inspectScenario(bytes,{worker:false})).project).toEqual(p);const stem=name.endsWith('C')?'C':'D';writeFileSync(root+'/'+stem+'.scenario',bytes);writeFileSync(root+'/'+stem+'.json',JSON.stringify(p,null,2)+'\n');}});
