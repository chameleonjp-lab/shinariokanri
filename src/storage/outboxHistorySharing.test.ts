import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText } from '../domain/model';
import { createWorldSnapshot } from '../domain/world';
import { inspectScenario } from './archive';
import { jsonBytes, sha256 } from './json';
import { ScenarioStore } from './store';

const stores: ScenarioStore[] = [];
const open = (databaseName = `outbox-history-${newId()}`) => {
  const store = new ScenarioStore({ databaseName }); stores.push(store); return store;
};
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });

it('keeps every historical image and pending hash across checkpoint 64 and cold full recovery', async () => {
  const databaseName = `outbox-checkpoint-${newId()}`, writer = open(databaseName);
  let project = createProject('保存前');
  const person = createEntity(project.projectId, 'character', '人物の旧名');
  const other = createEntity(project.projectId, 'character', '相手');
  const scene = createEntity(project.projectId, 'scene', 'Unicode本文', { body: textToRichText('😀旧本文 e\u0301') });
  project.entities.push(person, other, scene);
  project.relations.push({ id: newId(), projectId: project.projectId, fromId: person.id, toId: other.id,
    revision: '0', evidenceIds: [], relationType: 'trust', direction: 'forward', status: 'confirmed',
    visibility: 'private', validity: { worldRange: null, routeCondition: null, presentationAnchor: null } });
  project = await createWorldSnapshot(project, '変更前の固定版');
  const pin = structuredClone(project.snapshots[0]!);
  for (let index = 0; index < 67; index++) {
    project.name = `作品名 ${index}`;
    if (index === 63) project.entities.find(entity => entity.id === person.id)!.name = '人物の新名';
    if (index === 64) project.relations[0].status = 'needs_review';
    if (index === 65) {
      const current = project.entities.find(entity => entity.id === scene.id)!;
      if (current.kind === 'scene') current.data.body[0].text = '😀新本文 e\u0301';
    }
    project = (await writer.saveProject(project, { reason: `独立した通常保存 ${index}`, includeHistory: true })).project;
  }
  const expected = structuredClone(project), pending = await writer.listOutbox(project.projectId);
  expect(pending).toHaveLength(67);
  expect(pending.at(-1)?.command).toEqual(expected.history.at(-1));
  expect(pending[63].changes.find(change => change.targetId === person.id)).toMatchObject({ before: { name: '人物の旧名' }, after: { name: '人物の新名' } });
  expect(pending[64].changes.find(change => change.targetId === project.relations[0].id)).toMatchObject({ before: { status: 'confirmed' }, after: { status: 'needs_review' } });
  const bytes = await writer.exportProject(project.projectId), prepared = await inspectScenario(bytes, { worker: false });
  expect(prepared.project).toEqual(expected);
  expect(prepared.project.snapshots[0]).toEqual(pin);
  expect(prepared.recovery?.pending).toHaveLength(67);
  for (const [index, row] of prepared.recovery!.pending.entries()) {
    expect(row.command).toEqual(expected.history[index]);
    expect(row.commandHash).toBe(await sha256(jsonBytes(expected.history[index])));
  }
  writer.close();
  const cold = open(databaseName);
  for (const index of [0, 62, 63, 64, 65, 66]) expect(await cold.historyCommand(project.projectId, expected.history[index].operationId)).toEqual(expected.history[index]);
  const emptyName = `outbox-empty-${newId()}`, empty = open(emptyName);
  await empty.importScenario(prepared, { mode: 'new' }); empty.close();
  const recovered = open(emptyName);
  expect(await recovered.getProject(project.projectId)).toEqual(expected);
  expect(await recovered.listRecoveredPending(project.projectId)).toHaveLength(67);
}, 60000);
