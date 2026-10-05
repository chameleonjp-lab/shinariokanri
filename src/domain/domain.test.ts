import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import type { Condition, EffectData, Entity, EntityDataMap, EntityKind, ProjectData, TypedValue } from './types';
import { ENTITY_KINDS, KIND_LABELS, collectReferences, createDemoProject, createEntity, createProject, emptyRuntimeState, newId, rewriteEntityReferences, toJsonSchema, validateCondition, validateEntity, validateProject } from './model';
import { DomainValidationError, applyEffectsAtomic, conditionToText, evaluateCondition, evaluateExpression, initializeRuntimeState } from './conditions';
import { MAX_TICK, GREGORIAN_CALENDAR, addTicks, calendarDateToTick, compareTicks, formatRelativeTick, isTick, resolveTime, tickToCalendarDate, tickToScreen, validateCalendar } from './time';
import { getTrialChoices, pinTrialRecord, replaySavedTrace, startTrial, stepTrial, trialRecordData } from './runtime';

const hash = '0'.repeat(64);
function add<K extends EntityKind>(project: ProjectData, kind: K, data?: Partial<EntityDataMap[K]>, name = KIND_LABELS[kind]): Entity<K> {
  const entity = createEntity(project.projectId, kind, name, data); project.entities.push(entity); return entity;
}
function allKindsFixture(): ProjectData {
  const project = createProject('全種類固定データ'), byKind = new Map<EntityKind, Entity>();
  for (const kind of ENTITY_KINDS) byKind.set(kind, add(project, kind));
  const id = (kind: EntityKind): string => byKind.get(kind)!.id;
  const set = <K extends EntityKind>(kind: K, fields: Partial<EntityDataMap[K]>): void => { Object.assign(byKind.get(kind)!.data, fields); };
  set('goal', { ownerId: id('character') });
  set('flow_node', { nodeType: 'entry', executionPolicy: 'manual_choice' });
  set('flow_edge', { fromId: id('flow_node'), toId: id('flow_node'), effectIds: [id('effect')] });
  set('flow_graph', { nodeIds: [id('flow_node')], edgeIds: [id('flow_edge')], entryIds: [id('flow_node')], exitIds: [] });
  set('quest', { key: 'quest', stateVariableId: id('variable') });
  set('variable', { key: 'flag', initial: { type: 'boolean', value: false } });
  set('effect', { operation: 'mark_seen', targetId: id('note'), value: null });
  set('assertion', { subjectId: id('character'), predicate: '居場所', value: { type: 'ref', value: id('place') } });
  set('disclosure', { foreshadowId: id('foreshadow'), anchor: { entityId: id('scene') } });
  set('checkpoint', { contentVersionId: project.projectId, contentRevision: '0', runtimeState: emptyRuntimeState(project.projectId) });
  set('trace', { contentVersionId: project.projectId, startCheckpointId: id('checkpoint'), contentRevision: '0' });
  set('attachment', { mediaType: 'image/png', contentHash: hash, assetPath: `assets/${hash}.png`, provenanceId: id('source') });
  set('source', { locator: 'https://example.com', attachmentId: id('attachment') });
  set('cue', { anchor: { entityId: id('dialogue_line') }, cueType: 'narration' });
  set('storyboard_frame', { anchor: { entityId: id('scene') }, mediaStartMs: 0, mediaEndMs: 2000 });
  set('localization', { sourceLineId: id('dialogue_line'), language: 'ja', sourceHash: hash });
  set('recording', { sourceLineId: id('dialogue_line'), language: 'ja', sourceHash: hash });
  set('terminology', { canonical: '霧の門' });
  set('map', { placeId: id('place') });
  set('travel_route', { fromPlaceId: id('place'), toPlaceId: id('place'), minimumTicks: '0', maximumTicks: '10' });
  set('review', { target: id('note'), targetVersionId: id('snapshot') });
  set('decision', { subject: '企画判断', targetVersionId: id('snapshot') });
  set('gameplay_spec', { sceneId: id('scene') });
  set('production_task', { targetIds: [id('scene')] });
  set('media_variant', { baseSnapshotId: id('snapshot') });
  set('voice_rule', { characterId: id('character') });
  set('external_contract', { key: 'battle' });
  set('snapshot', { versionLabel: 'v1', contentHash: hash });
  set('projection_profile', { audience: '読者', includedIds: [id('character')] });
  return project;
}

