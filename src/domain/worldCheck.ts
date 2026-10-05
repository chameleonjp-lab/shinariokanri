import type { Condition, Entity, ID, ProjectData, Tick, TimeRange, TypedValue, Validity } from './types';
import { collectReferences } from './model';
import { compareTicks, isTick, parseTick, type ResolvedTime } from './time';
import { resolveEventTimes } from './timeEditing';
import { assessWorldValidity, assertionReference, compatibleLocations, WORLD_PREDICATES, worldPeriodsOverlap, type WorldPoint } from './world';

export type WorldCheckKind = 'time' | 'location' | 'travel' | 'ownership' | 'condition' | 'after_death' | 'analysis_limit';
export interface WorldCheckCandidate {
  id: string; kind: WorldCheckKind; targetIds: ID[]; evidenceIds: ID[]; reason: string; paths: string[];
  disposition: 'candidate'; certainty: 'supported' | 'uncertain' | 'intentional'; worldRange: TimeRange | null;
}
export interface WorldCheckOptions extends WorldPoint { maximumPairs?: number }
export interface WorldCheckReport { candidates: WorldCheckCandidate[]; complete: boolean; checkedPairs: number }
function finding(kind: WorldCheckKind, ids: ID[], reason: string, certainty: WorldCheckCandidate['certainty'] = 'uncertain', evidence: ID[] = [], worldRange: TimeRange | null = null, paths: string[] = []): WorldCheckCandidate {
  const targetIds = [...new Set(ids)].sort();
  return { id: `${kind}:${targetIds.join(',')}:${paths.join(',')}`, kind, targetIds, evidenceIds: [...new Set([...evidence, ...ids])], reason, paths, disposition: 'candidate', certainty, worldRange };
}
function rangeOf(time: ResolvedTime): TimeRange | null { return compareTicks(time.earliest, time.endLatest) < 0 ? { start: time.earliest, end: time.endLatest } : null; }
function overlaps(a: ResolvedTime, b: ResolvedTime): boolean {
  const left = compareTicks(a.endLatest, b.earliest), right = compareTicks(b.endLatest, a.earliest);
  return (left > 0 || left === 0 && a.mode !== 'interval') && (right > 0 || right === 0 && b.mode !== 'interval');
}
function exact(time: ResolvedTime) { return time.earliest === time.latest && time.endEarliest === time.endLatest; }
function routeCertain(validity: Validity | null | undefined, point: WorldPoint): boolean { return assessWorldValidity(validity ? { ...validity, worldRange: null } : validity, point).value === 'true'; }

interface LiteralBounds { type: TypedValue['type']; permitted?: Set<string>; excluded: Set<string>; lower?: number; upper?: number }
/** Only proves contradictions in declared literal conjunctions; external/missing values are not guessed. */
export function conditionContradiction(condition: Condition | null | undefined): string | undefined {
  if (!condition) return undefined;
  if (condition.op === 'constant') return condition.value ? undefined : '条件が常に偽に設定されています。';
  if (condition.op === 'any') return condition.children.length && condition.children.every(child => conditionContradiction(child)) ? 'すべての代替条件が矛盾しています。' : undefined;
  const atoms: Condition[] = [];
  const collect = (current: Condition) => { if (current.op === 'all') current.children.forEach(collect); else atoms.push(current); };
  collect(condition);
  const bounds = new Map<ID, LiteralBounds>();
  for (const atom of atoms) {
    if (atom.op === 'constant' && !atom.value) return '同時に満たす条件に常に偽の条件があります。';
    if (atom.op !== 'compare') continue;
    const values = Array.isArray(atom.value) ? atom.value : [atom.value];
    if (values.some(value => value.type === 'unknown')) continue;
    const first = values[0]; if (!first) continue;
    const entry = bounds.get(atom.variableId) ?? { type: first.type, excluded: new Set<string>() };
    if (entry.type !== first.type || values.some(value => value.type !== entry.type)) return '同じ状態に異なる型の条件が指定されています。';
    const keys = new Set(values.map(value => JSON.stringify(value.value)));
    if (atom.comparator === 'eq' || atom.comparator === 'in') entry.permitted = entry.permitted ? new Set([...entry.permitted].filter(value => keys.has(value))) : keys;
    else if (atom.comparator === 'ne') keys.forEach(value => entry.excluded.add(value));
    else if (first.type === 'integer') {
      const value = first.value;
      if (atom.comparator === 'gt' || atom.comparator === 'ge') entry.lower = Math.max(entry.lower ?? -Infinity, value + (atom.comparator === 'gt' ? 1 : 0));
      else if (atom.comparator === 'lt' || atom.comparator === 'le') entry.upper = Math.min(entry.upper ?? Infinity, value - (atom.comparator === 'lt' ? 1 : 0));
    }
    bounds.set(atom.variableId, entry);
    if (entry.lower !== undefined && entry.upper !== undefined && entry.lower > entry.upper) return '同じ整数状態の上下限を同時に満たせません。';
    if (entry.permitted && ![...entry.permitted].some(key => { if (entry.excluded.has(key)) return false; const value = JSON.parse(key) as unknown; return typeof value !== 'number' || (entry.lower === undefined || value >= entry.lower) && (entry.upper === undefined || value <= entry.upper); })) return '同じ状態の値を同時に満たせません。';
  }
  return undefined;
}

