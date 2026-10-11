import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText } from '../src/domain/model';
import { startTrial, stepTrial, setTrialStubValues } from '../src/domain/runtime';
import { runtimeChangeOrigins } from '../src/domain/runtimeChangeOrigins';
import { startTrialVerified } from '../src/domain/runtimeVerified';
import { jsonBytes, sha256 } from '../src/storage/json';

function fixture() {
  const project = createProject();
  const variable = createEntity(project.projectId, 'variable', '変更される好感度', { key: 'affinity', valueType: 'integer', initial: { type: 'integer', value: 0 } });
  const effect = createEntity(project.projectId, 'effect', '好感度を2増やす', { operation: 'add', targetId: variable.id, value: { type: 'integer', value: 2 } });
  const entry = createEntity(project.projectId, 'flow_node', '入口', { nodeType: 'entry' });
  const end = createEntity(project.projectId, 'flow_node', '合流', { nodeType: 'terminal', terminalReason: '終端' });
  const edge = createEntity(project.projectId, 'flow_edge', '実際に好感度を変えた線', { fromId: entry.id, toId: end.id, effectIds: [effect.id] });
  const unrelated = createEntity(project.projectId, 'flow_edge', '実行していない線', { fromId: entry.id, toId: end.id });
  project.entities.push(variable, effect, entry, end, edge, unrelated);
  const session = stepTrial(project, startTrial(project, { entryId: entry.id }), { edgeId: edge.id });
  return { project, variable, edge, unrelated, session, path: `variableValues.${variable.id}` };
}

describe('runtime change origins', () => {
  it('uses only the actual selected edge recorded on the change and keeps the observed edition', () => {
    const { project, edge, session, path } = fixture();
    expect(session.status).toBe('terminal');
    expect(runtimeChangeOrigins(session, path)).toEqual([{ edgeId: edge.id, edgeName: edge.name, anchor: { entityId: edge.id, sourceVersionId: project.projectId } }]);
    const fixedVersion = newId(), pinned = { ...session, state: { ...session.state, contentVersionId: fixedVersion } };
    expect(runtimeChangeOrigins(pinned, path)[0].anchor.sourceVersionId).toBe(fixedVersion);
  });

  it('does not infer an origin from an unrelated path or edge present in the edition', () => {
    const { session, path, unrelated } = fixture();
    expect(runtimeChangeOrigins(session, `variableValues.${unrelated.id}`)).toEqual([]);
    const corrupted = structuredClone(session);
    corrupted.trace.at(-1)!.changes.find(change => change.path === path)!.edgeIds = [unrelated.id];
    expect(runtimeChangeOrigins(corrupted, path)).toEqual([]);
  });

  it('does not fall back to an old effect when a later stub changes the same value', () => {
    const { project, session, variable, path } = fixture();
    const stub = setTrialStubValues(project, session, { variables: { [variable.id]: { type: 'integer', value: 3 } } });
    expect(stub.state.variableValues[variable.id]).toEqual({ type: 'integer', value: 3 });
    expect(runtimeChangeOrigins(stub, path)).toEqual([]);
  });

  it('withholds an origin when the final value no longer matches the recorded transition', () => {
    const { session, variable, path } = fixture();
    const drift = { ...session, state: { ...session.state, variableValues: { ...session.state.variableValues, [variable.id]: { type: 'integer' as const, value: 99 } } } };
    expect(runtimeChangeOrigins(drift, path)).toEqual([]);
  });

  it('opens a borrowed real-world edge in each observed immutable world edition and withholds missing pins', async () => {
    const { project: world, edge, path } = fixture();
    const scene = createEntity(world.projectId, 'scene', '借用する旧版本文', {body: textToRichText('第一版の本文。')});
    const entry = world.entities.find(entity => entity.id === edge.data.fromId);
    if (!entry || entry.kind !== 'flow_node') throw new Error('Expected the actual world entry');
    entry.data.sceneId = scene.id; world.entities.push(scene);
    const { history: _history, snapshots: _snapshots, authorAlternatives: _alternatives, ...content } = world;
    const firstId = newId(), secondId = newId(), hash = await sha256(jsonBytes(content));
    const effectId = edge.data.effectIds?.[0];
    if (!effectId) throw new Error('Expected the actual selected edge effect');
    const revisedContent = structuredClone(content), changedScene = revisedContent.entities.find(entity => entity.id === scene.id), effect = revisedContent.entities.find(entity => entity.id === effectId);
    if (!changedScene || changedScene.kind !== 'scene' || !effect || effect.kind !== 'effect') throw new Error('Expected the same owned scene and effect in the second world edition');
    changedScene.data.body[0].text = '第二版の本文。'; effect.data.value = {type: 'integer', value: 5}; revisedContent.revision = '1';
    const secondHash = await sha256(jsonBytes(revisedContent)), registry = { [firstId]: content, [secondId]: revisedContent };
    const work = createProject('世界から実行線を借りる作品');
    work.worldReferences = [{ projectId: world.projectId, immutableSnapshotId: firstId, contentHash: hash }];
    const first = stepTrial(work, await startTrialVerified(work, { entryId: edge.data.fromId }, registry), { edgeId: edge.id });
    expect(first.status, JSON.stringify(first.issues)).toBe('terminal');
    expect(first.content.entities.some(entity => entity.id === edge.id)).toBe(false);
    expect(first.referenceEntities?.some(entity => entity.id === edge.id)).toBe(true);
    const revised = structuredClone(work);
    revised.worldReferences[0] = {...revised.worldReferences[0], immutableSnapshotId: secondId, contentHash: secondHash};
    const second = stepTrial(revised, await startTrialVerified(revised, { entryId: edge.data.fromId }, registry), { edgeId: edge.id });
    expect(second.status, JSON.stringify(second.issues)).toBe('terminal');
    expect(first.lastDiff.find(change => change.path === path)?.after).toEqual({type: 'integer', value: 2});
    expect(second.lastDiff.find(change => change.path === path)?.after).toEqual({type: 'integer', value: 5});
    expect(first.state.seenIds).toContain(scene.id); expect(second.state.seenIds).toContain(scene.id);
    expect(runtimeChangeOrigins(first, path, registry)[0].anchor).toEqual({ entityId: edge.id, sourceVersionId: firstId });
    expect(runtimeChangeOrigins(second, path, registry)[0].anchor).toEqual({ entityId: edge.id, sourceVersionId: secondId });
    expect(runtimeChangeOrigins(first, path, {})).toEqual([]);
    expect(runtimeChangeOrigins(first, path, { [secondId]: content })).toEqual([]);
  });
});