describe('versioned entity and reference contracts', () => {
  it('validates a complete all-kind project and the interactive demo', () => {
    expect(ENTITY_KINDS).toHaveLength(43);
    const fixture = validateProject(allKindsFixture()); if (!fixture.ok) throw new Error(JSON.stringify(fixture.issues));
    expect(fixture.ok).toBe(true);
    const demo = validateProject(createDemoProject()); if (!demo.ok) throw new Error(JSON.stringify(demo.issues));
    expect(demo.ok).toBe(true);
  });
  it.each(ENTITY_KINDS)('rejects unknown payload fields for %s', kind => {
    const fixture = allKindsFixture(), entity = fixture.entities.find(entity => entity.kind === kind)!;
    expect(validateEntity(entity).ok).toBe(true);
    (entity.data as unknown as Record<string, unknown>).unexpected = 'silently dropping this loses content';
    const result = validateEntity(entity); expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some(issue => issue.path.endsWith('.unexpected'))).toBe(true);
  });
  it('preserves duplicate display names while refusing key and ID collisions', () => {
    const project = createProject(); const a = add(project, 'character', undefined, '同名'); add(project, 'character', undefined, '同名');
    expect(validateProject(project).ok).toBe(true);
    const variable = add(project, 'variable', { key: 'flag', initial: { type: 'boolean', value: false } });
    add(project, 'variable', { key: 'flag', initial: { type: 'boolean', value: true } });
    expect(validateProject(project).ok).toBe(false); project.entities.pop();
    variable.id = a.id; expect(validateProject(project).ok).toBe(false);
  });
  it('checks missing references, reference kinds, and project scope', () => {
    const project = createProject(), place = add(project, 'place'), event = add(project, 'event', { participants: [{ characterId: place.id, role: 'witness' }] });
    const wrongKind = validateProject(project); expect(wrongKind.ok).toBe(false);
    if (!wrongKind.ok) expect(wrongKind.issues.some(issue => issue.code === 'REFERENCE_INVALID')).toBe(true);
    event.data.participants = []; event.data.locationId = newId(); expect(validateProject(project).ok).toBe(false);
    event.data.locationId = place.id; event.projectId = newId(); expect(validateProject(project).ok).toBe(false);
  });
  it('checks explicit pinned world snapshots independently for old/current content', () => {
    const worldV1 = createProject('世界'), old = add(worldV1, 'character', { body: [{ id: newId(), kind: 'paragraph', text: '旧版' }] });
    const worldV2 = structuredClone(worldV1); (worldV2.entities[0] as Entity<'character'>).data.body![0].text = '新版';
    const v1 = newId(), v2 = newId(), project = createProject();
    project.worldReferences = [{ projectId: worldV1.projectId, immutableSnapshotId: v1, contentHash: hash }];
    add(project, 'event', { participants: [{ characterId: old.id, role: 'mentioned' }] });
    const options = { worldSnapshots: { [v1]: worldV1, [v2]: worldV2 } };
    expect(validateProject(project, options).ok).toBe(true);
    expect(validateProject(project).ok).toBe(false);
    expect(validateProject(project, { worldSnapshots: { [v1]: createProject('別世界') } }).ok).toBe(false);
  });
  it('rejects a world UUID collision before it can overwrite a local variable declaration', () => {
    const project = createProject('ローカル'), world = createProject('共通世界');
    const local = add(project, 'variable', { key: 'local_bool', initial: { type: 'boolean', value: true } }), foreign = add(world, 'variable', { key: 'world_int', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 100 } });
    foreign.id = local.id;
    add(project, 'flow_node', { nodeType: 'entry', gate: { op: 'compare', variableId: local.id, comparator: 'eq', value: { type: 'integer', value: 0 } } });
    expect(validateProject(project).ok).toBe(false); expect(validateProject(world).ok).toBe(true);
    const versionId = newId(); project.worldReferences.push({ projectId: world.projectId, immutableSnapshotId: versionId, contentHash: hash });
    const result = validateProject(project, { worldSnapshots: { [versionId]: world } }); expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some(issue => issue.code === 'REFERENCE_INVALID' && issue.message.includes('衝突'))).toBe(true);
  });
  it.each([
    ['entity', 'entity'], ['entity', 'relation'], ['relation', 'entity'], ['relation', 'relation'],
  ] as const)('rejects active local %s / world %s ID collisions in the shared record namespace', (localKind, foreignKind) => {
    const project = createProject('ローカル'), world = createProject('世界');
    const localNote = add(project, 'note'), worldNote = add(world, 'note');
    const relation = (content: ProjectData): ProjectData['relations'][number] => {
      const from = add(content, 'character'), to = add(content, 'character');
      const record = { id: newId(), projectId: content.projectId, revision: '0', fromId: from.id, toId: to.id, relationType: 'reference', direction: 'forward' as const, validity: { worldRange: null, routeCondition: null, presentationAnchor: null }, evidenceIds: [], status: 'confirmed' as const, visibility: 'private' as const }; content.relations.push(record); return record;
    };
    const localRelation = relation(project), worldRelation = relation(world);
    (foreignKind === 'entity' ? worldNote : worldRelation).id = (localKind === 'entity' ? localNote : localRelation).id;
    expect(validateProject(project).ok).toBe(true); expect(validateProject(world).ok).toBe(true);
    const version = newId(); project.worldReferences.push({ projectId: world.projectId, immutableSnapshotId: version, contentHash: hash });
    expect(validateProject(project, { worldSnapshots: { [version]: world } }).ok).toBe(false);
  });
  it('rejects two simultaneously active versions of one world even when they contain no records', () => {
    const project = createProject(), world = createProject('同じ世界'), oldVersion = newId(), newVersion = newId();
    project.worldReferences = [{ projectId: world.projectId, immutableSnapshotId: oldVersion, contentHash: hash }, { projectId: world.projectId, immutableSnapshotId: newVersion, contentHash: hash }];
    expect(validateProject(project, { worldSnapshots: { [oldVersion]: world, [newVersion]: structuredClone(world) } }).ok).toBe(false);
    project.worldReferences.pop(); expect(validateProject(project, { worlds: [world, structuredClone(world)] }).ok).toBe(false);
  });
  it('preserves the same world record IDs across separately pinned current, snapshot and history contexts', () => {
    const project = createProject('別々の版'), oldWorld = createProject('世界'), character = add(oldWorld, 'character', { body: [{ id: newId(), kind: 'paragraph', text: '旧版' }] });
    const newWorld = structuredClone(oldWorld); (newWorld.entities[0] as Entity<'character'>).data.body![0].text = '新版';
    const oldVersion = newId(), newVersion = newId();
    project.worldReferences = [{ projectId: oldWorld.projectId, immutableSnapshotId: oldVersion, contentHash: hash }];
    add(project, 'event', { participants: [{ characterId: character.id, role: 'mentioned' }] });
    const { history: _history, ...before } = structuredClone(project), { snapshots: _snapshots, ...oldContent } = structuredClone(before);
    project.worldReferences = [{ projectId: newWorld.projectId, immutableSnapshotId: newVersion, contentHash: hash }];
    project.snapshots.push({ id: newId(), versionLabel: '旧作品版', createdAt: new Date().toISOString(), contentHash: hash, content: oldContent });
    const { history: _afterHistory, ...after } = structuredClone(project);
    project.history.push({ operationId: newId(), projectId: project.projectId, baseRevision: '0', revision: '1', targetIds: [], reason: '世界の固定版更新', createdAt: new Date().toISOString(), before, after });
    // The unused world intentionally has an ID collision; it is outside every selected scope.
    const unusedWorld = createProject('未参照世界'); add(unusedWorld, 'note').id = project.entities[0].id;
    const result = validateProject(project, { worldSnapshots: { [oldVersion]: oldWorld, [newVersion]: newWorld, [newId()]: unusedWorld } });
    expect(result.ok, result.ok ? '' : JSON.stringify(result.issues)).toBe(true);
  });
  it('rejects cycles in parent trees, relative times, derived values and task dependencies', () => {
    const project = createProject(), a = add(project, 'place'), b = add(project, 'place', { parentId: a.id }); a.data.parentId = b.id;
    expect(validateProject(project).ok).toBe(false); a.data.parentId = null;
    const first = add(project, 'event'), second = add(project, 'event');
    first.data.time = { mode: 'relative', anchorEventId: second.id, anchorPoint: 'start', minOffset: '1', maxOffset: '1' };
    second.data.time = { mode: 'relative', anchorEventId: first.id, anchorPoint: 'end', minOffset: '1', maxOffset: '1' };
    expect(validateProject(project).ok).toBe(false); first.data.time = { mode: 'unknown', reason: '' }; second.data.time = { mode: 'unknown', reason: '' };
    const x = add(project, 'variable', { key: 'x', initial: { type: 'boolean', value: false } }), y = add(project, 'variable', { key: 'y', initial: { type: 'boolean', value: false } });
    x.data.derived = { op: 'variable', variableId: y.id }; y.data.derived = { op: 'variable', variableId: x.id };
    expect(validateProject(project).ok).toBe(false); x.data.derived = null; y.data.derived = null;
    const t1 = add(project, 'production_task'), t2 = add(project, 'production_task', { dependsOn: [t1.id] }); t1.data.dependsOn = [t2.id];
    expect(validateProject(project).ok).toBe(false);
  });
  it('counts Unicode code points in rich text spans and rejects invalid surrogate text', () => {
    const project = createProject(), character = add(project, 'character'), note = add(project, 'note', { body: [{ id: newId(), kind: 'paragraph', text: '漢😀字', ruby: [{ start: 1, end: 2, text: 'えもじ' }], links: [{ start: 0, end: 1, target: { entityId: character.id } }] }] });
    expect(validateProject(project).ok).toBe(true);
    note.data.body[0].ruby![0].end = 4; expect(validateProject(project).ok).toBe(false);
    note.data.body[0].ruby = []; note.data.body[0].text = '\ud800'; expect(validateProject(project).ok).toBe(false);
  });
  it('leaves text unchanged while rewriting typed refs, then moves dictionary keys safely', () => {
    const project = createProject(), source = add(project, 'character'), targetId = newId();
    const profile = add(project, 'projection_profile', { audience: '読者', includedIds: [source.id], publicTexts: { [source.id]: { body: [{ id: newId(), kind: 'paragraph', text: `原文のUUID ${source.id}`, links: [{ start: 0, end: 1, target: { entityId: source.id } }] }] } } });
    const cloned = rewriteEntityReferences(profile, new Map([[source.id, targetId]]));
    expect(cloned.data.includedIds).toEqual([targetId]);
    expect(cloned.data.publicTexts![targetId].body![0].text).toContain(source.id);
    expect(cloned.data.publicTexts![targetId].body![0].links![0].target.entityId).toBe(targetId);
    expect(profile.data.publicTexts![source.id]).toBeDefined();
    profile.data.publicTexts![targetId] = { label: '別の内容' };
    expect(() => rewriteEntityReferences(profile, new Map([[source.id, targetId]]))).toThrow(/衝突/);
    expect(collectReferences(profile).some(reference => reference.path.endsWith('.$key'))).toBe(true);
  });
  it('requires holder/source/terminal and rejects unsafe assets and false immutable snapshots', () => {
    const project = allKindsFixture(), assertion = project.entities.find((entity): entity is Entity<'assertion'> => entity.kind === 'assertion')!;
    assertion.data.truthKind = 'belief'; expect(validateEntity(assertion).ok).toBe(false);
    assertion.data.truthKind = 'testimony'; expect(validateEntity(assertion).ok).toBe(false);
    const terminal = add(project, 'flow_node', { nodeType: 'terminal' }); expect(validateEntity(terminal).ok).toBe(false);
    const attachment = project.entities.find((entity): entity is Entity<'attachment'> => entity.kind === 'attachment')!; attachment.data.assetPath = '../secret'; expect(validateEntity(attachment).ok).toBe(false);
    const snapshot = project.entities.find(entity => entity.kind === 'snapshot')!; (snapshot.data as unknown as Record<string, unknown>).immutable = false; expect(validateEntity(snapshot).ok).toBe(false);
  });
  it('keeps the portable schema artifact aligned with all executable field schemas', () => {
    const schema = JSON.parse(readFileSync(new URL('./schema.json', import.meta.url), 'utf8'));
    expect(schema).toEqual(toJsonSchema());
    expect(Object.keys(schema.$defs).filter(name => name.startsWith('Entity_'))).toHaveLength(43);
    expect(schema.$defs.Entity_variable.properties.data.required).toContain('initial');
  });
  it('compiles the actual JSON Schema and accepts all-kind/condition/query fixtures while rejecting unknown payloads', () => {
    const ajv = new Ajv2020({ strict: true, allowUnionTypes: true, validateFormats: false });
    const validate = ajv.compile(toJsonSchema()), fixture = allKindsFixture();
    const variable = fixture.entities.find((entity): entity is Entity<'variable'> => entity.kind === 'variable')!;
    const edge = fixture.entities.find((entity): entity is Entity<'flow_edge'> => entity.kind === 'flow_edge')!;
    edge.data.condition = { op: 'all', children: [{ op: 'any', children: [{ op: 'constant', value: true }, { op: 'constant', value: false }] }, { op: 'compare', variableId: variable.id, comparator: 'in', value: [{ type: 'boolean', value: true }, { type: 'boolean', value: false }] }] };
    const collection = fixture.entities.find((entity): entity is Entity<'collection'> => entity.kind === 'collection')!;
    collection.data.mode = 'dynamic'; collection.data.query = { op: 'all', children: [{ op: 'any', children: [{ op: 'kind', value: 'character' }, { op: 'text', value: '門' }] }] };
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    expect(validate(createDemoProject()), JSON.stringify(validate.errors)).toBe(true);
    (fixture.entities[0].data as unknown as Record<string, unknown>).unknownField = true;
    expect(validate(fixture)).toBe(false);
  });
  it('persists real demo trial records with block IDs in the complete seen state', () => {
    const project = createDemoProject(), session = startTrial(project), choice = getTrialChoices(project, session)[0], next = stepTrial(project, session, { edgeId: choice.edgeId });
    const checkpointId = newId(), record = trialRecordData(project, next, checkpointId), checkpoint = createEntity(project.projectId, 'checkpoint', '試読開始点', record.checkpoint);
    checkpoint.id = checkpointId;
    project.entities.push(checkpoint, createEntity(project.projectId, 'trace', '試読経路', record.trace));
    const validated = validateProject(project); expect(validated.ok, validated.ok ? '' : JSON.stringify(validated.issues)).toBe(true);
  });
  it('validates pinned checkpoint and trace refs against their own content after live body and node changes', () => {
    const project = createDemoProject(), start = startTrial(project), choice = getTrialChoices(project, start)[0], finished = stepTrial(project, start, { edgeId: choice.edgeId });
    const checkpointId = newId(), snapshotId = newId(), pinned = pinTrialRecord(finished, { checkpointId, snapshotId });
    const checkpoint = createEntity(project.projectId, 'checkpoint', '固定試読開始点', pinned.checkpoint); checkpoint.id = checkpointId;
    const trace = createEntity(project.projectId, 'trace', '固定試読経路', pinned.trace);
    project.snapshots.push({ id: snapshotId, versionLabel: '固定試読版', contentHash: hash, createdAt: new Date().toISOString(), content: pinned.content }); project.entities.push(checkpoint, trace);
    for (const entity of project.entities) if (entity.kind === 'scene') entity.data.body = [];
    // Even stable flow IDs may now be tombstones; evidence stays fixed to the immutable content.
    const oldNode = project.entities.find((entity): entity is Entity<'flow_node'> => entity.kind === 'flow_node')!; oldNode.deletedAt = new Date().toISOString(); oldNode.deletionOperationId = newId();
    const result = validateProject(project); expect(result.ok, result.ok ? '' : JSON.stringify(result.issues)).toBe(true);
    expect(replaySavedTrace(project, trace.id).issues).toEqual([]);
  });
  it('retains review and explicit source-version anchors when live text is replaced', () => {
    const project = createProject('本文の元版'), note = add(project, 'note', { body: [{ id: newId(), kind: 'paragraph', text: '古い😀本文' }] });
    const blockId = note.data.body[0].id, versionId = newId(), { snapshots: _snapshots, history: _history, ...content } = structuredClone(project);
    project.snapshots.push({ id: versionId, versionLabel: 'v1', createdAt: new Date().toISOString(), contentHash: hash, content });
    const review = add(project, 'review', { target: { entityId: note.id, blockId, start: 2, end: 3 }, targetVersionId: versionId });
    add(project, 'cue', { anchor: { entityId: note.id, blockId, sourceVersionId: versionId, start: 0, end: 1 }, cueType: 'reading' });
    note.data.body = [{ id: newId(), kind: 'paragraph', text: '新しい本文' }];
    const result = validateProject(project); expect(result.ok, result.ok ? '' : JSON.stringify(result.issues)).toBe(true);
    (review.data.target as { end: number }).end = 100; expect(validateProject(project).ok).toBe(false);
  });
  it('validates snapshot metadata, content and project ownership inside both sides of every history command', () => {
    const project = createProject('履歴検査'), { history: _history, ...state } = structuredClone(project);
    project.history.push({ operationId: newId(), projectId: project.projectId, baseRevision: '0', revision: '1', targetIds: [], reason: '', createdAt: new Date().toISOString(), before: structuredClone(state), after: structuredClone(state) });
    const malformed = { id: newId(), versionLabel: 'BAD', contentHash: hash, createdAt: new Date().toISOString(), content: { BROKEN_UNKNOWN_FIELD: true } };
    project.history[0].after.snapshots.push(malformed as never);
    const result = validateProject(project); expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some(issue => issue.path.includes('history[0].after.snapshots[0].content'))).toBe(true);
    project.history[0].after.snapshots = []; project.history[0].before.snapshots.push({ ...malformed, content: { ...state, projectId: newId() } } as never);
    expect(validateProject(project).ok).toBe(false);
  });
});