/** Review candidates carry their source IDs and missing evidence; this never changes a project. */
export function inspectWorldCandidates(project: ProjectData, options: WorldCheckOptions = {}): WorldCheckReport {
  const active = project.entities.filter(entity => !entity.deletedAt), index = new Map(active.map(entity => [entity.id, entity])), events = active.filter((entity): entity is Entity<'event'> => entity.kind === 'event'), times = resolveEventTimes(events);
  const candidates: WorldCheckCandidate[] = [], assertions = active.filter((entity): entity is Entity<'assertion'> => entity.kind === 'assertion' && entity.data.truthKind === 'author_truth');
  const deathProxies: Entity<'event'>[] = active.filter((entity): entity is Entity<'character'> => entity.kind === 'character' && !!entity.data.death).map(person => ({ ...person, kind: 'event', data: { summary: [], time: person.data.death!, laneRole: 'participants', participants: [] } }));
  const deathTimes = resolveEventTimes([...events, ...deathProxies]);
  const maximum = Number.isSafeInteger(options.maximumPairs) && options.maximumPairs! > 0 ? options.maximumPairs! : 20000;
  let checkedPairs = 0, complete = true;
  const checkPair = () => { if (++checkedPairs <= maximum) return true; complete = false; return false; };
  const exceptionFor = (characterId: ID, event: Entity<'event'>, at: Tick) => assertions.find(assertion => assertion.data.subjectId === characterId && assertion.data.predicate === WORLD_PREDICATES.appearance && (assertion.data.sourceIds ?? []).includes(event.id) && !!assertion.data.reason?.trim() && assessWorldValidity(assertion.data.validity, { ...options, at }).value === 'true');
  const physical = new Map<ID, { event: Entity<'event'>; time: ResolvedTime }[]>();
  const dependencies = new Map<ID, Set<ID>>(), indegree = new Map(events.map(event => [event.id, 0]));
  const addDependency = (from: ID, to: ID) => { if (!indegree.has(from) || !indegree.has(to)) return; const edges = dependencies.get(from) ?? new Set<ID>(); if (!edges.has(to)) { edges.add(to); dependencies.set(from, edges); indegree.set(to, indegree.get(to)! + 1); } };
  for (const event of events) {
    const time = times.get(event.id)!;
    if (time.status !== 'resolved') {
      if (time.status === 'conflict' || event.data.time.mode === 'relative') candidates.push(finding('time', [event.id, ...time.path.filter(id => index.has(id))], time.reason, 'uncertain', [], null, ['data.time']));
    }
    if (event.data.time.mode === 'relative') addDependency(event.data.time.anchorEventId, event.id);
    for (const constraint of event.data.constraints ?? []) {
      addDependency(event.id, constraint.targetEventId);
      const other = times.get(constraint.targetEventId);
      if (time.status !== 'resolved' || other?.status !== 'resolved') { candidates.push(finding('time', [event.id, constraint.targetEventId], '前後関係を確認するための日時が未解決です。', 'uncertain', [], null, ['data.constraints'])); continue; }
      let conflict = time.calendarId !== other.calendarId;
      try {
        if (constraint.type === 'before') conflict ||= time.mode === 'interval' ? compareTicks(time.endEarliest, other.latest) > 0 : compareTicks(time.endEarliest, other.latest) >= 0;
        else if (constraint.type === 'same_start') conflict ||= compareTicks(time.earliest, other.latest) > 0 || compareTicks(other.earliest, time.latest) > 0;
        else conflict ||= parseTick(other.latest) - parseTick(time.endEarliest) < parseTick(constraint.minimumTicks) || parseTick(other.earliest) - parseTick(time.endLatest) > parseTick(constraint.maximumTicks);
        if (conflict) candidates.push(finding('time', [event.id, constraint.targetEventId], time.calendarId !== other.calendarId ? '前後関係の暦の対応が未登録です。' : '登録された前後・同時・時間差の条件を満たしていない候補です。', time.calendarId === other.calendarId && exact(time) && exact(other) ? 'supported' : 'uncertain', [], rangeOf(time), ['data.constraints']));
      } catch { candidates.push(finding('time', [event.id, constraint.targetEventId], '登録された時間差を確認できません。整数tickを確認してください。', 'uncertain', [], null, ['data.constraints'])); }
    }
    for (const participant of event.data.participants ?? []) {
      if (!['actor', 'witness'].includes(participant.role) || time.status !== 'resolved') continue;
      const person = index.get(participant.characterId);
      if (person?.kind !== 'character') continue;
      if (event.data.locationId) { const entries = physical.get(person.id) ?? []; if (!entries.some(entry => entry.event.id === event.id)) entries.push({ event, time }); physical.set(person.id, entries); }
      if (person.data.death) {
        const death = deathTimes.get(person.id);
        const endOrder = death?.status === 'resolved' ? compareTicks(time.endLatest, death.earliest) : -1;
        if (death?.status === 'resolved' && death.calendarId === time.calendarId && (endOrder > 0 || endOrder === 0 && time.mode !== 'interval')) {
          const exception = exceptionFor(person.id, event, time.earliest);
          candidates.push(finding('after_death', [person.id, event.id], exception ? `死亡後登場の意図：${exception.data.reason}` : '死亡後に登場する可能性があります。回想・記録・復活などの意図と経路を確認してください。', exception ? 'intentional' : compareTicks(time.earliest, death.latest) >= 0 ? 'supported' : 'uncertain', exception ? [exception.id, ...(exception.data.sourceIds ?? [])] : [], rangeOf(time), ['data.death', 'data.participants']));
        }
      }
    }
  }
  const queue = events.filter(event => !indegree.get(event.id)).map(event => event.id);
  for (let cursor = 0; cursor < queue.length; cursor++) for (const id of dependencies.get(queue[cursor]) ?? []) { const degree = indegree.get(id)! - 1; indegree.set(id, degree); if (!degree) queue.push(id); }
  const cyclic = events.filter(event => indegree.get(event.id)).map(event => event.id);
  if (cyclic.length) candidates.push(finding('time', cyclic, '相対日時・前後関係に循環する依存があります。', 'supported', [], null, ['data.time', 'data.constraints']));
  const routes = active.filter((entity): entity is Entity<'travel_route'> => entity.kind === 'travel_route'), routesByPlaces = new Map<ID, Map<ID, Entity<'travel_route'>[]>>();
  const registerRoute = (from: ID, to: ID, route: Entity<'travel_route'>) => { let destinations = routesByPlaces.get(from); if (!destinations) { destinations = new Map(); routesByPlaces.set(from, destinations); } const entries = destinations.get(to) ?? []; entries.push(route); destinations.set(to, entries); };
  for (const route of routes) { registerRoute(route.data.fromPlaceId, route.data.toPlaceId, route); if (route.data.direction === 'two_way' && route.data.fromPlaceId !== route.data.toPlaceId) registerRoute(route.data.toPlaceId, route.data.fromPlaceId, route); }
  for (const [characterId, entries] of physical) {
    entries.sort((a, b) => compareTicks(a.time.earliest, b.time.earliest));
    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      for (let j = i + 1; j < entries.length; j++) {
        const next = entries[j]; if (compareTicks(next.time.earliest, current.time.endLatest) > 0) break;
        if (!checkPair()) break;
        if (compatibleLocations(current.event.data.locationId!, next.event.data.locationId!, index)) continue;
        if (current.time.calendarId !== next.time.calendarId) { candidates.push(finding('location', [characterId, current.event.id, next.event.id], '異なる場所の出来事について暦の対応が未登録です。同時かどうかを確認できません。', 'uncertain', [], null, ['data.locationId', 'data.time'])); continue; }
        if (!overlaps(current.time, next.time)) continue;
        candidates.push(finding('location', [characterId, current.event.id, next.event.id], '異なる場所での行動・目撃が同時になる候補です。言及・伝聞は居場所として扱いません。', exact(current.time) && exact(next.time) ? 'supported' : 'uncertain', [], rangeOf(current.time), ['data.locationId', 'data.participants', 'data.time']));
      }
      if (!complete) break;
      const next = entries[i + 1]; if (!next || compatibleLocations(current.event.data.locationId!, next.event.data.locationId!, index)) continue;
      const optionsForTrip = (routesByPlaces.get(current.event.data.locationId!)?.get(next.event.data.locationId!) ?? []).filter(route => assessWorldValidity(route.data.validity, { ...options, at: current.time.endEarliest }).value !== 'false');
      const measured = optionsForTrip.filter(route => isTick(route.data.minimumTicks) && route.data.method?.trim() && (route.data.evidence ?? []).length && routeCertain(route.data.validity, options));
      const maximumGap = parseTick(next.time.latest) - parseTick(current.time.endEarliest), minimumGap = parseTick(next.time.earliest) - parseTick(current.time.endLatest);
      const uncertain = current.time.calendarId !== next.time.calendarId || measured.length !== optionsForTrip.length || !measured.length;
      const tooShort = !uncertain && measured.every(route => parseTick(route.data.minimumTicks!) > maximumGap);
      const maybeShort = !uncertain && measured.every(route => parseTick(route.data.minimumTicks!) > minimumGap);
      if (uncertain || tooShort || maybeShort) {
        const exception = exceptionFor(characterId, next.event, next.time.earliest);
        candidates.push(finding('travel', [characterId, current.event.id, next.event.id], exception ? `移動の意図した例外：${exception.data.reason}` : uncertain ? '移動手段・最低時間・根拠・暦または経路が未確認です。移動不可能とは断定しません。' : tooShort ? '登録されたすべての移動経路の最低所要時間より短い候補です。' : '不確定日時の範囲によって移動時間が不足する可能性があります。', exception ? 'intentional' : tooShort ? 'supported' : 'uncertain', [...optionsForTrip.flatMap(route => [route.id, ...(route.data.evidence ?? [])]), ...(exception ? [exception.id] : [])], rangeOf(current.time), ['data.time', 'data.locationId']));
      }
    }
    if (!complete) break;
  }
  const histories = new Map<string, Entity<'assertion'>[]>();
  for (const assertion of assertions) if ([WORLD_PREDICATES.location, WORLD_PREDICATES.ownership].includes(assertion.data.predicate as 'location' | 'owner') && assessWorldValidity(assertion.data.validity, options).value !== 'false') {
    const key = `${assertion.data.subjectId}:${assertion.data.predicate}`, entries = histories.get(key) ?? []; entries.push(assertion); histories.set(key, entries);
  }
  for (const entries of histories.values()) {
    for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
      if (!checkPair()) break;
      const a = entries[i], b = entries[j], x = assertionReference(a.data.value), y = assertionReference(b.data.value), item = index.get(a.data.subjectId);
      if (!x || !y || x === y || !worldPeriodsOverlap(a.data.validity, b.data.validity)) continue;
      if (a.data.predicate === WORLD_PREDICATES.location && compatibleLocations(x, y, index)) continue;
      if (a.data.predicate === WORLD_PREDICATES.ownership && item?.kind === 'item' && item.data.itemMode !== 'instance') continue;
      const certain = !!a.data.validity?.worldRange && !!b.data.validity?.worldRange && routeCertain(a.data.validity, options) && routeCertain(b.data.validity, options);
      candidates.push(finding(a.data.predicate === WORLD_PREDICATES.ownership ? 'ownership' : 'location', [a.data.subjectId, a.id, b.id], a.data.predicate === WORLD_PREDICATES.ownership ? '同じ物品個体に複数の所有者が有効となる候補です。物品種類の複数所持とは区別します。' : '同じ人物・物品に複数の現在地が有効となる候補です。時期と経路を確認してください。', certain ? 'supported' : 'uncertain', [...(a.data.sourceIds ?? []), ...(b.data.sourceIds ?? [])], a.data.validity?.worldRange ?? null, ['data.validity', 'data.value']));
    }
    if (!complete) break;
  }
  for (const entity of active) {
    const declarations: { condition?: Condition | null; path: string }[] = [];
    if (entity.kind === 'flow_edge') declarations.push({ condition: entity.data.condition, path: 'data.condition' });
    if (entity.kind === 'flow_node') declarations.push({ condition: entity.data.gate, path: 'data.gate' });
    if (entity.kind === 'assertion') declarations.push({ condition: entity.data.validity?.routeCondition, path: 'data.validity.routeCondition' });
    for (const declaration of declarations) { const reason = conditionContradiction(declaration.condition); if (reason) candidates.push(finding('condition', [entity.id], reason, 'supported', collectReferences(entity).map(reference => reference.id), null, [declaration.path])); }
  }
  for (const relation of project.relations) if (!relation.deletedAt) { const reason = conditionContradiction(relation.validity.routeCondition); if (reason) candidates.push(finding('condition', [relation.id, relation.fromId, relation.toId], reason, 'supported', relation.evidenceIds, relation.validity.worldRange, ['validity.routeCondition'])); }
  if (!complete) candidates.push(finding('analysis_limit', [], `確認候補の比較は${maximum}組で上限に達しました。範囲を絞って再確認してください。残りは未確認です。`, 'uncertain'));
  return { candidates: [...new Map(candidates.map(candidate => [candidate.id, candidate])).values()], complete, checkedPairs: Math.min(checkedPairs, maximum) };
}
export function findWorldCheckCandidates(project: ProjectData, options: WorldCheckOptions = {}): WorldCheckCandidate[] { return inspectWorldCandidates(project, options).candidates; }
