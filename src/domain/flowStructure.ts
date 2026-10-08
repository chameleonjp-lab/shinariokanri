import type { Entity, ID, ProjectData } from './types';
import { adoptedRecord } from './adoption';
import { initializeRuntimeState, evaluateCondition } from './conditions';
import { validateEntity } from './model';
import { resolveReuseContent } from './reuse';

export interface FlowStructureItem {
  id: ID; name: string; kind: Entity['kind'] | 'unplaced';
  children: FlowStructureItem[]; entries: ID[]; exits: ID[];
  problems: { targetId: ID; message: string; category: 'unfinished' | 'error' | 'unknown' }[];
}
/** This is a structural summary, not a substitute for bounded path analysis. */
export function flowStructure(project: ProjectData, referenceEntities: Entity[] = []): FlowStructureItem[] {
  try { project = resolveReuseContent(project, project.snapshots); }
  catch (error) { const target = project.entities.find(entity => (entity.kind === 'scene' || entity.kind === 'flow_node') && entity.data.reuse?.mode !== 'clone' && entity.data.reuse); return [{ id: target?.id ?? 'reuse-errors', name: target?.name || '固定共通元を確認してください', kind: target?.kind ?? 'unplaced', children: [], entries: [], exits: [], problems: [{ targetId: target?.id ?? '', category: 'error', message: (error as Error).message }] }]; }
  const records = [...new Map([...referenceEntities, ...project.entities].map(entity => [entity.id, entity])).values()];
  const byId = new Map(records.filter(adoptedRecord).map(entity => [entity.id, entity]));
  const local = project.entities.filter(adoptedRecord);
  const nodes = records.filter((entity): entity is Entity<'flow_node'> => entity.kind === 'flow_node' && adoptedRecord(entity));
  const edges = records.filter((entity): entity is Entity<'flow_edge'> => entity.kind === 'flow_edge' && adoptedRecord(entity));
  const graphs = records.filter((entity): entity is Entity<'flow_graph'> => entity.kind === 'flow_graph' && adoptedRecord(entity));
  const state = initializeRuntimeState(project, project.projectId, referenceEntities);
  const edgesFrom = new Map<ID, Entity<'flow_edge'>[]>(), nodesInScene = new Map<ID, Entity<'flow_node'>[]>(), graphsUnder = new Map<ID, Entity<'flow_graph'>[]>();
  for (const edge of edges) edgesFrom.set(edge.data.fromId, [...(edgesFrom.get(edge.data.fromId) ?? []), edge]);
  for (const node of nodes) if (node.data.sceneId) nodesInScene.set(node.data.sceneId, [...(nodesInScene.get(node.data.sceneId) ?? []), node]);
  for (const graph of graphs) if (graph.data.parentGraphId) graphsUnder.set(graph.data.parentGraphId, [...(graphsUnder.get(graph.data.parentGraphId) ?? []), graph]);
  const problems = new Map<ID, FlowStructureItem['problems']>();
  function add(id: ID, message: string, category: 'unfinished' | 'error' | 'unknown') {
    const found = problems.get(id) ?? []; if (!found.some(problem => problem.message === message && problem.category === category)) found.push({ targetId: id, message, category }); problems.set(id, found);
  }
  function condition(id: ID, value: Entity<'flow_node'>['data']['gate']) {
    if (!value) return;
    try { const result = evaluateCondition(value, { state, entities: records }); if (result.value === 'unknown') add(id, `初期状態では未確認：${result.reasons.join('、')}`, 'unknown'); }
    catch (error) { add(id, (error as Error).message, 'error'); }
  }
  for (const entity of local) {
    const validation = validateEntity(entity);
    if (!validation.ok) for (const issue of validation.issues) add(entity.id, issue.message, 'error');
  }
  for (const node of nodes) {
    const outgoing = edgesFrom.get(node.id) ?? [];
    if (node.data.nodeType === 'terminal') { if (!node.data.terminalReason?.trim()) add(node.id, '終端の理由が未入力です。', 'unfinished'); }
    else if (node.data.nodeType !== 'exit' && node.data.nodeType !== 'call' && !outgoing.length && !node.data.fallbackId) add(node.id, '進行先・代替先が未接続です。', 'unfinished');
    if (node.data.sceneId && byId.get(node.data.sceneId)?.kind !== 'scene') add(node.id, '本文の場面が削除・不採用または見つかりません。', 'error');
    if (node.data.nodeType === 'call') {
      if (byId.get(node.data.childGraphId ?? '')?.kind !== 'flow_graph') add(node.id, '呼出し先の図が未接続です。', 'unfinished');
      if (!node.data.fallbackId || byId.get(node.data.fallbackId)?.kind !== 'flow_node') add(node.id, '呼出しから戻る先が未接続です。', 'unfinished');
    }
    condition(node.id, node.data.gate);
  }
  for (const edge of edges) {
    if (byId.get(edge.data.fromId)?.kind !== 'flow_node') add(edge.id, '接続の始点が有効なノードではありません。', 'error');
    if (typeof edge.data.toId !== 'string') add(edge.id, '接続の出口が未完成です。', 'unfinished');
    else if (byId.get(edge.data.toId)?.kind !== 'flow_node') add(edge.id, '接続の出口が削除・不採用または見つかりません。', 'error');
    condition(edge.id, edge.data.condition);
  }
  for (const graph of graphs) {
    for (const id of graph.data.nodeIds) if (byId.get(id)?.kind !== 'flow_node') add(graph.id, '図のノードが見つかりません。', 'error');
    for (const [label, ids] of [['入口', graph.data.entryIds], ['出口', graph.data.exitIds]] as const) {
      if (!ids.length) add(graph.id, `${label}が未宣言です。`, 'unfinished');
      for (const id of ids) {
        const node = byId.get(id);
        if (!graph.data.nodeIds.includes(id) || node?.kind !== 'flow_node') add(graph.id, `${label}が図内の有効なノードへ接続していません。`, 'unfinished');
        else if (label === '入口' && node.data.nodeType !== 'entry' || label === '出口' && !['exit', 'terminal'].includes(node.data.nodeType)) add(graph.id, `${label}のノード種別が一致しません。`, 'error');
      }
    }
  }
  for (const scene of records.filter((entity): entity is Entity<'scene'> => entity.kind === 'scene' && adoptedRecord(entity))) {
    for (const id of scene.data.dialogueLineIds ?? []) if (byId.get(id)?.kind !== 'dialogue_line') add(scene.id, '会話の台詞が削除・不採用または見つかりません。', 'error');
  }
  function calledTargets(graphId: ID): ID[] {
    const queue = [graphId], visited = new Set<ID>(), targets = new Set<ID>();
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index]; if (visited.has(id)) continue; visited.add(id); targets.add(id);
      const graph = byId.get(id); if (graph?.kind !== 'flow_graph') continue;
      for (const nodeId of graph.data.nodeIds) {
        targets.add(nodeId); for (const edge of edgesFrom.get(nodeId) ?? []) targets.add(edge.id);
        const node = byId.get(nodeId);
        if (node?.kind === 'flow_node') {
          if (node.data.childGraphId) queue.push(node.data.childGraphId);
          if (node.data.sceneId) {
            targets.add(node.data.sceneId);
            const scene = byId.get(node.data.sceneId);
            if (scene?.kind === 'scene') for (const lineId of scene.data.dialogueLineIds ?? []) targets.add(lineId);
          }
        }
      }
      for (const child of graphsUnder.get(id) ?? []) queue.push(child.id);
    }
    return [...targets];
  }
  const summarize = (id: ID, children: FlowStructureItem[] = [], extra: ID[] = []): FlowStructureItem => {
    const entity = byId.get(id);
    const ownProblems = [id, ...extra].flatMap(target => problems.get(target) ?? []);
    const allProblems = [...ownProblems, ...children.flatMap(child => child.problems)];
    return { id, name: entity?.name || '参照先を確認してください', kind: entity?.kind ?? 'unplaced', children,
      entries: [...new Set([...(entity?.kind === 'flow_node' && entity.data.nodeType === 'entry' ? [id] : []), ...children.flatMap(child => child.entries)])],
      exits: [...new Set([...(entity?.kind === 'flow_node' && ['exit', 'terminal'].includes(entity.data.nodeType) ? [id] : []), ...children.flatMap(child => child.exits)])],
      problems: [...new Map(allProblems.map(problem => [`${problem.targetId}:${problem.category}:${problem.message}`, problem])).values()] };
  };
  const sceneItem = (scene: Entity<'scene'>): FlowStructureItem => {
    const sceneNodes = nodesInScene.get(scene.id) ?? [];
    const lines = (scene.data.dialogueLineIds ?? []).map(id => summarize(id));
    const nodeItems = sceneNodes.map(node => summarize(node.id, [], [...(edgesFrom.get(node.id) ?? []).map(edge => edge.id), ...(node.data.childGraphId ? calledTargets(node.data.childGraphId) : [])]));
    return summarize(scene.id, [...lines, ...nodeItems]);
  };
  const chapters = local.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter');
  const placed = new Set(chapters.flatMap(chapter => chapter.data.sceneIds));
  const result = chapters.map(chapter => summarize(chapter.id, chapter.data.sceneIds.map(id => {
    const scene = byId.get(id); if (scene?.kind === 'scene') return sceneItem(scene);
    add(chapter.id, '章内の場面が削除・不採用または見つかりません。', 'error'); return summarize(id);
  })));
  const unplaced = local.filter((entity): entity is Entity<'scene'> => entity.kind === 'scene' && !placed.has(entity.id)).map(sceneItem);
  if (unplaced.length) result.push({ ...summarize('unplaced', unplaced), name: '章に未配置の場面' });
  function graphItem(graph: Entity<'flow_graph'>, ancestors: Set<ID>): FlowStructureItem {
    if (ancestors.has(graph.id)) { add(graph.id, '図の階層が循環しています。', 'error'); return summarize(graph.id); }
    const next = new Set([...ancestors, graph.id]);
    if (ancestors.size >= 64) { add(graph.id, '64階層までの表示です。下位図を個別に開いて確認してください。', 'unknown'); return summarize(graph.id, [], calledTargets(graph.id)); }
    const childGraphs = graphsUnder.get(graph.id) ?? [];
    const graphNodes = graph.data.nodeIds.map(id => { const node = byId.get(id); return summarize(id, [], [...(edgesFrom.get(id) ?? []).map(edge => edge.id), ...(node?.kind === 'flow_node' && node.data.childGraphId ? calledTargets(node.data.childGraphId) : [])]); });
    const item = summarize(graph.id, [...graphNodes, ...childGraphs.map(child => graphItem(child, next))], calledTargets(graph.id));
    item.entries = [...new Set([...graph.data.entryIds, ...item.entries])]; item.exits = [...new Set([...graph.data.exitIds, ...item.exits])];
    return item;
  }
  const roots = graphs.filter(graph => graph.projectId === project.projectId && !graph.data.parentGraphId);
  result.push(...roots.map(graph => graphItem(graph, new Set())));
  const reachable = new Set<ID>(); function collect(item: FlowStructureItem) { reachable.add(item.id); item.children.forEach(collect); } result.forEach(collect);
  for (const graph of graphs.filter(graph => graph.projectId === project.projectId)) if (!reachable.has(graph.id)) { add(graph.id, '上位の図が削除・不採用または接続されていません。', 'error'); result.push(graphItem(graph, new Set())); }
  const bareNodes = nodes.filter(node => node.projectId === project.projectId && !reachable.has(node.id)).map(node => summarize(node.id, [], (edgesFrom.get(node.id) ?? []).map(edge => edge.id)));
  if (bareNodes.length) result.push({ ...summarize('ungrouped', bareNodes), name: '図に未配置のノード' });
  return result;
}

export function structureCounts(item: FlowStructureItem) {
  return { unfinished: item.problems.filter(problem => problem.category === 'unfinished').length, errors: item.problems.filter(problem => problem.category === 'error').length, unknown: item.problems.filter(problem => problem.category === 'unknown').length };
}
