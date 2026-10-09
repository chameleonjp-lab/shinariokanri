import { describe, expect, it } from 'vitest';
import type { Entity, ProjectData, ProjectSnapshot, Relation, Validity } from '../src/domain/types';
import { createEntity, createProject, emptyRuntimeState, emptyValidity, newId, validateProject } from '../src/domain/model';
import { assessWorldValidity, compatibleLocations, createWorldSnapshot, effectiveWorldContent, previewWorldVersion, setPublicAliasPolicy, worldDisplayName, worldStateCandidates } from '../src/domain/world';
import { conditionContradiction, inspectWorldCandidates } from '../src/domain/worldCheck';
import { alignGraphPositions, buildRelationGraph } from '../src/domain/relationGraph';
import { worldTimeConsequences } from '../src/domain/worldTimeImpact';
import { worldSnapshotContents } from '../src/storage/archive';

function add<K extends Entity['kind']>(project: ProjectData, kind: K, name: string, data: Partial<Entity<K>['data']> = {}): Entity<K> { const entity = createEntity(project.projectId, kind, name, data) as Entity<K>; entity.status = 'confirmed'; project.entities.push(entity); return entity; }
const period = (start: string | null, end: string | null): Validity => ({ ...emptyValidity(), worldRange: { start, end } });
function assertion(project: ProjectData, subjectId: string, predicate: string, value: string, validity: Validity = emptyValidity()) { return add(project, 'assertion', `${predicate}の記録`, { subjectId, predicate, value, truthKind: 'author_truth', validity, sourceIds: [] }); }
function relation(project: ProjectData, fromId: string, toId: string, type = 'trust', validity = emptyValidity()): Relation { const result: Relation = { id: newId(), projectId: project.projectId, revision: '0', fromId, toId, relationType: type, direction: 'forward', validity, evidenceIds: [], status: 'provisional', visibility: 'private' }; project.relations.push(result); return result; }
function frozenEnvelope(snapshot: ProjectSnapshot): ProjectData { return { ...structuredClone(snapshot.content), snapshots: [structuredClone(snapshot)], history: [] }; }

describe('shared world point assessment', () => {
  it('uses half-open time ranges, unknown routes, and explicit recorded state', () => {
    const p = createProject(), variable = add(p, 'variable', '道', { key: 'route', valueType: 'integer', initial: { type: 'integer', value: 1 }, allowed: { min: 0, max: 1 }, scope: 'run' });
    const validity = { ...period('-10', '10'), routeCondition: { op: 'compare' as const, variableId: variable.id, comparator: 'eq' as const, value: { type: 'integer' as const, value: 1 } } };
    expect(assessWorldValidity(validity, { at: '0' }).value).toBe('unknown');
    const state = emptyRuntimeState(p.projectId); state.variableValues[variable.id] = { type: 'integer', value: 1 };
    const context = { state, variables: [variable] };
    expect(assessWorldValidity(validity, { at: '-10', context }).value).toBe('true');
    expect(assessWorldValidity(validity, { at: '10', context }).value).toBe('false');
    expect(assessWorldValidity(period(null, null)).value).toBe('true');
    expect(assessWorldValidity({ ...emptyValidity(), routeCondition: { op: 'constant', value: false } }).value).toBe('false');
  });
  it('retains conflicting histories and keeps testimony distinct from author truth', () => {
    const p = createProject(), person = add(p, 'character', '人物'), a = add(p, 'group', '組織A'), b = add(p, 'group', '組織B');
    const first = assertion(p, person.id, 'member_of', a.id, period('-100', '0')), second = assertion(p, person.id, 'member_of', b.id, period('0', '100'));
    expect(worldStateCandidates(p, person.id, 'member_of', { at: '0' }).definite.map(candidate => candidate.assertion.id)).toEqual([second.id]);
    expect(worldStateCandidates(p, person.id, 'member_of').status).toBe('possible');
    const belief = assertion(p, person.id, 'member_of', a.id); belief.data.truthKind = 'belief'; belief.data.holderId = person.id;
    expect(worldStateCandidates(p, person.id, 'member_of', { at: '0' }).status).toBe('known');
    expect(worldStateCandidates(p, person.id, 'member_of', { at: '0' }, person.id).definite[0].assertion.id).toBe(belief.id);
    first.data.validity = period(null, '100'); expect(worldStateCandidates(p, person.id, 'member_of', { at: '0' }).status).toBe('multiple');
  });
  it('selects names by holder/time without falling back to a secret real name', () => {
    const p = createProject(), person = add(p, 'character', '秘密の本名'), viewer = add(p, 'character', '知っている人物');
    const fake = { id: newId(), text: '旅人', reading: 'たびびと', validity: period('-100', '0'), audienceHolderIds: [], isPublicDefault: true }, real = { id: newId(), text: '秘密の本名', reading: '', validity: emptyValidity(), audienceHolderIds: [viewer.id], isPublicDefault: false };
    person.data.aliases = [fake, real];
    expect(worldDisplayName(person, { at: '-1', publicOnly: true }).name).toBe('旅人');
    const unknown = worldDisplayName(person, { at: '1', publicOnly: true }); expect(unknown.name).not.toContain(person.name); expect(unknown.candidates).toEqual([]);
    expect(worldDisplayName(person, { at: '1', holderId: viewer.id }).name).toBe(person.name);
    const profile = add(p, 'projection_profile', '公開', { audience: 'reader', includedIds: [person.id], namePolicy: { mode: 'replace', replacement: '人物' } });
    expect(setPublicAliasPolicy(profile, person.id, fake.id).data.namePolicy).toMatchObject({ byEntityId: { [person.id]: { mode: 'alias', aliasId: fake.id } } });
    const unnamed = add(p, 'character', '公開前の別の本名'); expect(worldDisplayName(unnamed, { publicOnly: true }).name).toBe('公開名未選択'); expect(worldDisplayName(unnamed, { holderId: viewer.id }).candidates).toEqual([]);
  });
});

