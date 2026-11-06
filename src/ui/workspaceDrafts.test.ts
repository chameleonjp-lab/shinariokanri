import {describe, expect, it} from 'vitest';
import {createEntity, createProject} from '../domain/model';
import {mirrorWorkspaceDrafts, readWorkspaceDrafts, readWorkspaceRecovery, workspaceDraftKey, type WorkspaceDrafts} from './workspaceDrafts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {getItem:(key:string) => values.get(key) ?? null, setItem:(key:string, value:string) => {values.set(key, value);}};
}
function inputs(): WorkspaceDrafts {
  const project = createProject('保持した作品'), scene = createEntity(project.projectId, 'scene', '帰る場面');
  return {drafts:{[`${project.projectId}:${scene.id}`]:scene}, jsonBuffers:{}, settingsDrafts:{}, alternativeDrafts:{}};
}
describe('workspace draft recovery mirror', () => {
  it('retains account-scoped inputs with a recovery time while keeping storage inputs backward compatible', () => {
    const storage = memoryStorage(), value = inputs(), retainedAt = '2026-11-06T12:30:00.000Z';
    expect(mirrorWorkspaceDrafts('author-a', value, storage, retainedAt)).toBe('');
    expect(readWorkspaceDrafts('author-a', storage)).toEqual(value);
    expect(readWorkspaceRecovery('author-a', storage)).toEqual({accountId:'author-a', retainedAt, inputs:value});
    expect(Object.keys(readWorkspaceDrafts('author-a', storage))).toEqual(['drafts','jsonBuffers','settingsDrafts','alternativeDrafts']);
    expect(readWorkspaceRecovery('author-b', storage).inputs.drafts).toEqual({});
  });
  it('exports legacy mirrors without inventing a retention time', () => {
    const storage = memoryStorage(), value = inputs();
    storage.setItem(workspaceDraftKey(null), JSON.stringify(value));
    expect(readWorkspaceRecovery(null, storage)).toEqual({accountId:null, retainedAt:null, inputs:value});
  });
  it('reports quota failures and leaves the previous recoverable mirror intact', () => {
    const storage = memoryStorage(), value = inputs();
    mirrorWorkspaceDrafts(null, value, storage, '2026-11-06T12:30:00.000Z');
    const unavailable = {...storage, setItem:() => {throw new DOMException('full', 'QuotaExceededError');}};
    expect(mirrorWorkspaceDrafts(null, {...value, drafts:{}}, unavailable)).toContain('保持できません');
    expect(readWorkspaceDrafts(null, storage)).toEqual(value);
  });
});
