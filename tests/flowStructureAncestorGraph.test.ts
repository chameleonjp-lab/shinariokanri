import { describe, expect, it } from 'vitest';
import { createEntity, createProject } from '../src/domain/model';
import { flowStructure, structureCounts } from '../src/domain/flowStructure';

function hierarchyFixture() {
  const project = createProject('finalized hierarchy diagnoses');
  const first = createEntity(project.projectId, 'scene', 'first');
  const second = createEntity(project.projectId, 'scene', 'second');
  const chapter = createEntity(project.projectId, 'chapter', 'chapter', { sceneIds: [first.id, second.id] });
  project.entities.push(first, second, chapter);
  const addGraph = (name: string) => {
    const entry = createEntity(project.projectId, 'flow_node', `${name} entry`, { nodeType: 'entry', sceneId: first.id });
    const end = createEntity(project.projectId, 'flow_node', `${name} end`, { nodeType: 'terminal', sceneId: second.id, terminalReason: 'end' });
    const edge = createEntity(project.projectId, 'flow_edge', `${name} edge`, { fromId: entry.id, toId: end.id });
    const graph = createEntity(project.projectId, 'flow_graph', name, { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [entry.id], exitIds: [end.id] });
    project.entities.push(entry, end, edge, graph);
    return { graph, entry, end };
  };
  return { project, first, second, chapter, addGraph };
}

