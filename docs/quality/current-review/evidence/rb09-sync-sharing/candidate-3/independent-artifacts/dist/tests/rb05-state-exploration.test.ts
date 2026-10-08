import { describe, it, expect } from 'vitest';
import { createProject, createEntity, newId, validateProject, rewriteEntityReferences, emptyValidity } from '../src/domain/model';
import { applyEffectsAtomic, initializeRuntimeState } from '../src/domain/conditions';
import { analyzeFlow, backTrial, startTrial, stepTrial, trialRecordData } from '../src/domain/runtime';
import { declaredRegressionPaths, regressionPathCoverage } from '../src/domain/regressionPaths';
import type { Entity, ProjectData } from '../src/domain/types';

function add<K extends Entity['kind']>(p: ProjectData, kind: K, data: Partial<Entity<K>['data']> = {}) { const entity = createEntity(p.projectId, kind, kind, data); p.entities.push(entity); return entity as Entity<K>; }
function branching() {
  const p = createProject();
  const clueScene = add(p, 'scene'), payoffScene = add(p, 'scene');
  const a = add(p, 'flow_node', { nodeType: 'entry', sceneId: clueScene.id }), b = add(p, 'flow_node', { nodeType: 'entry' });
  const end = add(p, 'flow_node', { nodeType: 'terminal', sceneId: payoffScene.id, terminalReason: '完了' });
  const left = add(p, 'flow_edge', { fromId: a.id, toId: end.id, edgeType: 'choice' }), right = add(p, 'flow_edge', { fromId: b.id, toId: end.id, edgeType: 'choice' });
  const graph = add(p, 'flow_graph', { entryIds: [a.id, b.id], exitIds: [end.id], nodeIds: [a.id, b.id, end.id], edgeIds: [left.id, right.id] });
  const q = add(p, 'foreshadow', { resolutionPolicy: 'this_work' });
  const clue = add(p, 'disclosure', { foreshadowId: q.id, anchor: { entityId: clueScene.id }, role: 'clue' });
  const payoff = add(p, 'disclosure', { foreshadowId: q.id, anchor: { entityId: payoffScene.id }, role: 'payoff' });
  q.data.requiredInfo = [clue.id]; q.data.clueIds = [clue.id]; q.data.payoffIds = [payoff.id];
  return { p, a, b, end, left, right, graph, q, clue, payoff, payoffScene };
}
describe('RB05 exclusion and declared-entry exploration', () => {
  it('rejects an exclusion atomically including inventory and allows a legal atomic swap', () => {
    const p = createProject();
    const a = add(p, 'variable', { key: 'a', initial: { type: 'boolean', value: true } }), b = add(p, 'variable', { key: 'b', initial: { type: 'boolean', value: false } });
    a.data.exclusions = [{ variableId: b.id, value: { type: 'boolean', value: true }, otherValue: { type: 'boolean', value: true }, reason: '両方の所属を同時に持てない' }];
    const item = add(p, 'item'), state = initializeRuntimeState(p), context = { state, entities: p.entities };
    const illegal = applyEffectsAtomic(state, [{ operation: 'grant', targetId: item.id }, { operation: 'set', targetId: b.id, value: { type: 'boolean', value: true } }], context);
    expect(illegal.ok).toBe(false); expect(illegal.state).toBe(state); if (!illegal.ok) expect(illegal.issues[0].code).toBe('TRANSITION_BLOCKED');
    const swap = applyEffectsAtomic(state, [{ operation: 'set', targetId: b.id, value: { type: 'boolean', value: true } }, { operation: 'set', targetId: a.id, value: { type: 'boolean', value: false } }], context);
    expect(swap.ok).toBe(true); expect(state.variableValues[b.id]).toEqual({ type: 'boolean', value: false });
    state.variableValues[b.id] = { type: 'unknown', value: null, reason: '未設定' }; expect(applyEffectsAtomic(state, [], context).ok).toBe(false);
    state.variableValues[a.id] = { type: 'boolean', value: false }; expect(applyEffectsAtomic(state, [], context).ok).toBe(true);
    b.data.valueType = 'integer'; b.data.allowed = { min: 0, max: 2 }; b.data.initial = { type: 'integer', value: 0 }; expect(validateProject(p).ok).toBe(false);
    const map = { [a.id]: newId(), [b.id]: newId() }; expect((rewriteEntityReferences(a, map) as Entity<'variable'>).data.exclusions?.[0].variableId).toBe(map[b.id]);
  });
  it('does not treat a free-text or expired exclusion exception as permission', () => {
    const p = createProject(), source = add(p, 'source', { locator: '規則の根拠' }); source.status = 'confirmed';
    const a = add(p, 'variable', { key: 'a', initial: { type: 'boolean', value: true } }), b = add(p, 'variable', { key: 'b', initial: { type: 'boolean', value: true } });
    a.data.exclusions = [{ variableId: b.id, value: a.data.initial, otherValue: b.data.initial, reason: '通常は禁止', exceptions: [{ reason: '特別な期間', evidenceIds: [source.id], targetScope: { projectId: p.projectId }, validity: { ...emptyValidity(), worldRange: { start: '0', end: '10' } } }] }];
    const state = initializeRuntimeState(p), context = { state, entities: p.entities, ruleContext: { projectId: p.projectId, contentVersionId: p.projectId, worldTick: '5' } };
    expect(applyEffectsAtomic(state, [], context).ok).toBe(true);
    expect(applyEffectsAtomic(state, [], { ...context, ruleContext: { ...context.ruleContext, worldTick: '10' } }).ok).toBe(false);
    source.status = 'provisional'; expect(applyEffectsAtomic(state, [], context).ok).toBe(false);
  });
  it('explores both declared initial entries and retains the missing-clue witness on the second path', () => {
    const { p, a, b, q, clue } = branching(); expect(validateProject(p).ok).toBe(true);
    const result = analyzeFlow(p); expect(result.entryIds).toEqual([a.id, b.id]); expect(result.truncated).toBe(false);
    const finding = result.findings.find(finding => finding.code === 'REQUIRED_INFO_MISSING');
    expect(finding?.targetId).toBe(q.id); expect(finding?.missingInfoIds).toEqual([clue.id]); expect(finding?.path[0]).toBe(b.id); expect(finding?.startState?.provenance).toBe('full_play');
    expect(analyzeFlow(p, { entryId: a.id }).findings.some(f => f.code === 'REQUIRED_INFO_MISSING')).toBe(false);
    expect(analyzeFlow(p, { maxStates: 1 }).truncated).toBe(true);
    const aborted = new AbortController(); aborted.abort(); expect(analyzeFlow(p, { signal: aborted.signal }).status).toBe('unknown');
  });
  it('uses authored alternative information without requiring optional clues', () => {
    const { p, b, q, clue } = branching(); const alternate = add(p, 'disclosure', { foreshadowId: q.id, anchor: { entityId: b.id }, role: 'clue' });
    q.data.alternativeInfo = { [clue.id]: [alternate.id] }; expect(validateProject(p).ok).toBe(true);
    expect(analyzeFlow(p).findings.some(f => f.code === 'REQUIRED_INFO_MISSING')).toBe(false);
    const map = { [clue.id]: newId(), [alternate.id]: newId() };
    expect((rewriteEntityReferences(q, map) as Entity<'foreshadow'>).data.alternativeInfo).toEqual({ [map[clue.id]]: [map[alternate.id]] });
  });
  it('counts actual declared paths and never calls a prefix, stub or changed version checked', () => {
    const { p, a, left, right } = branching(); const initial = startTrial(p, { entryId: a.id }), ended = stepTrial(p, initial, { edgeId: left.id });
    expect(backTrial(ended).state).toEqual(initial.state);
    const id = newId(), record = trialRecordData(p, ended, id), checkpoint = { ...createEntity(p.projectId, 'checkpoint', '開始', record.checkpoint), id }, trace = add(p, 'trace', record.trace);
    p.entities.push(checkpoint); add(p, 'collection', { mode: 'fixed', purpose: 'regression', memberIds: [trace.id] });
    expect(declaredRegressionPaths(p).ids).toEqual([trace.id]); expect(regressionPathCoverage(p, trace.data, initial.state)).toMatchObject({ checked: 1, total: 1 });
    expect(regressionPathCoverage(p, { ...trace.data, steps: [] }, initial.state).checked).toBe(0);
    expect(regressionPathCoverage(p, { ...trace.data, contentVersionId: newId() }, initial.state)).toMatchObject({ checked: 0, total: 1, unknown: 1 });
    expect(regressionPathCoverage(p, trace.data, { ...initial.state, provenance: 'stub' }).checked).toBe(0);
    expect(trialRecordData(p, ended, newId()).trace.coverage?.declaredTests).toMatchObject({ checked: 1, total: 1 });
    expect(right.id).not.toBe(left.id);
  });
});
