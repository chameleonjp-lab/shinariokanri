import { expect, it } from 'vitest';
import { createEntity, createProject, newId } from './model';
import { adoptedWorldEntityIds } from './worldSources';

it('retains legacy visibility until an explicit world adoption selection exists', () => {
  expect(adoptedWorldEntityIds(createProject())).toBeUndefined();
});

it('keeps locally used foreign participants and group members visible without adopting unrelated people', () => {
  const project = createProject(), participant = newId(), member = newId(), unrelated = newId();
  project.views.push({ id: newId(), name: '世界の採用', view: `world-adoption:${newId()}`, entityIds: [], settings: {} });
  const event = createEntity(project.projectId, 'event', '本編の出来事', { participants: [{ characterId: participant, role: 'actor' }] });
  const group = createEntity(project.projectId, 'group', '本編のグループ', { groupType: 'display', members: [member] });
  const archived = createEntity(project.projectId, 'event', '不使用', { participants: [{ characterId: unrelated, role: 'actor' }] });
  archived.deletedAt = new Date().toISOString();
  project.entities.push(event, group, archived);
  expect(adoptedWorldEntityIds(project)).toEqual([participant, member]);
});