describe('graph declarations inside chapter ancestors', () => {
  it('counts a graph shared by two scenes once and preserves independent unfinished, error and unknown diagnoses', () => {
    const p = createProject('ancestor diagnostics');
    const first = createEntity(p.projectId, 'scene', 'first');
    const second = createEntity(p.projectId, 'scene', 'second');
    const chapter = createEntity(p.projectId, 'chapter', 'chapter', { sceneIds: [first.id, second.id] });
    const unknown = createEntity(p.projectId, 'variable', 'unknown', { key: 'unknown_key', valueType: 'boolean', initial: { type: 'unknown', value: null, reason: 'not set' } });
    const outOfRange = createEntity(p.projectId, 'variable', 'range error', { key: 'range_error', valueType: 'integer', initial: { type: 'integer', value: 0 }, derived: { op: 'add', left: { op: 'value', value: { type: 'integer', value: Number.MAX_SAFE_INTEGER } }, right: { op: 'value', value: { type: 'integer', value: 1 } } } });
    const entry = createEntity(p.projectId, 'flow_node', 'entry', { nodeType: 'entry', sceneId: first.id });
    const end = createEntity(p.projectId, 'flow_node', 'end', { nodeType: 'terminal', sceneId: second.id, terminalReason: 'end', gate: { op: 'compare', variableId: outOfRange.id, comparator: 'eq', value: { type: 'integer', value: 0 } } });
    const edge = createEntity(p.projectId, 'flow_edge', 'unfinished edge', { fromId: entry.id, toId: { unresolved: { label: 'end', reason: 'not connected' } }, condition: { op: 'compare', variableId: unknown.id, comparator: 'eq', value: { type: 'boolean', value: true } } });
    const graph = createEntity(p.projectId, 'flow_graph', 'graph', { nodeIds: [entry.id, end.id], edgeIds: [edge.id], entryIds: [], exitIds: [end.id] });
    p.entities.push(first, second, chapter, unknown, outOfRange, entry, end, edge, graph);
    const items = flowStructure(p), ancestor = items.find(item => item.id === chapter.id)!;
    expect(structureCounts(ancestor)).toEqual({ unfinished: 2, errors: 1, unknown: 1 });
    expect(ancestor.problems.filter(problem => problem.targetId === graph.id && problem.message === '入口が未宣言です。')).toHaveLength(1);
    for (const scene of ancestor.children) expect(scene.problems).toContainEqual({ targetId: graph.id, message: '入口が未宣言です。', category: 'unfinished' });
    expect(items.find(item => item.id === graph.id)?.problems).toContainEqual({ targetId: graph.id, message: '入口が未宣言です。', category: 'unfinished' });
    edge.data.toId = end.id;
    expect(structureCounts(flowStructure(p).find(item => item.id === chapter.id)!)).toEqual({ unfinished: 1, errors: 1, unknown: 1 });
    graph.data.entryIds = [entry.id];
    expect(structureCounts(flowStructure(p).find(item => item.id === chapter.id)!)).toEqual({ unfinished: 0, errors: 1, unknown: 1 });
  });

  it('includes an orphan graph diagnosis in both scenes and once in their chapter', () => {
    const { project, chapter, addGraph } = hierarchyFixture();
    const { graph, entry, end } = addGraph('orphan');
    graph.data.parentGraphId = createEntity(project.projectId, 'flow_graph', 'absent parent').id;
    const items = flowStructure(project), ancestor = items.find(item => item.id === chapter.id)!;
    const problem = { targetId: graph.id, message: '上位の図が削除・不採用または接続されていません。', category: 'error' };
    expect(structureCounts(ancestor)).toEqual({ unfinished: 0, errors: 1, unknown: 0 });
    expect(ancestor.problems).toEqual([problem]);
    for (const scene of ancestor.children) expect(scene.problems).toEqual([problem]);
    const graphRoot = items.find(item => item.id === graph.id)!;
    expect(graphRoot.problems).toEqual([problem]);
    expect(graphRoot.entries).toEqual([entry.id]);
    expect(graphRoot.exits).toEqual([end.id]);
    expect(graphRoot.children.map(item => item.id)).toEqual([entry.id, end.id]);
  });

  it('propagates cycle diagnoses discovered during graph traversal without duplicating their target identities', () => {
    const { project, chapter, addGraph } = hierarchyFixture();
    const first = addGraph('first graph'), second = addGraph('second graph');
    first.graph.data.parentGraphId = second.graph.id;
    second.graph.data.parentGraphId = first.graph.id;
    const items = flowStructure(project), ancestor = items.find(item => item.id === chapter.id)!;
    for (const id of [first.graph.id, second.graph.id]) {
      expect(ancestor.problems.filter(problem => problem.targetId === id && problem.message === '図の階層が循環しています。')).toHaveLength(1);
      expect(ancestor.problems.filter(problem => problem.targetId === id && problem.message === '上位の図が削除・不採用または接続されていません。')).toHaveLength(1);
    }
    expect(structureCounts(ancestor)).toEqual({ unfinished: 0, errors: 4, unknown: 0 });
    expect(new Set(ancestor.problems.map(problem => `${problem.targetId}:${problem.category}:${problem.message}`)).size).toBe(ancestor.problems.length);
    expect(items.filter(item => [first.graph.id, second.graph.id].includes(item.id)).map(item => item.id)).toEqual([first.graph.id, second.graph.id]);
  });

  it('propagates the existing 64-level display boundary to scene and chapter summaries as unknown', () => {
    const { project, chapter, addGraph } = hierarchyFixture();
    const chain = Array.from({ length: 65 }, (_, index) => addGraph(`level ${index}`));
    chain.forEach((item, index) => { if (index) item.graph.data.parentGraphId = chain[index - 1]!.graph.id; });
    const items = flowStructure(project), ancestor = items.find(item => item.id === chapter.id)!;
    const problem = { targetId: chain[64]!.graph.id, message: '64階層までの表示です。下位図を個別に開いて確認してください。', category: 'unknown' };
    expect(structureCounts(ancestor)).toEqual({ unfinished: 0, errors: 0, unknown: 1 });
    expect(ancestor.problems).toEqual([problem]);
    for (const scene of ancestor.children) expect(scene.problems).toEqual([problem]);
    const graphRoot = items.find(item => item.id === chain[0]!.graph.id)!;
    expect(graphRoot.problems).toEqual([problem]);
    expect(graphRoot.entries).toContain(chain[0]!.entry.id);
    expect(graphRoot.exits).toContain(chain[63]!.end.id);
  });
});
