import { describe, expect, it } from 'vitest';
import { createEntity, createProject, emptyValidity, validateProject } from '../src/domain/model';
import type { Entity, ProjectData } from '../src/domain/types';
import { applyEffectsAtomic, initializeRuntimeState } from '../src/domain/conditions';
import { backTrial, restartTrial, startTrial, stepTrial } from '../src/domain/runtime';
import { backChapterReading, presentContent, presentNextChapterScene, startChapterReading } from '../src/domain/presentation';
import { buildRelationGraph } from '../src/domain/relationGraph';
import { createWorldAssessment, worldStateCandidates } from '../src/domain/world';

function add<K extends Entity['kind']>(p: ProjectData, kind: K, data: Partial<Entity<K>['data']> = {}) {
  const entity = createEntity(p.projectId, kind, kind, data) as Entity<K>; p.entities.push(entity); return entity;
}
function fixture() {
  const p = createProject('レビュー回帰');
  const s1 = add(p, 'scene'), s2 = add(p, 'scene');
  const a = add(p, 'flow_node', { nodeType: 'entry', sceneId: s1.id, executionPolicy: 'first_match' });
  const b = add(p, 'flow_node', { nodeType: 'terminal', sceneId: s2.id, terminalReason: '完了' });
  const edge = add(p, 'flow_edge', { fromId: a.id, toId: b.id, edgeType: 'automatic', priority: 0 });
  return { p, a, b, s1, s2, edge };
}

