import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, validateProject } from './model';
import type { Entity, RichText } from './types';
import {
  addRubyAnnotation,
  addTextLink,
  findTextLinkReferences,
  indexTextLinkReferences,
  findTextOccurrences,
  ignoredLinkCandidateKey,
  mergeRichTextBlocks,
  moveRichTextBlock,
  removeUnresolvedAnnotation,
  resolveUnresolvedAnnotation,
  splitRichTextBlock,
  suggestLinkCandidates,
  targetAnchorForTerm,
} from './linkCandidates';

function projectFixture() {
  const project = createProject('リンク候補テスト');
  const source = createEntity(project.projectId, 'scene', '本文');
  const target = createEntity(project.projectId, 'character', 'アオ', { reading: 'あお', summary: [{ id: 'summary-1', kind: 'paragraph', text: '😀アオは青い傘を持つ。' }] });
  const twin = createEntity(project.projectId, 'character', 'アオ');
  const deleted = createEntity(project.projectId, 'character', 'アオ');
  deleted.deletedAt = '2026-01-01T00:00:00Z';
  target.data.aliases = [{ id: 'alias-1', text: '青', reading: 'あお', validity: { worldRange: null, routeCondition: null, presentationAnchor: null }, audienceHolderIds: [], isPublicDefault: true }];
  project.entities = [source, target, twin, deleted];
  return { project, source, target, twin, deleted };
}

