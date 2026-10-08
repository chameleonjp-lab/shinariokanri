import {expect,it} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createProject,createEntity,newId,validateProject} from '../src/domain/model';
import {prepareReuse,resolveReuseContent} from '../src/domain/reuse';
import {flowStructure,structureCounts} from '../src/domain/flowStructure';
it('S5F10: retains pinned called-child errors in the use-site upper hierarchy after the current child is repaired',async()=>{
 let p=createProject();
 const ce=createEntity(p.projectId,'flow_node','共通子入口',{nodeType:'entry'}),cx=createEntity(p.projectId,'flow_node','共通子出口',{nodeType:'exit'}),missing=createEntity(p.projectId,'flow_edge','旧固定の未接続出口',{fromId:ce.id,toId:{unresolved:{label:'未接続',reason:'旧版では未接続'}}}),child=createEntity(p.projectId,'flow_graph','共通子図',{nodeIds:[ce.id,cx.id],edgeIds:[missing.id],entryIds:[ce.id],exitIds:[cx.id]});
 const entry=createEntity(p.projectId,'flow_node','使用先入口',{nodeType:'entry'}),use=createEntity(p.projectId,'flow_node','再利用する呼出し'),end=createEntity(p.projectId,'flow_node','使用先終端',{nodeType:'terminal',terminalReason:'意図した終端'}),enter=createEntity(p.projectId,'flow_edge','共通元へ',{fromId:entry.id,toId:use.id}),leave=createEntity(p.projectId,'flow_edge','使用先終端へ',{fromId:use.id,toId:end.id}),main=createEntity(p.projectId,'flow_graph','使用先の上位図',{nodeIds:[entry.id,use.id,end.id],edgeIds:[enter.id,leave.id],entryIds:[entry.id],exitIds:[end.id]});
 const source=createEntity(p.projectId,'flow_node','固定共通呼出し',{nodeType:'call',childGraphId:child.id,fallbackId:end.id});p.entities.push(ce,cx,missing,child,entry,use,end,enter,leave,main,source);
 p=(await prepareReuse(p,{ownerId:use.id,sourceId:source.id,mode:'reference'})).candidate;
 (p.entities.find(e=>e.id===missing.id) as typeof missing).data.toId=cx.id;
 const hierarchy=flowStructure(p),upper=hierarchy.find(item=>item.id===main.id)!,view=resolveReuseContent(p,p.snapshots),executedUpper=flowStructure(view).find(item=>item.id===main.id)!;
 const dir='/tmp/shinariokanri-rb05-reuse-hierarchy-fixtures';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/S5F10.json',JSON.stringify({project:p,validation:validateProject(p),hierarchy,upperCounts:structureCounts(upper),executedUpperCounts:structureCounts(executedUpper)},null,2)+'\n');
 expect(validateProject(p).ok).toBe(true);expect(structureCounts(executedUpper).unfinished).toBeGreaterThan(0);expect(structureCounts(upper).unfinished).toBeGreaterThan(0);
});
