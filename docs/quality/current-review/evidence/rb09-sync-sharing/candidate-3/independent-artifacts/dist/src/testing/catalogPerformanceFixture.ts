import { createEntity } from '../domain/model';
import type { Entity, EntityKind, Query } from '../domain/types';
import { jsonBytes, sha256 } from '../storage/json';
import { createPerformanceFixture } from './performanceFixture';

/** Standard's 8,800 records, with 1,210 dialogue rows exchanged for real query dependencies. */
export async function createCatalogPerformanceFixture() {
  const fixture = await createPerformanceFixture('standard-catalog-v1'), project = fixture.project;
  const scenes = project.entities.filter(entity => entity.kind === 'scene'), characters = project.entities.filter(entity => entity.kind === 'character');
  const foreshadows = project.entities.filter(entity => entity.kind === 'foreshadow');
  foreshadows.forEach((entity, index) => { entity.data.resolutionPolicy = index % 2 ? 'sequel' : 'this_work'; });
  const id = (index: number) => `${project.projectId.slice(0, 8)}-0000-4000-8000-${(100_000 + index).toString(16).padStart(12, '0')}`;
  const replacements: Entity[] = [];
  const make = (kind: EntityKind, index: number, data: object) => { const entity = createEntity(project.projectId, kind, `${kind}${index}`, data as never); entity.id = id(index); entity.createdAt = entity.updatedAt = '2026-10-05T00:00:00Z'; return entity; };
  for (let index = 0; index < 400; index++) {
    const node = make('flow_node', index, { nodeType: 'choice', sceneId: scenes[index % scenes.length].id });
    const disclosure = make('disclosure', index + 400, { foreshadowId: foreshadows[index % foreshadows.length].id, anchor: { entityId: index % 2 ? scenes[index % scenes.length].id : node.id }, role: index % 3 ? 'clue' : 'payoff', stage: index % 3 ? 'hint' : 'reveal' });
    const task = make('production_task', index + 800, { targetIds: [scenes[index % scenes.length].id, characters[index % characters.length].id], progress: index % 3 ? 'done' : 'needs_review' });
    if (index % 17 === 0) { task.deletedAt = '2026-10-05T00:00:01Z'; disclosure.deletedAt = '2026-10-05T00:00:01Z'; }
    replacements.push(node, disclosure, task);
  }
  for (let index = 0; index < 10; index++) {
    const sceneIds = scenes.slice(index * 50, (index + 1) * 50).map(scene => scene.id), chapter = make('chapter', index + 1200, { sceneIds });
    for (const scene of scenes.slice(index * 50, (index + 1) * 50)) scene.data.chapterId = chapter.id;
    replacements.push(chapter);
  }
  let position = 0;
  project.entities = project.entities.map(entity => entity.kind === 'dialogue_line' && position < replacements.length ? replacements[position++] : entity);
  const counts = Object.fromEntries([...new Set(project.entities.map(entity => entity.kind))].map(kind => [kind, project.entities.filter(entity => entity.kind === kind).length]));
  const queries: { name: string; query: Query }[] = [
    { name: 'production', query: { op: 'production', value: 'done' } },
    { name: 'foreshadow', query: { op: 'foreshadow', resolutionPolicy: 'this_work', role: 'clue', stage: 'hint' } },
    { name: 'participant', query: { op: 'participant', characterId: characters[1].id } },
    { name: 'compound', query: { op: 'all', children: [{ op: 'kind', value: 'scene' }, { op: 'any', children: [{ op: 'production', value: 'done' }, { op: 'foreshadow', resolutionPolicy: 'this_work', role: 'clue' }] }] } },
    { name: 'text', query: { op: 'text', value: '霧' } },
  ];
  return { project, queries, seed: fixture.seed, size: fixture.size, sha256: await sha256(jsonBytes(project)), counts: { ...counts, relation: project.relations.length, totalRecords: project.entities.length + project.relations.length }, assetBytes: 0 };
}
