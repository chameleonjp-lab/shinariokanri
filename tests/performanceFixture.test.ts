import {describe,it,expect} from 'vitest';
import {createPerformanceFixture,createMaterialPerformanceFixture} from '../src/testing/performanceFixture';
import {exportScenario,inspectScenario} from '../src/storage/archive';
import {sha256,jsonBytes} from '../src/storage/json';
import {newId} from '../src/domain/model';
import type {CommandRecord,ContentState} from '../src/domain/types';
describe('performance dataset provenance',()=>{
 it('produces a deterministic, populated standard fixture with explicit unmeasured asset bytes',async()=>{
  const a=await createPerformanceFixture('standard-v1'),b=await createPerformanceFixture('standard-v1');
  expect(a.sha256).toBe(b.sha256);
  expect(a.counts).toEqual({character:100,event:1000,scene:500,dialogue_line:5000,relation:2000,variable:100,foreshadow:100,totalRecords:8800});
  expect(a.assetBytes).toBe(0);
  const line=a.project.entities.find(e=>e.kind==='dialogue_line')!;
  if(line.kind==='dialogue_line')expect(Array.from(line.data.text[0]!.text)).toHaveLength(40);
 });
 it('includes actual bounded Large materials and restores every byte from a complete file',async()=>{
  const fixture=await createMaterialPerformanceFixture('large-material-rb10-v1');
  expect(fixture.coreRecords).toBe(88000);expect(fixture.counts.totalRecords).toBe(88003);expect(fixture.assetBytes).toBe(72*1024*1024);
  const {history:_history,...original}=fixture.project;
  const edited:ContentState={...original,revision:'1',entities:original.entities.map((e,i)=>i===0?{...e,name:'第一の編集'}:e)};
  const later:ContentState={...edited,revision:'2',entities:edited.entities.map((e,i)=>i===1?{...e,name:'第二の編集'}:e)};
  const history:CommandRecord[]=[{operationId:newId(),projectId:original.projectId,baseRevision:original.revision,revision:'1',targetIds:[original.entities[0]!.id],reason:'実編集1',createdAt:'2026-10-08T12:00:00.000Z',before:original,after:edited},{operationId:newId(),projectId:original.projectId,baseRevision:'1',revision:'2',targetIds:[original.entities[1]!.id],reason:'実編集2',createdAt:'2026-10-08T12:01:00.000Z',before:edited,after:later}];
  const project={...later,history},recovery={version:1 as const,projectId:project.projectId,sourceRevision:'2',serverRevision:'0',pending:await Promise.all(history.map(async command=>({operationId:command.operationId,command,commandHash:await sha256(jsonBytes(command))})))};
  const bytes=await exportScenario(project,{recovery,loadAsset:hash=>fixture.assets.find(a=>a.contentHash===hash)?.bytes});
  const recovered=await inspectScenario(bytes,{worker:false});expect(recovered.assets).toHaveLength(3);expect(recovered.project.entities.length+recovered.project.relations.length).toBe(88003);
  expect(recovered.manifest.requiredFeatures).toContain('shared-records-v1');expect(recovered.project).toEqual(project);expect(recovered.recovery).toEqual(recovery);
  expect(recovered.project.history[0]!.before.entities[0]!.name).toBe(original.entities[0]!.name);expect(recovered.project.history[0]!.after.entities[0]!.name).toBe('第一の編集');expect(recovered.project.entities[1]!.name).toBe('第二の編集');
  for(const asset of recovered.assets){expect(asset.bytes.length).toBe(24*1024*1024);expect(await sha256(asset.bytes)).toBe(asset.contentHash);expect(asset.bytes[500]).toBe(fixture.assets.find(a=>a.contentHash===asset.contentHash)!.bytes[500]);}
 },300000);
});
