import { expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stageHNarrativeFixture as fixture } from './helpers/stageHNarrative';
import { startTrial, stepTrial, trialNarrativeOccurrences } from '../src/domain/runtime';
import { startTrialVerified } from '../src/domain/runtimeVerified';
import { compareNarrativePerspectives } from '../src/domain/narrative';
import { NarrativeClaims } from '../src/ui/NarrativeClaims';
import { projectContent } from '../src/domain/writingWorkspace';
import { jsonBytes, sha256 } from '../src/storage/json';

it('keeps author truth, selected-holder belief and actual route exposure separate at the same scene', () => {
  const f = fixture(), initial = startTrial(f.project, { entryId: f.entry.id, worldTick: '15' });
  const direct = stepTrial(f.project, initial, { edgeId: f.direct.id, worldTick: '15' });
  const firstStep = stepTrial(f.project, initial, { edgeId: f.via.id, worldTick: '15' });
  expect(firstStep.nodeId, JSON.stringify(firstStep.issues)).toBe(f.via.data.toId);
  const via = stepTrial(f.project, firstStep, { edgeId: f.join.id, worldTick: '15' });
  expect(via.status, JSON.stringify(via.issues)).toBe('terminal');
  const comparison = (session: typeof via) => compareNarrativePerspectives(session.content, trialNarrativeOccurrences(session), f.person.id).at(-1)!;
  const bypass = comparison(direct), seen = comparison(via);
  expect(bypass.positionId).toBe(f.common.id); expect(seen.positionId).toBe(f.common.id);
  expect(seen.authorTruths.map(item => item.id)).toEqual([f.truth.id]);
  expect(seen.characterBeliefs.map(item => item.id)).toEqual([f.belief.id]);
  expect(bypass.characterBeliefs).toEqual([]);
  expect(compareNarrativePerspectives(via.content, trialNarrativeOccurrences(via), f.otherPerson.id).at(-1)?.characterBeliefs).toEqual([]);
  expect(seen.readerExposures.find(item => item.id === f.clue.id)?.status).toBe('presented');
  expect(bypass.readerExposures.find(item => item.id === f.clue.id)?.status).toBe('not_presented');
  expect(seen.readerUnderstanding).toBe('not_assessed');
  expect(seen.authorTruths[0].sources).toContainEqual(f.truth.data.evidenceLocation);
  expect(seen.characterBeliefs[0].sources).toContainEqual({ entityId: f.project.entities.find(entity => entity.kind === 'scene')!.id });
  expect(seen.readerExposures.find(item => item.id === f.clue.id)?.sources).toContainEqual(f.clue.data.anchor);
  const html = renderToStaticMarkup(createElement(NarrativeClaims, { project: via.content, state: via.state, occurrences: trialNarrativeOccurrences(via), onOpenTarget: () => {} }));
  for (const label of ['作者が定めた真実', '選んだ人物の信念', '選んだ経路で読者に提示', '意図した嘘', '読者の理解は判定しません']) expect(html.includes(label)).toBe(true);
});

it('uses the verified pinned edition and recorded time, and marks partial missing exposure unknown', async () => {
  const f = fixture(), content = projectContent(f.project), pin = { id: crypto.randomUUID(), content, contentHash: await sha256(jsonBytes(content)), versionLabel: '比較する固定稿', createdAt: new Date().toISOString() };
  f.project.snapshots.push(pin); f.truth.data.truthKind = 'hypothesis';
  const session = await startTrialVerified(f.project, { contentVersionId: pin.id, entryId: f.entry.id, worldTick: '15' });
  const occurrences = trialNarrativeOccurrences(session);
  expect(compareNarrativePerspectives(session.content, occurrences, f.person.id)[0].authorTruths.map(item => item.id)).toEqual([f.truth.id]);
  const otherTime = occurrences.map(item => ({ ...item, worldTick: '25' }));
  expect(compareNarrativePerspectives(session.content, otherTime, f.person.id)[0].authorTruths).toEqual([]);
  const partial = occurrences.map(item => ({ ...item, state: { ...item.state, provenance: 'partial' as const } }));
  expect(compareNarrativePerspectives(session.content, partial, f.person.id)[0].readerExposures.find(item => item.id === f.clue.id)?.status).toBe('unknown');
  expect(compareNarrativePerspectives(session.content, occurrences.map(item => ({ ...item, state: { ...item.state, seenIds: [] } })), f.person.id)).toEqual([]);
});
