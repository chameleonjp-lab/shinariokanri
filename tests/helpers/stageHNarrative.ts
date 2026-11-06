import { createEntity, createProject, textToRichText } from '../../src/domain/model';

export function stageHNarrativeFixture() {
  const project = createProject('三つの認識');
  const person = createEntity(project.projectId, 'character', '語り手');
  const otherPerson = createEntity(project.projectId, 'character', '聞き手');
  const clueScene = createEntity(project.projectId, 'scene', '手掛かりを見る', { body: textToRichText('手掛かりの原文') });
  const commonScene = createEntity(project.projectId, 'scene', '同じ合流場面', { body: textToRichText('合流する') });
  const truth = createEntity(project.projectId, 'assertion', '作者の確定事実', { subjectId: person.id, predicate: 'secret', truthKind: 'author_truth', value: { type: 'boolean', value: true }, sourceIds: [clueScene.id], evidenceLocation: { entityId: clueScene.id, blockId: clueScene.data.body[0].id }, validity: { worldRange: { start: '10', end: '20' }, routeCondition: null, presentationAnchor: null } });
  const belief = createEntity(project.projectId, 'assertion', '本人の誤った信念', { subjectId: person.id, predicate: 'secret', truthKind: 'belief', holderId: person.id, value: { type: 'boolean', value: false }, sourceIds: [clueScene.id], evidenceLocation: { entityId: clueScene.id, blockId: clueScene.data.body[0].id, start: 0, end: 1 } });
  const acquire = createEntity(project.projectId, 'effect', '本人の信念を取得', { operation: 'assert', targetId: belief.id, value: { type: 'boolean', value: true } });
  const foreshadow = createEntity(project.projectId, 'foreshadow', '手掛かりの問い', { resolutionPolicy: 'intentional_open' });
  const clue = createEntity(project.projectId, 'disclosure', '経路の手掛かり', { foreshadowId: foreshadow.id, role: 'clue', anchor: { entityId: clueScene.id, blockId: clueScene.data.body[0].id, start: 0, end: 1 }, knowledgeEffects: [acquire.id] });
  foreshadow.data.clueIds = [clue.id];
  const line = createEntity(project.projectId, 'dialogue_line', '意図的に嘘をつく台詞', { text: textToRichText('私は真実を知っている'), speakerId: person.id, claimAssertionIds: [truth.id], assertionIntent: 'lie', assertionReason: '相手を遠ざけるため' });
  commonScene.data.dialogueLineIds = [line.id];
  const entry = createEntity(project.projectId, 'flow_node', '道を選ぶ', { nodeType: 'entry', executionPolicy: 'manual_choice' });
  const middle = createEntity(project.projectId, 'flow_node', '手掛かりの道', { nodeType: 'scene', executionPolicy: 'manual_choice', sceneId: clueScene.id });
  const common = createEntity(project.projectId, 'flow_node', '合流', { nodeType: 'terminal', terminalReason: '合流を確認', sceneId: commonScene.id });
  const via = createEntity(project.projectId, 'flow_edge', '手掛かりを経由', { fromId: entry.id, toId: middle.id });
  const direct = createEntity(project.projectId, 'flow_edge', '直接合流', { fromId: entry.id, toId: common.id });
  const join = createEntity(project.projectId, 'flow_edge', '合流へ', { fromId: middle.id, toId: common.id });
  const graph = createEntity(project.projectId, 'flow_graph', '二つの道', { nodeIds: [entry.id, middle.id, common.id], entryIds: [entry.id], edgeIds: [via.id, direct.id, join.id], exitIds: [] });
  project.entities = [person, otherPerson, clueScene, commonScene, truth, belief, acquire, foreshadow, clue, line, entry, middle, common, via, direct, join, graph];
  project.entities.forEach(entity => { entity.status = 'confirmed'; });
  return { project, person, otherPerson, truth, belief, clue, line, entry, common, via, direct, join };
}

