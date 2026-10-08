import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { createEntity, createProject, newId, textToRichText } from '../domain/model';
import { createWorldSnapshot, previewWorldVersion } from '../domain/world';
import { exportScenario, inspectScenario } from './archive';
import { ScenarioStore, type FaultStage } from './store';

const stores: ScenarioStore[] = [];
afterEach(async () => { for (const store of stores.splice(0)) await store.deleteDatabase(); });
function store(faultInjector?: (stage: FaultStage) => void) { const value = new ScenarioStore({ databaseName: `world-pin-${newId()}`, faultInjector }); stores.push(value); return value; }
async function fixture() {
  const world = createProject('共通世界'); world.entities.push(createEntity(world.projectId, 'character', '固定版の人物'));
  const fixed = await createWorldSnapshot(world, '第一版');
  return { fixed, id: fixed.snapshots[0].id };
}
it('atomically pins immutable world content and preserves it through undo and full restore', async () => {
  const db = store(), { fixed, id } = await fixture();
  const initial = (await db.saveProject(createProject('作品'), { reason: '開始' })).project;
  const preview = await previewWorldVersion(initial, fixed, id, [fixed.entities[0].id]);
  const saved = await db.saveProject(preview.candidate, { reason: '世界版を固定', worldPin: { world: fixed, snapshotId: id } });
  expect(saved.project.entities).toHaveLength(0);
  const archive = await inspectScenario(await db.exportProject(initial.projectId), { worker: false });
  expect(archive.worlds[id].entities[0].name).toBe('固定版の人物');
  expect(archive.worlds[id].history).toEqual([]);
  const undone = await db.undo(initial.projectId, saved.operationId);
  expect(undone.project.worldReferences).toEqual([]);
  const afterUndo = await inspectScenario(await db.exportProject(initial.projectId), { worker: false });
  expect(afterUndo.worlds[id].snapshots[0].contentHash).toBe(fixed.snapshots[0].contentHash);
  const restored = store(); await restored.importScenario(afterUndo, { mode: 'new' });
  expect((await restored.getProject(initial.projectId))?.history).toHaveLength(3);
});
it('rolls back world registry and author command together and rejects modified immutable pins', async () => {
  let fail = false; const db = store(stage => { if (fail && stage === 'after-history') throw new Error('injected'); });
  const { fixed, id } = await fixture(), initial = (await db.saveProject(createProject('作品'), { reason: '開始' })).project;
  const candidate = (await previewWorldVersion(initial, fixed, id)).candidate;
  fail = true; await expect(db.saveProject(candidate, { reason: '固定', worldPin: { world: fixed, snapshotId: id } })).rejects.toThrow();
  expect((await db.getProject(initial.projectId))?.worldReferences).toEqual([]);
  expect(await db.listWorldSnapshots()).toEqual({});
  expect((await db.listOutbox(initial.projectId))).toHaveLength(1);
  fail = false; const saved = await db.saveProject(candidate, { reason: '再試行', worldPin: { world: fixed, snapshotId: id } });
  const changed = structuredClone(fixed); changed.snapshots[0].content.entities[0].name = '書換';
  await expect(db.saveProject(saved.project, { reason: '不正な版', worldPin: { world: changed, snapshotId: id } })).rejects.toThrow();
  expect((await db.getProject(initial.projectId))?.revision).toBe(saved.project.revision);
});

