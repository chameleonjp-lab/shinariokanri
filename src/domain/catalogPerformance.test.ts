import { describe, expect, it } from 'vitest';
import { createCatalogPerformanceFixture } from '../testing/catalogPerformanceFixture';
import { evaluateCollection, filterCatalogEntities } from './catalog';
import { createEntity, createProject } from './model';
import type { Entity, Query } from './types';

function countReads(entities: Entity[]) {
  let reads = 0;
  const records = new Proxy(entities, { get(target, property, receiver) { if (typeof property === 'string' && /^(?:0|[1-9][0-9]*)$/.test(property)) reads++; return Reflect.get(target, property, receiver); } });
  return { records, reads: () => reads };
}

describe('catalog batch evaluation cost and dependencies', () => {
  it('reads Standard records at most twice for production, foreshadow, participant and compound queries', async () => {
    const fixture = await createCatalogPerformanceFixture();
    expect(fixture.counts.totalRecords).toBe(8_800);
    const expected = { production: 600, foreshadow: 425, participant: 15, compound: 250, text: 5490 };
    for (const { name, query } of fixture.queries) {
      const counted = countReads(fixture.project.entities), project = { ...fixture.project, entities: counted.records };
      const result = filterCatalogEntities(project, query);
      expect(result.length, name).toBe(expected[name as keyof typeof expected]);
      // Counts actual array element reads, catching a full dependency scan inside each row predicate.
      expect(counted.reads(), name).toBeLessThanOrEqual(project.entities.length * 2);
    }
  });

  it('uses the same linear batch path for a saved dynamic collection', async () => {
    const fixture = await createCatalogPerformanceFixture();
    const collection = createEntity(fixture.project.projectId, 'collection', '工程の確認', { mode: 'dynamic', query: { op: 'production', value: 'done' }, sort: null });
    const counted = countReads([...fixture.project.entities, collection]), project = { ...fixture.project, entities: counted.records };
    expect(evaluateCollection(project, collection).entityIds).toHaveLength(600);
    expect(counted.reads()).toBeLessThanOrEqual(project.entities.length * 2);
  });

  it('keeps special foreshadow/disclosure matching and excludes archived flow nodes from scene expansion', () => {
    const project = createProject(), scene = createEntity(project.projectId, 'scene', 'scene');
    const node = createEntity(project.projectId, 'flow_node', 'node', { sceneId: scene.id });
    const parent = createEntity(project.projectId, 'foreshadow', 'parent', { resolutionPolicy: 'this_work' });
    const different = createEntity(project.projectId, 'foreshadow', 'different', { resolutionPolicy: 'sequel' });
    const clue = createEntity(project.projectId, 'disclosure', 'clue', { foreshadowId: parent.id, anchor: { entityId: different.id }, role: 'clue', stage: 'hint' });
    const anchor = createEntity(project.projectId, 'disclosure', 'node clue', { foreshadowId: parent.id, anchor: { entityId: node.id }, role: 'clue', stage: 'hint' });
    const payoff = createEntity(project.projectId, 'disclosure', 'payoff', { foreshadowId: parent.id, anchor: { entityId: scene.id }, role: 'payoff', stage: 'reveal' });
    project.entities = [scene, node, parent, different, clue, anchor, payoff];
    const query: Query = { op: 'foreshadow', resolutionPolicy: 'this_work', role: 'clue', stage: 'hint' };
    expect(filterCatalogEntities(project, query).map(entity => entity.id)).toEqual([scene.id, node.id, parent.id, clue.id, anchor.id]);
    node.deletedAt = '2026-10-05T00:00:01Z';
    expect(filterCatalogEntities(project, query).map(entity => entity.id)).toEqual([parent.id, clue.id, anchor.id]);
    anchor.deletedAt = '2026-10-05T00:00:01Z'; clue.deletedAt = '2026-10-05T00:00:01Z';
    expect(filterCatalogEntities(project, query)).toEqual([]);
  });

  it('rebuilds dependencies after edits to the same project object and keeps caller ordering', () => {
    const project = createProject(), first = createEntity(project.projectId, 'scene', 'first'), second = createEntity(project.projectId, 'scene', 'second');
    const task = createEntity(project.projectId, 'production_task', 'task', { targetIds: [first.id, second.id], progress: 'done' });
    project.entities = [first, second, task]; const query: Query = { op: 'production', value: 'done' };
    expect(filterCatalogEntities(project, query, [second, first, task]).map(entity => entity.id)).toEqual([second.id, first.id, task.id]);
    task.data.targetIds = [second.id];
    expect(filterCatalogEntities(project, query).map(entity => entity.id)).toEqual([second.id, task.id]);
    task.deletedAt = '2026-10-05T00:00:01Z';
    expect(filterCatalogEntities(project, query)).toEqual([]);
  });
});
