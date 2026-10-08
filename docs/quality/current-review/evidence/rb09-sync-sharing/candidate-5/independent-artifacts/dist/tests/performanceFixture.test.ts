import {describe,it,expect} from 'vitest';
import {createPerformanceFixture} from '../src/testing/performanceFixture';
describe('performance dataset provenance',()=>{
 it('produces a deterministic, populated standard fixture with explicit unmeasured asset bytes',async()=>{
  const a=await createPerformanceFixture('standard-v1'),b=await createPerformanceFixture('standard-v1');
  expect(a.sha256).toBe(b.sha256);
  expect(a.counts).toEqual({character:100,event:1000,scene:500,dialogue_line:5000,relation:2000,variable:100,foreshadow:100,totalRecords:8800});
  expect(a.assetBytes).toBe(0);
  const line=a.project.entities.find(e=>e.kind==='dialogue_line')!;
  if(line.kind==='dialogue_line')expect(Array.from(line.data.text[0]!.text)).toHaveLength(40);
 });
});
