import { describe, expect, it } from 'vitest';
import { createEntity, createProject } from '../src/domain/model';
import type { Entity, EntityDataMap, EntityKind } from '../src/domain/types';
import { backTrial, getTrialChoices, startTrial, stepTrial } from '../src/domain/runtime';

function fixture() {
  const project = createProject('代替進行の検査');
  const add = <K extends EntityKind>(kind: K, data: Partial<EntityDataMap[K]>, name: string = kind): Entity<K> => {
    const entity = createEntity<K>(project.projectId, kind, name, data);
    project.entities.push(entity);
    return entity;
  };
  const entry = add('flow_node', { nodeType: 'choice', gate: null, executionPolicy: 'manual_choice' }, '分岐点');
  const fallback = add('flow_node', { nodeType: 'terminal', terminalReason: '代替先の終端' }, '代替先');
  const alternative = add('flow_node', { nodeType: 'terminal', terminalReason: '別経路の終端' }, '別経路');
  const edge = (toId: string, condition: EntityDataMap['flow_edge']['condition']) => add('flow_edge', { fromId: entry.id, toId, edgeType: 'choice', condition });
  return { project, add, entry, fallback, alternative, edge };
}

describe('manual reader fallback', () => {
  it('takes and records the fallback when every manual candidate is false', () => {
    const { project, entry, fallback, alternative, edge } = fixture();
    entry.data.fallbackId = fallback.id;
    edge(alternative.id, { op: 'constant', value: false });
    edge(alternative.id, { op: 'constant', value: false });

    const before = startTrial(project, { entryId: entry.id });
    expect(before.status).toBe('ready');
    expect(getTrialChoices(project, before).map(choice => choice.result)).toEqual(['false', 'false']);
    const after = stepTrial(project, before);

    expect(after.nodeId).toBe(fallback.id);
    expect(after.status).toBe('terminal');
    expect(after.trace[0].edgeIds).toEqual([]);
    expect(backTrial(after).state).toEqual(before.state);
  });

  it('stops with a reason when unknown is the only candidate, even when fallback is set', () => {
    const { project, add, entry, fallback, alternative, edge } = fixture();
    const missing = add('variable', { key: 'missing', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: '未入力' } });
    entry.data.fallbackId = fallback.id;
    edge(alternative.id, { op: 'compare', variableId: missing.id, comparator: 'eq', value: { type: 'boolean', value: true } });

    const before = startTrial(project, { entryId: entry.id });
    expect(before.status).toBe('unknown');
    expect(before.issues[0]?.message).toContain('未確認');
    const after = stepTrial(project, before);
    expect(after.nodeId).toBe(entry.id);
    expect(after.state).toEqual(before.state);
    expect(after.trace).toEqual([]);
  });

  it('reports blocked when every candidate is false and no fallback exists', () => {
    const { project, entry, alternative, edge } = fixture();
    edge(alternative.id, { op: 'constant', value: false });

    const blocked = startTrial(project, { entryId: entry.id });
    expect(blocked.status).toBe('blocked');
    expect(blocked.issues[0]?.message).toContain('行き止まり');
    expect(stepTrial(project, blocked).trace).toEqual([]);
  });

  it('uses fallback for a false gate even if an outgoing condition itself is true', () => {
    const { project, entry, fallback, alternative, edge } = fixture();
    entry.data.gate = { op: 'constant', value: false };
    entry.data.fallbackId = fallback.id;
    edge(alternative.id, { op: 'constant', value: true });

    const before = startTrial(project, { entryId: entry.id });
    expect(before.status).toBe('ready');
    expect(getTrialChoices(project, before)[0]?.result).toBe('false');
    expect(stepTrial(project, before).nodeId).toBe(fallback.id);
  });

  it('follows a true manual choice instead of the configured fallback', () => {
    const { project, entry, fallback, alternative, edge } = fixture();
    entry.data.fallbackId = fallback.id;
    const active = edge(alternative.id, { op: 'constant', value: true });

    const before = startTrial(project, { entryId: entry.id });
    expect(before.status).toBe('ready');
    expect(stepTrial(project, before, { edgeId: active.id }).nodeId).toBe(alternative.id);
  });
});
