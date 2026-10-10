import {registerProcedure} from './procedureRegistry';
import {test,expect} from '@playwright/test';
import {createEntity,createProject,validateProject} from '../candidate/src/domain/model';
import {stateUsageIndex} from '../candidate/src/domain/stateUsage';
import {findCatalogMaintenance} from '../candidate/src/domain/catalog';
import type {Entity} from '../candidate/src/domain/types';
import {seed,nav,backup,evidence,digest} from './common';
import {reader,begin,recordTrial} from './extended-support';

registerProcedure('original F39 unused external Y remains an explicit maintenance candidate after ordinary checkpoint/trace recording',async({page},info)=>{
 const p=createProject('原F39 保存記録は作者の状態利用と別');
 const y=createEntity(p.projectId,'variable','未使用Y・外部利用宣言あり',{key:'external_y',valueType:'integer',scope:'across_runs',initial:{type:'integer',value:7},allowed:{},externalUseDeclared:true});
 const entry=createEntity(p.projectId,'flow_node','Yを読まない入口',{nodeType:'entry'}),end=createEntity(p.projectId,'flow_node','Yを更新しない意図した終端',{nodeType:'terminal',terminalReason:'Yは外部利用宣言だけを保持'}),edge=createEntity(p.projectId,'flow_edge','状態を使わず終える',{fromId:entry.id,toId:end.id,label:'状態を使わず終える'}),graph=createEntity(p.projectId,'flow_graph','状態Yを利用しない図',{nodeIds:[entry.id,end.id],entryIds:[entry.id],exitIds:[end.id],edgeIds:[edge.id]});
 p.entities=[y,entry,end,edge,graph];for(const e of p.entities)e.status='confirmed';expect(validateProject(p).ok).toBe(true);expect(stateUsageIndex(p).get(y.id)??[]).toEqual([]);expect(findCatalogMaintenance(p).some(f=>f.kind==='external_use'&&f.targetIds.includes(y.id))).toBe(true);
 const input=await seed(page,p);await nav(page,/^検索/);await page.getByRole('tab',{name:'見直しと統合',exact:true}).click();const beforeRow=page.locator('.search-page article').filter({hasText:y.name});await expect(beforeRow.getByRole('button',{name:'外部利用宣言を確認',exact:true})).toBeVisible();
 await reader(page);await begin(page,entry.id);await page.locator('.reader-choices').getByRole('button',{name:edge.data.label!,exact:true}).click();await recordTrial(page);const archive=await backup(page),saved=archive.parsed.project,storedY=saved.entities.find(e=>e.id===y.id) as Entity<'variable'>;expect(storedY.data).toEqual(y.data);expect(storedY.deletedAt).toBeFalsy();const fullUsage=stateUsageIndex(saved).get(y.id)??[],authoredUsage=fullUsage.filter(use=>!['checkpoint','trace'].includes(saved.entities.find(e=>e.id===use.entityId)?.kind??''));expect(authoredUsage).toEqual([]);
 const findings=findCatalogMaintenance(saved),recorded=saved.entities.filter(e=>e.kind==='checkpoint'||e.kind==='trace');await nav(page,/^検索/);await page.getByRole('tab',{name:'見直しと統合',exact:true}).click();
 await evidence(info,'F39-recorded-unused-observation',{originalCase:'AT-F39',fixtureSHA256:digest(input),archiveSHA256:digest(archive.bytes),unusedY:y.id,externalUseDeclared:storedY.data.externalUseDeclared,actualAuthoredUsage:authoredUsage,actualSerializationAndAuthoredUsage:fullUsage,recordedKinds:recorded.map(e=>({id:e.id,kind:e.kind})),actualCatalogFindings:findings,actualMaintenanceText:await page.locator('.search-page').innerText(),expected:'The unused externally-declared state remains an explicit review candidate. Runtime serialization of every initial value must not imply an authored condition/effect/reset use.',candidate:'C15',physical:'not_run',actualAuth:'not_run',wholeCasePassed:false});
 await expect(page.locator('.search-page article').filter({hasText:y.name}).getByRole('button',{name:'外部利用宣言を確認',exact:true})).toBeVisible();
});