it('pins transitive world places and rejects conflicting active versions of the same world', async () => {
  const db = store(), nested = createProject('基層の世界');
  const place = createEntity(nested.projectId, 'place', '深い世界の場所'); nested.entities.push(place);
  const first = await createWorldSnapshot(nested, '基層1'), a = first.snapshots[0];
  const outer = createProject('外側の世界'); outer.worldReferences.push({ projectId: nested.projectId, immutableSnapshotId: a.id, contentHash: a.contentHash });
  const fixed = await createWorldSnapshot(outer, '外側1'), id = fixed.snapshots[0].id;
  const initial = (await db.saveProject(createProject('作品'), { reason: '開始' })).project;
  const candidate = (await previewWorldVersion(initial, fixed, id, [], [first])).candidate;
  const pinned = (await db.saveProject(candidate, { reason: '階層世界を固定', worldPin: { world: fixed, snapshotId: id, dependencies: { [a.id]: first } } })).project;
  const event = createEntity(pinned.projectId, 'event', '借用した場所で出来事', { locationId: place.id });
  const saved = (await db.saveProject({ ...pinned, entities: [event] }, { reason: '場所を参照' })).project;
  const archive = await inspectScenario(await db.exportProject(saved.projectId), { worker: false });
  expect(archive.project.entities[0].kind === 'event' && archive.project.entities[0].data.locationId).toBe(place.id);
  expect(archive.worlds[a.id].entities[0].id).toBe(place.id);
  const second = await createWorldSnapshot(first, '基層2'), b = second.snapshots[1];
  const mixed = { ...saved, worldReferences: [...saved.worldReferences, { projectId: nested.projectId, immutableSnapshotId: b.id, contentHash: b.contentHash }] };
  await expect(db.saveProject(mixed, { reason: '矛盾する版', worldPin: { world: second, snapshotId: b.id } })).rejects.toThrow();
});
it('retains cited earlier snapshots of the selected world without its mutable draft or history', async () => {
  const db = store(), world = createProject('引用する世界'), place = createEntity(world.projectId, 'place', '旧版の場所'); world.entities.push(place);
  const first = await createWorldSnapshot(world, '旧版'), old = first.snapshots[0];
  const body = textToRichText('旧版への引用'); body[0].links = [{ start: 0, end: 2, target: { entityId: place.id, sourceVersionId: old.id } }];
  first.entities.push(createEntity(first.projectId, 'note', '引用メモ', { body }));
  const second = await createWorldSnapshot(first, '引用付き新版'), id = second.snapshots[1].id;
  const initial = (await db.saveProject(createProject('作品'), { reason: '開始' })).project;
  const candidate = (await previewWorldVersion(initial, second, id)).candidate;
  const saved = (await db.saveProject(candidate, { reason: '引用付き世界を固定', worldPin: { world: second, snapshotId: id } })).project;
  const archive = await inspectScenario(await db.exportProject(saved.projectId), { worker: false });
  expect(archive.worlds[id].snapshots.find(value => value.id === old.id)).toEqual(old);
  expect(archive.worlds[id].history).toEqual([]);
  expect(archive.worlds[id].entities.some(entity => entity.kind === 'snapshot' && entity.id === id)).toBe(false);
});

it('rejects conflicting calendar definitions without saving a world pin', async () => {
  const db = store(), world = createProject('世界');
  world.calendars.push({ id: 'shared-custom-calendar', name: '独自暦', kind: 'repeating', originLabel: '元年', ticksPerDay: '1', years: [{ months: [{ name: '月', days: 100 }] }] });
  const fixed = await createWorldSnapshot(world, '版1'), id = fixed.snapshots[0].id;
  const work = createProject('作品'); work.calendars.push({ ...world.calendars[1], kind: 'repeating', years: [{ months: [{ name: '月', days: 10 }] }] });
  const initial = (await db.saveProject(work, { reason: '開始' })).project;
  const candidate = { ...initial, worldReferences: [{ projectId: fixed.projectId, immutableSnapshotId: id, contentHash: fixed.snapshots[0].contentHash }] };
  await expect(db.saveProject(candidate, { reason: '衝突する暦', worldPin: { world: fixed, snapshotId: id } })).rejects.toThrow();
  expect(await db.listWorldSnapshots()).toEqual({});
  expect((await db.getProject(work.projectId))?.revision).toBe(initial.revision);
});

it('validates local event constraints against frozen world events in the same atomic save', async () => {
  const db = store(), world = createProject('時点の世界');
  const anchor = createEntity(world.projectId, 'event', '固定された出来事', { time: { mode: 'instant', at: '100', calendarId: world.calendarId } }); world.entities.push(anchor);
  const fixed = await createWorldSnapshot(world, '時点1'), id = fixed.snapshots[0].id;
  const initial = (await db.saveProject(createProject('作品'), { reason: '開始' })).project;
  const candidate = (await previewWorldVersion(initial, fixed, id)).candidate;
  const pinned = (await db.saveProject(candidate, { reason: '固定', worldPin: { world: fixed, snapshotId: id } })).project;
  const impossible = createEntity(pinned.projectId, 'event', '矛盾する日時', { time: { mode: 'instant', at: '150', calendarId: pinned.calendarId }, constraints: [{ type: 'before', targetEventId: anchor.id }] });
  await expect(db.saveProject({ ...pinned, entities: [impossible] }, { reason: '不可能な制約' })).rejects.toThrow();
  const legal = { ...impossible, data: { ...impossible.data, time: { mode: 'instant' as const, at: '50', calendarId: pinned.calendarId } } };
  const saved = (await db.saveProject({ ...pinned, entities: [legal] }, { reason: '固定時点より前' })).project;
  expect(saved.entities).toHaveLength(1);
  expect((await db.listWorldSnapshots())[id].entities[0]).toEqual(anchor);
});

