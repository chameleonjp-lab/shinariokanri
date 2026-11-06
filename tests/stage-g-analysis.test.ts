import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId } from '../src/domain/model';
import { analyzeFlow } from '../src/domain/runtime';
function fixture() {
  const p = createProject('検査の理由');
  const key = createEntity(p.projectId, 'variable', '鍵', { key: 'key', valueType: 'boolean', initial: { type: 'boolean', value: false } });
  const entry = createEntity(p.projectId, 'flow_node', '入口', { nodeType: 'entry' });
  const end = createEntity(p.projectId, 'flow_node', '出口', { nodeType: 'terminal', terminalReason: '終了' });
  const edge = createEntity(p.projectId, 'flow_edge', '鍵の扉', { fromId: entry.id, toId: end.id, condition: { op: 'compare', variableId: key.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
  p.entities.push(key, entry, end, edge); return { p, key, entry, end, edge };
}
describe('G13 actionable scoped diagnostics', () => {
  it('separates a false choice at this start from a missing target and unknown external input', () => {
    const f = fixture(), noKey = analyzeFlow(f.p);
    expect(noKey.findings).toContainEqual(expect.objectContaining({ category: 'condition_false', targetId: f.edge.id, repairPath: 'condition' }));
    expect(noKey.findings.some(f => /作品全体.*到達不能/.test(f.message))).toBe(false);
    f.edge.data.toId = newId();
    expect(analyzeFlow(f.p).findings).toContainEqual(expect.objectContaining({ category: 'missing_target', targetId: f.edge.id, repairPath: 'toId' }));
    f.edge.data.toId = f.end.id;
    const external = createEntity(f.p.projectId, 'external_contract', '外部の鍵', { key: 'external_key', outputType: 'boolean', owner: 'game' }); f.p.entities.push(external);
    f.edge.data.condition = { op: 'external', contractId: external.id };
    expect(analyzeFlow(f.p).findings).toContainEqual(expect.objectContaining({ category: 'unknown_value', targetId: f.edge.id }));
  });
  it('records completed and interrupted boundaries separately at a time limit', () => {
    const f = fixture(); f.edge.data.condition = null; let now = 0;
    const result = analyzeFlow(f.p, { maxMs: 5, now: () => now++ });
    expect(result.truncated).toBe(true);
    expect(result.findings).toContainEqual(expect.objectContaining({ category: 'exploration_limit' }));
    expect(result.boundaries.complete).toBe(false);
    expect(result.boundaries.unfinished.length).toBeGreaterThan(0);
    expect(result.boundaries.checkedNodeIds).toEqual(expect.any(Array));
  });
});