describe('RV01/RV02/RV03/RV10 expected behavior (Node, not device evidence)', () => {
  it('runs scene/chapter/run reset declarations and recomputes derived values, with full rewind', () => {
    const { p, a, s1, s2 } = fixture();
    const c1 = add(p, 'chapter', { sceneIds: [s1.id] }), c2 = add(p, 'chapter', { sceneIds: [s2.id] });
    s1.data.chapterId = c1.id; s2.data.chapterId = c2.id;
    const v = add(p, 'variable', { key: 'scene', scope: 'scene', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 10 }, resetRules: [{ on: 'scene_end', value: { type: 'integer', value: 0 } }, { on: 'chapter_end', value: { type: 'integer', value: 1 } }, { on: 'run_end', value: { type: 'integer', value: 2 } }] });
    const derived = add(p, 'variable', { key: 'derived', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 20 }, derived: { op: 'multiply', left: { op: 'variable', variableId: v.id }, right: { op: 'value', value: { type: 'integer', value: 2 } } } });
    expect(validateProject(p).ok).toBe(true);
    const state = initializeRuntimeState(p); state.variableValues[v.id] = { type: 'integer', value: 5 };
    const before = startTrial(p, { entryId: a.id, state }), after = stepTrial(p, before);
    expect(after.status).toBe('terminal'); expect(after.state.variableValues[v.id]).toEqual({ type: 'integer', value: 2 });
    expect(after.state.variableValues[derived.id]).toEqual({ type: 'integer', value: 4 });
    expect(after.state.resetCauses?.filter(cause => cause.variableId === v.id).map(cause => cause.on)).toEqual(['scene_end', 'chapter_end', 'scene_end', 'chapter_end', 'run_end']);
    expect(backTrial(after).state).toEqual(before.state);
  });
  it('applies declared new_loop to carried values and full_reset separately', () => {
    const { p } = fixture();
    const v = add(p, 'variable', { key: 'carry', scope: 'across_runs', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 10 }, resetRules: [{ on: 'new_loop', value: { type: 'integer', value: 2 } }] });
    const state = initializeRuntimeState(p); state.variableValues[v.id] = { type: 'integer', value: 7 };
    const trial = startTrial(p, { state });
    expect(restartTrial(p, trial, 'next_run').state.variableValues[v.id]).toEqual({ type: 'integer', value: 2 });
    expect(restartTrial(p, trial, 'all').state.variableValues[v.id]).toEqual({ type: 'integer', value: 0 });
  });
  it('rejects a forbidden transition with only a note and rolls money and inventory back', () => {
    const { p } = fixture();
    const quest = add(p, 'variable', { key: 'quest', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 3 }, transitionRules: [{ from: { type: 'integer', value: 0 }, to: { type: 'integer', value: 1 } }] });
    const money = add(p, 'variable', { key: 'money', valueType: 'integer', initial: { type: 'integer', value: 10 }, allowed: { min: 0, max: 20 } });
    const item = add(p, 'item', { itemMode: 'type' });
    const state = initializeRuntimeState(p);
    const result = applyEffectsAtomic(state, [{ operation: 'add', targetId: money.id, value: { type: 'integer', value: 2 } }, { operation: 'grant', targetId: item.id }, { operation: 'set', targetId: quest.id, value: { type: 'integer', value: 3 }, reason: '備考だけ' }], { state, entities: p.entities });
    expect(result.ok).toBe(false); expect(result.state).toBe(state);
    expect(applyEffectsAtomic(state, [{ operation: 'reset', targetId: quest.id, value: { type: 'integer', value: 3 } }], { state, entities: p.entities }).ok).toBe(true);
  });
  it('excludes rejected/alternate truth and marks provisional truth as uncertain in both assessment APIs', () => {
    const { p } = fixture(); const person = add(p, 'character'), place = add(p, 'place');
    const assertion = add(p, 'assertion', { subjectId: person.id, predicate: 'location', truthKind: 'author_truth', value: { type: 'ref', value: place.id }, validity: emptyValidity() });
    for (const status of ['rejected', 'alternate'] as const) {
      assertion.status = status;
      expect(worldStateCandidates(p, person.id, 'location').status).toBe('unknown');
      expect(createWorldAssessment(p).stateCandidates(person.id, 'location').definite).toEqual([]);
    }
    assertion.status = 'provisional';
    expect(worldStateCandidates(p, person.id, 'location').status).toBe('possible');
    expect(createWorldAssessment(p).stateCandidates(person.id, 'location').definite).toEqual([]);
  });
  it('keeps rejected relations outside the effective graph and tentative relations uncertain', () => {
    const { p } = fixture(); const a = add(p, 'character'), b = add(p, 'character');
    const relation = { id: crypto.randomUUID(), projectId: p.projectId, revision: '0', fromId: a.id, toId: b.id, relationType: 'trust', direction: 'forward' as const, validity: emptyValidity(), evidenceIds: [], status: 'rejected' as const, visibility: 'private' as const };
    p.relations.push(relation);
    expect(buildRelationGraph(p).lines.some(line => line.id === relation.id)).toBe(false);
    p.relations[0] = { ...relation, status: 'needs_review' };
    expect(buildRelationGraph(p).lines.find(line => line.id === relation.id)?.assessment.value).toBe('unknown');
  });
  it('uses identical chapter/route/version scope and arrival observations in chapter and flow presentation', () => {
    const { p, a, s1 } = fixture(); const current = add(p, 'chapter', { sceneIds: [s1.id] }), other = add(p, 'chapter'); s1.data.chapterId = current.id;
    const v = add(p, 'variable', { key: 'disclosed', initial: { type: 'boolean', value: false } });
    const shadow = add(p, 'foreshadow', { resolutionPolicy: 'this_work' });
    const effect = add(p, 'effect', { operation: 'set', targetId: v.id, value: { type: 'boolean', value: true } });
    const disclosure = add(p, 'disclosure', { foreshadowId: shadow.id, anchor: { entityId: s1.id }, role: 'clue', stage: 'hint', knowledgeEffects: [effect.id], targetScope: { projectId: p.projectId, chapterId: other.id } });
    const chapter = presentContent(p, initializeRuntimeState(p), { nodeId: a.id, sceneId: s1.id }), flow = startTrial(p);
    expect(chapter.ok).toBe(true);
    if (chapter.ok) { expect(flow.state).toEqual(chapter.state); expect(flow.startConditionResults).toEqual(chapter.conditions); }
    expect(flow.state.seenIds).not.toContain(disclosure.id); expect(flow.state.variableValues[v.id]).toEqual({ type: 'boolean', value: false });
  });
  it('requires a confirmed reason, route, evidence and half-open expiry for a transition exception', () => {
    const { p, a, s1 } = fixture(), chapter = add(p, 'chapter', { sceneIds: [s1.id] }); s1.data.chapterId = chapter.id;
    const evidence = add(p, 'decision'); evidence.status = 'confirmed';
    const v = add(p, 'variable', { key: 'limited', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 3 }, transitionRules: [{ from: { type: 'integer', value: 0 }, to: { type: 'integer', value: 1 } }] });
    const state = initializeRuntimeState(p), ruleContext = { projectId: p.projectId, chapterId: chapter.id, worldTick: '9' };
    const effect = { operation: 'set' as const, targetId: v.id, value: { type: 'integer' as const, value: 3 }, exceptionDetails: { reason: '採用した仕様による再受注', evidenceIds: [evidence.id], targetScope: { projectId: p.projectId, chapterId: chapter.id, routeCondition: { op: 'constant' as const, value: true } }, validity: { ...emptyValidity(), worldRange: { start: '0', end: '10' } } } };
    const context = { state, entities: p.entities, ruleContext };
    expect(applyEffectsAtomic(state, [effect], context).ok).toBe(true);
    for (const worldTick of ['10', '-1', undefined]) { const result = applyEffectsAtomic(state, [effect], { ...context, ruleContext: { ...ruleContext, worldTick } }); expect(result.ok).toBe(false); expect(result.state).toBe(state); }
    expect(applyEffectsAtomic(state, [effect], { ...context, ruleContext: { ...ruleContext, chapterId: a.id } }).ok).toBe(false);
    evidence.status = 'needs_review'; expect(applyEffectsAtomic(state, [effect], context).ok).toBe(false);
    evidence.status = 'confirmed'; effect.exceptionDetails.evidenceIds = []; expect(applyEffectsAtomic(state, [effect], context).ok).toBe(false);
  });
  it('ends a scene even when the terminal has the same scene, and resets an omitted checkpoint value safely', () => {
    const { p, a, b, s1 } = fixture(); b.data.sceneId = s1.id;
    const v = add(p, 'variable', { key: 'same_scene', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 5 }, resetRules: [{ on: 'scene_end', value: { type: 'integer', value: 0 } }] });
    const state = initializeRuntimeState(p); state.variableValues[v.id] = { type: 'integer', value: 5 };
    expect(stepTrial(p, startTrial(p, { entryId: a.id, state })).state.variableValues[v.id]).toEqual({ type: 'integer', value: 0 });
    delete state.variableValues[v.id]; const ended = stepTrial(p, startTrial(p, { entryId: a.id, state }));
    expect(ended.status).toBe('terminal'); expect(ended.state.resetCauses?.[0].before.type).toBe('unknown');
  });
  it('uses the same lifecycle resets and rewind for chapter boundaries', async () => {
    const { p, s1, s2 } = fixture(); const c1 = add(p, 'chapter', { sceneIds: [s1.id] }), c2 = add(p, 'chapter', { sceneIds: [s2.id] }); s1.data.chapterId = c1.id; s2.data.chapterId = c2.id;
    const v = add(p, 'variable', { key: 'chapter_boundary', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 5 }, resetRules: [{ on: 'scene_end', value: { type: 'integer', value: 1 } }, { on: 'chapter_end', value: { type: 'integer', value: 2 } }, { on: 'run_end', value: { type: 'integer', value: 3 } }] });
    const state = initializeRuntimeState(p); state.variableValues[v.id] = { type: 'integer', value: 5 };
    const requested = { sceneIds: [s1.id, s2.id], state, worldTick: '5' }, pending = startChapterReading(p, requested); requested.worldTick = '2.5';
    const started = await pending, first = presentNextChapterScene(p, started), last = presentNextChapterScene(p, first);
    expect(started.worldTick).toBe('5');
    expect(first.state.variableValues[v.id]).toEqual({ type: 'integer', value: 5 }); expect(last.state.variableValues[v.id]).toEqual({ type: 'integer', value: 3 });
    expect(last.state.resetCauses?.map(cause => cause.on)).toEqual(['scene_end', 'chapter_end', 'scene_end', 'chapter_end', 'run_end']);
    expect(backChapterReading(last).state).toEqual(first.state);
  });
  it('observes every disclosure at the same arrival state before its atomic effects', () => {
    const { p, a, s1 } = fixture(); s1.data.body = [{ id: crypto.randomUUID(), kind: 'paragraph', text: '😀手掛かり答え' }];
    const v = add(p, 'variable', { key: 'arrival', initial: { type: 'boolean', value: false } }), shadow = add(p, 'foreshadow');
    const effect = add(p, 'effect', { operation: 'set', targetId: v.id, value: { type: 'boolean', value: true } });
    const first = add(p, 'disclosure', { foreshadowId: shadow.id, anchor: { entityId: s1.id, blockId: s1.data.body[0].id, start: 1, end: 5 }, knowledgeEffects: [effect.id] });
    const second = add(p, 'disclosure', { foreshadowId: shadow.id, anchor: { entityId: s1.id, blockId: s1.data.body[0].id, start: 5, end: 7 }, condition: { op: 'compare', variableId: v.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    const flow = startTrial(p, { entryId: a.id }), chapter = presentContent(p, initializeRuntimeState(p), { nodeId: a.id, sceneId: s1.id });
    expect(flow.startConditionResults.map(result => [result.targetId, result.value])).toEqual([[first.id, 'true'], [second.id, 'false']]);
    expect(chapter.ok).toBe(true); if (chapter.ok) expect(chapter.conditions).toEqual(flow.startConditionResults);
    expect(flow.state.variableValues[v.id]).toEqual({ type: 'boolean', value: true }); expect(flow.state.seenIds).not.toContain(second.id);
  });
});
