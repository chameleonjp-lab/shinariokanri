import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { Entity, Relation, RichText } from '../src/domain/types';
import { createEntity, createProject, emptyValidity, newId, validateProject } from '../src/domain/model';
import { buildTextTransform, editRichText, remapEditedTextReferences, remapEditedTextRelationReferences, transformAnchor } from '../src/domain/text';
import { RichTextView } from '../src/ui/Fields';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { checkTrialForeshadows, startTrial, stepTrial } from '../src/domain/runtime';
import { exportProject } from '../src/domain/exports';

function fixture(text = 'アオが歩く。') {
  const project = createProject('本文位置の回帰検査');
  const character = createEntity(project.projectId, 'character', 'アオ');
  const body: RichText = [{ id: newId(), kind: 'paragraph', text, ruby: [{ start: 0, end: 2, text: 'あお' }], links: [{ start: 0, end: 2, target: { entityId: character.id } }] }];
  const scene = createEntity(project.projectId, 'scene', '歩く場面', { body });
  const foreshadow = createEntity(project.projectId, 'foreshadow', '歩く理由');
  const disclosure = createEntity(project.projectId, 'disclosure', '', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id, blockId: body[0].id, start: 0, end: 2 } });
  project.entities = [character, scene, foreshadow, disclosure];
  return { project, character, body, scene, disclosure };
}

