import { describe,it,expect } from 'vitest';
import { createDiagnostic } from '../src/diagnostics';
describe('diagnostic privacy',()=>{
 it('only returns approved metadata and cannot smuggle content as an identifier',()=>{
  expect(Object.keys(createDiagnostic('LOCAL_SAVE_FAILED')).sort()).toEqual(['code','environment','operationId','recordedAt','revision','schemaVersion']);
  expect(()=>createDiagnostic('LOCAL_SAVE_FAILED','private manuscript')).toThrow();
  expect(()=>createDiagnostic('FORBIDDEN',undefined,'secret token')).toThrow();
 });
});
