import { describe, expect, it } from 'vitest';
import { createEntity, createProject, emptyValidity, newId, validateProject } from '../src/domain/model';
import { analyzeFlow, checkTrialForeshadows, startTrial, stepTrial, trialNarrativeOccurrences } from '../src/domain/runtime';
import { chapterNarrativeOccurrences, checkChapterForeshadows, presentNextChapterScene, startChapterReading } from '../src/domain/presentation';
import { assessPresentationClaims } from '../src/domain/narrative';
import { applyEffectsAtomic, initializeRuntimeState } from '../src/domain/conditions';

function story() {
  const project = createProject(), chapter = createEntity(project.projectId, 'chapter', '第一章'), scene = createEntity(project.projectId, 'scene', '手掛かり場面', { chapterId: chapter.id, body: [{ id: newId(), kind: 'paragraph', text: '問いを残す。' }] });
  const entry = createEntity(project.projectId, 'flow_node', '入口', { nodeType: 'entry', sceneId: scene.id }), end = createEntity(project.projectId, 'flow_node', '迂回した終端', { nodeType: 'terminal', terminalReason: '迂回して終わる' }), edge = createEntity(project.projectId, 'flow_edge', '回収を飛ばす', { fromId: entry.id, toId: end.id });
  const question = createEntity(project.projectId, 'foreshadow', '今作の問い', { resolutionPolicy: 'this_work' }), clue = createEntity(project.projectId, 'disclosure', '手掛かり', { foreshadowId: question.id, anchor: { entityId: scene.id }, role: 'clue' });
  chapter.data.sceneIds = [scene.id]; question.data.clueIds = [clue.id]; project.entities.push(chapter, scene, entry, end, edge, question, clue);
  return { project, chapter, scene, entry, end, edge, question, clue };
}
describe('same presentation proof in chapters and paths', () => {
  it('finds an unrecovered this-work question on a bypass terminal with its entry state and witness, while keeping open/sequel/rejected policies separate', async () => {
    const f = story(); expect(validateProject(f.project).ok).toBe(true);
    let trial = startTrial(f.project, { entryId: f.entry.id }); expect(checkTrialForeshadows(f.project, trial)).toEqual([]);
    trial = stepTrial(f.project, trial, { edgeId: f.edge.id });
    const result = checkTrialForeshadows(f.project, trial).find(item => item.targetId === f.question.id)!;
    expect(result.status).toBe('candidate'); expect(result.path).toEqual([f.entry.id, f.end.id]); expect(result.startState.provenance).toBe('full_play');
    const analysis = await analyzeFlow(f.project); expect(analysis.findings.some(item => item.targetId === f.question.id && item.code === 'REQUIRED_INFO_MISSING')).toBe(true);
    for (const policy of ['sequel', 'intentional_open', 'red_herring', 'rejected'] as const) {
      f.question.data.resolutionPolicy = policy;
      const intentional = checkTrialForeshadows(f.project, stepTrial(f.project, startTrial(f.project), { edgeId: f.edge.id })); expect(intentional.find(item => item.targetId === f.question.id)?.status).toBe('intentional');
    }
  });
  it('checks a chapter deadline only after that chapter ends, excludes another graph and retains partial/unknown classification', async () => {
    const f = story(); f.question.data.deadline = { projectId: f.project.projectId, chapterId: f.chapter.id };
    expect(checkTrialForeshadows(f.project, startTrial(f.project))).toEqual([]);
    let chapter = await startChapterReading(f.project, { chapterIds: [f.chapter.id] }); chapter = presentNextChapterScene(f.project, chapter);
    expect(checkChapterForeshadows(chapter).find(item => item.targetId === f.question.id)?.status).toBe('unknown');
    f.question.data.deadline.graphId = newId();
    const reports = checkTrialForeshadows(f.project, stepTrial(f.project, startTrial(f.project), { edgeId: f.edge.id })); expect(reports.every(item => item.status !== 'candidate')).toBe(true);
  });
  it('uses code-point presentation positions for the recovery deadline, and never substitutes a world date', () => {
    const f = story(), block = f.scene.data.body[0]; block.text = '🌸先に期限、その後に真相';
    const payoff = createEntity(f.project.projectId, 'disclosure', '遅い回収', { foreshadowId: f.question.id, role: 'payoff', stage: 'reveal', anchor: { entityId: f.scene.id, blockId: block.id, start: 7, end: 9 } });
    f.question.data.payoffIds = [payoff.id]; f.question.data.presentationDeadline = { entityId: f.scene.id, blockId: block.id, start: 1, end: 3 }; f.project.entities.push(payoff);
    const reports = checkTrialForeshadows(f.project, startTrial(f.project, { worldTick: '-99999999999999999' })); expect(reports.some(item => item.message.includes('指定提示位置'))).toBe(true);
    f.question.data.presentationDeadline.start = 10; f.question.data.presentationDeadline.end = 12;
    expect(checkTrialForeshadows(f.project, startTrial(f.project, { worldTick: '99999999999999999' }))).toEqual([]);
  });
  it('compares truth, testimony, belief and never-acquired claims at each presentation rather than propagating later knowledge backwards', async () => {
    const f = story(), person = createEntity(f.project.projectId, 'character', '人物C'), truth = createEntity(f.project.projectId, 'assertion', '真実T', { subjectId: person.id, predicate: 'secret', value: { type: 'boolean', value: true }, truthKind: 'author_truth' }), belief = createEntity(f.project.projectId, 'assertion', 'Cが取得する認識', { subjectId: person.id, predicate: 'secret', value: { type: 'boolean', value: true }, truthKind: 'belief', holderId: person.id, sourceIds: [truth.id], evidenceLocation: { entityId: f.scene.id } }), line = createEntity(f.project.projectId, 'dialogue_line', 'Cの断言', { speakerId: person.id, claimAssertionIds: [truth.id], text: [{ id: newId(), kind: 'paragraph', text: '知っています。' }] });
    truth.status = belief.status = 'confirmed'; f.scene.data.dialogueLineIds = [line.id]; f.project.entities.push(person, truth, belief, line);
    const trial = startTrial(f.project), assessments = assessPresentationClaims(f.project, trialNarrativeOccurrences(trial)); expect(assessments[0].knowledge).toBe('not_acquired'); expect(assessments[0].status).toBe('candidate');
    const reading = presentNextChapterScene(f.project, await startChapterReading(f.project, { sceneIds: [f.scene.id] })); expect(assessPresentationClaims(reading.content, chapterNarrativeOccurrences(reading))[0].knowledge).toBe('not_acquired');
    trial.state.assertions.push({ assertionId: belief.id, holderId: person.id, truth: 'true' }); expect(assessPresentationClaims(f.project, trialNarrativeOccurrences(trial))[0].knowledge).toBe('not_acquired');
    line.data.assertionIntent = 'lie'; line.data.assertionReason = '知らないことを隠すため'; expect(assessPresentationClaims(f.project, trialNarrativeOccurrences(startTrial(f.project)))[0].status).toBe('intentional');
  });
  it('rejects source/position-less knowledge atomically with the monetary update, and accepts only a reached declared acquisition point', () => {
    const f = story(), person = createEntity(f.project.projectId, 'character', 'C'), money = createEntity(f.project.projectId, 'variable', '金額', { key: 'money', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 100 } }), belief = createEntity(f.project.projectId, 'assertion', 'Cの認識', { subjectId: person.id, holderId: person.id, truthKind: 'belief', predicate: 'secret', value: { type: 'boolean', value: true } }), acquire = createEntity(f.project.projectId, 'effect', '取得', { operation: 'assert', targetId: belief.id, value: { type: 'boolean', value: true } }), add = createEntity(f.project.projectId, 'effect', '加算', { operation: 'add', targetId: money.id, value: { type: 'integer', value: 1 } });
    f.project.entities.push(person, money, belief, acquire, add); const state = initializeRuntimeState(f.project, f.project.projectId), before = structuredClone(state);
    const context = { state, entities: f.project.entities, variables: [money], ruleContext: { projectId: f.project.projectId } };
    expect(applyEffectsAtomic(state, [add, acquire], context).ok).toBe(false); expect(state).toEqual(before);
    belief.data.sourceIds = [f.scene.id]; belief.data.evidenceLocation = { entityId: f.scene.id, blockId: f.scene.data.body[0].id };
    expect(applyEffectsAtomic(state, [add, acquire], context).ok).toBe(false);
    state.seenIds.push(f.scene.id, f.scene.data.body[0].id); const legal = applyEffectsAtomic(state, [add, acquire], context); expect(legal.ok).toBe(true); if (legal.ok) { expect(legal.state.variableValues[money.id]).toEqual({ type: 'integer', value: 1 }); expect(legal.state.assertions[0].sourceEffectId).toBe(acquire.id); }
  });
  it('presents all declared manual choice text and observes its disclosures, but does not invent presentations for automatic choices', () => {
    const f = story(), choice = createEntity(f.project.projectId, 'dialogue_line', '選択肢本文', { text: [{ id: newId(), kind: 'paragraph', text: 'ここで選ぶ。' }] }); f.edge.data.choiceLineId = choice.id; f.project.entities.push(choice);
    expect(startTrial(f.project).state.seenIds).toContain(choice.data.text[0].id);
    f.entry.data.executionPolicy = 'first_match'; expect(startTrial(f.project).state.seenIds).not.toContain(choice.id);
  });
});
