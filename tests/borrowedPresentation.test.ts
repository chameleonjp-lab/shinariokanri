import {describe, expect, it} from 'vitest';
import {createEntity, createProject, newId, textToRichText} from '../src/domain/model';
import type {Entity, ProjectContent} from '../src/domain/types';
import {startTrialVerified} from '../src/domain/runtimeVerified';
import {backTrial, checkTrialForeshadows, replayTrial, restartTrial, startTrial, stepTrial} from '../src/domain/runtime';
import {capturePinnedPresentationReferences, capturePresentationReferences, presentationAnchorApplies, presentationLineIds, presentationRuleContext, presentContent, presentNextChapterScene, startChapterReading} from '../src/domain/presentation';
import {projectContent} from '../src/domain/writingWorkspace';
import {jsonBytes, sha256} from '../src/storage/json';

async function fixture() {
  const world = createProject('実際に借用する共通世界'), firstId = newId(), secondId = newId();
  const value = createEntity(world.projectId, 'variable', '世界の蓄積値', {key: 'world_value', valueType: 'integer', initial: {type: 'integer', value: 0}});
  const chapterValue = createEntity(world.projectId, 'variable', '章末に戻す値', {key: 'chapter_value', valueType: 'integer', scope: 'chapter', initial: {type: 'integer', value: 7}, resetRules: [{on: 'chapter_end', value: {type: 'integer', value: 0}, reason: '借用章を終了した'}]});
  const arrival = createEntity(world.projectId, 'effect', '提示で1増やす', {operation: 'add', targetId: value.id, value: {type: 'integer', value: 1}});
  const edgeEffect = createEntity(world.projectId, 'effect', '選んだ線で2増やす', {operation: 'add', targetId: value.id, value: {type: 'integer', value: 2}});
  const scene = createEntity(world.projectId, 'scene', '第一版の提示本文', {body: textToRichText('第一版の手掛かり。')});
  const lastScene = createEntity(world.projectId, 'scene', '終端の本文', {body: textToRichText('世界の経路を終了する。')});
  const firstChapter = createEntity(world.projectId, 'chapter', '借用した第一章', {sceneIds: [scene.id]}), lastChapter = createEntity(world.projectId, 'chapter', '借用した終章', {sceneIds: [lastScene.id]});
  scene.data.chapterId = firstChapter.id; lastScene.data.chapterId = lastChapter.id;
  const line = createEntity(world.projectId, 'dialogue_line', '借用した台詞', {text: textToRichText('第一版の台詞。')}); scene.data.dialogueLineIds = [line.id];
  const entry = createEntity(world.projectId, 'flow_node', '世界の入口', {nodeType: 'entry', sceneId: scene.id}), end = createEntity(world.projectId, 'flow_node', '世界の終端', {nodeType: 'terminal', sceneId: lastScene.id, terminalReason: '借用した経路を完了'});
  const edge = createEntity(world.projectId, 'flow_edge', '世界の選択肢', {fromId: entry.id, toId: end.id, choiceLineId: line.id, effectIds: [edgeEffect.id]});
  const graph = createEntity(world.projectId, 'flow_graph', '借用するgraph', {nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id]});
  const question = createEntity(world.projectId, 'foreshadow', '世界の問い');
  const disclosure = createEntity(world.projectId, 'disclosure', '借用場面の開示', {foreshadowId: question.id, role: 'clue', stage: 'hint',
    anchor: {entityId: scene.id, blockId: scene.data.body[0].id, start: 0, end: 3, sourceVersionId: firstId},
    knowledgeEffects: [arrival.id]});
  world.entities.push(value, chapterValue, arrival, edgeEffect, scene, lastScene, firstChapter, lastChapter, line, entry, end, edge, graph, question, disclosure);
  world.entities.forEach(entity => {entity.status = 'confirmed';});
  const first = projectContent(world), second = structuredClone(first);
  const changed = <K extends Entity['kind']>(id: string, kind: K): Entity<K> => {
    const entity = second.entities.find((entity): entity is Entity<K> => entity.id === id && entity.kind === kind);
    if (!entity) throw new Error(`Missing second-edition ${kind}`); return entity;
  };
  second.revision = '1'; changed(scene.id, 'scene').data.body[0].text = '第二版の手掛かり。';
  changed(line.id, 'dialogue_line').data.text[0].text = '第二版の台詞。';
  changed(arrival.id, 'effect').data.value = {type: 'integer', value: 3}; changed(edgeEffect.id, 'effect').data.value = {type: 'integer', value: 5};
  changed(disclosure.id, 'disclosure').data.anchor.sourceVersionId = secondId;
  const registry = {[firstId]: first, [secondId]: second}, firstHash = await sha256(jsonBytes(first)), secondHash = await sha256(jsonBytes(second));
  const work = createProject('固定世界の分岐を借りる別作品');
  work.worldReferences = [{projectId: world.projectId, immutableSnapshotId: firstId, contentHash: firstHash}];
  const revised = {...work, worldReferences: [{projectId: world.projectId, immutableSnapshotId: secondId, contentHash: secondHash}]};
  return {world, work, revised, registry, firstId, secondId, first, second, value, chapterValue, arrival, edgeEffect, scene, lastScene, line, entry, end, edge, graph, firstChapter, question, disclosure};
}