describe('RG-R01 Unicode text annotations and content anchors', () => {
  it('detaches untracked repeated insertions for block and line anchors', () => {
    const { body, scene } = fixture('アオアオ');
    const after = structuredClone(body); after[0].text = 'アオアオアオ';
    const transform = buildTextTransform(body, after);
    expect(transform.range(body[0].id, 0, 2)).toBeUndefined();
    expect(transform.lineRange(0, 2)).toBeUndefined();
    expect(transformAnchor({ entityId: scene.id, blockId: body[0].id, start: 0, end: 2 }, scene.id, body, transform).positionStatus).toBe('unresolved');
    const known = buildTextTransform(body, after, { start: 0, end: 0 });
    expect(known.range(body[0].id, 0, 2)).toMatchObject({ start: 2, end: 4 });
  });

  it('keeps identical paragraphs attached to their stable IDs after explicit reorder', () => {
    const before: RichText = [{ id: newId(), kind: 'paragraph', text: '同じ段落' }, { id: newId(), kind: 'paragraph', text: '同じ段落' }];
    const transform = buildTextTransform(before, [before[1], before[0]]);
    expect(transform.range(before[0].id, 0, 2)).toEqual({ blockId: before[0].id, start: 0, end: 2 });
    expect(transform.range(before[1].id, 0, 2)).toEqual({ blockId: before[1].id, start: 0, end: 2 });
  });

  it('remaps a scene paragraph selection when its paragraph is merged', () => {
    const { project, body, scene } = fixture();
    const second = { id: newId(), kind: 'paragraph' as const, text: '続き' };
    const before = { ...scene, data: { ...scene.data, body: [...body, second], blockIds: [second.id] } };
    const after = { ...before, data: { ...before.data, body: editRichText(before.data.body, 'アオが歩く。続き', { start: 6, end: 7 }) } };
    const mapped = remapEditedTextReferences([after], before, after)[0] as Entity<'scene'>;
    expect(mapped.data.blockIds).toEqual([mapped.data.body[0].id]);
    project.entities = [mapped];
    // Remove fixture links to the character excluded from this minimal project.
    mapped.data.body[0].links = [];
    expect(validateProject(project).ok).toBe(true);
  });

  it('does not trust an inferred paragraph ID after untracked whole-paragraph duplication', () => {
    const { body, scene } = fixture('アオ');
    const after = editRichText(body, 'アオ\nアオ');
    expect(after.flatMap(block => block.ruby ?? [])).toEqual([]);
    expect(transformAnchor({ entityId: scene.id, blockId: body[0].id, start: 0, end: 2 }, scene.id, body, buildTextTransform(body, after)).positionStatus).toBe('unresolved');
    const selected = editRichText(body, 'アオ\nアオ', { start: 0, end: 0 });
    expect(selected[1]).toMatchObject({ id: body[0].id, ruby: body[0].ruby });
  });
  it('moves ruby, links and disclosure anchors by code points after prefix/emoji insertion', () => {
    const { body, scene } = fixture(), before = structuredClone(body);
    const next = editRichText(body, '昨日、😀アオが歩く。');
    expect(next[0].id).toBe(body[0].id);
    expect(next[0].ruby).toEqual([{ start: 4, end: 6, text: 'あお' }]);
    expect(next[0].links?.[0]).toMatchObject({ start: 4, end: 6 });
    expect(transformAnchor({ entityId: scene.id, blockId: body[0].id, start: 0, end: 2 }, scene.id, body, buildTextTransform(body, next))).toMatchObject({ blockId: body[0].id, start: 4, end: 6 });
    expect(body).toEqual(before);
    const markup = renderToStaticMarkup(createElement(RichTextView, { value: next }));
    expect(markup).toContain('昨日、😀');
    expect(markup).toContain('<button class="inline-link"');
    expect(markup).toContain('<ruby>アオ<rt>あお</rt></ruby>');
  });

  it('shifts annotations back after deletion strictly before them', () => {
    const { body } = fixture();
    const prefixed = editRichText(body, '昨日、アオが歩く。');
    expect(editRichText(prefixed, 'アオが歩く。')[0]).toMatchObject({ id: body[0].id, ruby: body[0].ruby, links: body[0].links });
  });

  it('detaches an overlapping replacement and keeps its reading, target and quoted text through archive restoration', async () => {
    const { project, body, scene, disclosure } = fixture();
    const edited = { ...scene, data: { ...scene.data, body: editRichText(body, 'クロが歩く。') } };
    project.entities = remapEditedTextReferences(project.entities.map(entity => entity.id === scene.id ? edited : entity), scene, edited);
    const current = project.entities.find(entity => entity.id === scene.id) as Entity<'scene'>;
    expect(current.data.body[0].ruby ?? []).toEqual([]);
    expect(current.data.body[0].links ?? []).toEqual([]);
    expect(current.data.body[0].unresolvedAnnotations).toEqual([
      expect.objectContaining({ kind: 'ruby', originalText: 'アオ', reading: 'あお' }),
      expect.objectContaining({ kind: 'link', originalText: 'アオ', target: body[0].links![0].target }),
    ]);
    const anchor = (project.entities.find(entity => entity.id === disclosure.id) as Entity<'disclosure'>).data.anchor;
    expect(anchor).toMatchObject({ positionStatus: 'unresolved', quotedText: 'アオ' });
    expect(anchor.start).toBeUndefined(); expect(anchor.end).toBeUndefined();
    expect(validateProject(project).ok).toBe(true);
    const archive = await exportScenario(project), restored = await inspectScenario(archive, { worker: false });
    expect(restored.project.entities).toEqual(project.entities);
  });

  it('does not guess which repeated name survived a destructive edit', () => {
    const { body, scene } = fixture('アオ、アオ');
    body[0].links!.push({ start: 3, end: 5, target: body[0].links![0].target });
    const ambiguous = editRichText(body, 'アオ');
    expect(ambiguous[0].links ?? []).toEqual([]);
    expect(ambiguous[0].unresolvedAnnotations).toHaveLength(3);
    expect(transformAnchor({ entityId: scene.id, blockId: body[0].id, start: 0, end: 2 }, scene.id, body, buildTextTransform(body, ambiguous)).positionStatus).toBe('unresolved');
    const selectedDeletion = editRichText(body, 'アオ', { start: 0, end: 3 });
    expect(selectedDeletion[0].links).toEqual([{ ...body[0].links![1], start: 0, end: 2 }]);
    expect(selectedDeletion[0].unresolvedAnnotations).toHaveLength(2);
  });

  it('preserves fixed IDs across a paragraph move and maps split/merged ranges to their real block', () => {
    const { body, scene } = fixture();
    const other = { id: newId(), kind: 'heading' as const, text: '前書き' }, combined = [other, ...body];
    const moved = editRichText(combined, 'アオが歩く。\n前書き');
    expect(moved.map(block => block.id)).toEqual([body[0].id, other.id]);
    expect(moved[0].links).toEqual(body[0].links);
    const split = editRichText(body, 'アオ\nが歩く。');
    expect(split[0].id).toBe(body[0].id);
    expect(split[0].ruby).toEqual(body[0].ruby);
    const anchor = { entityId: scene.id, blockId: body[0].id, start: 2, end: 4 };
    const splitAnchor = transformAnchor(anchor, scene.id, body, buildTextTransform(body, split));
    expect(splitAnchor).toMatchObject({ blockId: split[1].id, start: 0, end: 2 });
    const merged = editRichText(split, 'アオが歩く。');
    expect(transformAnchor(splitAnchor, scene.id, split, buildTextTransform(split, merged))).toMatchObject({ blockId: body[0].id, start: 2, end: 4 });
  });

  it('keeps an empty paragraph and explicitly unresolved references after deleting its complete text', () => {
    const { body, scene } = fixture(), empty = editRichText(body, '');
    expect(empty[0].id).toBe(body[0].id);
    expect(empty[0].unresolvedAnnotations).toHaveLength(2);
    const anchor = transformAnchor({ entityId: scene.id, blockId: body[0].id, start: 0, end: 2 }, scene.id, body, buildTextTransform(body, empty));
    expect(anchor).toMatchObject({ blockId: body[0].id, positionStatus: 'unresolved' });
    expect(anchor.start).toBeUndefined();
  });

  it('updates current disclosure/cue/line/relation anchors together and leaves pinned references unchanged', () => {
    const { project, body, scene, disclosure, character } = fixture();
    const cue = createEntity(project.projectId, 'cue', '', { anchor: structuredClone(disclosure.data.anchor), cueType: 'reading' });
    const pinned = createEntity(project.projectId, 'cue', '', { anchor: { ...disclosure.data.anchor, sourceVersionId: newId() }, cueType: 'reading' });
    const review = createEntity(project.projectId, 'review', '旧版の指摘', { target: structuredClone(disclosure.data.anchor), targetVersionId: newId() });
    const relation: Relation = { id: newId(), projectId: project.projectId, revision: '0', fromId: character.id, toId: scene.id, relationType: '参加', direction: 'forward', validity: { ...emptyValidity(), presentationAnchor: structuredClone(disclosure.data.anchor) }, evidenceIds: [], status: 'confirmed', visibility: 'private' };
    const edited = { ...scene, data: { ...scene.data, body: editRichText(body, '昨日、アオが歩く。') } };
    const entities = remapEditedTextReferences([...project.entities, cue, pinned, review].map(entity => entity.id === scene.id ? edited : entity), scene, edited);
    for (const id of [disclosure.id, cue.id]) expect((entities.find(entity => entity.id === id) as Entity<'cue'>).data.anchor).toMatchObject({ start: 3, end: 5 });
    expect((entities.find(entity => entity.id === pinned.id) as Entity<'cue'>).data.anchor).toEqual(pinned.data.anchor);
    expect((entities.find(entity => entity.id === review.id) as Entity<'review'>).data.target).toEqual(review.data.target);
    expect(remapEditedTextRelationReferences([relation], scene, edited)[0].validity.presentationAnchor).toMatchObject({ start: 3, end: 5 });
    const line = createEntity(project.projectId, 'dialogue_line', '', { text: body });
    const lineAnchor = { entityId: line.id, lineId: line.id, start: 0, end: 2 };
    expect(transformAnchor(lineAnchor, line.id, body, buildTextTransform(body, edited.data.body))).toMatchObject({ lineId: line.id, start: 3, end: 5 });
  });

  it('detaches repeated dialogue-line disclosure and assertion anchors even when the surviving text has the same spelling', () => {
    const { project, character } = fixture();
    const line = createEntity(project.projectId, 'dialogue_line', '', { text: [{ id: newId(), kind: 'paragraph', text: '😀アオ😀アオ', ruby: [{ start: 1, end: 3, text: 'あお' }], links: [{ start: 1, end: 3, target: { entityId: character.id } }] }] });
    const anchor = { entityId: line.id, lineId: line.id, start: 1, end: 3 };
    const disclosure = createEntity(project.projectId, 'disclosure', '', { foreshadowId: project.entities.find(entity => entity.kind === 'foreshadow')!.id, anchor });
    const assertion = createEntity(project.projectId, 'assertion', '', { subjectId: character.id, predicate: '名前', value: { type: 'text', value: 'アオ' }, evidenceLocation: structuredClone(anchor) });
    const after = { ...line, data: { ...line.data, text: editRichText(line.data.text, '😀アオ', { start: 0, end: 3 }) } };
    const mapped = remapEditedTextReferences([after, disclosure, assertion], line, after);
    expect(after.data.text[0].ruby ?? []).toEqual([]);
    expect(after.data.text[0].links ?? []).toEqual([]);
    expect((mapped[1] as Entity<'disclosure'>).data.anchor).toMatchObject({ positionStatus: 'unresolved', quotedText: 'アオ', lineId: line.id });
    expect((mapped[2] as Entity<'assertion'>).data.evidenceLocation).toMatchObject({ positionStatus: 'unresolved', quotedText: 'アオ' });
    expect((mapped[1] as Entity<'disclosure'>).data.anchor.start).toBeUndefined();
  });

  it('remaps schema-defined summaries, author notes, aliases and edits to a summary document', () => {
    const { project, scene, body, character, disclosure } = fixture();
    const linked = (): RichText => [{ id: newId(), kind: 'paragraph', text: '関連', links: [{ start: 0, end: 2, target: structuredClone(disclosure.data.anchor) }] }];
    character.data.summary = linked(); character.data.authorNotes = linked();
    character.data.aliases = [{ id: newId(), text: '青', reading: 'あお', isPublicDefault: true, audienceHolderIds: [], validity: { ...emptyValidity(), presentationAnchor: structuredClone(disclosure.data.anchor) } }];
    const after = { ...scene, data: { ...scene.data, body: editRichText(body, '昨日、アオが歩く。') } };
    const mapped = remapEditedTextReferences(project.entities.map(entity => entity.id === scene.id ? after : entity), scene, after);
    const mappedCharacter = mapped.find(entity => entity.id === character.id) as Entity<'character'>;
    expect(mappedCharacter.data.summary![0].links![0].target).toMatchObject({ start: 3, end: 5 });
    expect(mappedCharacter.data.authorNotes![0].links![0].target).toMatchObject({ start: 3, end: 5 });
    expect(mappedCharacter.data.aliases![0].validity.presentationAnchor).toMatchObject({ start: 3, end: 5 });
    const summary = [{ id: newId(), kind: 'paragraph' as const, text: 'アオの要約' }];
    scene.data.summary = summary; disclosure.data.anchor = { entityId: scene.id, blockId: summary[0].id, start: 0, end: 2 };
    const summaryEdited = { ...scene, data: { ...scene.data, summary: editRichText(summary, '😀アオの要約') } };
    expect((remapEditedTextReferences([summaryEdited, disclosure], scene, summaryEdited)[1] as Entity<'disclosure'>).data.anchor).toMatchObject({ start: 1, end: 3 });
  });

  it('retains the known edit origins across save for duplicate-prefix insertion and resolves current-version review targets', () => {
    const { project, scene, body, disclosure } = fixture('アオ');
    const review = createEntity(project.projectId, 'review', '現行版の指摘', { target: structuredClone(disclosure.data.anchor), targetVersionId: project.projectId });
    const inserted = editRichText(body, '😀アオアオ', { start: 0, end: 0 });
    const after = { ...scene, data: { ...scene.data, body: inserted } };
    expect(inserted[0].ruby?.[0]).toMatchObject({ start: 3, end: 5 });
    const mapped = remapEditedTextReferences([after, disclosure, review], scene, after);
    expect((mapped[1] as Entity<'disclosure'>).data.anchor).toMatchObject({ start: 3, end: 5 });
    expect((mapped[2] as Entity<'review'>).data.target).toMatchObject({ start: 3, end: 5 });
    const replaced = { ...scene, data: { ...scene.data, body: editRichText(body, 'イオ', { start: 0, end: 2 }) } };
    expect((remapEditedTextReferences([replaced, review], scene, replaced)[1] as Entity<'review'>).data.target).toMatchObject({ positionStatus: 'unresolved', quotedText: 'アオ' });
    // Input originating in a restored JSON buffer has no trustworthy edit origin.
    const untracked = { ...after, data: { ...after.data, body: structuredClone(inserted) } };
    expect((remapEditedTextReferences([untracked, disclosure], scene, untracked)[1] as Entity<'disclosure'>).data.anchor).toMatchObject({ positionStatus: 'unresolved' });
  });

  it('stops arrival atomically at an unresolved clue after save/reload without granting knowledge or claiming a passed inspection', async () => {
    const { project, scene, body, disclosure } = fixture();
    const variable = createEntity(project.projectId, 'variable', '知識', { key: 'knowledge', initial: { type: 'boolean', value: false } });
    const effect = createEntity(project.projectId, 'effect', '', { operation: 'set', targetId: variable.id, value: { type: 'boolean', value: true } });
    disclosure.data.knowledgeEffects = [effect.id];
    const entry = createEntity(project.projectId, 'flow_node', '入口', { nodeType: 'entry' });
    const clue = createEntity(project.projectId, 'flow_node', '手掛かり', { nodeType: 'scene', sceneId: scene.id });
    const end = createEntity(project.projectId, 'flow_node', '終端', { nodeType: 'terminal', terminalReason: '完了' });
    const entering = createEntity(project.projectId, 'flow_edge', '手掛かりへ', { fromId: entry.id, toId: clue.id, effectIds: [effect.id] });
    const finishing = createEntity(project.projectId, 'flow_edge', '終端へ', { fromId: clue.id, toId: end.id });
    const graph = createEntity(project.projectId, 'flow_graph', '進行', { nodeIds: [entry.id, clue.id, end.id], edgeIds: [entering.id, finishing.id], entryIds: [entry.id], exitIds: [] });
    project.entities.push(variable, effect, entry, clue, end, entering, finishing, graph);
    const after = { ...scene, data: { ...scene.data, body: editRichText(body, 'クロが歩く。') } };
    project.entities = remapEditedTextReferences(project.entities.map(entity => entity.id === scene.id ? after : entity), scene, after);
    const restored = (await inspectScenario(await exportScenario(project), { worker: false })).project;
    const initial = startTrial(restored), next = stepTrial(restored, initial, { edgeId: entering.id });
    expect(next.status).toBe('unknown');
    expect(next.issues).toContainEqual(expect.objectContaining({ code: 'CONDITION_UNKNOWN', path: `${disclosure.id}.anchor` }));
    expect(next.state).toEqual(initial.state);
    expect(next.trace).toEqual(initial.trace);
    expect(next.state.seenIds).not.toContain(disclosure.id);
    const directly = startTrial(restored, { entryId: clue.id });
    expect(directly.status).toBe('unknown');
    expect(directly.state.variableValues[variable.id]).toEqual({ type: 'boolean', value: false });
    expect(directly.state.seenIds).not.toContain(disclosure.id);
    expect(checkTrialForeshadows(restored, directly)).toContainEqual(expect.objectContaining({ status: 'unknown', targetId: disclosure.id }));
  });

  it('refuses runtime and playable exports for an unresolved active disclosure even when its author excludes it from projection', async () => {
    const { project, scene, disclosure } = fixture();
    disclosure.data.anchor = { entityId: scene.id, positionStatus: 'unresolved', positionReason: '変更範囲が重複', quotedText: 'PRIVATE_ORIGINAL_QUOTE' };
    const entry = createEntity(project.projectId, 'flow_node', '入口', { nodeType: 'entry', sceneId: scene.id });
    const end = createEntity(project.projectId, 'flow_node', '終端', { nodeType: 'terminal', terminalReason: '完了' });
    const edge = createEntity(project.projectId, 'flow_edge', '進む', { fromId: entry.id, toId: end.id });
    const graph = createEntity(project.projectId, 'flow_graph', '進行', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [] });
    const included = [scene, entry, end, edge, graph];
    const profile = createEntity(project.projectId, 'projection_profile', '公開範囲', { audience: 'reader', publicTitle: '公開作品', allowedKinds: [...new Set(included.map(entity => entity.kind))], includedIds: included.map(entity => entity.id), namePolicy: { byEntityId: Object.fromEntries(included.map(entity => [entity.id, { mode: 'replace' as const, replacement: entity.name }])) }, idPolicy: 'preserve', publicTexts: { [scene.id]: { body: [{ id: newId(), kind: 'paragraph', text: '公開する本文' }] }, [end.id]: { terminalReason: '完了' }, [edge.id]: { label: '進む' } } });
    project.entities.push(entry, end, edge, graph, profile); project.entities.forEach(entity => { entity.status = 'confirmed'; });
    for (const format of ['runtime_json', 'playable_preview'] as const) {
      const result = await exportProject(project, { projectionProfileId: profile.id, profile: format, targetRevision: project.revision });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('An unresolved runtime dependency must block export');
      expect(result.issues).toContainEqual(expect.objectContaining({ entityId: disclosure.id, field: 'anchor', code: 'EXPORT_UNSUPPORTED' }));
      expect(JSON.stringify(result)).not.toContain('PRIVATE_ORIGINAL_QUOTE');
    }
  });
});

it('remaps explicit current-version Unicode anchors while retaining historical anchors', () => {
  const { project, scene, body, disclosure } = fixture('アオ😀が歩く。');
  disclosure.data.anchor.sourceVersionId = project.projectId;
  const historical = createEntity(project.projectId, 'disclosure', '', { ...disclosure.data, anchor: { ...disclosure.data.anchor, sourceVersionId: newId() } });
  const changed = { ...scene, data: { ...scene.data, body: editRichText(body, '昨日、アオ😀が歩く。', { start: 0, end: 0 }) } };
  const result = remapEditedTextReferences([changed, disclosure, historical], scene, changed);
  expect((result[1] as Entity<'disclosure'>).data.anchor).toMatchObject({ start: 3, end: 5, sourceVersionId: project.projectId });
  expect((result[2] as Entity<'disclosure'>).data.anchor).toEqual(historical.data.anchor);
});
