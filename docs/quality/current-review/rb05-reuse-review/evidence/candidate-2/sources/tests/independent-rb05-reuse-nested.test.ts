import{expect,it}from'vitest';
import{mkdirSync,writeFileSync}from'node:fs';
import{createProject,createEntity,newId,validateProject}from'../src/domain/model';
import{prepareReuse,resolveReuseContent,reuseOrigin,reuseExecutionAnchor}from'../src/domain/reuse';
import{startChapterReading,presentNextChapterScene}from'../src/domain/presentation';
import{jsonBytes,sha256}from'../src/storage/json';
it('S5F11: a disclosure authored in the outer fixed module presents even if its body originates in an inner module',async()=>{
 let p=createProject();const old=createEntity(p.projectId,'scene','内側の元本文',{body:[{id:newId(),kind:'paragraph',text:'内側に固定した本文'}]}),first=createEntity(p.projectId,'scene','外側共通元'),second=createEntity(p.projectId,'scene','最後の使用先');p.entities.push(old,first,second);
 p=(await prepareReuse(p,{ownerId:first.id,sourceId:old.id,mode:'reference'})).candidate;
 const outer=newId(),variable=createEntity(p.projectId,'variable','提示による値',{key:'outer_effect',valueType:'integer',initial:{type:'integer',value:0},scope:'across_runs',allowed:{min:0,max:10}}),effect=createEntity(p.projectId,'effect','外側の提示効果',{operation:'set',targetId:variable.id,value:{type:'integer',value:5}}),f=createEntity(p.projectId,'foreshadow','外側伏線'),d=createEntity(p.projectId,'disclosure','外側版の提示',{foreshadowId:f.id,anchor:{entityId:first.id,sourceVersionId:outer},targetScope:{projectId:p.projectId,targetSnapshotId:outer},knowledgeEffects:[effect.id]});f.data.clueIds=[d.id];p.entities.push(variable,effect,f,d);
 const{snapshots:_s,history:_h,authorAlternatives:_a,...content}=structuredClone(p);p.snapshots.push({id:outer,content,contentHash:await sha256(jsonBytes(content)),createdAt:new Date().toISOString(),versionLabel:'外側の固定共通元'});
 p=(await prepareReuse(p,{ownerId:second.id,sourceId:first.id,snapshotId:outer,mode:'reference'})).candidate;
 const reading=presentNextChapterScene(p,await startChapterReading(p,{sceneIds:[second.id]})),view=resolveReuseContent(p,p.snapshots),owner=p.entities.find(e=>e.id===second.id)as typeof second,id=owner.data.reuse!.bindings![d.id],borrowed=view.entities.find(e=>e.id===id)as typeof d,dir='/tmp/shinariokanri-independent-rb05-reuse-2-nested-fixtures';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/S5F11.json',JSON.stringify({project:p,validation:validateProject(p),reading,ownerOrigin:reuseOrigin(view,second.id),disclosureOrigin:reuseOrigin(view,id),executionAnchor:reuseExecutionAnchor(view,borrowed.data.anchor,id)},null,2)+'\n');
 expect(validateProject(p).ok).toBe(true);expect(reading.status).toBe('terminal');expect(reading.state.seenIds).toContain(id);expect(reading.state.variableValues[variable.id]).toEqual({type:'integer',value:5});
});
