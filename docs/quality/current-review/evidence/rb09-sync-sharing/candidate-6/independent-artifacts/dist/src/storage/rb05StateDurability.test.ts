import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { ScenarioStore } from './store';
import { inspectScenario } from './archive';
import { createEntity, createProject, newId } from '../domain/model';
import { initializeRuntimeState, applyEffectsAtomic } from '../domain/conditions';
import type { Entity } from '../domain/types';

describe('RB05 persistent state declarations across reload and full clone', () => {
  it('retains exclusion references and alternative-info dictionary keys without changing source bytes', async () => {
    const db = new ScenarioStore({ databaseName: `rb05-source-${newId()}` }), restoredDb = new ScenarioStore({ databaseName: `rb05-restored-${newId()}` });
    try {
      const p = createProject('状態宣言');
      const a = createEntity(p.projectId, 'variable', '所属A', { key: 'a', initial: { type: 'boolean', value: true } }), b = createEntity(p.projectId, 'variable', '所属B', { key: 'b', initial: { type: 'boolean', value: false } });
      a.data.exclusions = [{ variableId: b.id, value: { type: 'boolean', value: true }, otherValue: { type: 'boolean', value: true }, reason: '相互排他' }];
      const person = createEntity(p.projectId, 'character', '人物'), claim = createEntity(p.projectId, 'assertion', '真実', { subjectId: person.id, predicate: '在籍', value: { type: 'boolean', value: true }, truthKind: 'author_truth' });
      const line = createEntity(p.projectId, 'dialogue_line', '発言', { claimAssertionIds: [claim.id], assertionIntent: 'lie', assertionReason: '出所の異なる情報であるため' });
      const scene = createEntity(p.projectId, 'scene', '提示'), q = createEntity(p.projectId, 'foreshadow', '伏線');
      const clue = createEntity(p.projectId, 'disclosure', '必須情報', { foreshadowId: q.id, anchor: { entityId: scene.id } }), alt = createEntity(p.projectId, 'disclosure', '代替情報', { foreshadowId: q.id, anchor: { entityId: scene.id } });
      q.data.requiredInfo = [clue.id]; q.data.alternativeInfo = { [clue.id]: [alt.id] };
      p.entities.push(a, b, person, claim, line, scene, q, clue, alt);
      const saved = (await db.saveProject(p, { reason: '排他・提示・発言の宣言' })).project;
      expect((await db.getProject(p.projectId))?.entities).toEqual(saved.entities);
      const archive = await inspectScenario(await db.exportProject(p.projectId), { worker: false });
      const clone = (await restoredDb.importScenario(archive, { mode: 'clone' })).project;
      const variables = clone.entities.filter((entity): entity is Entity<'variable'> => entity.kind === 'variable'), copiedA = variables.find(v => v.data.key === 'a')!, copiedB = variables.find(v => v.data.key === 'b')!;
      expect(copiedA.id).not.toBe(a.id); expect(copiedA.data.exclusions?.[0].variableId).toBe(copiedB.id);
      const copiedQ = clone.entities.find((entity): entity is Entity<'foreshadow'> => entity.kind === 'foreshadow')!, copiedClue = clone.entities.find(entity => entity.name === clue.name)!, copiedAlt = clone.entities.find(entity => entity.name === alt.name)!;
      expect(copiedQ.data.alternativeInfo).toEqual({ [copiedClue.id]: [copiedAlt.id] });
      const copiedLine = clone.entities.find((entity): entity is Entity<'dialogue_line'> => entity.kind === 'dialogue_line')!, copiedClaim = clone.entities.find(entity => entity.kind === 'assertion')!;
      expect(copiedLine.data.claimAssertionIds).toEqual([copiedClaim.id]); expect(copiedLine.data.assertionIntent).toBe('lie');
      const state = initializeRuntimeState(clone); expect(applyEffectsAtomic(state, [{ operation: 'set', targetId: copiedB.id, value: { type: 'boolean', value: true } }], { state, entities: clone.entities }).ok).toBe(false);
      expect(await db.getProject(p.projectId)).toEqual(saved);
    } finally { await db.deleteDatabase(); await restoredDb.deleteDatabase(); }
  });
});
