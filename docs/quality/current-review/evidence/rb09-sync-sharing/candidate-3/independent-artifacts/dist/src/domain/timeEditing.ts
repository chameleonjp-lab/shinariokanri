import type { CalendarDefinition, Entity, EventData, ID, ProjectData, Tick, TimeConstraint, TimeSpec, ValidationIssue } from './types';
import { addTicks, calendarDateToTick, compareTicks, floorDiv, isTick, MAX_TICK, parseTick, resolveEventTimes, resolveRelativeTime, resolveTime, tickToCalendarDate, toTick, type CalendarDate, type ResolvedTime, type TimeResolution } from './time';

export type CalendarDisplayUnit = 'tick' | 'hour' | 'day' | 'month' | 'year' | 'custom';
export interface DisplayUnitChoice { key: CalendarDisplayUnit; label: string; available: boolean; reason?: string }
export function calendarDisplayUnits(calendar: CalendarDefinition): DisplayUnitChoice[] {
  return [
    { key: 'tick', label: 'tick', available: true },
    { key: 'hour', label: '時', available: calendar.kind === 'gregorian', ...(calendar.kind !== 'gregorian' ? { reason: 'この暦には時の定義がありません。' } : {}) },
    { key: 'day', label: '日', available: true }, { key: 'month', label: '月', available: true },
    { key: 'year', label: '年', available: true }, { key: 'custom', label: '独自表示単位', available: true },
  ];
}

function boundedDateTick(date: CalendarDate, calendar: CalendarDefinition, side: 'start' | 'end'): Tick {
  try { return calendarDateToTick(date, calendar); }
  catch (error) {
    if (error instanceof RangeError && /38桁/.test(error.message)) return (side === 'start' ? -MAX_TICK : MAX_TICK).toString();
    throw error;
  }
}
function nextMonth(date: CalendarDate, calendar: CalendarDefinition): CalendarDate {
  const year = parseTick(date.year);
  const monthCount = calendar.kind === 'gregorian' ? 12 : calendar.years[Number(year - floorDiv(year, BigInt(calendar.years.length)) * BigInt(calendar.years.length))].months.length;
  return date.month < monthCount ? { year: date.year, month: date.month + 1, day: 1, tickOfDay: '0' } : { year: (year + 1n).toString(), month: 1, day: 1, tickOfDay: '0' };
}
/** Calendar boundaries are derived from the selected calendar, never a 30/365 day approximation. */
export function calendarUnitBounds(at: Tick, calendar: CalendarDefinition, unit: Exclude<CalendarDisplayUnit, 'custom'>): { start: Tick; end: Tick } {
  const value = parseTick(at);
  if (unit === 'month' || unit === 'year') {
    const date = tickToCalendarDate(at, calendar);
    const startDate = { year: date.year, month: unit === 'year' ? 1 : date.month, day: 1, tickOfDay: '0' };
    const endDate = unit === 'year' ? { ...startDate, year: (parseTick(date.year) + 1n).toString() } : nextMonth(startDate, calendar);
    return { start: boundedDateTick(startDate, calendar, 'start'), end: boundedDateTick(endDate, calendar, 'end') };
  }
  if (unit === 'hour' && calendar.kind !== 'gregorian') throw new RangeError('この暦には時の定義がありません。');
  const width = unit === 'day' ? parseTick(calendar.ticksPerDay) : unit === 'hour' ? 3600n : 1n;
  const start = floorDiv(value, width) * width, end = start + width;
  return { start: (start < -MAX_TICK ? -MAX_TICK : start).toString(), end: (end > MAX_TICK ? MAX_TICK : end).toString() };
}
export function displayUnitTicks(at: Tick, calendar: CalendarDefinition, unit: CalendarDisplayUnit, customTicks: Tick = '1'): bigint {
  if (unit === 'custom') { const width = parseTick(customTicks); if (width <= 0n) throw new RangeError('独自表示単位のtick数は正の整数です。'); return width; }
  const bounds = calendarUnitBounds(at, calendar, unit);
  const distance = parseTick(bounds.end) - parseTick(bounds.start);
  return distance > 0n ? distance : 1n;
}
export function calendarAxisTicks(origin: Tick, end: Tick, calendar: CalendarDefinition, unit: CalendarDisplayUnit, customTicks: Tick = '1'): Tick[] {
  const start = parseTick(origin), stop = parseTick(end), span = stop - start;
  if (span <= 0n) return [origin];
  const result = new Set<Tick>();
  for (let i = 0; i <= 6; i++) {
    const sample = toTick(start + span * BigInt(i) / 6n);
    const at = unit === 'custom' ? (floorDiv(parseTick(sample), displayUnitTicks(sample, calendar, unit, customTicks)) * parseTick(customTicks)).toString() : calendarUnitBounds(sample, calendar, unit).start;
    if (isTick(at) && parseTick(at) >= start && parseTick(at) <= stop) result.add(at);
  }
  // Narrow calendar ranges may have few boundaries; include each of them, with a bounded loop.
  if (unit === 'month' || unit === 'year') {
    let cursor = calendarUnitBounds(origin, calendar, unit).end;
    const narrow: Tick[] = [];
    for (let i = 0; i < 8 && parseTick(cursor) <= stop; i++) {
      narrow.push(cursor);
      const next = calendarUnitBounds(cursor, calendar, unit).end;
      if (next === cursor) break;
      cursor = next;
    }
    if (narrow.length < 8 || parseTick(cursor) > stop) for (const tick of narrow) result.add(tick);
  }
  return [...result].sort(compareTicks);
}

