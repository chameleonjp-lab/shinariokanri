import { describe, expect, it } from 'vitest';
import { buildJapaneseAuthorIndex, collectCatalogText, evaluateCollection, findCatalogMaintenance, matchesQuery, normalizeCatalogText, searchJapaneseAuthorIndex } from './catalog';
import { createEntity, createProject, emptyValidity, newId, validateEntity } from './model';
import type { Entity, EntityDataMap, EntityKind, ProjectData, Query } from './types';

function add<K extends EntityKind>(project: ProjectData, kind: K, name: string, data?: Partial<EntityDataMap[K]>): Entity<K> {
  const entity = createEntity(project.projectId, kind, name, data);
  project.entities.push(entity);
  return entity;
}

describe('catalog query and index helpers', () => {
  it('normalizes Japanese width, kana, case and whitespace without changing source text', () => {
    expect(normalizeCatalogText(' ＡＯＩ　ガーデン ')).toBe(normalizeCatalogText('aoi がーでん'));
    expect(normalizeCatalogText('カタカナ')).toBe('かたかな');
  });

  it('searches names, readings, aliases and rich text while excluding reference IDs', () => {
    const project = createProject();
    const character = add(project, 'character', '葵', { reading: 'あおい', aliases: [{ id: newId(), text: '青衣', reading: 'あおい', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false }], body: [{ id: newId(), kind: 'paragraph', text: '塔の鍵を探す' }] });
    const unknownId = newId();
    character.customValues.relation = { type: 'ref', value: unknownId };
    const text = collectCatalogText(character);

    expect(matchesQuery(project, character, { op: 'text', value: 'アオイ' })).toBe(true);
    expect(matchesQuery(project, character, { op: 'text', value: '青衣' })).toBe(true);
    expect(matchesQuery(project, character, { op: 'text', value: '塔 の 鍵' })).toBe(true);
    expect(text.some(term => term.path === 'data.body[0].text')).toBe(true);
    expect(matchesQuery(project, character, { op: 'text', value: unknownId })).toBe(false);
  });

  it('composes current query operators and resolves participant filters through scene event IDs', () => {
    const project = createProject();
    const character = add(project, 'character', '葵');
    const other = add(project, 'character', '薫');
    const event = add(project, 'event', '門を開く', { participants: [{ characterId: character.id, role: 'witness' }] });
    const scene = add(project, 'scene', '夜の場面', { eventIds: [event.id] });
    const unrelated = add(project, 'scene', '別の場面');
    const query: Query = { op: 'all', children: [{ op: 'kind', value: 'scene' }, { op: 'participant', characterId: character.id }, { op: 'text', value: '夜' }] };

    expect(matchesQuery(project, scene, query)).toBe(true);
    expect(matchesQuery(project, unrelated, query)).toBe(false);
    expect(matchesQuery(project, event, { op: 'participant', characterId: character.id })).toBe(true);
    expect(matchesQuery(project, event, { op: 'participant', characterId: other.id })).toBe(false);
    expect(matchesQuery(project, event, { op: 'all', children: [] })).toBe(true);
    expect(matchesQuery(project, event, { op: 'any', children: [] })).toBe(false);
  });

  it('filters chapters and their assigned scenes, including inside nested queries', () => {
    const project = createProject();
    const chapter = add(project, 'chapter', '第一章');
    const scene = add(project, 'scene', '第一章の場面', { chapterId: chapter.id });
    const other = add(project, 'scene', '別章の場面');
    const query: Query = { op: 'all', children: [{ op: 'kind', value: 'scene' }, { op: 'chapter', chapterId: chapter.id }, { op: 'text', value: '場面' }] };

    expect(matchesQuery(project, chapter, { op: 'chapter', chapterId: chapter.id })).toBe(true);
    expect(matchesQuery(project, scene, query)).toBe(true);
    expect(matchesQuery(project, other, query)).toBe(false);
    expect(matchesQuery(project, scene, { op: 'chapter', chapterId: newId() })).toBe(false);
  });

  it('matches foreshadow records, qualifying disclosures, and explicit scene/flow-node anchors', () => {
    const project = createProject();
    const scene = add(project, 'scene', '記録を見つける');
    const other = add(project, 'scene', '無関係な場面');
    const node = add(project, 'flow_node', '手掛かりを提示', { sceneId: other.id });
    const foreshadow = add(project, 'foreshadow', '塔の鍵は誰のものか', { resolutionPolicy: 'this_work' });
    const clue = add(project, 'disclosure', '鍵の記録', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id }, role: 'clue', stage: 'hint' });
    const payoff = add(project, 'disclosure', '鍵を使う', { foreshadowId: foreshadow.id, anchor: { entityId: node.id }, role: 'payoff', stage: 'reveal' });
    const query: Query = { op: 'foreshadow', foreshadowId: foreshadow.id, role: 'clue', stage: 'hint' };

    expect(matchesQuery(project, foreshadow, query)).toBe(true);
    expect(matchesQuery(project, clue, query)).toBe(true);
    expect(matchesQuery(project, scene, query)).toBe(true);
    expect(matchesQuery(project, node, { op: 'foreshadow', role: 'payoff', stage: 'reveal' })).toBe(true);
    expect(matchesQuery(project, other, { op: 'foreshadow', role: 'clue', stage: 'hint' })).toBe(false);
    expect(matchesQuery(project, payoff, query)).toBe(false);
    expect(matchesQuery(project, foreshadow, { op: 'foreshadow', resolutionPolicy: 'sequel' })).toBe(false);
    payoff.deletedAt = new Date().toISOString();
    expect(matchesQuery(project, other, { op: 'foreshadow', role: 'payoff', stage: 'reveal' })).toBe(false);
  });

  it('accepts chapter/foreshadow saved query nodes and rejects an empty foreshadow predicate', () => {
    const project = createProject();
    const chapter = add(project, 'chapter', '第一章');
    const foreshadow = add(project, 'foreshadow', '鍵の問い');
    const collection = add(project, 'collection', '章と伏線', { mode: 'dynamic', query: { op: 'all', children: [{ op: 'chapter', chapterId: chapter.id }, { op: 'foreshadow', foreshadowId: foreshadow.id, role: 'clue' }] } });
    expect(validateEntity(collection).ok).toBe(true);
    const invalid = add(project, 'collection', '条件なしの伏線', { mode: 'dynamic', query: { op: 'foreshadow' } as Query });
    expect(validateEntity(invalid).ok).toBe(false);
  });

  it('matches production progress on task records and on entities targeted by tasks', () => {
    const project = createProject();
    const scene = add(project, 'scene', '書庫');
    const task = add(project, 'production_task', '書庫を確認', { targetIds: [scene.id], progress: 'needs_review' });
    const otherTask = add(project, 'production_task', '別作業', { progress: 'done' });

    expect(matchesQuery(project, scene, { op: 'production', value: 'needs_review' })).toBe(true);
    expect(matchesQuery(project, task, { op: 'production', value: 'needs_review' })).toBe(true);
    expect(matchesQuery(project, scene, { op: 'production', value: 'done' })).toBe(false);
    otherTask.deletedAt = new Date().toISOString();
    expect(matchesQuery(project, otherTask, { op: 'production', value: 'done' })).toBe(true);
    expect(matchesQuery(project, scene, { op: 'production', value: 'done' })).toBe(false);
  });

  it('re-evaluates dynamic collections and keeps fixed membership, reporting stale IDs separately', () => {
    const project = createProject();
    const first = add(project, 'scene', '場面A', { body: [{ id: newId(), kind: 'paragraph', text: '葵が登場' }] });
    const second = add(project, 'scene', '場面B', { body: [{ id: newId(), kind: 'paragraph', text: '薫が登場' }] });
    const later = add(project, 'scene', '場面C', { body: [{ id: newId(), kind: 'paragraph', text: '葵が登場' }] });
    const dynamic = add(project, 'collection', '葵の場面', { mode: 'dynamic', query: { op: 'all', children: [{ op: 'kind', value: 'scene' }, { op: 'text', value: '葵' }] }, sort: { field: 'name', direction: 'asc' } });
    const fixed = add(project, 'collection', '固定の場面', { mode: 'fixed', memberIds: [second.id, first.id, newId()], query: { op: 'text', value: '一致しない' }, sort: null });

    expect(evaluateCollection(project, dynamic).entityIds).toEqual([first.id, later.id]);
    expect(evaluateCollection(project, fixed).entityIds).toEqual([second.id, first.id]);
    expect(evaluateCollection(project, fixed).missingIds).toHaveLength(1);
    expect(evaluateCollection(project, fixed).mode).toBe('fixed');

    later.deletedAt = new Date().toISOString();
    expect(evaluateCollection(project, dynamic).entityIds).toEqual([first.id]);
  });

  it('builds a sorted author index from readings, aliases, variants and category groups', () => {
    const project = createProject();
    const character = add(project, 'character', '葵', { reading: 'あおい', aliases: [{ id: newId(), text: '青衣', reading: 'あおい', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false }] });
    add(project, 'group', '主要人物', { groupType: 'category', members: [character.id] });
    const term = add(project, 'terminology', '霧の門', { canonical: '霧の門', reading: 'きりのもん', variants: ['霧門'] });
    const index = buildJapaneseAuthorIndex(project);
    const aliases = searchJapaneseAuthorIndex(index, 'アオイ');

    expect(aliases.some(entry => entry.entityId === character.id && entry.source === 'alias_reading')).toBe(true);
    expect(index.find(entry => entry.entityId === character.id && entry.source === 'name')?.classifications).toEqual(['主要人物']);
    expect(searchJapaneseAuthorIndex(index, 'きりのもん').some(entry => entry.entityId === term.id)).toBe(true);
    expect(searchJapaneseAuthorIndex(index, '霧門').some(entry => entry.entityId === term.id && entry.source === 'variant')).toBe(true);
    const collator = new Intl.Collator('ja-JP', { usage: 'sort', sensitivity: 'base', numeric: true });
    expect(index.every((entry, position) => position === 0 || collator.compare(index[position - 1]!.reading || index[position - 1]!.term, entry.reading || entry.term) <= 0)).toBe(true);
  });

  it('reports review candidates with reasons and targets without treating intentional background as an error', () => {
    const project = createProject();
    const duplicateA = add(project, 'character', '葵');
    const duplicateB = add(project, 'character', ' 葵 ');
    const background = add(project, 'lore', '星の伝承', { body: [{ id: newId(), kind: 'paragraph', text: '未参照でも残す背景設定' }] });
    const retained = add(project, 'lore', '保持指定の背景', { body: [] });
    retained.retainIfUnreferenced = true;
    const variable = add(project, 'variable', '外部状態', { key: 'external', externalUseDeclared: true });
    const untranslated = add(project, 'localization', '翻訳', { stage: 'needs_review' });
    const media = add(project, 'media_variant', '公開本文', { needsReview: true });
    const review = add(project, 'review', '変更確認', { target: duplicateA.id, targetVersionId: project.projectId, body: [] });
    const findings = findCatalogMaintenance(project);

    const duplicateFinding = findings.find(item => item.kind === 'possible_duplicate');
    expect(duplicateFinding?.targetIds).toEqual([duplicateA.id, duplicateB.id].sort());
    expect(duplicateFinding?.disposition).toBe('candidate');
    expect(findings.find(item => item.kind === 'unreferenced' && item.targetIds[0] === background.id)?.reason).toContain('背景設定');
    expect(findings.find(item => item.kind === 'retained' && item.targetIds[0] === retained.id)?.paths).toContain('retainIfUnreferenced');
    expect(findings.find(item => item.kind === 'external_use' && item.targetIds[0] === variable.id)?.paths).toContain('data.externalUseDeclared');
    expect(findings.some(item => item.kind === 'unreferenced' && item.targetIds[0] === variable.id)).toBe(false);
    expect(findings.some(item => item.kind === 'unreferenced' && item.targetIds[0] === retained.id)).toBe(false);
    expect(findings.some(item => item.kind === 'missing_reading' && item.targetIds[0] === duplicateA.id)).toBe(true);
    expect(findings.find(item => item.kind === 'needs_review' && item.targetIds[0] === untranslated.id)?.paths).toContain('data.stage');
    expect(findings.find(item => item.kind === 'needs_review' && item.targetIds[0] === media.id)?.paths).toContain('data.needsReview');
    expect(findings.find(item => item.kind === 'needs_review' && item.targetIds[0] === review.id)?.paths).toContain('data.stage');
    expect(findings.some(item => item.kind === 'unreferenced' && item.targetIds[0] === review.id)).toBe(false);
    review.data.stage = 'verified';
    expect(findCatalogMaintenance(project).some(item => item.kind === 'needs_review' && item.targetIds[0] === review.id)).toBe(false);
    expect(findings.every(item => item.disposition === 'candidate' && item.reason.length > 0 && item.targetIds.length > 0)).toBe(true);
  });
});