describe('world context before applying date changes', () => {
  it('previews age, membership, related scenes and retained immutable versions', async () => {
    let before = createProject(); before.calendars = [{ id: 'hundred-day-year', name: '百日年', kind: 'repeating', originLabel: '原点', ticksPerDay: '1', years: [{ months: [{ name: '月', days: 100 }] }] }]; before.calendarId = before.calendars[0].id;
    const person = add(before, 'character', '人物', { birth: { mode: 'instant', at: '0', calendarId: before.calendarId } }), a = add(before, 'group', '古い所属'), b = add(before, 'group', '新しい所属'); assertion(before, person.id, 'member_of', a.id, period('0', '100')); assertion(before, person.id, 'member_of', b.id, period('100', '200'));
    const event = add(before, 'event', '登場', { time: { mode: 'instant', at: '50', calendarId: before.calendarId }, participants: [{ characterId: person.id, role: 'actor' }] }), scene = add(before, 'scene', '関連場面', { eventIds: [event.id] }); before = await createWorldSnapshot(before, '固定版');
    const after = { ...before, entities: before.entities.map(entity => entity.id === event.id ? { ...event, data: { ...event.data, time: { mode: 'instant' as const, at: '150', calendarId: before.calendarId } } } : entity) };
    const report = worldTimeConsequences(before, after, [{ eventId: event.id, before: { status: 'resolved', mode: 'instant', earliest: '50', latest: '50', endEarliest: '50', endLatest: '50', calendarId: before.calendarId }, after: { status: 'resolved', mode: 'instant', earliest: '150', latest: '150', endEarliest: '150', endLatest: '150', calendarId: before.calendarId }, reason: '変更', fixed: false }]);
    expect(report.lives[0].before[0]).toMatchObject({ life: { age: '0歳' }, memberships: [a.name] }); expect(report.lives[0].after[0]).toMatchObject({ life: { age: '1歳' }, memberships: [b.name] }); expect(report.linkedIds).toContain(scene.id); expect(report.fixedSnapshotIds).toEqual([before.snapshots[0].id]); expect(after.snapshots).toEqual(before.snapshots);
  });
});