const relativeResolution = (time: Extract<TimeSpec, { mode: 'relative' }>, anchor: TimeResolution, eventId: ID): TimeResolution => resolveRelativeTime(time, anchor, [eventId]);
export { resolveEventTimes } from './time';

export interface TimeEdit { eventId: ID; time: TimeSpec; constraints?: TimeConstraint[] }
export interface TimeEditChange { eventId: ID; before: TimeSpec; after: TimeSpec; beforeConstraints: TimeConstraint[] | null | undefined; afterConstraints: TimeConstraint[] | null | undefined; reason: string }
export interface TimeEditImpact { eventId: ID; before: TimeResolution; after: TimeResolution; reason: string; fixed: boolean }
export interface TimeEditPreview {
  projectId: ID; baseRevision: string; candidate: ProjectData; changes: TimeEditChange[]; impacts: TimeEditImpact[];
  conflicts: ValidationIssue[]; canApply: boolean; requestedEventId: ID;
}
export interface TimeEditOptions { moveDependents?: boolean; movableEventIds?: ID[]; referenceEvents?: Entity<'event'>[] }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function issue(eventId: ID, message: string): ValidationIssue { return { code: 'TIME_CONSTRAINT_CONFLICT', path: `entities.${eventId}.data.time`, message }; }
function shiftedTime(time: TimeSpec, delta: bigint): TimeSpec {
  const shift = (value: Tick) => toTick(parseTick(value) + delta);
  if (time.mode === 'instant') return { ...time, at: shift(time.at) };
  if (time.mode === 'interval') return { ...time, start: shift(time.start), end: shift(time.end) };
  if (time.mode === 'uncertain') return { ...time, earliest: shift(time.earliest), latest: shift(time.latest) };
  throw new RangeError('相対日時・未定日時の式は連動移動で変更しません。');
}
interface ConstraintEdge { sourceId: ID; constraint: TimeConstraint }
function permittedShift(source: ResolvedTime, target: ResolvedTime, constraint: TimeConstraint): { lower?: bigint; upper?: bigint } {
  if (source.calendarId !== target.calendarId) throw new RangeError('暦の対応が未定の出来事同士は連動移動できません。');
  if (constraint.type === 'before') return { lower: parseTick(source.endEarliest) + (source.mode === 'interval' ? 0n : 1n) - parseTick(target.latest) };
  if (constraint.type === 'same_start') return { lower: parseTick(source.earliest) - parseTick(target.latest), upper: parseTick(source.latest) - parseTick(target.earliest) };
  const minimum = parseTick(constraint.minimumTicks), maximum = parseTick(constraint.maximumTicks);
  if (minimum > maximum) throw new RangeError('日時差の最小値は最大値以下です。');
  return { lower: parseTick(source.endEarliest) + minimum - parseTick(target.latest), upper: parseTick(source.endLatest) + maximum - parseTick(target.earliest) };
}

