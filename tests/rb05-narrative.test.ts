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
/** The same confirmed proposition is kept apart from an author's unconfirmed proposal. */
function proposalStory() {
  const f = story(), p = f.project;
  const a = createEntity(p.projectId, 'character', 'A'), b = createEntity(p.projectId, 'character', 'B'), c = createEntity(p.projectId, 'character', 'C');
  const truth = createEntity(p.projectId, 'assertion', 'confirmed author truth', { subjectId: a.id, predicate: 'secret', truthKind: 'author_truth', value: { type: 'boolean', value: true } });
  const lie = createEntity(p.projectId, 'assertion', 'A testimony', { subjectId: a.id, predicate: 'secret', truthKind: 'testimony', holderId: a.id, sourceIds: [truth.id], value: { type: 'boolean', value: false } });
  const mistaken = createEntity(p.projectId, 'assertion', 'B belief', { subjectId: a.id, predicate: 'secret', truthKind: 'belief', holderId: b.id, sourceIds: [lie.id], value: { type: 'boolean', value: false } });
  const acquisitionScene = createEntity(p.projectId, 'scene', 'later acquisition', { body: [{ id: newId(), kind: 'paragraph', text: 'C learns the confirmed fact here.' }] });
  const anchor = { entityId: acquisitionScene.id, blockId: acquisitionScene.data.body[0].id, start: 0, end: 1 };
  const knowledge = createEntity(p.projectId, 'assertion', 'C knowledge', { subjectId: a.id, predicate: 'secret', truthKind: 'belief', holderId: c.id, sourceIds: [truth.id], evidenceLocation: anchor, value: { type: 'boolean', value: true } });
  const proposal = createEntity(p.projectId, 'assertion', 'author proposal', { subjectId: a.id, predicate: 'secret', truthKind: 'hypothesis', value: { type: 'unknown', value: null, reason: 'not decided by the author' } });
  const line = createEntity(p.projectId, 'dialogue_line', 'C speaks', { speakerId: c.id, text: [{ id: newId(), kind: 'paragraph', text: 'There is a secret.' }], claimAssertionIds: [knowledge.id] });
  const aLine = createEntity(p.projectId, 'dialogue_line', 'A lies intentionally', { speakerId: a.id, text: [{ id: newId(), kind: 'paragraph', text: 'There is no secret.' }], claimAssertionIds: [lie.id], assertionIntent: 'lie', assertionReason: 'A hides the fact' });
  const bLine = createEntity(p.projectId, 'dialogue_line', 'B misunderstands intentionally', { speakerId: b.id, text: [{ id: newId(), kind: 'paragraph', text: 'I believe there is no secret.' }], claimAssertionIds: [mistaken.id], assertionIntent: 'misunderstanding', assertionReason: 'B believed A testimony' });
  lie.data.evidenceLocation = { entityId: aLine.id, blockId: aLine.data.text[0].id };
  mistaken.data.evidenceLocation = { entityId: bLine.id, blockId: bLine.data.text[0].id };
  f.scene.data.dialogueLineIds = [line.id, aLine.id, bLine.id]; acquisitionScene.data.dialogueLineIds = [line.id];
  const acquire = createEntity(p.projectId, 'effect', 'acquire C knowledge', { operation: 'assert', targetId: knowledge.id, value: { type: 'boolean', value: true } });
  const disclosure = createEntity(p.projectId, 'disclosure', 'actual acquisition', { foreshadowId: f.question.id, anchor, role: 'clue', knowledgeEffects: [acquire.id] });
  const acquisitionNode = createEntity(p.projectId, 'flow_node', 'acquisition scene', { nodeType: 'scene', sceneId: acquisitionScene.id });
  const finish = createEntity(p.projectId, 'flow_edge', 'finish after acquisition', { fromId: acquisitionNode.id, toId: f.end.id });
  f.edge.data.toId = acquisitionNode.id; f.question.data.clueIds!.push(disclosure.id);
  p.entities.push(a, b, c, truth, lie, mistaken, knowledge, proposal, line, aLine, bLine, acquisitionScene, acquire, disclosure, acquisitionNode, finish);
  for (const entity of p.entities) entity.status = 'confirmed'; proposal.status = 'provisional';
  return { ...f, a, b, c, truth, lie, mistaken, knowledge, proposal, line, aLine, bLine, acquisitionScene, acquire, disclosure };
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
  it('retains the same-proposition author proposal without suppressing unacquired C or granting later knowledge backwards', () => {
    const f = proposalStory(), before = structuredClone(f.project);
    expect(validateProject(f.project).ok).toBe(true);
    const initial = startTrial(f.project, { entryId: f.entry.id });
    const opening = assessPresentationClaims(f.project, trialNarrativeOccurrences(initial));
    const c = opening.find(item => item.lineId === f.line.id)!;
    expect(c).toMatchObject({ status: 'candidate', knowledge: 'not_acquired', assertionId: f.knowledge.id });
    expect(c.counterpartIds).toEqual([f.truth.id, f.lie.id, f.mistaken.id, f.knowledge.id, f.proposal.id]);
    expect(c.evidenceIds).toEqual(expect.arrayContaining([f.truth.id, f.lie.id, f.proposal.id, f.aLine.id, f.bLine.id, f.acquisitionScene.id]));
    expect(opening.find(item => item.lineId === f.aLine.id)).toMatchObject({ status: 'intentional', message: '意図した嘘：A hides the fact' });
    expect(opening.find(item => item.lineId === f.bLine.id)).toMatchObject({ status: 'intentional', message: '意図した誤解：B believed A testimony' });
    expect(initial.state.assertions).toEqual([]);
    const later = stepTrial(f.project, initial, { edgeId: f.edge.id });
    const after = assessPresentationClaims(f.project, trialNarrativeOccurrences(later)).filter(item => item.lineId === f.line.id);
    expect(after.map(item => ({ status: item.status, knowledge: item.knowledge }))).toEqual([{ status: 'candidate', knowledge: 'not_acquired' }, { status: 'passed_for_checked_scope', knowledge: 'acquired' }]);
    expect(later.state.assertions).toEqual([{ assertionId: f.knowledge.id, holderId: f.c.id, truth: 'true', sourceEffectId: f.acquire.id }]);
    expect(f.proposal.status).toBe('provisional'); expect(f.proposal.data.truthKind).toBe('hypothesis');
    expect(f.project.entities.filter(entity => entity.kind === 'assertion' && entity.data.truthKind === 'author_truth')).toHaveLength(1);
    expect(f.project).toEqual(before);
  });
  it('keeps a direct provisional-hypothesis claim and an unconfirmed belief claim unknown', () => {
    for (const directProposal of [true, false]) {
      const f = proposalStory();
      if (directProposal) f.line.data.claimAssertionIds = [f.proposal.id];
      else f.knowledge.status = 'provisional';
      expect(validateProject(f.project).ok).toBe(true);
      const assessment = assessPresentationClaims(f.project, trialNarrativeOccurrences(startTrial(f.project, { entryId: f.entry.id }))).find(item => item.lineId === f.line.id)!;
      expect(assessment).toMatchObject({ status: 'unknown', knowledge: 'unknown', assertionId: directProposal ? f.proposal.id : f.knowledge.id });
      expect(assessment.counterpartIds).toContain(f.proposal.id);
    }
  });
  it('keeps an unspecified world time and an unconfirmed external route unknown', () => {
    for (const kind of ['world', 'route'] as const) {
      const f = proposalStory();
      if (kind === 'world') f.knowledge.data.validity = { ...emptyValidity(), worldRange: { start: '10', end: null } };
      else {
        const external = createEntity(f.project.projectId, 'external_contract', 'unconfirmed route', { key: 'unconfirmed_route', owner: 'game', inputType: 'boolean', outputType: 'boolean', version: '1.0.0', missingPolicy: 'unknown' });
        external.status = 'confirmed'; f.project.entities.push(external);
        f.knowledge.data.validity = { ...emptyValidity(), routeCondition: { op: 'external', contractId: external.id } };
      }
      expect(validateProject(f.project).ok).toBe(true);
      const assessment = assessPresentationClaims(f.project, trialNarrativeOccurrences(startTrial(f.project, { entryId: f.entry.id }))).find(item => item.lineId === f.line.id)!;
      expect(assessment).toMatchObject({ status: 'unknown', knowledge: 'unknown' });
    }
  });
  it('keeps a confirmed hypothesis with unknown applicability in the claim assessment', () => {
    const f = proposalStory(); f.proposal.status = 'confirmed'; f.proposal.data.value = { type: 'boolean', value: true };
    f.proposal.data.validity = { ...emptyValidity(), worldRange: { start: '10', end: null } };
    expect(validateProject(f.project).ok).toBe(true);
    const assessment = assessPresentationClaims(f.project, trialNarrativeOccurrences(startTrial(f.project, { entryId: f.entry.id }))).find(item => item.lineId === f.line.id)!;
    expect(assessment).toMatchObject({ status: 'unknown', knowledge: 'unknown' });
    expect(assessment.counterpartIds).toContain(f.proposal.id);
  });
  it('never uses a related provisional hypothesis acquisition as proof that C acquired the confirmed claim', () => {
    const f = proposalStory(), anchor = { entityId: f.scene.id, blockId: f.scene.data.body[0].id, start: 0, end: 1 };
    f.proposal.data.value = { type: 'boolean', value: true }; f.proposal.data.holderId = f.c.id; f.proposal.data.sourceIds = [f.truth.id]; f.proposal.data.evidenceLocation = anchor;
    const draftEffect = createEntity(f.project.projectId, 'effect', 'record a proposed belief', { operation: 'assert', targetId: f.proposal.id, value: { type: 'boolean', value: true } });
    const draftDisclosure = createEntity(f.project.projectId, 'disclosure', 'proposed belief acquisition', { foreshadowId: f.question.id, anchor, role: 'clue', knowledgeEffects: [draftEffect.id] });
    draftEffect.status = draftDisclosure.status = 'confirmed'; f.question.data.clueIds!.push(draftDisclosure.id); f.project.entities.push(draftEffect, draftDisclosure);
    expect(validateProject(f.project).ok).toBe(true);
    const session = startTrial(f.project, { entryId: f.entry.id });
    expect(session.state.assertions).toEqual([{ assertionId: f.proposal.id, holderId: f.c.id, truth: 'true', sourceEffectId: draftEffect.id }]);
    const assessment = assessPresentationClaims(f.project, trialNarrativeOccurrences(session)).find(item => item.lineId === f.line.id)!;
    expect(assessment).toMatchObject({ status: 'candidate', knowledge: 'not_acquired' });
    expect(assessment.counterpartIds).toContain(f.proposal.id); expect(assessment.evidenceIds).toContain(f.proposal.id);
    expect(f.proposal.status).toBe('provisional');
  });
  it('retains an unknown stored acquisition result and missing presentation observations as unknown', () => {
    const f = proposalStory(), session = startTrial(f.project, { entryId: f.entry.id });
    const observed = trialNarrativeOccurrences(session);
    expect(observed[0].observationState).toBeDefined();
    observed[0].observationState!.assertions.push({ assertionId: f.knowledge.id, holderId: f.c.id, truth: 'unknown' });
    expect(assessPresentationClaims(f.project, observed).find(item => item.lineId === f.line.id)).toMatchObject({ status: 'unknown', knowledge: 'unknown' });
    const legacy = trialNarrativeOccurrences(session).map(({ observationState: _observationState, ...occurrence }) => occurrence);
    expect(assessPresentationClaims(f.project, legacy).find(item => item.lineId === f.line.id)).toMatchObject({ status: 'unknown', knowledge: 'unknown' });
  });
});