describe('immutable shared-world versions', () => {
  it('rejects conflicting same-ID calendar definitions before applying a world pin', async () => {
    let world = createProject('百日年の世界'); world.calendars = [{ id: 'shared-custom-calendar', kind: 'repeating', name: '共有暦', originLabel: '原点', ticksPerDay: '1', years: [{ months: [{ name: '月', days: 100 }] }] }]; world.calendarId = world.calendars[0].id; const person = add(world, 'character', '世界の人物', { birth: { mode: 'instant', at: '0', calendarId: world.calendarId } }); world = await createWorldSnapshot(world, '世界版');
    const work = createProject('十日年の作品'); work.calendars = structuredClone(world.calendars); work.calendarId = world.calendarId; if (work.calendars[0].kind === 'repeating') work.calendars[0].years[0].months[0].days = 10;
    await expect(previewWorldVersion(work, world, world.snapshots[0].id, [person.id])).rejects.toThrow('同じ暦ID'); expect(work.worldReferences).toEqual([]);
    work.calendars = structuredClone(world.calendars); expect((await previewWorldVersion(work, world, world.snapshots[0].id, [person.id])).canApply).toBe(true);
  });
  it('keeps immutable citations when the current world pin changes, while mixed current references still block', async () => {
    let world = createProject('引用先の世界'); const place = add(world, 'place', '保存した街'); world = await createWorldSnapshot(world, '引用版'); const first = world.snapshots[0];
    const work = (await previewWorldVersion(createProject('引用する作品'), world, first.id)).candidate;
    const pinned = add(work, 'note', '旧版だけの引用', { body: [{ id: newId(), kind: 'paragraph', text: '旧い街の引用', links: [{ start: 0, end: 1, target: { entityId: place.id, sourceVersionId: first.id } }] }] });
    world.entities = world.entities.map(entity => entity.id === place.id ? { ...entity, deletedAt: new Date().toISOString(), deletionOperationId: newId() } : entity); world = await createWorldSnapshot(world, '街を除外した版'); const second = world.snapshots[1];
    const worlds = { [first.id]: frozenEnvelope(first), [second.id]: frozenEnvelope(second) }, validation = { worldSnapshots: worldSnapshotContents(worlds) };
    expect(validateProject(work, validation).ok).toBe(true);
    const preview = await previewWorldVersion(work, frozenEnvelope(second), second.id, [], Object.values(worlds));
    expect(preview.canApply).toBe(true); expect(preview.brokenReferenceIds).not.toContain(pinned.id); expect(preview.affectedIds).not.toContain(pinned.id); expect(validateProject(preview.candidate, validation).ok).toBe(true); expect(preview.candidate.entities.find(entity => entity.id === pinned.id)).toEqual(pinned);
    const mixed = add(work, 'note', '現在版と旧版の引用', { body: [{ id: newId(), kind: 'paragraph', text: '別々の参照', links: [{ start: 0, end: 1, target: { entityId: place.id, sourceVersionId: first.id } }, { start: 1, end: 2, target: { entityId: place.id } }] }] });
    expect(validateProject(work, validation).ok).toBe(true);
    const blocked = await previewWorldVersion(work, frozenEnvelope(second), second.id, [], Object.values(worlds)); expect(blocked.canApply).toBe(false); expect(blocked.brokenReferenceIds).toContain(mixed.id); expect(blocked.brokenReferenceIds).not.toContain(pinned.id);
  });
  it('resolves separately stored immutable envelopes and diffs transitive frozen worlds', async () => {
    let nested = createProject('入れ子の世界'); const place = add(nested, 'place', '旧い街'); nested = await createWorldSnapshot(nested, '入れ子1'); const nested1 = nested.snapshots[0];
    nested.entities = nested.entities.map(entity => entity.id === place.id ? { ...entity, name: '新しい街' } : entity); nested = await createWorldSnapshot(nested, '入れ子2'); const nested2 = nested.snapshots[1];
    let world = createProject('世界'); const lore = add(world, 'lore', '設定'); world.worldReferences = [{ projectId: nested.projectId, immutableSnapshotId: nested1.id, contentHash: nested1.contentHash }]; world = await createWorldSnapshot(world, '世界1'); const first = world.snapshots[0];
    const sources = [frozenEnvelope(first), frozenEnvelope(nested1), frozenEnvelope(nested2)];
    const work = (await previewWorldVersion(createProject('作品'), frozenEnvelope(first), first.id, [lore.id], sources)).candidate; const event = add(work, 'event', '入れ子の街を参照する出来事', { locationId: place.id });
    world.worldReferences = [{ projectId: nested.projectId, immutableSnapshotId: nested2.id, contentHash: nested2.contentHash }]; world = await createWorldSnapshot(world, '世界2'); const second = world.snapshots[1];
    const envelopes = [frozenEnvelope(second), ...sources];
    expect(effectiveWorldContent(work, envelopes).entities.find(entity => entity.id === place.id)?.name).toBe('旧い街');
    const preview = await previewWorldVersion(work, frozenEnvelope(second), second.id, [lore.id], envelopes);
    expect(preview.differences.find(difference => difference.id === place.id)).toMatchObject({ change: 'changed', after: { name: '新しい街' } }); expect(preview.affectedIds).toContain(event.id);
    expect(effectiveWorldContent(preview.candidate, envelopes).entities.find(entity => entity.id === place.id)?.name).toBe('新しい街');
    expect(work.entities.some(entity => entity.projectId !== work.projectId)).toBe(false); expect(work.worldReferences[0].immutableSnapshotId).toBe(first.id);
    await expect(previewWorldVersion(work, frozenEnvelope(second), second.id, [], [frozenEnvelope(first), frozenEnvelope(nested2)])).rejects.toThrow('すべての固定版');
  });
  it('pins a frozen version, previews revised sources and never rewrites old works', async () => {
    let world = createProject('共通世界'); const place = add(world, 'place', '旧名'), person = add(world, 'character', '人物');
    world = await createWorldSnapshot(world, '第一版'); const first = world.snapshots[0];
    const old = createProject('旧作品'), initial = await previewWorldVersion(old, world, first.id, [place.id, person.id]);
    expect(initial.canApply).toBe(true); const oldWork = initial.candidate, retained = structuredClone(oldWork);
    const event = add(oldWork, 'event', '世界内の出来事', { locationId: place.id });
    world.entities = world.entities.map(entity => entity.id === place.id ? { ...entity, name: '新名' } : entity); world = await createWorldSnapshot(world, '第二版');
    expect(effectiveWorldContent(oldWork, [world]).entities.find(entity => entity.id === place.id)?.name).toBe('旧名');
    const preview = await previewWorldVersion(oldWork, world, world.snapshots[1].id, [place.id]);
    expect(preview.differences.find(diff => diff.id === place.id)?.change).toBe('changed'); expect(preview.affectedIds).toContain(event.id);
    expect(oldWork.worldReferences).toEqual(retained.worldReferences); expect(preview.candidate.worldReferences[0].immutableSnapshotId).toBe(world.snapshots[1].id);
    expect(first.content.entities.find(entity => entity.id === place.id)?.name).toBe('旧名');
  });
  it('blocks corrupt versions and adoption of missing or archived referenced settings', async () => {
    let world = createProject('世界'); const place = add(world, 'place', '街'); world = await createWorldSnapshot(world, '1');
    const work = (await previewWorldVersion(createProject(), world, world.snapshots[0].id)).candidate; const event = add(work, 'event', '場面', { locationId: place.id });
    const view = { id: newId(), name: '世界の場所を含む表示', view: 'relation_graph', entityIds: [place.id], settings: {} }; work.views.push(view);
    world.entities = world.entities.map(entity => entity.id === place.id ? { ...entity, deletedAt: new Date().toISOString(), deletionOperationId: newId() } : entity); world = await createWorldSnapshot(world, '2');
    const preview = await previewWorldVersion(work, world, world.snapshots[1].id); expect(preview.canApply).toBe(false); expect(preview.brokenReferenceIds).toContain(event.id); expect(preview.brokenReferenceIds).toContain(view.id); expect(preview.affectedIds).toContain(view.id);
    await expect(previewWorldVersion(work, world, world.snapshots[1].id, [place.id])).rejects.toThrow('選択した世界版');
    const corrupt = structuredClone(world); corrupt.snapshots[1].content.name = '改竄'; await expect(previewWorldVersion(work, corrupt, corrupt.snapshots[1].id)).rejects.toThrow('hash');
    await expect(previewWorldVersion(world, world, world.snapshots[0].id)).rejects.toThrow('自身');
  });
});

