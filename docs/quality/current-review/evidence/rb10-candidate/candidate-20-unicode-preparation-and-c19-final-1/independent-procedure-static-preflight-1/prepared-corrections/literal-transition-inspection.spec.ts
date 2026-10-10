import {registerProcedure} from './procedureRegistry';
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {inspectScenario} from '../candidate/src/storage/archive';
import {sha256,jsonBytes} from '../candidate/src/storage/json';
import {importBytes,backup,durable,digest,evidence,appURL} from './common';
import {openRecord} from './extended-support';

registerProcedure('AT-F41 remaining then: actual recorded completed→unaccepted reset, normal state transition rules and effect reason/target, fixed source/hash and native unchanged',async({page},info)=>{
 test.setTimeout(120000);
 const bytes=new Uint8Array(await readFile(new URL('../regression-inputs/f41-observed-c15.scenario',import.meta.url)));
 expect(digest(bytes)).toBe('0481aef02168e76360929e2a2220ef4ff6e0513490a3ec6a761e4f9ec6b53d06');
 const prepared=await inspectScenario(bytes,{worker:false}),p=prepared.project;
 const state=p.entities.find(e=>e.kind==='variable'&&e.name==='クエスト状態')!;
 const reset=p.entities.find(e=>e.kind==='effect'&&e.name==='理由付き明示reset')!;
 const edge=p.entities.find(e=>e.kind==='flow_edge'&&e.name==='理由付きresetだけを明示する')!;
 if(state.kind!=='variable'||reset.kind!=='effect'||edge.kind!=='flow_edge')throw Error('Actual source kind mismatch');
 const trace=p.entities.find(e=>e.kind==='trace'&&e.data.steps.some(s=>s.edgeIds.includes(edge.id)))!;
 if(trace.kind!=='trace')throw Error('Actual reset trace missing');
 const step=trace.data.steps.find(s=>s.edgeIds.includes(edge.id))!;
 expect(step.before.variableValues[state.id]).toEqual({type:'enum',value:'完了'});
 expect(step.after.variableValues[state.id]).toEqual({type:'enum',value:'未受注'});
 const pin=p.snapshots.find(s=>s.id===trace.data.contentVersionId)!;
 expect(await sha256(jsonBytes(pin.content))).toBe(pin.contentHash);
 const oldState=pin.content.entities.find(e=>e.id===state.id)!;
 expect(oldState.kind==='variable'&&oldState.data.transitionRules).toEqual(state.data.transitionRules);
 await importBytes(page,bytes,appURL);const before=await durable(page);
 await openRecord(page,'variable',state.name);
 const field=page.getByRole('region',{name:'許容する状態遷移の構造化入力',exact:true});await expect(field).toBeVisible();
 const expectedPairs=[['未受注','進行中'],['進行中','完了'],['進行中','失敗']];
 const actualStructuredPairs:string[][]=[];
 for(let index=0;index<expectedPairs.length;index++){
  const from=field.locator(`#sd-transitionRules-${index}-from-value`),to=field.locator(`#sd-transitionRules-${index}-to-value`);
  await expect(from).toBeVisible();await expect(to).toBeVisible();
  await expect(from).toHaveValue(expectedPairs[index][0]);await expect(to).toHaveValue(expectedPairs[index][1]);
  actualStructuredPairs.push([await from.inputValue(),await to.inputValue()]);
 }
 expect(actualStructuredPairs).toEqual(expectedPairs);
 // Read the unchanged ordinary advanced-data control as well; never inject or
 // manufacture transition values from the captured archive into the UI.
 await page.locator('.detail-panel summary').filter({hasText:'詳細データ・ルビ・本文リンクを編集'}).click();
 const actualRules=JSON.parse(await page.locator('.detail-panel').getByRole('textbox',{name:'詳細データ',exact:true}).inputValue()).transitionRules;
 expect(actualRules).toEqual(state.data.transitionRules);
 expect(actualRules.map((r:{from:{value:string};to:{value:string}})=>[r.from.value,r.to.value])).toEqual(expectedPairs);
 await openRecord(page,'effect',reset.name);
 await expect(page.getByLabel('操作',{exact:true})).toHaveValue('reset');
 await expect(page.getByLabel('操作の対象',{exact:true})).toHaveValue(state.id);
 await expect(page.getByLabel('操作の説明',{exact:true})).toHaveValue(reset.data.reason!);
 expect(reset.data.reason).toBe('作者が明示して最初からやり直す');
 expect(await durable(page)).toEqual(before);
 const after=await backup(page);expect(after.parsed.project).toEqual(p);
 await evidence(info,'F41-normal-rules-and-reset-source',{previousActualRun:'c15-literal-flow-reuse-state-7',sameExactActualArchiveSHA256:digest(bytes),originalThenRuleConfirmation:true,normalTargetStateID:state.id,normalRules:actualRules,actualStructuredPairs,normalEffectID:reset.id,normalReason:reset.data.reason,normalOperation:'reset',recordedOldVersionID:pin.id,recordedOldVersionHash:pin.contentHash,recordedBefore:step.before.variableValues[state.id],recordedAfter:step.after.variableValues[state.id],recordedEdgeID:edge.id,currentRulesEqualFixedSource:true,nativeUnchanged:true,actualNewArchiveSHA256:digest(after.bytes),wholeCasePassInferred:false,physical:'not_run'});
});