/** Build a reviewable candidate. Only individually approved absolute dependents can move. */
export function previewTimeEdit(project: ProjectData, edit: TimeEdit, options: TimeEditOptions = {}): TimeEditPreview {
  const local = project.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event' && !entity.deletedAt), localIds = new Set(local.map(event => event.id));
  const original = [...local, ...(options.referenceEvents ?? []).filter(event => !event.deletedAt && !localIds.has(event.id))];
  const originalIndex = new Map(original.map(event => [event.id, event]));
  const beforeTimes = resolveEventTimes(original), conflicts: ValidationIssue[] = [];
  const source = originalIndex.get(edit.eventId);
  const base = { projectId: project.projectId, baseRevision: project.revision, requestedEventId: edit.eventId };
  if (!source || !localIds.has(edit.eventId)) return { ...base, candidate: project, changes: [], impacts: [], conflicts: [issue(edit.eventId, '変更する出来事がありません。共通世界の固定日時は元情報から改訂してください。')], canApply: false };
  const events = original.map(event => event.id === edit.eventId ? { ...event, data: { ...event.data, time: edit.time, ...(edit.constraints !== undefined ? { constraints: edit.constraints } : {}) } } : event);
  const index = new Map(events.map(event => [event.id, event]));
  const times = resolveEventTimes(events), incoming = new Map<ID, ConstraintEdge[]>(), outgoing = new Map<ID, Set<ID>>(), indegree = new Map(events.map(event => [event.id, 0]));
  const addDependency = (from: ID, to: ID) => {
    if (!index.has(from) || !index.has(to)) { conflicts.push(issue(to, '日時の依存先となる出来事がありません。')); return; }
    const edges = outgoing.get(from) ?? new Set<ID>();
    if (!edges.has(to)) { edges.add(to); outgoing.set(from, edges); indegree.set(to, (indegree.get(to) ?? 0) + 1); }
  };
  for (const event of events) {
    if (event.data.time.mode === 'relative') addDependency(event.data.time.anchorEventId, event.id);
    for (const constraint of event.data.constraints ?? []) {
      const edges = incoming.get(constraint.targetEventId) ?? [];
      edges.push({ sourceId: event.id, constraint }); incoming.set(constraint.targetEventId, edges); addDependency(event.id, constraint.targetEventId);
    }
  }
  const order = events.filter(event => indegree.get(event.id) === 0).map(event => event.id);
  for (let cursor = 0; cursor < order.length; cursor++) for (const target of outgoing.get(order[cursor]) ?? []) {
    const count = indegree.get(target)! - 1; indegree.set(target, count); if (count === 0) order.push(target);
  }
  if (order.length !== events.length) for (const event of events) if (indegree.get(event.id)) conflicts.push(issue(event.id, '相対日時・日時制約の依存が循環しています。連動先を確認してください。'));
  const affected = new Set<ID>([edit.eventId]), pending = [edit.eventId];
  for (let cursor = 0; cursor < pending.length; cursor++) for (const target of outgoing.get(pending[cursor]) ?? []) if (!affected.has(target)) { affected.add(target); pending.push(target); }
  const approved = new Set((options.movableEventIds ?? []).filter(id => localIds.has(id))), reasons = new Map<ID, string>([[edit.eventId, '指定した日時・制約の変更']]);
  for (const id of order) {
    let event = index.get(id)!;
    if (event.data.time.mode === 'relative') times.set(id, relativeResolution(event.data.time, times.get(event.data.time.anchorEventId) ?? { status: 'unknown', reason: '基準となる出来事がありません。', path: [event.data.time.anchorEventId] }, id));
    const targetTime = times.get(id)!;
    if (targetTime.status !== 'resolved') continue;
    let lower: bigint | undefined, upper: bigint | undefined;
    for (const edge of incoming.get(id) ?? []) {
      const sourceTime = times.get(edge.sourceId);
      if (sourceTime?.status !== 'resolved') continue;
      try {
        const bound = permittedShift(sourceTime, targetTime, edge.constraint);
        if (bound.lower !== undefined && (lower === undefined || bound.lower > lower)) lower = bound.lower;
        if (bound.upper !== undefined && (upper === undefined || bound.upper < upper)) upper = bound.upper;
      } catch (error) { conflicts.push(issue(id, error instanceof Error ? error.message : '日時制約を解決できません。')); }
    }
    if (lower !== undefined && upper !== undefined && lower > upper) { conflicts.push(issue(id, '複数の日時制約を同時に満たせません。')); continue; }
    const delta = lower !== undefined && lower > 0n ? lower : upper !== undefined && upper < 0n ? upper : 0n;
    if (!delta || !affected.has(id) || id === edit.eventId) continue;
    if (!options.moveDependents || !approved.has(id) || event.data.time.mode === 'relative' || !localIds.has(id)) {
      reasons.set(id, !localIds.has(id) ? '共通世界の固定日時と衝突。作品側の日時・制約か、参照する世界版を確認してください。' : event.data.time.mode === 'relative' ? '相対日時の式と日時制約が衝突' : '固定日時と衝突。移動を承認するか制約を修正してください。');
      continue;
    }
    try {
      const time = shiftedTime(event.data.time, delta);
      event = { ...event, data: { ...event.data, time } }; index.set(id, event); times.set(id, resolveTime(time, [], [id])); reasons.set(id, '承認した日時制約の連動移動');
    } catch (error) { conflicts.push(issue(id, error instanceof Error ? error.message : '日時を移動できません。')); }
  }
  // Check the final candidate, including constraints coming in from an unchanged source.
  for (const event of index.values()) {
    const at = times.get(event.id)!;
    if (at.status === 'conflict') conflicts.push(issue(event.id, at.reason));
    for (const constraint of event.data.constraints ?? []) {
      const target = times.get(constraint.targetEventId);
      if (at.status !== 'resolved' || target?.status !== 'resolved') continue;
      try {
        const bound = permittedShift(at, target, constraint);
        if ((bound.lower !== undefined && bound.lower > 0n) || (bound.upper !== undefined && bound.upper < 0n)) {
          affected.add(event.id); affected.add(constraint.targetEventId);
          const name = originalIndex.get(constraint.targetEventId)?.name || constraint.targetEventId;
          conflicts.push(issue(event.id, `「${name}」との日時制約に衝突しています${!approved.has(constraint.targetEventId) ? '（連動先は固定日時）' : ''}。`));
        }
      } catch (error) { conflicts.push(issue(event.id, error instanceof Error ? error.message : '日時制約を解決できません。')); }
    }
  }
  const changes: TimeEditChange[] = [], impacts: TimeEditImpact[] = [];
  for (const event of index.values()) {
    const before = originalIndex.get(event.id)!;
    if (!same(before.data.time, event.data.time) || !same(before.data.constraints, event.data.constraints)) changes.push({ eventId: event.id, before: before.data.time, after: event.data.time, beforeConstraints: before.data.constraints, afterConstraints: event.data.constraints, reason: reasons.get(event.id) ?? '日時制約の連動移動' });
    if (affected.has(event.id) || !same(beforeTimes.get(event.id), times.get(event.id))) impacts.push({ eventId: event.id, before: beforeTimes.get(event.id)!, after: times.get(event.id)!, reason: reasons.get(event.id) ?? (event.data.time.mode === 'relative' ? '基準となる出来事からの相対日時' : '日時制約の連動先'), fixed: event.id !== edit.eventId && event.data.time.mode !== 'relative' && !approved.has(event.id) });
  }
  const uniqueConflicts = [...new Map(conflicts.map(conflict => [`${conflict.path}:${conflict.message}`, conflict])).values()];
  const candidate = { ...project, entities: project.entities.map(entity => entity.kind === 'event' && index.has(entity.id) ? index.get(entity.id)! : entity) };
  return { ...base, candidate, changes, impacts, conflicts: uniqueConflicts, canApply: changes.length > 0 && uniqueConflicts.length === 0 };
}
export function applyTimeEditPreview(project: ProjectData, preview: TimeEditPreview): ProjectData {
  if (project.projectId !== preview.projectId || project.revision !== preview.baseRevision) throw new Error('日時の確認後に作品が変更されました。現在版で差分を確認し直してください。');
  if (!preview.canApply) throw new Error(preview.conflicts[0]?.message || '変更する日時がありません。');
  return preview.candidate;
}
/** Restore exactly the applied fields while preserving unrelated changes made afterwards. */
export function undoTimeEdit(project: ProjectData, changes: TimeEditChange[]): ProjectData {
  const edits = new Map(changes.map(change => [change.eventId, change]));
  const current = new Map(project.entities.map(entity => [entity.id, entity]));
  for (const change of changes) {
    const event = current.get(change.eventId);
    if (event?.kind !== 'event' || event.deletedAt || !same(event.data.time, change.after) || !same(event.data.constraints, change.afterConstraints)) throw new Error('連動移動した日時が後から変更されています。取消前に現在版を確認してください。');
  }
  return { ...project, entities: project.entities.map(entity => {
    const change = edits.get(entity.id);
    if (entity.kind !== 'event' || !change) return entity;
    const data: EventData = { ...entity.data, time: change.before };
    if (change.beforeConstraints === undefined) delete data.constraints; else data.constraints = change.beforeConstraints;
    return { ...entity, data };
  }) };
}