describe('lossless world time and calendars', () => {
  it.each(['+1', '-0', '01', '-01', '1.5', '1e3', '9'.repeat(39), 123, null])('rejects noncanonical tick %s', value => { expect(isTick(value)).toBe(false); });
  it('round-trips negative 38-digit ticks and rejects arithmetic overflow', () => {
    const tick = `-${'9'.repeat(38)}`; expect(isTick(tick)).toBe(true); expect(addTicks(tick, '1')).toBe((-(MAX_TICK - 1n)).toString());
    expect(compareTicks('9007199254740993', '9007199254740992')).toBe(1);
    expect(() => addTicks(MAX_TICK.toString(), '1')).toThrow(RangeError);
    expect(tickToScreen('9007199254740993', '9007199254740992', '1')).toBe(1);
    expect(formatRelativeTick(tick, '0')).toBe(`−${'9'.repeat(38)}`);
  });
  it('handles astronomical year zero, Gregorian leap rules and negative days without JS Date', () => {
    expect(calendarDateToTick({ year: '0', month: 1, day: 1 })).toBe('0');
    expect(tickToCalendarDate('-1')).toEqual({ year: '-1', month: 12, day: 31, tickOfDay: '86399' });
    expect(calendarDateToTick({ year: '0', month: 2, day: 29 })).toBe((59n * 86400n).toString());
    expect(() => calendarDateToTick({ year: '1900', month: 2, day: 29 })).toThrow(/存在しない/);
    expect(() => calendarDateToTick({ year: '2000', month: 2, day: 29 })).not.toThrow();
    for (const year of ['-1000000000', '-400', '-1', '0', '1', '400', '2000', '1000000000']) {
      const date = { year, month: 12, day: 31, tickOfDay: '12345' };
      expect(tickToCalendarDate(calendarDateToTick(date))).toEqual(date);
    }
  });
  it('uses bounded repeating custom calendars for years before and after the origin', () => {
    const custom = { id: 'custom', name: '霧暦', kind: 'repeating' as const, originLabel: '原点', ticksPerDay: '100', years: [{ months: [{ name: '霧', days: 10 }, { name: '晴', days: 20 }] }, { months: [{ name: '霧', days: 11 }, { name: '晴', days: 20 }] }] };
    expect(validateCalendar(custom).ok).toBe(true);
    expect(tickToCalendarDate('-1', custom)).toEqual({ year: '-1', month: 2, day: 20, tickOfDay: '99' });
    for (const year of ['-999999999', '-2', '-1', '0', '1', '2', '999999999']) { const date = { year, month: 2, day: 20, tickOfDay: '0' }; expect(tickToCalendarDate(calendarDateToTick(date, custom), custom)).toEqual(date); }
    expect(validateCalendar({ ...custom, years: Array(401).fill(custom.years[0]) }).ok).toBe(false);
    expect(validateCalendar({ ...GREGORIAN_CALENDAR, ticksPerDay: '1' }).ok).toBe(false);
  });
  it('resolves relative uncertainty, rejects cycles and keeps unresolved anchors unknown', () => {
    const project = createProject(), anchor = add(project, 'event', { time: { mode: 'uncertain', earliest: '-100', latest: '-90', calendarId: project.calendarId, precision: 'およそ' } });
    const relative = add(project, 'event', { time: { mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'end', minOffset: '2', maxOffset: '5' } });
    expect(resolveTime(relative.data.time, [anchor, relative])).toMatchObject({ status: 'resolved', earliest: '-98', latest: '-85' });
    anchor.data.time = { mode: 'unknown', reason: '調査中' }; expect(resolveTime(relative.data.time, [anchor, relative]).status).toBe('unknown');
    anchor.data.time = { mode: 'relative', anchorEventId: relative.id, anchorPoint: 'start', minOffset: '0', maxOffset: '0' };
    expect(resolveTime(relative.data.time, [anchor, relative]).status).toBe('conflict');
  });
  it('rejects fixed time conflicts and does not mutate world time when the display origin changes', () => {
    const project = createProject(), a = add(project, 'event', { time: { mode: 'instant', at: '-10', calendarId: project.calendarId } }), b = add(project, 'event', { time: { mode: 'instant', at: '-20', calendarId: project.calendarId } });
    a.data.constraints = [{ type: 'before', targetEventId: b.id }]; expect(validateProject(project).ok).toBe(false);
    a.data.constraints = []; const before = structuredClone(a.data.time); project.mainStart = '100'; expect(validateProject(project).ok).toBe(true); expect(a.data.time).toEqual(before);
  });
  it('rejects constraint cycles and reversed gaps while dates remain unknown, and accepts half-open adjacency', () => {
    const project = createProject(), a = add(project, 'event'), b = add(project, 'event');
    a.data.constraints = [{ type: 'before', targetEventId: b.id }]; b.data.constraints = [{ type: 'before', targetEventId: a.id }];
    const cyclic = validateProject(project); expect(cyclic.ok).toBe(false); if (!cyclic.ok) expect(cyclic.issues.some(issue => issue.code === 'TIME_CONSTRAINT_CONFLICT')).toBe(true);
    b.data.constraints = []; a.data.constraints = [{ type: 'end_gap', targetEventId: b.id, minimumTicks: '5', maximumTicks: '1' }]; expect(validateProject(project).ok).toBe(false);
    a.data.constraints = [{ type: 'before', targetEventId: b.id }]; a.data.time = { mode: 'interval', start: '0', end: '10', calendarId: project.calendarId }; b.data.time = { mode: 'instant', at: '10', calendarId: project.calendarId };
    expect(validateProject(project).ok).toBe(true);
  });
});