describe('presentation from actual captured fixed worlds', () => {
  it('keeps same owned node/scene IDs in two distinct pins with their own bodies, effects and chapter resets', async () => {
    const f = await fixture(), original = structuredClone(f.work);
    const first = await startTrialVerified(f.work, {entryId: f.entry.id}, f.registry);
    expect(first.status, JSON.stringify(first.issues)).toBe('ready'); expect(first.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 1});
    expect(first.state.seenIds).toEqual(expect.arrayContaining([f.entry.id, f.scene.id, f.scene.data.body[0].id, f.line.id, f.line.data.text[0].id, f.disclosure.id]));
    const firstEnded = stepTrial(f.work, first, {edgeId: f.edge.id});
    expect(firstEnded.status, JSON.stringify(firstEnded.issues)).toBe('terminal'); expect(firstEnded.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 3});
    expect(firstEnded.state.variableValues[f.chapterValue.id]).toEqual({type: 'integer', value: 0});
    expect(firstEnded.state.resetCauses).toContainEqual(expect.objectContaining({variableId: f.chapterValue.id, on: 'chapter_end', before: {type: 'integer', value: 7}, after: {type: 'integer', value: 0}}));
    const second = await startTrialVerified(f.revised, {entryId: f.entry.id}, f.registry), secondEnded = stepTrial(f.revised, second, {edgeId: f.edge.id});
    expect(second.status, JSON.stringify(second.issues)).toBe('ready'); expect(second.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 3});
    expect(secondEnded.status, JSON.stringify(secondEnded.issues)).toBe('terminal'); expect(secondEnded.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 8});
    expect(first.referenceEntities?.find(entity => entity.id === f.scene.id)?.data).toMatchObject({body: [{text: '第一版の手掛かり。'}]});
    expect(second.referenceEntities?.find(entity => entity.id === f.scene.id)?.data).toMatchObject({body: [{text: '第二版の手掛かり。'}]});
    expect(first.content.entities).toEqual([]); expect(f.work).toEqual(original);
    expect(backTrial(firstEnded).state).toEqual(first.state);
  });

  it('resolves target graph/chapter, dialogue and qualified anchors from the exact same captured references', async () => {
    const f = await fixture(), first = await startTrialVerified(f.work, {entryId: f.entry.id}, f.registry);
    const target = {nodeId: f.entry.id, referenceEntities: first.referenceEntities};
    expect(presentationRuleContext(first.content, target)).toMatchObject({projectId: f.work.projectId, graphId: f.graph.id, chapterId: f.firstChapter.id});
    expect(presentationLineIds(first.content, target)).toEqual([f.line.id]);
    expect(presentationAnchorApplies(first.content, first.state, f.disclosure.data.anchor, target)).toBe(true);
    expect(presentationAnchorApplies(first.content, first.state, {...f.disclosure.data.anchor, sourceVersionId: f.secondId}, target)).toBe(false);
    expect(presentationAnchorApplies(first.content, first.state, {...f.disclosure.data.anchor, sourceVersionId: f.work.projectId}, target)).toBe(false);
  });

  it('assesses the actual borrowed clue and payoff instead of omitting their foreshadow', async () => {
    const f = await fixture(), goodPin = newId(), missingPin = newId(), good = structuredClone(f.first);
    const question = good.entities.find((entity): entity is Entity<'foreshadow'> => entity.id === f.question.id && entity.kind === 'foreshadow');
    const clue = good.entities.find((entity): entity is Entity<'disclosure'> => entity.id === f.disclosure.id && entity.kind === 'disclosure');
    if (!question || !clue) throw new Error('Expected the actual world-owned question and clue');
    const payoff = createEntity(f.world.projectId, 'disclosure', '借用した終端の回収', {foreshadowId: question.id, role: 'payoff', stage: 'reveal',
      anchor: {entityId: f.lastScene.id, blockId: f.lastScene.data.body[0].id, start: 0, end: 3, sourceVersionId: goodPin}});
    payoff.status = 'confirmed'; clue.data.anchor.sourceVersionId = goodPin;
    question.data.resolutionPolicy = 'this_work'; question.data.clueIds = [clue.id]; question.data.payoffIds = [payoff.id]; question.data.requiredInfo = [clue.id];
    good.entities.push(payoff);
    const missing = structuredClone(good); missing.revision = '2';
    for (const entity of missing.entities) if (entity.kind === 'disclosure') {
      entity.data.anchor.sourceVersionId = missingPin;
      if (entity.id === clue.id) entity.data.condition = {op: 'constant', value: false};
    }
    const registry = {[goodPin]: good, [missingPin]: missing}, work = {...f.work, worldReferences: [{projectId: f.world.projectId, immutableSnapshotId: goodPin, contentHash: await sha256(jsonBytes(good))}]};
    const missingWork = {...work, worldReferences: [{projectId: f.world.projectId, immutableSnapshotId: missingPin, contentHash: await sha256(jsonBytes(missing))}]};
    const presented = stepTrial(work, await startTrialVerified(work, {entryId: f.entry.id}, registry), {edgeId: f.edge.id});
    const omitted = stepTrial(missingWork, await startTrialVerified(missingWork, {entryId: f.entry.id}, registry), {edgeId: f.edge.id});
    expect(presented.status, JSON.stringify(presented.issues)).toBe('terminal'); expect(omitted.status, JSON.stringify(omitted.issues)).toBe('terminal');
    expect(presented.state.seenIds).toEqual(expect.arrayContaining([clue.id, payoff.id]));
    expect(omitted.state.seenIds).toContain(payoff.id); expect(omitted.state.seenIds).not.toContain(clue.id);
    expect(checkTrialForeshadows(work, presented)).toEqual([]);
    // The borrowed entry is a partial start in this executing work. Preserve
    // that existing evidence limit while reporting the actual missing clue.
    expect(checkTrialForeshadows(missingWork, omitted)).toEqual([expect.objectContaining({status: 'unknown', code: 'REQUIRED_INFO_MISSING', targetId: question.id, payoffId: payoff.id, missingInfoIds: [clue.id], path: [f.entry.id, f.end.id]})]);
    omitted.referenceEntities = [];
    expect(checkTrialForeshadows(missingWork, omitted)).toEqual([expect.objectContaining({targetId: question.id, payoffId: payoff.id, missingInfoIds: [clue.id]})]);
    expect(presented.content.entities).toEqual([]); expect(omitted.content.entities).toEqual([]);
  });

  it('captures author input before awaiting and keeps the verified references tied to their unchanged pin', async () => {
    const f = await fixture(), starting = startTrialVerified(f.work, {entryId: f.entry.id}, f.registry);
    const sourceScene = f.registry[f.firstId].entities.find((entity): entity is Entity<'scene'> => entity.id === f.scene.id && entity.kind === 'scene');
    const sourceEffect = f.registry[f.firstId].entities.find((entity): entity is Entity<'effect'> => entity.id === f.edgeEffect.id && entity.kind === 'effect');
    if (!sourceScene || !sourceEffect) throw new Error('Expected the mutable author world');
    sourceScene.data.body[0].text = '捕捉後に作者が変更した本文。'; sourceEffect.data.value = {type: 'integer', value: 99};
    f.work.worldReferences = [...f.revised.worldReferences];
    expect(Object.isFrozen(sourceScene)).toBe(false); expect(Object.isFrozen(f.registry[f.firstId].entities)).toBe(false);
    const trial = await starting, returnedScene = trial.referenceEntities?.find((entity): entity is Entity<'scene'> => entity.id === f.scene.id && entity.kind === 'scene');
    const returnedEffect = trial.referenceEntities?.find((entity): entity is Entity<'effect'> => entity.id === f.edgeEffect.id && entity.kind === 'effect');
    if (!trial.referenceEntities || !returnedScene || !returnedEffect) throw new Error('Expected captured references');
    expect(trial.status, JSON.stringify(trial.issues)).toBe('ready'); expect(returnedScene.data.body[0].text).toBe('第一版の手掛かり。');
    expect(() => {returnedScene.data.body[0].text = '返却値からの差替え。';}).toThrow(TypeError);
    expect(() => {returnedEffect.data.value = {type: 'integer', value: 99};}).toThrow(TypeError);
    expect(() => {trial.referenceEntities!.push(sourceScene);}).toThrow(TypeError);
    const ended = stepTrial(f.work, trial, {edgeId: f.edge.id});
    expect(ended.status, JSON.stringify(ended.issues)).toBe('terminal'); expect(ended.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 3});
    expect(presentationAnchorApplies(trial.content, trial.state, f.disclosure.data.anchor, {nodeId: f.entry.id, referenceEntities: trial.referenceEntities})).toBe(true);
  });

  it('does not copy a verified pin association onto caller-modified factory references', async () => {
    const f = await fixture(), references = await capturePinnedPresentationReferences(f.work, f.registry);
    const scene = references.find((entity): entity is Entity<'scene'> => entity.id === f.scene.id && entity.kind === 'scene');
    if (!scene) throw new Error('Expected the captured scene');
    expect(() => {scene.data.body[0].text = '検証後の差替え。';}).toThrow(TypeError);
    const recaptured = capturePresentationReferences(references), trial = startTrial(f.work, {entryId: f.entry.id, referenceEntities: recaptured});
    expect(recaptured).not.toBe(references); expect(Object.isFrozen(recaptured)).toBe(true);
    expect(trial.status, JSON.stringify(trial.issues)).toBe('ready'); expect(trial.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 1});
    expect(presentationAnchorApplies(trial.content, trial.state, f.disclosure.data.anchor, {nodeId: f.entry.id, referenceEntities: recaptured})).toBe(true);
  });

  it('does not let mutable legacy input or returned copies replace the execution capture', async () => {
    const f = await fixture(), references = structuredClone(f.first.entities);
    for (const entity of references) if (entity.kind === 'disclosure') delete entity.data.anchor.sourceVersionId;
    const trial = startTrial(f.work, {entryId: f.entry.id, referenceEntities: references});
    const inputEffect = references.find((entity): entity is Entity<'effect'> => entity.id === f.edgeEffect.id && entity.kind === 'effect');
    const returnedEffect = trial.referenceEntities?.find((entity): entity is Entity<'effect'> => entity.id === f.edgeEffect.id && entity.kind === 'effect');
    if (!inputEffect || !returnedEffect) throw new Error('Expected separate mutable legacy records');
    inputEffect.data.value = {type: 'integer', value: 99}; returnedEffect.data.value = {type: 'integer', value: 98};
    const ended = stepTrial(f.work, trial, {edgeId: f.edge.id});
    expect(ended.status, JSON.stringify(ended.issues)).toBe('terminal'); expect(ended.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 3});
    expect(presentationAnchorApplies(trial.content, trial.state, f.disclosure.data.anchor, {nodeId: f.entry.id, referenceEntities: references})).toBe(false);
  });

  it('keeps replay and restart on the private capture when the returned reference field is replaced', async () => {
    const f = await fixture(), first = await startTrialVerified(f.work, {entryId: f.entry.id}, f.registry);
    const second = await startTrialVerified(f.revised, {entryId: f.entry.id}, f.registry);
    const ended = stepTrial(f.work, first, {edgeId: f.edge.id});
    ended.referenceEntities = second.referenceEntities;
    const replayed = replayTrial(f.work, ended);
    expect(replayed.status, JSON.stringify(replayed.issues)).toBe('terminal'); expect(replayed.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 3});
    const restarted = restartTrial(f.work, ended, 'all', f.entry.id), finished = stepTrial(f.work, restarted, {edgeId: f.edge.id});
    expect(restarted.status, JSON.stringify(restarted.issues)).toBe('ready'); expect(restarted.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 1});
    expect(finished.status, JSON.stringify(finished.issues)).toBe('terminal'); expect(finished.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 3});
    expect(replayed.referenceEntities?.find(entity => entity.id === f.scene.id)?.data).toMatchObject({body: [{text: '第一版の手掛かり。'}]});
    expect(restarted.referenceEntities?.find(entity => entity.id === f.scene.id)?.data).toMatchObject({body: [{text: '第一版の手掛かり。'}]});
  });

  it('keeps chapter disclosure effects on the captured world when the returned reference field is replaced', async () => {
    const f = await fixture(), scene = createEntity(f.work.projectId, 'scene', 'この作品の本文', {body: textToRichText('借用した効果を提示する。')});
    const disclosure = createEntity(f.work.projectId, 'disclosure', '固定世界の認識変化を使う開示', {foreshadowId: f.question.id, role: 'clue', stage: 'hint',
      anchor: {entityId: scene.id, blockId: scene.data.body[0].id, start: 0, end: 3}, knowledgeEffects: [f.arrival.id]});
    f.work.entities.push(scene, disclosure);
    const reading = await startChapterReading(f.work, {sceneIds: [scene.id], worldSnapshots: f.registry});
    const second = await startTrialVerified(f.revised, {entryId: f.entry.id}, f.registry);
    reading.referenceEntities = second.referenceEntities ?? [];
    const presented = presentNextChapterScene(f.work, reading);
    expect(presented.status, JSON.stringify(presented.issues)).toBe('terminal'); expect(presented.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 1});
    expect(presented.state.seenIds).toContain(disclosure.id);
  });

  it('stops an in-scope qualified disclosure when legacy reference arrays have no observed-pin association', async () => {
    const f = await fixture(), legacy = startTrial(f.work, {entryId: f.entry.id, referenceEntities: structuredClone(f.first.entities)});
    expect(legacy.status).toBe('unknown');
    expect(legacy.issues).toContainEqual(expect.objectContaining({code: 'CONDITION_UNKNOWN', path: `${f.disclosure.id}.anchor.sourceVersionId`}));
    expect(legacy.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 0}); expect(legacy.state.seenIds).toEqual([]);
  });

  it('does not execute an old-pin disclosure against a different observed edition with the same scene ID', async () => {
    const f = await fixture(), second = await startTrialVerified(f.revised, {entryId: f.entry.id}, f.registry);
    const local = createEntity(f.revised.projectId, 'disclosure', '旧版だけを指定した開示', {...f.disclosure.data, anchor: f.disclosure.data.anchor});
    const input = {...second.content, entities: [local]}, state = structuredClone(second.startState), before = structuredClone(state);
    const result = presentContent(input, state, {nodeId: f.entry.id, referenceEntities: second.referenceEntities});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.conditions.some(condition => condition.targetId === local.id)).toBe(false); expect(result.state.seenIds).not.toContain(local.id);
    expect(state).toEqual(before);
  });

  it('tracks a borrowed scene anchor to its own transitive world pin', async () => {
    const f = await fixture(), parent = createProject('推移依存を持つ世界'), parentPin = newId();
    parent.worldReferences = [...f.work.worldReferences];
    const entry = createEntity(parent.projectId, 'flow_node', '親世界の入口', {nodeType: 'entry', sceneId: f.scene.id});
    const bridge = createEntity(parent.projectId, 'flow_edge', '親入口から借用した分岐へ進む線', {fromId: entry.id, toId: f.entry.id});
    parent.entities.push(entry, bridge);
    const parentContent = projectContent(parent), registry: Record<string, ProjectContent> = {...f.registry, [parentPin]: parentContent};
    const work = createProject('推移依存を借りる作品');
    work.worldReferences = [{projectId: parent.projectId, immutableSnapshotId: parentPin, contentHash: await sha256(jsonBytes(parentContent))}];
    const trial = await startTrialVerified(work, {entryId: entry.id}, registry);
    expect(trial.status, JSON.stringify(trial.issues)).toBe('ready');
    expect(presentationAnchorApplies(trial.content, trial.state, f.disclosure.data.anchor, {nodeId: entry.id, referenceEntities: trial.referenceEntities})).toBe(true);
    expect(presentationAnchorApplies(trial.content, trial.state, {...f.disclosure.data.anchor, sourceVersionId: parentPin}, {nodeId: entry.id, referenceEntities: trial.referenceEntities})).toBe(false);
    const borrowed = stepTrial(work, trial, {edgeId: bridge.id});
    expect(borrowed.status, JSON.stringify(borrowed.issues)).toBe('ready'); expect(borrowed.nodeId).toBe(f.entry.id);
    expect(presentationAnchorApplies(borrowed.content, borrowed.state, f.disclosure.data.anchor, {nodeId: f.entry.id, referenceEntities: borrowed.referenceEntities})).toBe(true);
    const ended = stepTrial(work, borrowed, {edgeId: f.edge.id});
    expect(ended.status, JSON.stringify(ended.issues)).toBe('terminal'); expect(ended.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 4});
    expect(trial.content.entities).toEqual([]);
  });

  it.each(['missing', 'corrupt'] as const)('refuses %s world pins before borrowing presentation records', async mode => {
    const f = await fixture(), registry = structuredClone(f.registry);
    if (mode === 'missing') delete registry[f.firstId]; else registry[f.firstId].name = '期待hashと異なる世界';
    await expect(startTrialVerified(f.work, {entryId: f.entry.id}, registry)).rejects.toThrow();
    expect(f.work.entities).toEqual([]);
  });

  it.each([{kind: 'flow_node', status: 'rejected'}, {kind: 'flow_node', status: 'alternate'}, {kind: 'scene', status: 'rejected'}, {kind: 'scene', status: 'alternate'}, {kind: 'flow_node', status: 'deleted'}, {kind: 'scene', status: 'deleted'}] as const)(
    'refuses $status borrowed $kind records without substituting the other pin', async ({kind, status}) => {
      const f = await fixture(), registry = structuredClone(f.registry), id = kind === 'flow_node' ? f.entry.id : f.scene.id;
      const entity = registry[f.firstId].entities.find(entity => entity.id === id);
      if (!entity) throw new Error('Missing actual borrowed record');
      if (status === 'deleted') {entity.deletedAt = '2026-10-11T00:00:00.000Z'; entity.deletionOperationId = newId();} else entity.status = status;
      const work = {...f.work, worldReferences: [{...f.work.worldReferences[0], contentHash: await sha256(jsonBytes(registry[f.firstId]))}]};
      const trial = await startTrialVerified(work, {entryId: f.entry.id}, registry);
      expect(trial.status).toBe('error');
      expect(trial.issues).toContainEqual(expect.objectContaining({code: 'REFERENCE_INVALID'}));
      expect(trial.state.seenIds).toEqual([]); expect(trial.state.variableValues[f.value.id]).toEqual({type: 'integer', value: 0});
      expect(work.entities).toEqual([]);
    });
});