export function shiftAllEventTimes(project: ProjectData, offset: Tick, referenceEvents: Entity<'event'>[] = []): TimeEditPreview {
  const delta = parseTick(offset), changes: TimeEditChange[] = [], conflicts: ValidationIssue[] = [];
  const beforeEvents = project.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event' && !entity.deletedAt);
  const entities = project.entities.map(entity => {
    if (entity.kind !== 'event' || entity.deletedAt || ['unknown', 'relative'].includes(entity.data.time.mode)) return entity;
    try {
      const time = shiftedTime(entity.data.time, delta);
      if (!same(time, entity.data.time)) changes.push({ eventId: entity.id, before: entity.data.time, after: time, beforeConstraints: entity.data.constraints, afterConstraints: entity.data.constraints, reason: '全出来事の日時を移動' });
      return { ...entity, data: { ...entity.data, time } };
    } catch (error) { conflicts.push(issue(entity.id, error instanceof Error ? error.message : '日時を移動できません。')); return entity; }
  });
  const localIds = new Set(beforeEvents.map(event => event.id)), references = referenceEvents.filter(event => !event.deletedAt && !localIds.has(event.id)), afterEvents = entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event' && !entity.deletedAt);
  const before = resolveEventTimes([...beforeEvents, ...references]), after = resolveEventTimes([...afterEvents, ...references]);
  for (const [id, time] of after) if (time.status === 'conflict') conflicts.push(issue(id, time.reason));
  for (const event of [...afterEvents, ...references]) for (const constraint of event.data.constraints ?? []) {
    const source = after.get(event.id), target = after.get(constraint.targetEventId); if (source?.status !== 'resolved' || target?.status !== 'resolved') continue;
    try { const bound = permittedShift(source, target, constraint); if (bound.lower !== undefined && bound.lower > 0n || bound.upper !== undefined && bound.upper < 0n) conflicts.push(issue(event.id, '移動後の日時が前後・同時・時間差の条件と衝突します。固定した共通世界の出来事は移動しません。')); } catch (error) { conflicts.push(issue(event.id, (error as Error).message)); }
  }
  const impacts = beforeEvents.filter(event => !same(before.get(event.id), after.get(event.id))).map(event => ({ eventId: event.id, before: before.get(event.id)!, after: after.get(event.id)!, reason: event.data.time.mode === 'relative' ? '相対日時は基準の移動に追随' : '全出来事の日時を移動', fixed: false }));
  return { projectId: project.projectId, baseRevision: project.revision, requestedEventId: '', candidate: { ...project, entities }, changes, impacts, conflicts, canApply: changes.length > 0 && conflicts.length === 0 };
}

