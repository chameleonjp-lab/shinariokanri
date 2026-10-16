import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { ScenarioStore } from './store';
import { inspectScenario } from './archive';
import { createEntity, createProject, newId, textToRichText } from '../domain/model';
import type { ProjectData } from '../domain/types';

function barrier() { let release!: () => void; const ready = new Promise<void>(resolve => { release = resolve; }); return { ready, release }; }
const stores: ScenarioStore[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const store of stores.splice(0)) await store.deleteDatabase(); });

it('rejects a cancelled cached read after the database completes and leaves the saved edition intact', async () => {
  const project=createProject('cancel cached read'),store=new ScenarioStore({databaseName:`cache-cancel-${newId()}`});stores.push(store);
  await store.saveProject(project,{reason:'initial'});
  const captured=barrier(),resume=barrier(),internals=store as unknown as {db:Dexie};
  const transaction=internals.db.transaction.bind(internals.db);
  vi.spyOn(internals.db,'transaction').mockImplementationOnce(((...args:unknown[])=>{
    const read=(transaction as (...values:unknown[])=>Promise<unknown>)(...args);
    return read.then(async value=>{captured.release();await resume.ready;return value;});
  }) as typeof internals.db.transaction);
  const controller=new AbortController(),reading=store.getProjectForEditing(project.projectId,{signal:controller.signal});
  const rejection=expect(reading).rejects.toMatchObject({code:'CANCELLED'});
  await captured.ready;controller.abort();resume.release();await rejection;
  const current=(await store.getProject(project.projectId))!;
  expect(current.name).toBe('cancel cached read');expect(current.revision).toBe('1');expect(current.history).toHaveLength(1);
  expect(await store.listOutbox(project.projectId)).toHaveLength(1);
});

it('does not attach an older completed history read to a newer editing revision', async () => {
  const project = createProject('cache race'), store = new ScenarioStore({ databaseName: `cache-race-${newId()}` }); stores.push(store);
  project.entities.push(createEntity(project.projectId, 'scene', 'scene', { body: textToRichText('一行の本文') }));
  await store.saveProject(project, { reason: 'initial' });
  const editing = (await store.getProjectForEditing(project.projectId))!;
  await store.saveProject({ ...editing, name: 'revision 2' }, { reason: 'second', includeHistory: false });

  // Delay only the old read's post-transaction validation. Both data access and
  // saves still execute the actual native IndexedDB implementation.
  const internals = store as unknown as { db: Dexie; validationWorlds: () => Promise<unknown> };
  const validating = barrier(), finishValidation = barrier();
  const validateWorlds = internals.validationWorlds.bind(store);
  vi.spyOn(internals, 'validationWorlds').mockImplementationOnce(async () => { validating.release(); await finishValidation.ready; return validateWorlds(); });
  const completeRead = store.getProject(project.projectId);
  await validating.ready;
  const second = (await store.getProjectForEditing(project.projectId))!;
  await store.saveProject({ ...second, name: 'revision 3' }, { reason: 'third', includeHistory: false });

  // Expose the possible scheduling gap between a completed read transaction
  // and its awaiting method resuming. This changes timing, never its rows.
  const capturedEditingRead = barrier(), finishEditingRead = barrier();
  const readTransaction = internals.db.transaction.bind(internals.db);
  const transactionSpy = vi.spyOn(internals.db, 'transaction');
  transactionSpy.mockImplementationOnce(((...args: unknown[]) => {
    const result = (readTransaction as (...values: unknown[]) => Promise<unknown>)(...args);
    return result.then(async value => { capturedEditingRead.release(); await finishEditingRead.ready; return value; });
  }) as typeof internals.db.transaction);
  const nextEditingRead = store.getProjectForEditing(project.projectId);
  await capturedEditingRead.ready;
  finishValidation.release(); await completeRead;
  finishEditingRead.release(); const third = (await nextEditingRead)!;
  expect(third.revision).toBe('3');
  await expect(store.saveProject({ ...third, name: 'revision 4' } as ProjectData, { reason: 'fourth', includeHistory: false })).resolves.toMatchObject({ project: { revision: '4' } });
});