describe('link candidates and annotation helpers', () => {
  it('suggests repeated names, readings, and aliases with codepoint spans and disambiguated labels', () => {
    const { project, source, target, twin } = projectFixture();
    const text = '😀アオ、アオ、あお、青';
    const candidates = suggestLinkCandidates(text, project.entities, { projectId: project.projectId, sourceEntityId: source.id });
    const names = candidates.filter(candidate => candidate.entityId === target.id && candidate.term === 'アオ');
    expect(names.map(candidate => [candidate.start, candidate.end])).toEqual([[1, 3], [4, 6]]);
    expect(names.every(candidate => candidate.label.includes(target.id.slice(-6)))).toBe(true);
    expect(candidates.some(candidate => candidate.entityId === twin.id && candidate.term === 'アオ')).toBe(true);
    expect(candidates.find(candidate => candidate.entityId === target.id && candidate.term === 'あお')).toMatchObject({ start: 7, end: 9, suggestedReading: undefined });
    expect(candidates.find(candidate => candidate.entityId === target.id && candidate.term === '青')).toMatchObject({ start: 10, end: 11, sources: ['alias'] });
    expect(candidates.every(candidate => candidate.entityId !== source.id && candidate.entityId !== project.entities[3].id)).toBe(true);
    expect(targetAnchorForTerm(target, 'アオ')).toEqual({ entityId: target.id, blockId: 'summary-1', start: 1, end: 3 });
  });

  it('excludes deleted, current, explicitly excluded, and preference-ignored candidates', () => {
    const { project, source, target, twin, deleted } = projectFixture();
    const ignored = ignoredLinkCandidateKey(project.projectId, source.id, target.id, 'アオ');
    const candidates = suggestLinkCandidates('アオ、アオ', project.entities, {
      projectId: project.projectId,
      sourceEntityId: source.id,
      excludeEntityIds: [twin.id],
      ignoredKeys: new Set([ignored]),
    });
    expect(candidates).toEqual([]);
    expect(deleted.deletedAt).toBeTruthy();
    expect(ignored).toContain(encodeURIComponent(project.projectId));
  });

  it('counts overlapping occurrences in code points, including a supplementary emoji prefix', () => {
    expect(findTextOccurrences('😀花花', '花')).toEqual([{ start: 1, end: 2 }, { start: 2, end: 3 }]);
    expect(findTextOccurrences('😀青、青', '青')).toEqual([{ start: 1, end: 2 }, { start: 3, end: 4 }]);
  });

  it('preserves existing marks and unresolved intent while rejecting overlap and invalid ranges', () => {
    const { target } = projectFixture();
    const block: RichText = [{
      id: 'source-block', kind: 'paragraph', text: '😀アオと青',
      ruby: [{ start: 1, end: 3, text: 'あお' }],
      unresolvedAnnotations: [{ kind: 'link', originalText: '青', reason: '前回の範囲が変わりました。', target: { entityId: target.id } }],
    }];
    const link = addTextLink(block, 'source-block', 4, 5, { entityId: target.id, blockId: 'summary-1', start: 1, end: 2 });
    expect(link.ok).toBe(true);
    if (link.ok) {
      expect(link.value[0].ruby).toEqual(block[0].ruby);
      expect(link.value[0].unresolvedAnnotations).toEqual(block[0].unresolvedAnnotations);
      expect(link.value[0].links).toEqual([{ start: 4, end: 5, target: { entityId: target.id, blockId: 'summary-1', start: 1, end: 2 } }]);
    }
    expect(addRubyAnnotation(block, 'source-block', 2, 4, 'よみ')).toMatchObject({ ok: false, reason: expect.stringContaining('すでに') });
    expect(addTextLink(block, 'source-block', 0, 7, { entityId: target.id })).toMatchObject({ ok: false });
    expect(addTextLink(block, 'missing-block', 0, 1, { entityId: target.id })).toMatchObject({ ok: false });
    expect(addRubyAnnotation(block, 'source-block', 4, 5, '   ')).toMatchObject({ ok: false });
  });

  it('keeps unresolved intent on a failed relink and clears it only after the new mark is committed', () => {
    const { target, twin } = projectFixture();
    const body: RichText = [{
      id: 'owner', kind: 'paragraph', text: '元の文章',
      unresolvedAnnotations: [{ kind: 'link', originalText: 'アオ', reason: '本文変更', target: { entityId: target.id } }],
    }, { id: 'destination', kind: 'paragraph', text: '😀アオとアオ', ruby: [{ start: 1, end: 3, text: 'あお' }] }];
    const blocked = resolveUnresolvedAnnotation(body, 'owner', 0, 'destination', 1, 3, { entityId: twin.id });
    expect(blocked.ok).toBe(false);
    expect(body[0].unresolvedAnnotations?.[0]).toMatchObject({ kind: 'link', originalText: 'アオ', target: { entityId: target.id } });

    const resolved = resolveUnresolvedAnnotation(body, 'owner', 0, 'destination', 4, 6, { entityId: twin.id });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value[0].unresolvedAnnotations).toBeUndefined();
      expect(resolved.value[1].ruby).toEqual(body[1].ruby);
      expect(resolved.value[1].links).toEqual([{ start: 4, end: 6, target: { entityId: twin.id } }]);
    }
    expect(body[0].unresolvedAnnotations).toHaveLength(1);
    expect(removeUnresolvedAnnotation(body, 'owner', 0)[0].unresolvedAnnotations).toBeUndefined();
  });

  it('splits, merges, and reorders blocks while keeping IDs and non-overlapping marks stable', () => {
    const body: RichText = [{ id: 'first', kind: 'paragraph', text: 'アオが歩く', links: [{ start: 0, end: 2, target: { entityId: 'target' } }] }, { id: 'last', kind: 'quote', text: '次の文' }];
    const split = splitRichTextBlock(body, 'first', 3);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.value.map(block => block.text)).toEqual(['アオが', '歩く', '次の文']);
    expect(split.value[0]).toMatchObject({ id: 'first', links: [{ start: 0, end: 2 }] });
    const merged = mergeRichTextBlocks(split.value, split.value[0].id);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.value.map(block => block.text)).toEqual(['アオが歩く', '次の文']);
    expect(merged.value[0].links).toEqual(body[0].links);
    const moved = moveRichTextBlock(merged.value, 'last', -1);
    expect(moved.map(block => block.id)).toEqual(['last', 'first']);
    expect(moved[1].links).toEqual(body[0].links);
  });

  it('reports reverse references from the exact source paragraph and ignores deleted sources', () => {
    const { project, target, source, deleted } = projectFixture();
    const sourceBlock = { id: 'source-block', kind: 'paragraph' as const, text: '😀アオ', links: [{ start: 1, end: 3, target: { entityId: target.id, blockId: 'summary-1', start: 1, end: 3 } }] };
    (source as Entity<'scene'>).data.body = [sourceBlock];
    (deleted as Entity<'character'>).data.summary = [structuredClone(sourceBlock)];
    expect(findTextLinkReferences(project, target.id)).toEqual([{
      sourceEntityId: source.id,
      sourceEntityName: source.name,
      sourceEntityKind: 'scene',
      sourceField: 'body',
      sourceBlockId: 'source-block',
      start: 1,
      end: 3,
      text: 'アオ',
      target: { entityId: target.id, blockId: 'summary-1', start: 1, end: 3 },
    }]);
  });

  it('keeps pinned targets and Unicode source positions across every incoming field without mutating the authored anchors', () => {
    const { project, target, source, twin } = projectFixture();
    const fixed = { entityId: target.id, sourceVersionId: newId(), blockId: newId(), start: 7, end: 9 };
    (source as Entity<'scene'>).data.body = [{ id: 'first', kind: 'paragraph', text: '😀旧語', links: [{ start: 1, end: 3, target: fixed }, { start: 0, end: 1, target: { entityId: twin.id } }] }];
    (source as Entity<'scene'>).data.summary = [{ id: 'notes', kind: 'quote', text: '旧語😀', links: [{ start: 0, end: 2, target: fixed }] }];
    const before = structuredClone(project), index = indexTextLinkReferences(project);
    expect(index.get(target.id)?.map(reference => ({ block: reference.sourceBlockId, field: reference.sourceField, start: reference.start, end: reference.end, text: reference.text, target: reference.target }))).toEqual([
      { block: 'notes', field: 'summary', start: 0, end: 2, text: '旧語', target: fixed },
      { block: 'first', field: 'body', start: 1, end: 3, text: '旧語', target: fixed },
    ]);
    expect(index.get(twin.id)).toHaveLength(1);
    expect(index.get(newId())).toBeUndefined();
    index.get(target.id)![0]!.target.sourceVersionId = 'view-only-change';
    expect(project).toEqual(before);
    expect(index.get(target.id)![1]!.target).toEqual(fixed);
  });

  it('creates a known Unicode target position that passes the actual saved-project contract', () => {
    const project = createProject('確定した対象位置の通常リンク');
    const targetBlock = { id: newId(), kind: 'paragraph' as const, text: '😀アオの説明' };
    const target = createEntity(project.projectId, 'character', 'アオ', { summary: [targetBlock] });
    const source = createEntity(project.projectId, 'scene', '参照元', { body: [{ id: newId(), kind: 'paragraph', text: '😀アオが登場' }] });
    project.entities = [source, target];
    const anchor = targetAnchorForTerm(target, 'アオ');
    expect(anchor).toEqual({ entityId: target.id, blockId: targetBlock.id, start: 1, end: 3 });
    const added = addTextLink(source.data.body!, source.data.body![0]!.id, 1, 3, anchor);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    source.data.body = added.value;
    expect(validateProject(project)).toMatchObject({ ok: true });
  });
});
