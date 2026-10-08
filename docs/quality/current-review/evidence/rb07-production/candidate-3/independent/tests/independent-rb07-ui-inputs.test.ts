import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createEntity,validateProject} from '../src/domain/model';
const root='/tmp/shinariokanri-independent-rb07-92181f1/independent/fixtures';
it('Independent valid current-flow/chapter/native UI input derived from the frozen original IDs',()=>{
 const file=root+'/ui-production.json';if(existsSync(file)){expect(validateProject(JSON.parse(readFileSync(file,'utf8')).project).ok).toBe(true);return;}
 const base=JSON.parse(readFileSync(root+'/original-production.json','utf8')),p=base.project;
 const graph=createEntity(p.projectId,'flow_graph','独立通常graph'),entry=createEntity(p.projectId,'flow_node','独立通常入口',{nodeType:'entry',sceneId:base.ids.scene}),end=createEntity(p.projectId,'flow_node','独立通常終端',{nodeType:'terminal',sceneId:base.ids.otherScene,terminalReason:'検査対象終端'}),edge=createEntity(p.projectId,'flow_edge','独立通常進行',{fromId:entry.id,toId:end.id,label:'次の本文',edgeType:'choice'});graph.data.nodeIds=[entry.id,end.id];graph.data.entryIds=[entry.id];graph.data.edgeIds=[edge.id];[graph,entry,end,edge].forEach(e=>e.status='confirmed');p.entities.push(graph,entry,end,edge);
 base.ids={...base.ids,graph:graph.id,entry:entry.id,end:end.id,edge:edge.id};const checked=validateProject(p);if(!checked.ok)throw Error(JSON.stringify(checked.issues));expect(checked.ok).toBe(true);writeFileSync(file,JSON.stringify(base,null,2)+'\n');
});
