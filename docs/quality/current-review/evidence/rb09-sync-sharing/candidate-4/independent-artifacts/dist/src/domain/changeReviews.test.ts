import { describe, expect, it } from 'vitest';
import { addChangeReviews } from './changeReviews';
import { createEntity, createDemoProject, emptyValidity, newId, validateProject } from './model';
import { jsonBytes, sha256 } from '../storage/json';
import type { Entity, EntityKind, ProjectData } from './types';

function entity<K extends EntityKind>(project: ProjectData, kind: K): Entity<K> {
  return project.entities.find((item): item is Entity<K> => item.kind === kind && !item.deletedAt)!;
}

describe('semantic change reviews', () => {
  it('creates private review candidates for direct references and meaningful relation edges', () => {
    const before = createDemoProject();
    const character = entity(before, 'character');
    const neighbor = createEntity(before.projectId, 'character', '近所の人');
    before.entities.push(neighbor);
    before.relations.push({
      id: newId(), projectId: before.projectId, revision: '0', fromId: character.id, toId: neighbor.id,
      relationType: 'trust', direction: 'forward', validity: emptyValidity(), evidenceIds: [], status: 'provisional', visibility: 'private',
    });
    const genericReferenceTarget = createEntity(before.projectId, 'place', '単なる参照先');
    before.entities.push(genericReferenceTarget);
    before.relations.push({
      id: newId(), projectId: before.projectId, revision: '0', fromId: character.id, toId: genericReferenceTarget.id,
      relationType: 'reference', direction: 'forward', validity: emptyValidity(), evidenceIds: [], status: 'provisional', visibility: 'private',
    });

    const candidate = structuredClone(before);
    const changed = entity(candidate, 'character');
    changed.data.death = { mode: 'unknown', reason: '行方不明' };
    const scene = entity(candidate, 'scene');
    const sceneBefore = structuredClone(scene);
    const reviewed = addChangeReviews(before, candidate);
    const reviews = reviewed.entities.filter((item): item is Entity<'review'> => item.kind === 'review');
    const direct = reviews.find(review => review.data.target === scene.id);
    const semantic = reviews.find(review => review.data.target === neighbor.id);

    expect(direct).toBeDefined();
    expect(direct!.data.body.map(block => block.text).join('\n')).toContain('IDで直接参照しています');
    expect(direct!.data.body.map(block => block.text).join('\n')).toContain('data.povId');
    expect(semantic).toBeDefined();
    expect(semantic!.data.body.map(block => block.text).join('\n')).toContain(`作者が設定した関係「${'信頼'}」`);
    expect(reviews.some(review => review.data.target === genericReferenceTarget.id)).toBe(false);
    expect(direct!.data.targetVersionId).toBe(candidate.projectId);
    expect(direct!.data.stage).toBe('open');
    expect(direct!.status).toBe('needs_review');
    expect(direct!.visibility).toBe('private');
    expect(direct!.customValues['changeReview.sourceIds']).toContain(character.id);
    expect(direct!.customValues['changeReview.sourceRevisions']).toBe(JSON.stringify({ [character.id]: '1' }));
    expect(direct!.customValues['changeReview.projectRevision']).toBe('1');
    expect(reviewed.entities.find(item => item.id === scene.id)).toEqual(sceneBefore);
    const validation = validateProject(reviewed);
    expect(validation.ok, validation.ok ? '' : JSON.stringify(validation.issues)).toBe(true);
  });

  it('ignores name, reading, alias, review, view, and history changes', () => {
    const before = createDemoProject();
    const candidate = structuredClone(before);
    const character = entity(candidate, 'character');
    character.name = '別の表示名';
    character.data.reading = 'べつのよみ';
    character.data.aliases = [];
    candidate.views.push({ id: newId(), name: '別ビュー', view: 'list', entityIds: [character.id], settings: {} });
    candidate.history.push({
      operationId: newId(), projectId: candidate.projectId, baseRevision: candidate.revision, revision: '1', targetIds: [],
      reason: '表示設定', createdAt: new Date().toISOString(), before: structuredClone(candidate), after: structuredClone(candidate),
    });

    const reviewed = addChangeReviews(before, candidate);
    expect(reviewed.entities.some(item => item.kind === 'review')).toBe(false);

    const withReview = structuredClone(before);
    const review = createEntity(before.projectId, 'review', '手動確認', {
      target: character.id, targetVersionId: before.projectId, body: [{ id: newId(), kind: 'paragraph', text: '手動の確認' }],
    });
    withReview.entities.push(review);
    const editedReview = structuredClone(withReview);
    entity(editedReview, 'review').data.body[0]!.text = '解決しました';
    expect(addChangeReviews(withReview, editedReview).entities.filter(item => item.kind === 'review')).toHaveLength(1);
  });

  it('deduplicates a generated candidate for the same target and source revision', () => {
    const before = createDemoProject(), candidate = structuredClone(before);
    const character = entity(candidate, 'character');
    character.data.death = { mode: 'unknown', reason: '不明' };
    const first = addChangeReviews(before, candidate);
    const second = addChangeReviews(before, first);
    expect(second.entities.filter(item => item.kind === 'review')).toHaveLength(first.entities.filter(item => item.kind === 'review').length);
    expect(second.history).toBe(first.history);
    expect(second.views).toBe(first.views);
  });

  it('honors explicit path labels without declaring candidates to be confirmed errors', () => {
    const before = createDemoProject();
    const variable = entity(before, 'variable'), edge = entity(before, 'flow_edge');
    edge.data.condition = { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: false } };
    const candidate = structuredClone(before);
    entity(candidate, 'variable').data.initial = { type: 'boolean', value: true };
    const output = addChangeReviews(before, candidate);
    const review = output.entities.find((item): item is Entity<'review'> => item.kind === 'review' && item.data.target === edge.id);
    expect(review).toBeDefined();
    expect(review!.data.body.map(block => block.text).join('\n')).toContain('候補は人による確認用');
  });
});