describe('typed three-valued conditions and atomic effects', () => {
  it.each([
    ['all', false, 'false'], ['all', true, 'unknown'], ['any', true, 'true'], ['any', false, 'unknown'],
  ] as const)('evaluates %s(%s,unknown) = %s', (op, known, expected) => {
    const condition: Condition = { op, children: [{ op: 'constant', value: known }, { op: 'external', contractId: newId() }] };
    expect(evaluateCondition(condition, { state: emptyRuntimeState(newId()) }).value).toBe(expected);
  });
  it('preserves unknown through not and missing values, and rejects type errors even behind false', () => {
    const state = emptyRuntimeState(newId()), id = newId();
    expect(evaluateCondition({ op: 'not', child: { op: 'compare', variableId: id, comparator: 'eq', value: { type: 'boolean', value: false } } }, { state }).value).toBe('unknown');
    state.variableValues[id] = { type: 'boolean', value: true };
    expect(() => evaluateCondition({ op: 'all', children: [{ op: 'constant', value: false }, { op: 'compare', variableId: id, comparator: 'lt', value: { type: 'integer', value: 2 } }] }, { state })).toThrow(DomainValidationError);
    expect(evaluateCondition(undefined, { state }).value).toBe('true');
  });
  it('bounds AST depth/node count and refuses unknown operators, fields and expression strings', () => {
    let condition: Condition = { op: 'constant', value: true };
    for (let i = 0; i < 15; i++) condition = { op: 'not', child: condition };
    expect(validateCondition(condition).ok).toBe(true); expect(validateCondition({ op: 'not', child: condition }).ok).toBe(false);
    expect(validateCondition({ op: 'all', children: Array(255).fill({ op: 'constant', value: true }) }).ok).toBe(true);
    expect(validateCondition({ op: 'all', children: Array(256).fill({ op: 'constant', value: true }) }).ok).toBe(false);
    for (const bad of ['process.exit()', { op: 'eval', value: 'true' }, { op: 'constant', value: true, secret: 1 }, { op: 'all', children: [] }]) expect(validateCondition(bad).ok).toBe(false);
  });
  it('renders nested parentheses and evaluates integer in/enum comparisons', () => {
    const state = emptyRuntimeState(newId()), flag = newId(); state.variableValues[flag] = { type: 'integer', value: 2 };
    const condition: Condition = { op: 'all', children: [{ op: 'compare', variableId: flag, comparator: 'in', value: [{ type: 'integer', value: 1 }, { type: 'integer', value: 2 }] }, { op: 'any', children: [{ op: 'constant', value: true }, { op: 'constant', value: false }] }] };
    expect(evaluateCondition(condition, { state }).value).toBe('true'); expect(conditionToText(condition, { [flag]: '好感度' })).toContain('(真 または 偽)');
  });
  it('re-evaluates derived values from the current snapshot and rejects derived cycles', () => {
    const project = createProject(), node = add(project, 'flow_node'), derived = add(project, 'variable', { key: 'was_here', initial: { type: 'unknown', value: null, reason: '' }, derived: { op: 'visited', entityId: node.id, count: 1 } });
    const state = initializeRuntimeState(project), context = { state, entities: project.entities };
    const condition: Condition = { op: 'compare', variableId: derived.id, comparator: 'eq', value: { type: 'boolean', value: true } };
    expect(evaluateCondition(condition, context).value).toBe('false'); state.visitCounts[node.id] = 1; expect(evaluateCondition(condition, context).value).toBe('true');
    derived.data.derived = { op: 'variable', variableId: derived.id }; expect(() => evaluateCondition(condition, context)).toThrow(/循環/);
    expect(() => evaluateExpression({ op: 'multiply', left: { op: 'value', value: { type: 'integer', value: Number.MAX_SAFE_INTEGER } }, right: { op: 'value', value: { type: 'integer', value: 2 } } }, context)).toThrow(/範囲/);
  });
  it('does not infer knowledge from participation or author truth', () => {
    const project = createProject(), holder = add(project, 'character'), assertion = add(project, 'assertion', { subjectId: holder.id, predicate: '真実', value: { type: 'boolean', value: true }, truthKind: 'author_truth' });
    add(project, 'event', { participants: [{ characterId: holder.id, role: 'witness' }] });
    const state = initializeRuntimeState(project); expect(state.assertions).toEqual([]);
    expect(evaluateCondition({ op: 'known', assertionId: assertion.id, holderId: holder.id }, { state, entities: project.entities }).value).toBe('false');
  });
  it('applies effects in order against a working copy and rolls the full group back on overflow', () => {
    const project = createProject(), value = add(project, 'variable', { key: 'count', valueType: 'integer', initial: { type: 'integer', value: 1 }, allowed: { min: 0, max: 5 } });
    const state = initializeRuntimeState(project), context = { state, entities: project.entities };
    const effects: EffectData[] = [{ operation: 'add', targetId: value.id, value: { type: 'integer', value: 2 } }, { operation: 'add', targetId: value.id, value: { type: 'integer', value: 2 } }];
    const ok = applyEffectsAtomic(state, effects, context); expect(ok.ok).toBe(true); if (ok.ok) expect(ok.state.variableValues[value.id]).toEqual({ type: 'integer', value: 5 });
    expect(state.variableValues[value.id]).toEqual({ type: 'integer', value: 1 });
    effects.push({ operation: 'add', targetId: value.id, value: { type: 'integer', value: 1 } });
    const failed = applyEffectsAtomic(state, effects, context); expect(failed.ok).toBe(false); expect(failed.state).toBe(state);
  });
  it('blocks forbidden enum transitions as a group and allows explicit reset', () => {
    const project = createProject(), status = add(project, 'variable', { key: 'quest_status', valueType: 'enum', initial: { type: 'enum', value: 'completed' }, allowed: { values: ['unaccepted', 'active', 'completed'] }, transitionRules: [{ from: { type: 'enum', value: 'unaccepted' }, to: { type: 'enum', value: 'active' } }, { from: { type: 'enum', value: 'active' }, to: { type: 'enum', value: 'completed' } }] });
    const state = initializeRuntimeState(project), context = { state, entities: project.entities }, effect: EffectData = { operation: 'set', targetId: status.id, value: { type: 'enum', value: 'unaccepted' } };
    const blocked = applyEffectsAtomic(state, [effect], context); expect(blocked.ok).toBe(false); expect(blocked.state).toBe(state);
    const reset = applyEffectsAtomic(state, [{ ...effect, operation: 'reset' }], context); expect(reset.ok).toBe(true);
    const explained = applyEffectsAtomic(state, [{ ...effect, reason: '意図した再受注の例外' }], context); expect(explained.ok).toBe(true);
  });
  it('uses sequential effect conditions and rolls back an unknown condition', () => {
    const project = createProject(), flag = add(project, 'variable', { key: 'flag', initial: { type: 'boolean', value: false } }), seen = add(project, 'note');
    const state = initializeRuntimeState(project), context = { state, entities: project.entities };
    const effects: EffectData[] = [{ operation: 'set', targetId: flag.id, value: { type: 'boolean', value: true } }, { operation: 'mark_seen', targetId: seen.id, condition: { op: 'compare', variableId: flag.id, comparator: 'eq', value: { type: 'boolean', value: true } } }];
    const applied = applyEffectsAtomic(state, effects, context); expect(applied.ok).toBe(true); if (applied.ok) expect(applied.state.seenIds).toContain(seen.id);
    effects.push({ operation: 'mark_seen', targetId: seen.id, condition: { op: 'external', contractId: newId() } });
    const failed = applyEffectsAtomic(state, effects, context); expect(failed.ok).toBe(false); expect(failed.state).toBe(state);
    if (!failed.ok) expect(failed.issues[0].code).toBe('CONDITION_UNKNOWN');
  });
  it('grants deterministic stacks, rejects duplicate individual ownership, and refuses moving consumed items', () => {
    const project = createProject(), type = add(project, 'item'), instance = add(project, 'item', { itemMode: 'instance', typeId: type.id }), holder = add(project, 'character');
    const state = initializeRuntimeState(project), context = { state, entities: project.entities }, grant: EffectData = { operation: 'grant', targetId: type.id, value: { type: 'integer', value: 2 } };
    expect(applyEffectsAtomic(state, [grant], context)).toEqual(applyEffectsAtomic(state, [grant], context));
    const duplicate = applyEffectsAtomic(state, [{ operation: 'grant', targetId: instance.id }, { operation: 'grant', targetId: instance.id }], context); expect(duplicate.ok).toBe(false); expect(duplicate.state).toBe(state);
    const gone = applyEffectsAtomic(state, [{ operation: 'grant', targetId: instance.id }, { operation: 'consume', targetId: instance.id, reason: '扉で壊れた' }, { operation: 'move', targetId: instance.id, value: { type: 'ref', value: holder.id } }], context);
    expect(gone.ok).toBe(false); expect(gone.state).toBe(state);
  });
  it.each(['consume', 'move'] as const)('rejects a foreign type individual in %s before changing any inventory', operation => {
    const project = createProject(), a = add(project, 'item', undefined, 'A'), b = add(project, 'item', undefined, 'B'), individual = add(project, 'item', { itemMode: 'instance', typeId: b.id }, 'B個体'), owner = add(project, 'character');
    const state = initializeRuntimeState(project); state.itemInstances.push({ instanceId: individual.id, typeId: b.id, quantity: 1, ownerId: null, locationId: null, consumed: false });
    const effect = add(project, 'effect', { operation, targetId: a.id, instanceId: individual.id, value: operation === 'move' ? { type: 'ref', value: owner.id } : { type: 'integer', value: 1 }, reason: '試験消費' });
    const validation = validateProject(project); expect(validation.ok).toBe(false);
    const applied = applyEffectsAtomic(state, [effect], { state, entities: project.entities }); expect(applied.ok).toBe(false); expect(applied.state).toBe(state);
  });
  it('rejects direct writes to derived variables and retains missing initial values as unknown', () => {
    const project = createProject(), derived = add(project, 'variable', { key: 'derived', derived: { op: 'constant', value: true }, initial: { type: 'unknown', value: null, reason: '算出' } }), missing = add(project, 'variable', { key: 'missing' });
    const state = initializeRuntimeState(project); expect(state.variableValues[missing.id].type).toBe('unknown');
    expect(applyEffectsAtomic(state, [{ operation: 'set', targetId: derived.id, value: { type: 'boolean', value: false } }], { state, entities: project.entities }).ok).toBe(false);
  });
});
