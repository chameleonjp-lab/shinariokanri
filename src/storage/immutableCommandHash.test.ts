import {describe,expect,it,vi} from 'vitest';
import {createProject,newId} from '../domain/model';
import type {CommandRecord} from '../domain/types';
import {captureImmutablePlainData} from '../domain/immutablePlainData';
import {createImmutableCommandHasher} from './immutableCommandHash';
import {createRecoveryWorkSession} from './recovery';
import {jsonBytes,sha256} from './json';

function fixture() {
  const project=createProject('実commandのhash'),{history:_history,...before}=structuredClone(project);
  project.revision='1';const {history:_nextHistory,...after}=structuredClone(project);
  const command:CommandRecord={operationId:newId(),projectId:project.projectId,baseRevision:'0',revision:'1',targetIds:[project.projectId],
    createdAt:'2026-10-15T00:00:00.000Z',reason:'全値を保持😀',before,after};
  project.history=[command];return {project,command};
}
const own=<T>(value:T)=>captureImmutablePlainData(value).value;

describe('actual immutable command digest reuse',()=>{
 it('returns the complete canonical digest for frozen commands, keeping distinct own values and ordered images intact',async()=>{
  const {command}=fixture(),input=own(command),hash=createImmutableCommandHasher(),expected=await sha256(jsonBytes(input));
  expect(await hash(input)).toBe(expected);expect(await hash(input)).toBe(expected);
  const changed=own({...command,reason:'同じIDの異なる全文😀'});expect(await hash(changed)).toBe(await sha256(jsonBytes(changed)));expect(await hash(changed)).not.toBe(expected);
  const unknown=own({...command,unexpected:undefined});expect(Object.hasOwn(unknown,'unexpected')).toBe(true);
  expect(await hash(unknown)).toBe(expected);expect(Object.hasOwn(input,'unexpected')).toBe(false);
 });
 it('never reuses a mutable command after its content changes',async()=>{
  const {command}=fixture(),hash=createImmutableCommandHasher(),first=await hash(command);
  command.after.name='後から変えた現在稿';const next=await hash(command);
  expect(next).not.toBe(first);expect(next).toBe(await sha256(jsonBytes(command)));expect(Object.isFrozen(command)).toBe(false);
 });
 it('still rejects a declared hash mismatch and invalid own data after warming a real full digest',async()=>{
  const {project,command}=own(fixture()),scope=createRecoveryWorkSession(),actual=await scope.commandHash(command),validation=scope.validation({});
  const recovery=own({version:1 as const,projectId:project.projectId,sourceRevision:project.revision,serverRevision:'0',pending:[{operationId:command.operationId,command,commandHash:actual}]});
  expect(await validation.recoveryForInspection(recovery,project)).toEqual(recovery);
  await expect(validation.recoveryForInspection(own({...recovery,pending:[{...recovery.pending[0]!,commandHash:'0'.repeat(64)}]}),project)).rejects.toMatchObject({code:'VALIDATION_FAILED'});
  const invalid=own({...command,unexpected:undefined});expect(await scope.commandHash(invalid)).toBe(actual);
  await expect(validation.recoveryForInspection(own({...recovery,pending:[{...recovery.pending[0]!,command:invalid}]}),project)).rejects.toMatchObject({code:'VALIDATION_FAILED'});
 });
 it('discards old digests and serialized segments when JSON encoding changes, including a later return to native behavior',async()=>{
  const input=own(fixture().command),hash=createImmutableCommandHasher(),first=await hash(input),native=JSON.stringify;
  const spy=vi.spyOn(JSON,'stringify').mockImplementation((value:any,...args:any[])=>Reflect.apply(native,JSON,[typeof value==='string'?value+'別符号化':value,...args]));
  try{const expected=await sha256(jsonBytes(input));expect(expected).not.toBe(first);expect(await hash(input)).toBe(expected);}finally{spy.mockRestore();}
  expect(await hash(input)).toBe(first);
 });
 it('keeps observable getter behavior on the uncached canonical path',async()=>{
  const {command}=fixture();let reads=0;Object.defineProperty(command,'reason',{enumerable:true,get:()=>{reads++;return '観測可能な本文';}});
  await sha256(jsonBytes(command));const baseline=reads;reads=0;
  const hash=createImmutableCommandHasher();await hash(command);expect(reads).toBe(baseline);reads=0;await hash(command);expect(reads).toBe(baseline);
 });
});
