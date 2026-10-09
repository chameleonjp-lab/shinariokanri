import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createEntity,validateProject} from '../src/domain/model';
import {checkProductionRules,productionCheckView} from '../src/domain/productionChecks';
import type {ProjectData,ProjectContent} from '../src/domain/types';
const root='/tmp/shinariokanri-independent-rb07-28eccca/independent/fixtures';
it('R7D24 an applicable work-local terminology rule on an older-world subtitle links back to its own work edition',async()=>{
 const path=root+'/world-local-rule-production.json';
 let input: {project:ProjectData;ids:Record<string,string>;world:ProjectData;registry:Record<string,ProjectContent>};
 if(existsSync(path))input=JSON.parse(readFileSync(path,'utf8'));else{input=JSON.parse(readFileSync(root+'/world-new-current-production.json','utf8'));const term=createEntity(input.project.projectId,'terminology','作品だけの字幕用語',{canonical:'今',variants:['現在']});term.status='confirmed';input.project.entities.push(term);input.ids.localRule=term.id;writeFileSync(path,JSON.stringify(input,null,2)+'\n');}
 const {project:p,ids,registry,world}=input;expect(validateProject(p,{worldSnapshots:registry}).ok).toBe(true);const view=await productionCheckView(p,registry,world.snapshots),checks=checkProductionRules(view.project,{...view,at:'10'}).filter(x=>x.lineId===ids.frame&&x.ruleId===ids.localRule);expect(checks).toHaveLength(1);expect(checks[0]).toMatchObject({kind:'spelling',value:'true'});writeFileSync(root+'/R7D24.json',JSON.stringify({localRule:p.entities.find(e=>e.id===ids.localRule),checks,oldWorldHasLocalRule:world.snapshots.find(s=>s.id===ids.old)?.content.entities.some(e=>e.id===ids.localRule),sourceVersionId:ids.old},null,2)+'\n');expect(checks[0].ruleAnchor).toEqual({entityId:ids.localRule});
});