export interface CharacterTimeSummary { age: string; state: 'alive' | 'dead' | 'unborn' | 'uncertain' | 'unknown'; reason?: string }
function ageAt(birth: Tick, at: Tick, calendar: CalendarDefinition): bigint {
  const born = tickToCalendarDate(birth, calendar), date = tickToCalendarDate(at, calendar);
  const anniversary = calendarDateToTick({ ...born, year: date.year }, calendar);
  return parseTick(date.year) - parseTick(born.year) - (parseTick(at) < parseTick(anniversary) ? 1n : 0n);
}
export function characterTimeSummary(character: Entity<'character'>, at: Tick, calendar: CalendarDefinition, events: Entity<'event'>[], eventTimes?: Map<ID, TimeResolution>): CharacterTimeSummary {
  const times = eventTimes ?? (character.data.birth?.mode === 'relative' || character.data.death?.mode === 'relative' ? resolveEventTimes(events) : new Map<ID, TimeResolution>());
  const lifeTime = (time: TimeSpec | null | undefined) => time ? time.mode === 'relative' ? relativeResolution(time, times.get(time.anchorEventId) ?? { status: 'unknown', reason: '基準となる出来事がありません。', path: [time.anchorEventId] }, character.id) : resolveTime(time, [], [character.id]) : undefined;
  const birth = lifeTime(character.data.birth), death = lifeTime(character.data.death);
  if (!birth || birth.status !== 'resolved' || birth.calendarId !== calendar.id) return { age: '年齢不明', state: death?.status === 'resolved' && death.calendarId === calendar.id && compareTicks(at, death.latest) >= 0 ? 'dead' : 'unknown', reason: birth && birth.status !== 'resolved' ? birth.reason : '生年月日または暦の対応が未定です。' };
  if (compareTicks(at, birth.earliest) < 0) return { age: '未誕生', state: 'unborn' };
  let state: CharacterTimeSummary['state'] = compareTicks(at, birth.latest) < 0 ? 'uncertain' : 'alive';
  if (death?.status === 'resolved' && death.calendarId === calendar.id) state = compareTicks(at, death.latest) >= 0 ? 'dead' : compareTicks(at, death.earliest) >= 0 ? 'uncertain' : state;
  else if (death && (death.status !== 'resolved' || death.calendarId !== calendar.id)) state = 'uncertain';
  try {
    const minimum = compareTicks(at, birth.latest) < 0 ? 0n : ageAt(birth.latest, at, calendar), maximum = ageAt(birth.earliest, at, calendar);
    return { age: minimum === maximum ? `${minimum}歳` : `${minimum}〜${maximum}歳`, state, ...(state === 'uncertain' ? { reason: '誕生・死亡の時期に不確定な範囲があります。' } : {}) };
  } catch { return { age: '年齢不明', state, reason: 'この年には誕生日に対応する日がありません。暦の対応を確認してください。' }; }
}
