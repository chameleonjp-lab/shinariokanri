import { describe, expect, it } from 'vitest';
import { createAdventureSampleProject } from '../src/domain/adventureSample';
import { createEntity, createProject } from '../src/domain/model';
import { getTrialChoices, getTrialNode, pinTrialRecord, startTrial, trialCoverage } from '../src/domain/runtime';
import { collectImportIds, mapImportedProject } from '../src/storage/importMapping';
import { jsonBytes, sha256 } from '../src/storage/json';

function work(entries: number) {
  const project = createProject();
  const nodes = Array.from({ length: Math.max(2, entries) }, (_, i) => createEntity(project.projectId, 'flow_node', `入口${i}`, { nodeType: 'entry', gate: null }));
  const graph = createEntity(project.projectId, 'flow_graph', '本編', { nodeIds: nodes.map(n => n.id), entryIds: nodes.slice(0, entries).map(n => n.id) });
  project.entities = [...nodes, graph];
  return { project, nodes, graph };
}

describe('stage A initial reading', { timeout: 30_000 }, () => {
  it('starts a fresh three chapter sample at the authored opening without selecting an entry', async () => {
    const { project } = await createAdventureSampleProject();
    const initial = startTrial(project);
    expect(initial.issues).toEqual([]);
    const node = getTrialNode(project, initial)!;
    expect(project.entities.find(e => e.id === node.data.sceneId)?.name).toBe('01　知らない星の朝');
    expect(getTrialChoices(project, initial).some(choice => choice.result === 'true')).toBe(true);
    expect(trialCoverage(project, initial).scenes).toMatchObject({ reached: 1, total: 36 });
    expect(project.views.find(view => view.view === 'reader')?.entityIds).toEqual([node.id]);
  });

  it.each([0, 1, 2])('respects the %i declared entry case without choosing for the author', entries => {
    const { project, nodes } = work(entries), session = startTrial(project);
    if (entries === 1) expect(session.status).not.toBe('error');
    else expect(session.status).toBe('error');
    if (entries === 1) expect(session.nodeId).toBe(nodes[0].id);
    else expect(session.issues[0].path).toBe('entryId');
  });

  it('uses the stored identifier only when it is declared and active in the selected edition', async () => {
    const { project, nodes, graph } = work(2);
    project.views.push({ id: crypto.randomUUID(), name: '開始設定', view: 'reader', entityIds: [nodes[1].id], settings: {} });
    expect(startTrial(project).nodeId).toBe(nodes[1].id);
    const { history: _h, snapshots: _s, authorAlternatives: _a, ...content } = structuredClone(project);
    content.views = [];
    const snapshot = { id: crypto.randomUUID(), versionLabel: '以前の版', createdAt: new Date().toISOString(), content, contentHash: await sha256(jsonBytes(content)) };
    project.snapshots.push(snapshot);
    expect(startTrial(project, { contentVersionId: snapshot.id }).status).toBe('error');
    graph.data.entryIds = [nodes[0].id];
    expect(startTrial(project).nodeId).toBe(nodes[0].id);
    graph.data.entryIds = nodes.map(n => n.id); nodes[1].deletedAt = new Date().toISOString();
    expect(startTrial(project).nodeId).toBe(nodes[0].id);
  });

  it('preserves the authored entry when native import creates a separate copy with new IDs', async () => {
    const { project, nodes } = work(2), target = createProject('別のコピー');
    project.views.push({ id: crypto.randomUUID(), name: '本編の開始', view: 'reader', entityIds: [nodes[1].id], settings: {} });
    const idMap = Object.fromEntries(collectImportIds(project).map(({ id }) => [id, id === project.projectId ? target.projectId : crypto.randomUUID()]));
    const copy = await mapImportedProject(project, target, idMap);
    expect(startTrial(copy).nodeId).toBe(idMap[nodes[1].id]);
    expect(copy.projectId).not.toBe(project.projectId);
  });

  it('retains explicit starts and saved start states ahead of the sample default', async () => {
    const { project } = await createAdventureSampleProject();
    const auxiliary = project.entities.find(e => e.kind === 'flow_graph' && e.name === '補助演習・外部契約と仮値')!;
    const entryId = (auxiliary.data as { entryIds: string[] }).entryIds[0];
    const explicit = startTrial(project, { entryId });
    expect(explicit.nodeId).toBe(entryId);
    const record = pinTrialRecord(explicit, { checkpointId: crypto.randomUUID(), snapshotId: crypto.randomUUID() }, project);
    const checkpoint = createEntity(project.projectId, 'checkpoint', '別の開始状態', record.checkpoint);
    project.entities.push(checkpoint);
    const pin = { id: record.checkpoint.contentVersionId, versionLabel: '別の開始状態の固定稿', content: record.content, contentHash: await sha256(jsonBytes(record.content)), createdAt: new Date().toISOString() };
    project.snapshots.push(pin);
    const restored = startTrial(project, { checkpointId: checkpoint.id, contentVersionId: pin.id });
    expect(restored.nodeId).toBe(entryId);
    expect(restored.state).toEqual(explicit.state.contentVersionId === pin.id ? explicit.state : { ...explicit.state, contentVersionId: pin.id });
  });
});