it('reviews live dependencies only when a note also cites an immutable edition', async () => {
  const before = createDemoProject();
  const character = entity(before, 'character');
  const { history: _history, snapshots: _snapshots, ...content } = structuredClone(before);
  const versionId = newId();
  before.snapshots.push({ id: versionId, versionLabel: '固定版', createdAt: new Date().toISOString(), content, contentHash: await sha256(jsonBytes(content)) });
  const pinned = createEntity(before.projectId, 'note', '固定版のみ', { body: [{ id: newId(), kind: 'paragraph', text: '人', links: [{ start: 0, end: 1, target: { entityId: character.id, sourceVersionId: versionId } }] }] });
  const mixed = createEntity(before.projectId, 'note', '現在版と固定版', { body: [{ id: newId(), kind: 'paragraph', text: '人人', links: [{ start: 0, end: 1, target: { entityId: character.id, sourceVersionId: versionId } }, { start: 1, end: 2, target: { entityId: character.id, sourceVersionId: before.projectId } }] }] });
  before.entities.push(pinned, mixed);
  expect(validateProject(before).ok).toBe(true);
  const candidate = structuredClone(before);
  entity(candidate, 'character').data.death = { mode: 'unknown', reason: '消息変更' };
  const reviewed = addChangeReviews(before, candidate);
  const reviews = reviewed.entities.filter((item): item is Entity<'review'> => item.kind === 'review');
  expect(reviews.some(review => review.data.target === pinned.id)).toBe(false);
  const result = reviews.find(review => review.data.target === mixed.id)!;
  expect(result).toBeDefined();
  expect(result.customValues['changeReview.paths']).toContain('links[1]');
  expect(result.customValues['changeReview.paths']).not.toContain('links[0]');
  expect(reviewed.snapshots).toEqual(before.snapshots);
  expect(validateProject(reviewed).ok).toBe(true);
});

it('reviews both endpoints when one atomic change updates both linked settings', () => {
  const before = createDemoProject();
  const first = entity(before, 'character');
  const second = createEntity(before.projectId, 'character', '相手');
  before.entities.push(second);
  before.relations.push({ id: newId(), projectId: before.projectId, revision: '0', fromId: first.id, toId: second.id, relationType: 'trust', direction: 'forward', validity: emptyValidity(), evidenceIds: [], status: 'confirmed', visibility: 'private' });
  const next = structuredClone(before);
  for (const id of [first.id, second.id]) {
    const changed = next.entities.find((item): item is Entity<'character'> => item.kind === 'character' && item.id === id)!;
    changed.data.death = { mode: 'unknown', reason: '変更' };
  }
  const result = addChangeReviews(before, next);
  const reviews = result.entities.filter((item): item is Entity<'review'> => item.kind === 'review');
  expect(reviews.find(review => review.data.target === first.id)?.customValues['changeReview.sourceIds']).toContain(second.id);
  expect(reviews.find(review => review.data.target === second.id)?.customValues['changeReview.sourceIds']).toContain(first.id);
  expect(validateProject(result).ok).toBe(true);
});