describe('evidence-bearing world checks', () => {
  it('respects an exclusive event end at the earliest death boundary', () => {
    const p = createProject(), actor = add(p, 'character', '人物', { birth: { mode: 'instant', at: '0', calendarId: p.calendarId }, death: { mode: 'instant', at: '10', calendarId: p.calendarId } });
    const event = add(p, 'event', '登場', { time: { mode: 'interval', start: '0', end: '10', calendarId: p.calendarId }, participants: [{ characterId: actor.id, role: 'actor' }] });
    const appearances = () => inspectWorldCandidates(p).candidates.filter(candidate => candidate.kind === 'after_death');
    expect(validateProject(p).ok).toBe(true); expect(appearances()).toEqual([]);
    event.data.time = { mode: 'instant', at: '10', calendarId: p.calendarId }; expect(appearances()[0]?.certainty).toBe('supported');
    event.data.time = { mode: 'interval', start: '0', end: '11', calendarId: p.calendarId }; expect(appearances()[0]?.certainty).toBe('uncertain');
    actor.data.death = { mode: 'uncertain', earliest: '10', latest: '12', calendarId: p.calendarId, precision: '推定' };
    event.data.time = { mode: 'interval', start: '0', end: '10', calendarId: p.calendarId }; expect(appearances()).toEqual([]);
    event.data.time = { mode: 'instant', at: '10', calendarId: p.calendarId }; expect(appearances()[0]?.certainty).toBe('uncertain');
    event.data.time = { mode: 'interval', start: '0', end: '11', calendarId: p.calendarId }; expect(appearances()[0]?.certainty).toBe('uncertain');
    event.data.time = { mode: 'instant', at: '12', calendarId: p.calendarId }; expect(appearances()[0]?.certainty).toBe('supported');
  });
  it('ignores mentioned/common participation and compatible place containment', () => {
    const p = createProject(), actor = add(p, 'character', '行動人物'), mention = add(p, 'character', '言及人物'), root = add(p, 'place', '街'), building = add(p, 'place', '建物', { parentId: root.id }), other = add(p, 'place', '別の街');
    add(p, 'event', '街', { time: { mode: 'interval', start: '0', end: '20', calendarId: p.calendarId }, locationId: root.id, laneRole: 'both', participants: [{ characterId: actor.id, role: 'actor' }, { characterId: mention.id, role: 'mentioned' }] });
    add(p, 'event', '建物', { time: { mode: 'interval', start: '0', end: '20', calendarId: p.calendarId }, locationId: building.id, participants: [{ characterId: actor.id, role: 'witness' }] });
    const elsewhere = add(p, 'event', '別の街', { time: { mode: 'instant', at: '10', calendarId: p.calendarId }, locationId: other.id, participants: [{ characterId: mention.id, role: 'actor' }] });
    expect(inspectWorldCandidates(p).candidates.filter(candidate => candidate.kind === 'location')).toEqual([]);
    elsewhere.data.participants!.push({ characterId: actor.id, role: 'actor' });
    expect(inspectWorldCandidates(p).candidates.some(candidate => candidate.kind === 'location' && candidate.certainty === 'supported')).toBe(true);
    expect(compatibleLocations(building.id, root.id, new Map(p.entities.map(entity => [entity.id, entity])))).toBe(true);
  });
  it('reports travel as unconfirmed until method/minimum/evidence are declared', () => {
    const p = createProject(), actor = add(p, 'character', '人物'), a = add(p, 'place', '出発'), b = add(p, 'place', '到着'), evidence = add(p, 'source', '距離の根拠', { sourceType: 'observation', locator: '旅程の記録' });
    const first = add(p, 'event', '出発', { time: { mode: 'instant', at: '0', calendarId: p.calendarId }, locationId: a.id, participants: [{ characterId: actor.id, role: 'actor' }] }), second = add(p, 'event', '到着', { time: { mode: 'instant', at: '100', calendarId: p.calendarId }, locationId: b.id, participants: [{ characterId: actor.id, role: 'actor' }] });
    const route = add(p, 'travel_route', '徒歩', { fromPlaceId: a.id, toPlaceId: b.id, direction: 'one_way', minimumTicks: '200' });
    let found = inspectWorldCandidates(p).candidates.find(candidate => candidate.kind === 'travel')!; expect(found.certainty).toBe('uncertain'); expect(found.reason).toContain('断定しません');
    route.data.method = '徒歩'; route.data.evidence = [evidence.id]; found = inspectWorldCandidates(p).candidates.find(candidate => candidate.kind === 'travel')!; expect(found.certainty).toBe('supported'); expect(found.evidenceIds).toEqual(expect.arrayContaining([route.id, evidence.id, first.id, second.id]));
    route.data.minimumTicks = '50'; expect(inspectWorldCandidates(p).candidates.filter(candidate => candidate.kind === 'travel')).toEqual([]);
  });
  it('checks item instances and records intentional appearances with their reason and validity', () => {
    const p = createProject(), dead = add(p, 'character', '死亡人物', { death: { mode: 'instant', at: '0', calendarId: p.calendarId } }), b = add(p, 'character', '所持人物'), instance = add(p, 'item', '唯一の剣', { itemMode: 'instance' }), type = add(p, 'item', '剣の種類', { itemMode: 'type' });
    for (const item of [instance, type]) { assertion(p, item.id, 'owner', dead.id, period('0', '100')); assertion(p, item.id, 'owner', b.id, period('0', '100')); }
    const event = add(p, 'event', '回想', { time: { mode: 'instant', at: '10', calendarId: p.calendarId }, participants: [{ characterId: dead.id, role: 'actor' }] });
    let report = inspectWorldCandidates(p, { at: '10' }); expect(report.candidates.filter(candidate => candidate.kind === 'ownership')).toHaveLength(1); expect(report.candidates.find(candidate => candidate.kind === 'after_death')?.certainty).toBe('supported');
    const exception = assertion(p, dead.id, 'appearance_exception', '回想', period('5', '20')); exception.data.value = { type: 'enum', value: 'flashback' }; exception.data.reason = '過去の記憶を見せる'; exception.data.sourceIds = [event.id];
    report = inspectWorldCandidates(p, { at: '10' }); const found = report.candidates.find(candidate => candidate.kind === 'after_death')!; expect(found.certainty).toBe('intentional'); expect(found.reason).toContain(exception.data.reason); expect(found.evidenceIds).toContain(exception.id);
  });
  it('proves only explicit literal condition contradictions and declares a capped analysis', () => {
    const variableId = newId(); expect(conditionContradiction({ op: 'all', children: [{ op: 'compare', variableId, comparator: 'eq', value: { type: 'integer', value: 1 } }, { op: 'compare', variableId, comparator: 'eq', value: { type: 'integer', value: 2 } }] })).toBeDefined();
    expect(conditionContradiction({ op: 'all', children: [{ op: 'external', contractId: newId() }, { op: 'compare', variableId, comparator: 'eq', value: { type: 'unknown', value: null, reason: '未登録' } }] })).toBeUndefined();
    const p = createProject(), actor = add(p, 'character', '人物'); for (let i = 0; i < 5; i++) { const place = add(p, 'place', `場所${i}`); add(p, 'event', `出来事${i}`, { time: { mode: 'interval', start: '0', end: '10', calendarId: p.calendarId }, locationId: place.id, participants: [{ characterId: actor.id, role: 'actor' }] }); }
    const report = inspectWorldCandidates(p, { maximumPairs: 2 }); expect(report.complete).toBe(false); expect(report.candidates.some(candidate => candidate.kind === 'analysis_limit')).toBe(true); expect(validateProject(p).ok).toBe(true);
  });
});