it('protects retained immutable snapshot IDs globally across different registry keys', async () => {
  const db = store(), source = createProject('先に保存した世界');
  source.entities.push(createEntity(source.projectId, 'place', '引用される場所'));
  const first = await createWorldSnapshot(source, '旧版'), old = first.snapshots[0];
  const body = textToRichText('引用'); body[0].links = [{ start: 0, end: 1, target: { entityId: source.entities[0].id, sourceVersionId: old.id } }];
  first.entities.push(createEntity(first.projectId, 'note', '旧版を引用', { body }));
  const second = await createWorldSnapshot(first, '新版'), selected = second.snapshots[1];
  const initial = (await db.saveProject(createProject('本編'), { reason: '開始' })).project;
  const candidate = (await previewWorldVersion(initial, second, selected.id)).candidate;
  const saved = (await db.saveProject(candidate, { reason: '新版を固定', worldPin: { world: second, snapshotId: selected.id } })).project;
  const other = await createWorldSnapshot(createProject('衝突する別世界'), '別の版'); other.snapshots[0].id = old.id;
  const mixed = { ...saved, worldReferences: [...saved.worldReferences, { projectId: other.projectId, immutableSnapshotId: old.id, contentHash: other.snapshots[0].contentHash }] };
  await expect(db.saveProject(mixed, { reason: '保持版IDの衝突', worldPin: { world: other, snapshotId: old.id } })).rejects.toThrow();
  expect(Object.keys(await db.listWorldSnapshots())).toEqual([selected.id]);
  expect((await db.getProject(saved.projectId))?.revision).toBe(saved.revision);
  await db.saveProject(saved, { reason: '同一の不変内容は再参照できる', worldPin: { world: second, snapshotId: selected.id } });
});

it('checks retained snapshot identities again when a world import races another pin commit', async () => {
  const db = store(), world = createProject('並行して固定する世界'), place = createEntity(world.projectId, 'place', '場所'); world.entities.push(place);
  const first = await createWorldSnapshot(world, '旧版'), old = first.snapshots[0];
  const body = textToRichText('引用'); body[0].links = [{ start: 0, end: 1, target: { entityId: place.id, sourceVersionId: old.id } }];
  first.entities.push(createEntity(first.projectId, 'note', '引用メモ', { body }));
  const second = await createWorldSnapshot(first, '新版'), selected = second.snapshots[1];
  const other = await createWorldSnapshot(createProject('別の世界'), '衝突する版'), originalId = other.snapshots[0].id;
  other.snapshots[0].id = old.id; other.entities = other.entities.map(entity => entity.id === originalId ? { ...entity, id: old.id } : entity);
  const imported = createProject('読み込む作品'); imported.worldReferences.push({ projectId: other.projectId, immutableSnapshotId: old.id, contentHash: other.snapshots[0].contentHash });
  const prepared = await inspectScenario(await exportScenario(imported, { worlds: { [old.id]: other } }), { worker: false });
  const initial = (await db.saveProject(createProject('編集する作品'), { reason: '開始' })).project;
  const candidate = (await previewWorldVersion(initial, second, selected.id)).candidate;
  let signal!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => { signal = resolve; }), resumed = new Promise<void>(resolve => { release = resolve; });
  const original = db.previewImport.bind(db);
  const pause = vi.spyOn(db, 'previewImport').mockImplementation(async (value, options) => { const preview = await original(value, options); signal(); await resumed; return preview; });
  const pending = db.importScenario(prepared, { mode: 'new' });
  await reached;
  await db.saveProject(candidate, { reason: '先に不変版を固定', worldPin: { world: second, snapshotId: selected.id } });
  release(); await expect(pending).rejects.toThrow(); pause.mockRestore();
  expect(await db.getProject(imported.projectId)).toBeUndefined();
  expect(Object.keys(await db.listWorldSnapshots())).toEqual([selected.id]);
});