it('does not repopulate caches when an initial uncached read resumes after close', async () => {
  const project = createProject('close while validating'), databaseName = `cache-close-${newId()}`;
  const writer = new ScenarioStore({ databaseName }); stores.push(writer);
  await writer.saveProject(project, { reason: 'initial' }); writer.close();
  const reader = new ScenarioStore({ databaseName }); stores.push(reader);
  const internals = reader as unknown as { validationWorlds: () => Promise<unknown>; cachedProjects: Map<string, ProjectData>; cachedHistoryIds: Map<string, string[]> };
  const validating = barrier(), finishValidation = barrier(), validateWorlds = internals.validationWorlds.bind(reader);
  vi.spyOn(internals, 'validationWorlds').mockImplementationOnce(async () => { const worlds = await validateWorlds(); validating.release(); await finishValidation.ready; return worlds; });
  const pending = reader.getProject(project.projectId);
  await validating.ready; reader.close(); finishValidation.release();
  const completed = (await pending)!;
  expect(completed.revision).toBe('1'); expect(completed.history).toHaveLength(1);
  expect(internals.cachedProjects.has(project.projectId)).toBe(false);
  expect(internals.cachedHistoryIds.has(project.projectId)).toBe(false);
  const restarted = new ScenarioStore({ databaseName }); stores.push(restarted);
  const reopened = (await restarted.getProjectForEditing(project.projectId))!;
  expect(restarted.getHistoryCount(reopened)).toBe(1);
  await expect(restarted.saveProject({ ...reopened, name: 'after reopening' }, { reason: 'second', includeHistory: false })).resolves.toMatchObject({ project: { revision: '2' } });
});

it('does not remember an older in-flight read after atomic replacement recovery', async () => {
  const project = createProject('replace while validating'), store = new ScenarioStore({ databaseName: `cache-replace-${newId()}` }); stores.push(store);
  const initial = await store.saveProject(project, { reason: 'initial' });
  await store.commitAck(project.projectId, { operationId: initial.operationId, projectId: project.projectId, serverRevision: '1', status: 'applied' });
  const prepared = await inspectScenario(await store.exportProject(project.projectId), { worker: false }); prepared.project.name = 'replacement';
  const editing = (await store.getProjectForEditing(project.projectId))!;
  const second = await store.saveProject({ ...editing, name: 'revision 2' }, { reason: 'second', includeHistory: false });
  await store.commitAck(project.projectId, { operationId: second.operationId, projectId: project.projectId, serverRevision: '2', status: 'applied' });
  const internals = store as unknown as { validationWorlds: () => Promise<unknown>; cachedProjects: Map<string, ProjectData>; cachedHistoryIds: Map<string, string[]> };
  const validating = barrier(), finishValidation = barrier(), validateWorlds = internals.validationWorlds.bind(store);
  vi.spyOn(internals, 'validationWorlds').mockImplementationOnce(async () => { const worlds = await validateWorlds(); validating.release(); await finishValidation.ready; return worlds; });
  const pending = store.getProject(project.projectId); await validating.ready;
  const replacement = await store.importScenario(prepared, { mode: 'replace', baseRevision: '2' });
  expect(replacement.project.revision).toBe('3');
  finishValidation.release(); const old = (await pending)!;
  expect(old.revision).toBe('2'); expect(old.history).toHaveLength(2);
  expect(internals.cachedProjects.has(project.projectId)).toBe(false);
  expect(internals.cachedHistoryIds.has(project.projectId)).toBe(false);
  const current = (await store.getProjectForEditing(project.projectId))!;
  expect(current.name).toBe('replacement'); expect(current.revision).toBe('3'); expect(store.getHistoryCount(current)).toBe(3);
  await expect(store.saveProject({ ...current, name: 'revision 4' }, { reason: 'fourth', includeHistory: false })).resolves.toMatchObject({ project: { revision: '4' } });
});
