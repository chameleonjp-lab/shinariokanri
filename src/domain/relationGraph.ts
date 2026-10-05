import type { Entity, ID, ProjectData, Relation, Validity } from './types';
import { collectReferences, emptyValidity, RELATION_LABELS } from './model';
import { compareTicks } from './time';
import { resolveEventTimes } from './timeEditing';
import { assessWorldValidity, type ValidityAssessment, type WorldPoint } from './world';

export type GraphCategory = 'all' | 'characters' | 'family' | 'causal' | 'foreshadow' | 'progress' | 'reference' | 'production';
export const GRAPH_CATEGORY_LABELS: Record<GraphCategory, string> = { all: '作品全体', characters: '人物関係', family: '家系・師弟・血統', causal: '因果・前提', foreshadow: '伏線・回収', progress: '進行', reference: '参照', production: '制作の依存' };
export interface GraphLine {
  id: string; fromId: ID; toId: ID; label: string; meaning: string; category: Exclude<GraphCategory, 'all'>;
  direction: 'forward' | 'symmetric'; origin: 'manual' | 'derived'; hierarchy: boolean;
  sourceId: ID; sourcePath: string; evidenceIds: ID[]; assessment: ValidityAssessment; relation?: Relation;
}
export interface RelationGraphOptions extends WorldPoint {
  category?: GraphCategory; meaning?: string; includeHierarchy?: boolean; includeUnknown?: boolean;
  focusId?: ID | null; hops?: 1 | 2; query?: string;
}
export interface RelationGraphResult { nodes: Entity[]; lines: GraphLine[]; allLines: GraphLine[]; hiddenLines: number; inactiveLines: number; uncertainLines: number; missingEndpoints: number }
function categoryOf(type: string, a?: Entity, b?: Entity): Exclude<GraphCategory, 'all'> {
  if (['parent_of', 'mentor_of', 'bloodline', 'sibling_of', 'family_of'].includes(type)) return 'family';
  if (type.includes('foreshadow') || type.includes('payoff')) return 'foreshadow';
  if (['causes', 'requires'].includes(type)) return 'causal';
  if (a?.kind === 'character' && b?.kind === 'character') return 'characters';
  return 'reference';
}
/** The graph projects recorded sources. A neighbourhood is a scope, never an inferred relation. */
export function buildRelationGraph(project: ProjectData, options: RelationGraphOptions = {}): RelationGraphResult {
  const active = project.entities.filter(entity => !entity.deletedAt), index = new Map(active.map(entity => [entity.id, entity]));
  const allLines: GraphLine[] = [], covered = new Set<string>(), lineIds = new Set<string>(); let missingEndpoints = 0;
  const times = resolveEventTimes(active.filter((entity): entity is Entity<'event'> => entity.kind === 'event'));
  const add = (source: Entity, fromId: ID, toId: ID, label: string, path: string, category: Exclude<GraphCategory, 'all'> = 'reference', hierarchy = false, validity?: Validity | null, evidenceIds: ID[] = [], assessment?: ValidityAssessment) => {
    if (!index.has(fromId) || !index.has(toId)) { missingEndpoints++; return; }
    const id = `derived:${source.id}:${path}:${fromId}:${toId}`;
    if (lineIds.has(id)) return; lineIds.add(id);
    covered.add(`${source.id}:${toId}`);
    allLines.push({ id, fromId, toId, label, meaning: path.split(/[.[]/).filter(Boolean).join('.'), category, direction: 'forward', origin: 'derived', hierarchy, sourceId: source.id, sourcePath: path, evidenceIds: [...new Set([source.id, ...evidenceIds])], assessment: assessment ?? assessWorldValidity(validity, options) });
  };
  for (const relation of project.relations) if (!relation.deletedAt) {
    const a = index.get(relation.fromId), b = index.get(relation.toId);
    if (!a || !b) { missingEndpoints++; continue; }
    allLines.push({ id: relation.id, fromId: relation.fromId, toId: relation.toId, label: RELATION_LABELS[relation.relationType] ?? relation.relationType, meaning: relation.relationType, category: categoryOf(relation.relationType, a, b), direction: relation.direction, origin: 'manual', hierarchy: false, sourceId: relation.id, sourcePath: 'relation', evidenceIds: relation.evidenceIds, relation, assessment: assessWorldValidity(relation.validity, options) });
  }
  for (const entity of active) {
    if (entity.kind === 'event') {
      const time = times.get(entity.id); let assessment: ValidityAssessment = { value: 'unknown', reasons: ['出来事の時点が未解決です。'] };
      if (time?.status === 'resolved') {
        if (!options.at) assessment = { value: 'unknown', reasons: ['世界時点が未選択です。'] };
        else if (time.calendarId !== project.calendarId) assessment = { value: 'unknown', reasons: ['暦の対応が未登録です。'] };
        else if (compareTicks(options.at, time.earliest) < 0 || compareTicks(options.at, time.endLatest) > 0 || time.mode === 'interval' && compareTicks(options.at, time.endLatest) === 0) assessment = { value: 'false', reasons: [] };
        else { const uncertain = time.mode === 'uncertain' || time.earliest !== time.latest || time.endEarliest !== time.endLatest; assessment = { value: uncertain ? 'unknown' : 'true', reasons: uncertain ? ['出来事の日時に幅があります。'] : [] }; }
      }
      entity.data.participants?.forEach((participant, i) => add(entity, entity.id, participant.characterId, `参加 · ${participant.role}`, `data.participants[${i}].characterId`, 'characters', false, undefined, [], assessment));
      if (entity.data.locationId) add(entity, entity.id, entity.data.locationId, '出来事の場所', 'data.locationId', 'reference', false, undefined, [], assessment);
      entity.data.itemIds?.forEach((id, i) => add(entity, entity.id, id, '出来事の物品', `data.itemIds[${i}]`, 'reference', false, undefined, [], assessment));
    } else if (entity.kind === 'scene') entity.data.eventIds.forEach((id, i) => add(entity, entity.id, id, '場面の出来事', `data.eventIds[${i}]`));
    else if (entity.kind === 'chapter') entity.data.sceneIds.forEach((id, i) => add(entity, entity.id, id, '章の場面', `data.sceneIds[${i}]`, 'reference', true));
    else if (entity.kind === 'flow_edge') {
      if (typeof entity.data.toId === 'string') add(entity, entity.data.fromId, entity.data.toId, `${entity.data.edgeType} · ${entity.data.label || entity.name}`, 'data.toId', 'progress', false, { ...emptyValidity(), routeCondition: entity.data.condition ?? null }, entity.data.effectIds ?? []);
      covered.add(`${entity.id}:${entity.data.fromId}`);
      entity.data.effectIds?.forEach((id, i) => add(entity, entity.id, id, '接続が適用する効果', `data.effectIds[${i}]`, 'progress', false, { ...emptyValidity(), routeCondition: entity.data.condition ?? null }));
    } else if (entity.kind === 'flow_graph') {
      entity.data.nodeIds.forEach((id, i) => add(entity, entity.id, id, '分岐グループのノード', `data.nodeIds[${i}]`, 'progress', true));
      if (entity.data.parentGraphId) add(entity, entity.data.parentGraphId, entity.id, '子の分岐グループ', 'data.parentGraphId', 'progress', true);
    } else if (entity.kind === 'disclosure') {
      add(entity, entity.data.foreshadowId, entity.id, `${entity.data.role === 'clue' ? '手掛かり' : '回収'} · ${entity.data.stage}`, 'data.foreshadowId', 'foreshadow', false, { ...emptyValidity(), routeCondition: entity.data.condition ?? null });
      add(entity, entity.id, entity.data.anchor.entityId, '提示する位置', 'data.anchor.entityId', 'foreshadow', false, { ...emptyValidity(), routeCondition: entity.data.condition ?? null });
    } else if (entity.kind === 'foreshadow') {
      entity.data.clueIds?.forEach((id, i) => add(entity, entity.id, id, '登録された手掛かり', `data.clueIds[${i}]`, 'foreshadow'));
      entity.data.payoffIds?.forEach((id, i) => add(entity, entity.id, id, '登録された回収', `data.payoffIds[${i}]`, 'foreshadow'));
      entity.data.requiredInfo?.forEach((id, i) => add(entity, id, entity.id, '必要な情報', `data.requiredInfo[${i}]`, 'foreshadow'));
    } else if (entity.kind === 'production_task') {
      entity.data.dependsOn?.forEach((id, i) => add(entity, id, entity.id, '先行する制作タスク', `data.dependsOn[${i}]`, 'production'));
      entity.data.targetIds.forEach((id, i) => add(entity, entity.id, id, '制作の対象', `data.targetIds[${i}]`, 'production'));
    } else if (entity.kind === 'group') {
      entity.data.members?.forEach((id, i) => add(entity, entity.id, id, '表示・分類の所属参照', `data.members[${i}]`, 'characters', true));
      if (entity.data.parentId) add(entity, entity.data.parentId, entity.id, '子グループ', 'data.parentId', 'characters', true);
    } else if (entity.kind === 'place') {
      if (entity.data.parentId) add(entity, entity.data.parentId, entity.id, '場所の階層', 'data.parentId', 'reference', true);
    } else if (entity.kind === 'assertion') {
      const value = entity.data.value, target = typeof value === 'string' ? value : value.type === 'ref' ? value.value : undefined;
      if (target) add(entity, entity.data.subjectId, target, `記録 · ${entity.data.predicate}`, 'data.value', 'reference', false, entity.data.validity, entity.data.sourceIds ?? []);
      covered.add(`${entity.id}:${entity.data.subjectId}`);
    }
  }
  for (const entity of active) for (const reference of collectReferences(entity)) if (index.has(reference.id) && !covered.has(`${entity.id}:${reference.id}`)) add(entity, entity.id, reference.id, `参照 · ${reference.path}`, reference.path);
  const category = options.category ?? 'all', candidates = allLines.filter(line => (category === 'all' || line.category === category || category === 'characters' && line.category === 'family') && (!options.meaning || options.meaning === 'all' || line.meaning === options.meaning) && (options.includeHierarchy !== false || !line.hierarchy));
  let lines = candidates.filter(line => line.assessment.value !== 'false' && (options.includeUnknown !== false || line.assessment.value !== 'unknown'));
  if (options.focusId) {
    const reached = new Set<ID>([options.focusId]), neighbours = new Map<ID, Set<ID>>();
    for (const line of lines) { for (const [a, b] of [[line.fromId, line.toId], [line.toId, line.fromId]]) { const ids = neighbours.get(a) ?? new Set<ID>(); ids.add(b); neighbours.set(a, ids); } }
    let frontier = new Set<ID>([options.focusId]);
    for (let hop = 0; hop < (options.hops ?? 1); hop++) { const next = new Set<ID>(); for (const id of frontier) for (const target of neighbours.get(id) ?? []) if (!reached.has(target)) { reached.add(target); next.add(target); } frontier = next; }
    lines = lines.filter(line => reached.has(line.fromId) && reached.has(line.toId));
  }
  const query = options.query?.trim().toLocaleLowerCase();
  if (query) lines = lines.filter(line => [line.label, index.get(line.fromId)?.name, index.get(line.toId)?.name].some(value => value?.toLocaleLowerCase().includes(query)));
  const nodeIds = new Set(lines.flatMap(line => [line.fromId, line.toId])); if (options.focusId && index.has(options.focusId)) nodeIds.add(options.focusId);
  return { nodes: active.filter(entity => nodeIds.has(entity.id)), lines, allLines, hiddenLines: allLines.length - lines.length, inactiveLines: candidates.filter(line => line.assessment.value === 'false').length, uncertainLines: lines.filter(line => line.assessment.value === 'unknown').length, missingEndpoints };
}

export function alignGraphPositions(ids: ID[], positions: Record<ID, { x: number; y: number }>, mode: 'row' | 'column' | 'grid'): Record<ID, { x: number; y: number }> {
  if (!ids.length) return positions;
  const first = positions[ids[0]] ?? { x: 120, y: 100 }, result = { ...positions };
  const columns = mode === 'column' ? 1 : mode === 'row' ? ids.length : 4, rows = Math.ceil(ids.length / columns);
  const start = { x: Math.max(80, Math.min(first.x, 10000)), y: Math.max(80, Math.min(first.y, 10000)) };
  const dx = columns > 1 ? Math.min(220, (10000 - start.x) / (columns - 1)) : 0, dy = rows > 1 ? Math.min(120, (10000 - start.y) / (rows - 1)) : 0;
  ids.forEach((id, i) => { result[id] = { x: start.x + i % columns * dx, y: start.y + Math.floor(i / columns) * dy }; });
  return result;
}
