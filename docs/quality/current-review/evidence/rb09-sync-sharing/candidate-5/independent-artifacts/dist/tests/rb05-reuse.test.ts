import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, validateProject } from '../src/domain/model';
import { prepareReuse, resolveReuseContent, reuseTargetAnchor } from '../src/domain/reuse';
import { startTrialVerified, replaySavedTraceVerified } from '../src/domain/runtimeVerified';
import { pinTrialRecord, stepTrial, backTrial } from '../src/domain/runtime';
import { startChapterReading, presentNextChapterScene, pinChapterReadingRecord, replayChapterReading } from '../src/domain/presentation';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { cloneProject, ScenarioStore } from '../src/storage/store';
import { jsonBytes, sha256 } from '../src/storage/json';
import type { Entity, EntityKind, ProjectData } from '../src/domain/types';
import { createProjection } from '../src/domain/projection';
import { collectImportIds, planCrossProjectImport } from '../src/storage/importMapping';
function add<K extends EntityKind>(p: ProjectData, kind: K, data: Partial<Entity<K>['data']> = {}, name = kind) { const entity = createEntity(p.projectId, kind, name, data); p.entities.push(entity); return entity as Entity<K>; }
describe('RB05 immutable reuse and isolated overrides', () => {
  it('keeps S pinned, T independent and only U body overridden through revision, native restore, clone and chapter replay', async () => {
    let p = createProject(), source = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '旧版😀の会話' }] }), s = add(p, 'scene'), t = add(p, 'scene'), u = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '上書きの会話' }] });
    p = (await prepareReuse(p, { ownerId: s.id, sourceId: source.id, mode: 'reference' })).candidate;
    const fixed = (p.entities.find(entity => entity.id === s.id) as Entity<'scene'>).data.reuse!.pinnedSnapshotId;
    p = (await prepareReuse(p, { ownerId: t.id, sourceId: source.id, snapshotId: fixed, mode: 'clone' })).candidate;
    p = (await prepareReuse(p, { ownerId: u.id, sourceId: source.id, snapshotId: fixed, mode: 'override', overrideFields: ['body'] })).candidate;
    const current = p.entities.find((entity): entity is Entity<'scene'> => entity.id === source.id && entity.kind === 'scene')!; current.data.body[0].text = '新しい会話';
    expect(validateProject(p).ok).toBe(true);
    const view = resolveReuseContent(p, p.snapshots), scene = (id: string) => view.entities.find((entity): entity is Entity<'scene'> => entity.id === id && entity.kind === 'scene')!;
    expect(scene(s.id).data.body[0].text).toBe('旧版😀の会話'); expect(scene(t.id).data.body[0].text).toBe('旧版😀の会話'); expect(scene(u.id).data.body[0].text).toBe('上書きの会話');
    expect(scene(t.id).data.body[0].id).not.toBe(source.data.body[0].id);
    expect(reuseTargetAnchor(view, { entityId: s.id, blockId: scene(s.id).data.body[0].id, start: 2, end: 3 })).toEqual({ entityId: source.id, blockId: source.data.body[0].id, start: 2, end: 3, sourceVersionId: fixed });
    const updated = await prepareReuse(p, { ownerId: s.id, sourceId: source.id, mode: 'reference' }); expect(updated.fields).toContain('body'); expect(updated.users).toEqual(expect.arrayContaining([s.id, t.id, u.id]));
    expect(resolveReuseContent(updated.candidate, updated.candidate.snapshots).entities.find((entity): entity is Entity<'scene'> => entity.id === s.id && entity.kind === 'scene')!.data.body[0].text).toBe('新しい会話');
    let reading = await startChapterReading(p, { sceneIds: [s.id, t.id, u.id] }); for (let index = 0; index < 3; index++) reading = presentNextChapterScene(p, reading); expect(reading.status).toBe('terminal');
    const checkpointId = newId(), snapshotId = newId(), record = pinChapterReadingRecord(reading, { checkpointId, snapshotId });
    expect(record.content.entities).toHaveLength(p.entities.length); expect((record.content.entities.find(entity => entity.id === s.id) as Entity<'scene'>).data.reuse?.bindings).toBeTruthy();
    p.entities.push({ ...createEntity(p.projectId, 'checkpoint', '開始状態', record.checkpoint), id: checkpointId }); const trace = add(p, 'trace', record.trace); p.snapshots.push({ id: snapshotId, content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: new Date().toISOString(), versionLabel: '読んだ固定版' });
    const { project: cloned, idMap } = await cloneProject((await inspectScenario(await exportScenario(p), { worker: false })).project);
    expect(validateProject(cloned).ok).toBe(true); const saved = cloned.entities.find((entity): entity is Entity<'trace'> => entity.id === idMap[trace.id] && entity.kind === 'trace')!, cp = cloned.entities.find((entity): entity is Entity<'checkpoint'> => entity.id === saved.data.startCheckpointId && entity.kind === 'checkpoint')!;
    expect((await replayChapterReading(cloned, saved.data, cp.data)).status).toBe('terminal');
  });
  it('executes the old module gate, disclosure and knowledge effects and never substitutes changed current values', async () => {
    let p = createProject(), variable = add(p, 'variable', { key: 'old_gate', initial: { type: 'boolean', value: true } }), holder = add(p, 'character'), assertion = add(p, 'assertion', { subjectId: holder.id, predicate: '知った内容', value: { type: 'boolean', value: true } });
    const effect = add(p, 'effect', { operation: 'assert', targetId: assertion.id, value: { type: 'boolean', value: true } }), scene = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '旧固定の本文' }] }), foreshadow = add(p, 'foreshadow'), disclosure = add(p, 'disclosure', { foreshadowId: foreshadow.id, anchor: { entityId: scene.id, blockId: scene.data.body[0].id, start: 0, end: 1 }, knowledgeEffects: [effect.id] }); foreshadow.data.clueIds = [disclosure.id];
    const source = add(p, 'flow_node', { nodeType: 'scene', sceneId: scene.id, gate: { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } } }), entry = add(p, 'flow_node', { nodeType: 'entry' }), use = add(p, 'flow_node', { nodeType: 'scene' }), end = add(p, 'flow_node', { nodeType: 'terminal', terminalReason: '終了' }), edge = add(p, 'flow_edge', { fromId: entry.id, toId: use.id }), exit = add(p, 'flow_edge', { fromId: use.id, toId: end.id }); add(p, 'flow_graph', { nodeIds: [entry.id, use.id, end.id], edgeIds: [edge.id, exit.id], entryIds: [entry.id], exitIds: [end.id] });
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, mode: 'reference' })).candidate;
    (p.entities.find(entity => entity.id === variable.id) as Entity<'variable'>).data.initial = { type: 'boolean', value: false };
    // A shared declaration edited after the preview is a conflict, not permission to use current content.
    await expect(startTrialVerified(p, { entryId: entry.id })).rejects.toThrow('衝突');
    const rebind = await prepareReuse(p, { ownerId: use.id, sourceId: source.id, snapshotId: p.snapshots[0].id, mode: 'reference' }); p = rebind.candidate;
    let session = await startTrialVerified(p, { entryId: entry.id }); const initial = structuredClone(session.state); session = stepTrial(p, session, { edgeId: edge.id }); expect(session.status).toBe('ready'); expect(session.state.assertions).toHaveLength(1); expect(backTrial(session).state).toEqual(initial);
    session = stepTrial(p, session, { edgeId: exit.id }); expect(session.status).toBe('terminal');
    const checkpointId = newId(), snapshotId = newId(), record = pinTrialRecord(session, { checkpointId, snapshotId }); p.entities.push({ ...createEntity(p.projectId, 'checkpoint', '固定開始', record.checkpoint), id: checkpointId }); const trace = add(p, 'trace', record.trace); p.snapshots.push({ id: snapshotId, content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: new Date().toISOString(), versionLabel: '経路の固定版' });
    const store = new ScenarioStore({ databaseName: `reuse-${newId()}` }); try { await store.saveProject(p, { reason: '固定参照と経路' }); const restored = (await store.getProject(p.projectId))!; expect((await replaySavedTraceVerified(restored, trace.id)).status).toBe('terminal'); } finally { await store.deleteDatabase(); }
  });
  it('refuses tampered pins and incomplete or colliding bindings without mutating the source', async () => {
    const p = createProject(), c = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '共通' }] }), s = add(p, 'scene');
    const candidate = (await prepareReuse(p, { ownerId: s.id, sourceId: c.id, mode: 'reference' })).candidate, before = structuredClone(candidate);
    const bad = structuredClone(candidate); (bad.entities.find(entity => entity.id === s.id) as Entity<'scene'>).data.reuse!.bindings = {}; expect(validateProject(bad).ok).toBe(false);
    const tampered = structuredClone(candidate); (tampered.snapshots[0].content.entities.find(entity => entity.id === c.id) as Entity<'scene'>).data.body[0].text = '破損'; await expect(startChapterReading(tampered, { sceneIds: [s.id] })).rejects.toThrow('hash');
    expect(candidate).toEqual(before);
  });
  it('keeps a locally overridden Unicode position at the use site and composes inherited positions through two fixed modules', async () => {
    let p = createProject(); const source = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '元😀位置' }] }), first = add(p, 'scene'), second = add(p, 'scene'), own = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '使用先😀位置' }] });
    p = (await prepareReuse(p, { ownerId: first.id, sourceId: source.id, mode: 'reference' })).candidate; const oldPin = (p.entities.find(entity => entity.id === first.id) as Entity<'scene'>).data.reuse!.pinnedSnapshotId;
    p = (await prepareReuse(p, { ownerId: second.id, sourceId: first.id, mode: 'reference' })).candidate;
    p = (await prepareReuse(p, { ownerId: own.id, sourceId: source.id, mode: 'override', overrideFields: ['body'] })).candidate;
    const view = resolveReuseContent(p, p.snapshots), inherited = view.entities.find(entity => entity.id === second.id) as Entity<'scene'>;
    expect(reuseTargetAnchor(view, { entityId: second.id, blockId: inherited.data.body[0].id, start: 1, end: 2 })).toEqual({ entityId: source.id, blockId: source.data.body[0].id, sourceVersionId: oldPin, start: 1, end: 2 });
    const localAnchor = { entityId: own.id, blockId: own.data.body[0].id, start: 3, end: 4 }; expect(reuseTargetAnchor(view, localAnchor)).toEqual(localAnchor);
    expect((await startChapterReading(p, { sceneIds: [second.id, own.id] })).status).toBe('ready');
  });
  it('does not execute source-chapter disclosures in a different use-site chapter or silently omit reuse from a public artifact', async () => {
    let p = createProject(); const oldChapter = add(p, 'chapter'), useChapter = add(p, 'chapter'), source = add(p, 'scene', { chapterId: oldChapter.id, body: [{ id: newId(), kind: 'paragraph', text: '共通元の本文' }] }), use = add(p, 'scene', { chapterId: useChapter.id }); oldChapter.data.sceneIds = [source.id]; useChapter.data.sceneIds = [use.id];
    const v = add(p, 'variable', { key: 'scope', valueType: 'integer', initial: { type: 'integer', value: 0 }, allowed: { min: 0, max: 10 } }), e = add(p, 'effect', { operation: 'set', targetId: v.id, value: { type: 'integer', value: 5 } }), f = add(p, 'foreshadow'), d = add(p, 'disclosure', { foreshadowId: f.id, anchor: { entityId: source.id, blockId: source.data.body[0].id }, targetScope: { projectId: p.projectId, chapterId: oldChapter.id }, knowledgeEffects: [e.id] }); f.data.clueIds = [d.id];
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, mode: 'reference' })).candidate;
    const reading = presentNextChapterScene(p, await startChapterReading(p, { sceneIds: [use.id] })); expect(reading.status).toBe('terminal'); expect(reading.state.variableValues[v.id].value).toBe(0);
    const profile = add(p, 'projection_profile', { includedIds: [use.id], allowedKinds: ['scene'], includedStatuses: ['provisional'], publicTitle: '公開タイトル', namePolicy: { mode: 'replace', replacement: '公開場面' } });
    const projection = createProjection(p, profile.id); expect(projection.ok).toBe(false); if (!projection.ok) expect(projection.issues.some(issue => issue.code === 'EXPORT_UNSUPPORTED' && issue.field === 'reuse')).toBe(true);
  });
  it('maps the whole module namespace into another project and preserves the old gate after native restore', async () => {
    let sourceProject = createProject(); const c = add(sourceProject, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '対応する旧固定本文' }] }), s = add(sourceProject, 'scene');
    sourceProject = (await prepareReuse(sourceProject, { ownerId: s.id, sourceId: c.id, mode: 'reference' })).candidate;
    const prepared = await inspectScenario(await exportScenario(sourceProject), { worker: false }), target = createProject();
    const idMap = Object.fromEntries(collectImportIds(sourceProject).map(({ id }) => [id, id === sourceProject.projectId ? target.projectId : newId()]));
    const plan = await planCrossProjectImport(prepared, target, { idMap }); expect(plan.unresolved).toEqual([]); expect(validateProject(plan.candidate!).ok).toBe(true);
    const restored = (await inspectScenario(await exportScenario(plan.candidate!), { worker: false })).project;
    const reading = presentNextChapterScene(restored, await startChapterReading(restored, { sceneIds: [idMap[s.id]] })); expect(reading.status).toBe('terminal');
    const module = reading.content.entities.find(entity => entity.id === idMap[s.id]) as Entity<'scene'>; expect(module.data.body[0].text).toBe('対応する旧固定本文');
    expect(reuseTargetAnchor(reading.content, { entityId: module.id, blockId: module.data.body[0].id })).toEqual({ entityId: idMap[c.id], blockId: idMap[c.data.body[0].id], sourceVersionId: idMap[sourceProject.snapshots[0].id] });
  });
  it('preserves an explicit link in the same pin while evaluating a pin-scoped disclosure only for its borrowed occurrence', async () => {
    let p = createProject(); const fixed = newId(), v = add(p, 'variable', { key: 'disclosed', initial: { type: 'boolean', value: false } }), e = add(p, 'effect', { operation: 'set', targetId: v.id, value: { type: 'boolean', value: true } }), scene = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '固定😀本文' }] }), source = add(p, 'flow_node', { nodeType: 'scene', sceneId: scene.id }), use = add(p, 'flow_node', { nodeType: 'scene' });
    const link = { entityId: use.id, sourceVersionId: fixed }; scene.data.body[0].links = [{ start: 0, end: 1, target: link }];
    const f = add(p, 'foreshadow'), d = add(p, 'disclosure', { foreshadowId: f.id, anchor: { entityId: scene.id, blockId: scene.data.body[0].id, start: 0, end: 1, sourceVersionId: fixed }, targetScope: { projectId: p.projectId, targetSnapshotId: fixed }, knowledgeEffects: [e.id] }); f.data.clueIds = [d.id];
    const entry = add(p, 'flow_node', { nodeType: 'entry' }), end = add(p, 'flow_node', { nodeType: 'terminal', terminalReason: '確認完了' }), enter = add(p, 'flow_edge', { fromId: entry.id, toId: use.id }), exit = add(p, 'flow_edge', { fromId: use.id, toId: end.id }); add(p, 'flow_graph', { nodeIds: [entry.id, use.id, end.id], edgeIds: [enter.id, exit.id], entryIds: [entry.id], exitIds: [end.id] });
    const { snapshots: _s, history: _h, authorAlternatives: _a, ...content } = structuredClone(p); p.snapshots.push({ id: fixed, content, contentHash: await sha256(jsonBytes(content)), createdAt: new Date().toISOString(), versionLabel: '明示位置を持つ固定版' });
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, snapshotId: fixed, mode: 'reference' })).candidate;
    let session = await startTrialVerified(p, { entryId: entry.id }); session = stepTrial(p, session, { edgeId: enter.id }); expect(session.status).toBe('ready'); expect(session.state.variableValues[v.id].value).toBe(true);
    const moduleScene = session.content.entities.find(entity => entity.id === (session.content.entities.find(entity => entity.id === use.id) as Entity<'flow_node'>).data.sceneId) as Entity<'scene'>;
    expect(reuseTargetAnchor(session.content, moduleScene.data.body[0].links![0].target)).toEqual(link); expect(session.state.seenIds).not.toContain(d.id);
    expect(session.state.seenIds).toContain((p.entities.find(entity => entity.id === use.id) as Entity<'flow_node'>).data.reuse!.bindings![d.id]);
  });
});
