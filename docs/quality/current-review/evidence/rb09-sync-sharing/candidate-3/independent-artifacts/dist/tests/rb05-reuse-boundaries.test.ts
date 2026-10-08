import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createProject, createEntity, newId, validateProject, emptyValidity } from '../src/domain/model';
import { prepareReuse, resolveReuseContent, reuseOrigin, reuseTargetAnchor } from '../src/domain/reuse';
import { startTrialVerified, replaySavedTraceVerified, analyzeFlowVerified } from '../src/domain/runtimeVerified';
import { stepTrial, pinTrialRecord, checkTrialForeshadows, backTrial } from '../src/domain/runtime';
import { startChapterReading, presentNextChapterScene } from '../src/domain/presentation';
import { preparePartialCheckpoint } from '../src/domain/checkpoints';
import { exportScenario, inspectScenario } from '../src/storage/archive';
import { cloneProject } from '../src/storage/store';
import { jsonBytes, sha256 } from '../src/storage/json';
import type { Entity, EntityKind, ProjectData, ProjectContent } from '../src/domain/types';
const dir = '/tmp/shinariokanri-rb05-reuse-regression-fixtures';
function record(id: string, value: unknown) { mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/${id}.json`, JSON.stringify(value, null, 2) + '\n'); }
function add<K extends EntityKind>(p: ProjectData, kind: K, data: Partial<Entity<K>['data']> = {}, name = kind): Entity<K> { const entity = createEntity(p.projectId, kind, name, data); p.entities.push(entity); return entity as Entity<K>; }
function flow(p: ProjectData, owner: Entity<'flow_node'>) {
  const entry = add(p, 'flow_node', { nodeType: 'entry' }), end = add(p, 'flow_node', { nodeType: 'terminal', terminalReason: '正規終了' });
  const enter = add(p, 'flow_edge', { fromId: entry.id, toId: owner.id }), exit = add(p, 'flow_edge', { fromId: owner.id, toId: end.id });
  const graph = add(p, 'flow_graph', { nodeIds: [entry.id, owner.id, end.id], edgeIds: [enter.id, exit.id], entryIds: [entry.id], exitIds: [end.id] });
  return { entry, end, enter, exit, graph };
}
async function pin(p: ProjectData, id: string) { const { snapshots: _s, history: _h, authorAlternatives: _a, ...content } = structuredClone(p); p.snapshots.push({ id, content, contentHash: await sha256(jsonBytes(content)), createdAt: new Date().toISOString(), versionLabel: '独立固定共通元' }); }
describe('Independent fixed reuse original-contract boundaries', () => {
  it('S5F01: honors a confirmed, in-range pin-scoped exclusion exception before initial presentation', async () => {
    let p = createProject(); const fixed = newId(), evidence = add(p, 'note', { body: [{ id: newId(), kind: 'paragraph', text: '例外の確定根拠' }] }); evidence.status = 'confirmed';
    const other = add(p, 'variable', { key: 'other', initial: { type: 'boolean', value: true } });
    const variable = add(p, 'variable', { key: 'borrowed', initial: { type: 'boolean', value: true }, exclusions: [{ variableId: other.id, value: { type: 'boolean', value: true }, otherValue: { type: 'boolean', value: true }, reason: '限定した正当な例外', exceptions: [{ reason: '固定版のこの期間だけ許容', evidenceIds: [evidence.id], targetScope: { projectId: p.projectId, targetSnapshotId: fixed }, validity: { ...emptyValidity(), worldRange: { start: '0', end: '10' } } }] }] });
    const source = add(p, 'flow_node', { nodeType: 'scene', gate: { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } } }), use = add(p, 'flow_node'); const route = flow(p, use); await pin(p, fixed);
    variable.data.initial = { type: 'boolean', value: false }; variable.data.exclusions = [];
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, snapshotId: fixed, mode: 'reference' })).candidate;
    const session = await startTrialVerified(p, { entryId: route.entry.id, worldTick: '5' }); record('S5F01', { project: p, session });
    expect(validateProject(p).ok).toBe(true); expect(session.status).toBe('ready');
  });
  it('S5F02: reports missing mandatory information in the fixed source edition instead of dropping its pin-scoped deadline', async () => {
    let p = createProject(); const fixed = newId(), missingScene = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '未提示の必須情報' }] }), shownScene = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '先に回収してしまう場面' }] });
    const f = add(p, 'foreshadow', { deadline: { projectId: p.projectId, targetSnapshotId: fixed } }), clue = add(p, 'disclosure', { foreshadowId: f.id, anchor: { entityId: missingScene.id, blockId: missingScene.data.body[0].id }, role: 'clue' }), payoff = add(p, 'disclosure', { foreshadowId: f.id, anchor: { entityId: shownScene.id, blockId: shownScene.data.body[0].id }, role: 'payoff', stage: 'reveal' });
    f.data.clueIds = [clue.id]; f.data.payoffIds = [payoff.id]; f.data.requiredInfo = [clue.id];
    const source = add(p, 'flow_node', { nodeType: 'scene', sceneId: shownScene.id }), use = add(p, 'flow_node'); const route = flow(p, use); await pin(p, fixed);
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, snapshotId: fixed, mode: 'reference' })).candidate;
    let session = await startTrialVerified(p, { entryId: route.entry.id }); session = stepTrial(p, session, { edgeId: route.enter.id }); session = stepTrial(p, session, { edgeId: route.exit.id });
    const findings = checkTrialForeshadows(p, session), analysis = await analyzeFlowVerified(p, { maxStates: 100, maxTransitions: 100, maxMs: 1000 }); record('S5F02', { project: p, session, findings, analysis });
    const bindings = (p.entities.find(e => e.id === use.id) as Entity<'flow_node'>).data.reuse!.bindings!;
    expect(session.status).toBe('terminal'); expect(findings.some(x => x.targetId === bindings[f.id] && x.code === 'REQUIRED_INFO_MISSING')).toBe(true);
    expect(analysis.findings.some(x => x.targetId === bindings[f.id] && x.code === 'REQUIRED_INFO_MISSING')).toBe(true);
  });
  it.each(['relation', 'block'] as const)('S5F03/%s: rejects virtual bindings colliding with a canonical owned ID atomically', async collision => {
    let p = createProject(); const note = add(p, 'note', { body: [{ id: newId(), kind: 'paragraph', text: '固定の依存情報' }] }), source = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '固定の本文', links: [{ start: 0, end: 1, target: { entityId: note.id } }] }] }), use = add(p, 'scene'), other = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '別の正本本文' }] });
    const a = add(p, 'character'), b = add(p, 'character'), relationId = newId(); p.relations.push({ id: relationId, projectId: p.projectId, revision: '0', relationType: 'trust', fromId: a.id, toId: b.id, direction: 'forward', status: 'confirmed', visibility: 'private', evidenceIds: [], validity: emptyValidity() });
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, mode: 'reference' })).candidate;
    expect(validateProject(p).ok).toBe(true);
    const bindings = (p.entities.find(e => e.id === use.id) as Entity<'scene'>).data.reuse!.bindings!;
    bindings[collision === 'relation' ? note.id : source.data.body[0].id] = collision === 'relation' ? relationId : other.data.body[0].id;
    const before = structuredClone(p), validation = validateProject(p); record(`S5F03-${collision}`, { project: p, validation });
    expect(validation.ok).toBe(false); expect(p).toEqual(before);
  });
  it('S5F04: captures the preview request and author revision before hashing', async () => {
    const p = createProject(), source = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '確認開始時の本文' }] }), use = add(p, 'scene');
    const request = { ownerId: use.id, sourceId: source.id, mode: 'reference' as const }, before = structuredClone(p); const promise = prepareReuse(p, request);
    p.revision = '1'; source.data.body[0].text = 'hash待ち中の新本文'; (request as { mode: string }).mode = 'clone';
    const result = await promise; record('S5F04', { before, mutated: p, candidate: result.candidate });
    expect(result.candidate.revision).toBe(before.revision); expect((result.owner as Entity<'scene'>).data.reuse!.mode).toBe('reference');
    expect(result.candidate.entities.find(e => e.id === source.id)).toEqual(before.entities.find(e => e.id === source.id));
  });
  it('S5F05: restores and clones a partial checkpoint and flow trace without copying the borrowed gate into author records', async () => {
    let p = createProject(); const v = add(p, 'variable', { key: 'pinned_gate', initial: { type: 'boolean', value: true } }), source = add(p, 'flow_node', { nodeType: 'scene', gate: { op: 'compare', variableId: v.id, comparator: 'eq', value: { type: 'boolean', value: true } } }), use = add(p, 'flow_node'); const route = flow(p, use);
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, mode: 'reference' })).candidate; const fixed = p.snapshots[0].id;
    (p.entities.find(e => e.id === v.id) as Entity<'variable'>).data.initial = { type: 'boolean', value: false };
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, snapshotId: fixed, mode: 'reference' })).candidate;
    const originalCount = p.entities.length, prepared = await preparePartialCheckpoint(p, { entryId: route.entry.id }); p.entities.push(prepared.checkpoint); p.snapshots.push(...prepared.snapshots);
    let session = await startTrialVerified(p, { contentVersionId: prepared.checkpoint.data.contentVersionId, checkpointId: prepared.checkpoint.id, entryId: route.entry.id });
    const start = structuredClone(session.state); session = stepTrial(p, session, { edgeId: route.enter.id }); expect(session.status).toBe('ready'); expect(backTrial(session).state).toEqual(start); session = stepTrial(p, session, { edgeId: route.exit.id });
    const checkpointId = newId(), snapshotId = newId(), saved = pinTrialRecord(session, { checkpointId, snapshotId }); p.entities.push({ ...createEntity(p.projectId, 'checkpoint', '保存開始', saved.checkpoint), id: checkpointId }); const trace = add(p, 'trace', saved.trace); p.snapshots.push({ id: snapshotId, content: saved.content, contentHash: await sha256(jsonBytes(saved.content)), createdAt: new Date().toISOString(), versionLabel: '独立保存経路' });
    const restored = (await inspectScenario(await exportScenario(p), { worker: false })).project, { project: cloned, idMap } = await cloneProject(restored), replayed = await replaySavedTraceVerified(cloned, idMap[trace.id]); record('S5F05', { project: p, saved, restored, cloned, replayed });
    expect(saved.content.entities.length).toBe(originalCount); expect(replayed.status).toBe('terminal'); expect(replayed.state.provenance).toBe('partial'); expect((replayed.content.entities.find(e => e.id === idMap[use.id]) as Entity<'flow_node'>).data.gate).toBeTruthy();
  });
  it('S5F06: keeps inherited content after the current common source is rejected, and a clone allocates aliases independently', async () => {
    let p = createProject(); const character = add(p, 'character', { aliases: [{ id: newId(), text: '別名', reading: 'べつめい', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false }] }), source = add(p, 'scene', { povId: character.id, body: [{ id: newId(), kind: 'paragraph', text: '固定する会話' }] }), use = add(p, 'scene'), copy = add(p, 'scene');
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, mode: 'reference' })).candidate;
    p = (await prepareReuse(p, { ownerId: copy.id, sourceId: source.id, snapshotId: p.snapshots[0].id, mode: 'clone' })).candidate;
    (p.entities.find(e => e.id === source.id) as Entity<'scene'>).status = 'rejected';
    const reading = presentNextChapterScene(p, await startChapterReading(p, { sceneIds: [use.id, copy.id] })), validation = validateProject(p); record('S5F06', { project: p, reading, validation });
    expect(validation.ok).toBe(true); expect(reading.status).toBe('ready'); const copied = p.entities.find(e => e.id === copy.id) as Entity<'scene'>, clonedCharacter = p.entities.find(e => e.id === copied.data.povId) as Entity<'character'>; expect(clonedCharacter.data.aliases![0].id).not.toBe(character.data.aliases![0].id);
  });
  it.each(['reference', 'clone'] as const)('S5F07/%s: verifies transitive fixed source hashes before preparing borrowed or independent content', async mode => {
    let p = createProject(); const source = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '正しい依存pin本文' }] }), first = add(p, 'scene'), second = add(p, 'scene');
    p = (await prepareReuse(p, { ownerId: first.id, sourceId: source.id, mode: 'reference' })).candidate;
    (p.snapshots[0].content.entities.find(e => e.id === source.id) as Entity<'scene'>).data.body[0].text = 'hash不一致の依存本文';
    const before = structuredClone(p); record(`S5F07-${mode}`, { project: p });
    await expect(prepareReuse(p, { ownerId: second.id, sourceId: first.id, mode })).rejects.toThrow(/hash|ハッシュ/); expect(p).toEqual(before);
  });
  it('S5F08: preserves a typed local override referencing a borrowed pinned variable through save and native restore', async () => {
    let p = createProject(); const variable = add(p, 'variable', { key: 'old_definition', initial: { type: 'boolean', value: true } }), source = add(p, 'flow_node', { nodeType: 'scene', gate: { op: 'compare', variableId: variable.id, comparator: 'eq', value: { type: 'boolean', value: true } } }), use = add(p, 'flow_node'); const route = flow(p, use);
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, mode: 'reference' })).candidate; const fixed = p.snapshots[0].id;
    (p.entities.find(e => e.id === variable.id) as Entity<'variable'>).data.initial = { type: 'boolean', value: false };
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, snapshotId: fixed, mode: 'override', overrideFields: ['gate'] })).candidate;
    const owner = p.entities.find(e => e.id === use.id) as Entity<'flow_node'>, virtualId = owner.data.reuse!.bindings![variable.id]; owner.data.gate = { op: 'compare', variableId: virtualId, comparator: 'eq', value: { type: 'boolean', value: true } };
    const validation = validateProject(p), view = resolveReuseContent(p, p.snapshots); record('S5F08', { project: p, validation, virtualId, origin: reuseOrigin(view, virtualId) });
    expect(view.entities.some(e => e.id === virtualId && e.kind === 'variable')).toBe(true); expect(validation.ok).toBe(true);
    const restored = (await inspectScenario(await exportScenario(p), { worker: false })).project; const session = await startTrialVerified(restored, { entryId: route.entry.id }); expect(stepTrial(restored, session, { edgeId: route.enter.id }).status).toBe('ready'); expect(p.entities.some(e => e.id === virtualId)).toBe(false);
  });
  it('S5F09: preserves an explicit foreign fixed link even when its entity ID is the present reuse owner', async () => {
    let p = createProject(); const source = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '固定リンクを含む本文' }] }), use = add(p, 'scene', { body: [{ id: newId(), kind: 'paragraph', text: '開くべき別固定版の使用先' }] }), foreign = newId(); await pin(p, foreign);
    const target = { entityId: use.id, sourceVersionId: foreign }; source.data.body[0].links = [{ start: 0, end: 1, target }];
    p = (await prepareReuse(p, { ownerId: use.id, sourceId: source.id, mode: 'reference' })).candidate;
    const view = resolveReuseContent(p, p.snapshots), entity = view.entities.find(e => e.id === use.id) as Entity<'scene'>, actual = reuseTargetAnchor(view, entity.data.body[0].links![0].target); record('S5F09', { project: p, intendedTarget: target, mappedLink: entity.data.body[0].links![0], actual });
    expect(validateProject(p).ok).toBe(true); expect(actual).toEqual(target);
  });
});
