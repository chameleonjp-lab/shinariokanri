import type { Condition, ID, ProjectData } from './types';
import { createEntity, validateProject } from './model';
import { adoptedRecord } from './adoption';

export type ReactionMode = 'first_revisit' | 'sequence' | 'random';
export const REACTION_LABELS: Record<ReactionMode, string> = { first_revisit: '初回・再訪', sequence: '順番に提示', random: '抽選' };
/** Generate ordinary, inspectable conditions and edges; execution uses the shared engine. */
export function prepareReactions(project: ProjectData, request: { mode: ReactionMode; sceneIds: ID[]; name: string }) {
  if (!Object.hasOwn(REACTION_LABELS, request.mode) || !request.name.trim() || request.name.length > 1000) throw new Error('系列名を1〜1000文字で入力し、提示方式を指定してください。');
  if (!request.sceneIds.length || request.sceneIds.length > 100 || new Set(request.sceneIds).size !== request.sceneIds.length) throw new Error('反応の場面は重複なしで1〜100件です。');
  if (request.mode === 'first_revisit' && request.sceneIds.length !== 2) throw new Error('初回と再訪の二つの場面を順に選んでください。');
  if (request.sceneIds.some(id => !project.entities.some(entity => entity.id === id && entity.kind === 'scene' && adoptedRecord(entity)))) throw new Error('対象の場面が削除・不採用または見つかりません。');
  const entry = createEntity(project.projectId, 'flow_node', `${request.name}の入口`, { nodeType: 'entry', executionPolicy: request.mode === 'random' ? 'manual_choice' : 'first_match' });
  const terminal = createEntity(project.projectId, 'flow_node', `${request.name}の終了`, { nodeType: 'terminal', terminalReason: '作者が反応の試読を終了した' });
  const nodes = request.sceneIds.map((sceneId, index) => createEntity(project.projectId, 'flow_node', `${request.name}の反応 ${index + 1}`, { nodeType: 'scene', sceneId }));
  const threshold = (count: number): Condition => ({ op: 'visited', entityId: entry.id, count });
  const edges = nodes.flatMap((node, index) => {
    let condition: Condition = { op: 'constant', value: true };
    if (request.mode === 'first_revisit') condition = index === 0 ? { op: 'not', child: threshold(2) } : threshold(2);
    if (request.mode === 'sequence') condition = index === nodes.length - 1 ? threshold(index + 1) : { op: 'all', children: [threshold(index + 1), { op: 'not', child: threshold(index + 2) }] };
    return [
      createEntity(project.projectId, 'flow_edge', `反応 ${index + 1}`, { fromId: entry.id, toId: node.id, edgeType: 'choice', label: `反応 ${index + 1}`, condition, priority: index }),
      createEntity(project.projectId, 'flow_edge', 'もう一度反応を見る', { fromId: node.id, toId: entry.id, edgeType: 'choice', label: 'もう一度反応を見る' }),
      createEntity(project.projectId, 'flow_edge', '反応の試読を終了する', { fromId: node.id, toId: terminal.id, edgeType: 'choice', label: '反応の試読を終了する' }),
    ];
  });
  const graph = createEntity(project.projectId, 'flow_graph', request.name, { nodeIds: [entry.id, ...nodes.map(node => node.id), terminal.id], edgeIds: edges.map(edge => edge.id), entryIds: [entry.id], exitIds: [terminal.id] });
  const candidate = { ...project, entities: [...project.entities, entry, terminal, ...nodes, ...edges, graph] };
  const valid = validateProject(candidate); if (!valid.ok) throw new Error(valid.issues.map(issue => `${issue.path}: ${issue.message}`).join('、'));
  return { candidate, graphId: graph.id, entryId: entry.id };
}