describe('graph projection and layout', () => {
  it('retains uncertainty in relative participation, location and item projections', () => {
    const p = createProject(), actor = add(p, 'character', '人物'), place = add(p, 'place', '場所'), item = add(p, 'item', '物品');
    const anchor = add(p, 'event', '基準', { time: { mode: 'instant', at: '0', calendarId: p.calendarId } });
    const event = add(p, 'event', '相対日時', { time: { mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'start', minOffset: '0', maxOffset: '10' }, participants: [{ characterId: actor.id, role: 'actor' }], locationId: place.id, itemIds: [item.id] });
    const eventLines = (at: string, includeUnknown = true) => buildRelationGraph(p, { at, includeUnknown }).lines.filter(line => line.sourceId === event.id && [actor.id, place.id, item.id].includes(line.toId));
    expect(validateProject(p).ok).toBe(true);
    for (const at of ['0', '5', '10']) { expect(eventLines(at).map(line => line.assessment.value)).toEqual(['unknown', 'unknown', 'unknown']); expect(eventLines(at, false)).toEqual([]); }
    expect(eventLines('-1')).toEqual([]); expect(eventLines('11')).toEqual([]);
    event.data.time = { mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'start', minOffset: '3', maxOffset: '3' };
    expect(eventLines('3').map(line => line.assessment.value)).toEqual(['true', 'true', 'true']); expect(eventLines('4')).toEqual([]);
    anchor.data.time = { mode: 'uncertain', earliest: '0', latest: '10', calendarId: p.calendarId, precision: '推定' };
    for (const at of ['3', '5', '13']) { expect(eventLines(at).map(line => line.assessment.value)).toEqual(['unknown', 'unknown', 'unknown']); expect(eventLines(at, false)).toEqual([]); }
    expect(eventLines('14')).toEqual([]); expect(validateProject(p).ok).toBe(true);
  });
  it('scopes one/two hops without creating reverse or transitive relations', () => {
    const p = createProject(), a = add(p, 'character', 'A'), b = add(p, 'character', 'B'), c = add(p, 'character', 'C'), d = add(p, 'character', 'D'); const ab = relation(p, a.id, b.id), bc = relation(p, b.id, c.id); relation(p, c.id, d.id);
    const one = buildRelationGraph(p, { category: 'characters', focusId: a.id, hops: 1 }); expect(one.lines.map(line => line.id)).toEqual([ab.id]); expect(one.hiddenLines).toBe(2);
    const two = buildRelationGraph(p, { category: 'characters', focusId: a.id, hops: 2 }); expect(two.lines.map(line => line.id)).toEqual([ab.id, bc.id]); expect(two.lines.some(line => line.fromId === a.id && line.toId === c.id)).toBe(false);
    ab.validity = period('0', '10'); expect(buildRelationGraph(p, { at: '10', category: 'characters' }).lines.map(line => line.id)).not.toContain(ab.id);
  });
  it('points derived production and scene lines to their exact editing source', () => {
    const p = createProject(), event = add(p, 'event', '出来事'), scene = add(p, 'scene', '場面', { eventIds: [event.id] }), first = add(p, 'production_task', '先行作業'), second = add(p, 'production_task', '後続作業', { dependsOn: [first.id], targetIds: [scene.id] });
    const graph = buildRelationGraph(p); const dependency = graph.lines.find(line => line.fromId === first.id && line.toId === second.id)!; expect(dependency).toMatchObject({ sourceId: second.id, sourcePath: 'data.dependsOn[0]', direction: 'forward', origin: 'derived' }); expect(graph.lines.find(line => line.fromId === scene.id && line.toId === event.id)).toMatchObject({ sourceId: scene.id, sourcePath: 'data.eventIds[0]' });
    const before = structuredClone(p), positions = alignGraphPositions([first.id, second.id], { [first.id]: { x: 100, y: 100 } }, 'row'); expect(positions[second.id]).toEqual({ x: 320, y: 100 }); expect(p).toEqual(before);
  });
});
