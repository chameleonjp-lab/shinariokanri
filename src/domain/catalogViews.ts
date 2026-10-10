import type { Entity, ID, ProjectData, TimeSpec } from './types';
import { adoptedRecord } from './adoption';
import { compareTicks, resolveEventTimes, resolveTime, type TimeResolution } from './time';

export interface CatalogDate {
  sourceId: ID;
  label: string;
  time: TimeResolution;
}
export interface CatalogTimelineEntry {
  id: ID;
  entity: Entity;
  dates: CatalogDate[];
}

/** A view of the supplied result IDs, never another authored collection or world truth. */
export function catalogTimelineEntries(project: ProjectData, results: readonly Entity[]): CatalogTimelineEntry[] {
  const active = project.entities.filter(entity => !entity.deletedAt);
  const index = new Map(active.map(entity => [entity.id, entity]));
  const events = active.filter((entity): entity is Entity<'event'> => entity.kind === 'event' && adoptedRecord(entity));
  const times = resolveEventTimes(events);
  const lineEvents = new Map<ID, ID[]>();
  for (const scene of active) if (scene.kind === 'scene' && adoptedRecord(scene)) {
    for (const id of scene.data.dialogueLineIds ?? []) lineEvents.set(id, [...(lineEvents.get(id) ?? []), ...scene.data.eventIds]);
  }
  const date = (id: ID): CatalogDate => {
    const source = index.get(id);
    return { sourceId: id, label: source?.name || '参照先未確認', time: times.get(id) ?? { status: 'unknown', reason: source?.status === 'rejected' ? '没の出来事は現在有効な日時へ含めません。' : '出来事の参照先が削除・不明です。', path: [id] } };
  };
  const life = (entity: Entity<'character'>, spec: TimeSpec | null | undefined, label: string): CatalogDate[] => spec ? [{ sourceId: entity.id, label, time: resolveTime(spec, events) }] : [];
  const entries = results.map(entity => {
    let dates: CatalogDate[] = [];
    if (entity.kind === 'event') dates = [date(entity.id)];
    else if (entity.kind === 'scene') dates = [...new Set(entity.data.eventIds)].map(date);
    else if (entity.kind === 'chapter') dates = [...new Set(entity.data.sceneIds.flatMap(id => {
      const scene = index.get(id);
      return scene?.kind === 'scene' && adoptedRecord(scene) ? scene.data.eventIds : [];
    }))].map(date);
    else if (entity.kind === 'dialogue_line') dates = [...new Set(lineEvents.get(entity.id) ?? [])].map(date);
    else if (entity.kind === 'character') dates = [...life(entity, entity.data.birth, '出生'), ...life(entity, entity.data.death, '死亡')];
    dates.sort((a, b) => compareDates(a.time, b.time));
    return { id: entity.id, entity, dates };
  });
  // Independent calendars are grouped, never compared as if their ticks shared an origin.
  return entries.sort((a, b) => compareDates(a.dates[0]?.time, b.dates[0]?.time) || a.entity.name.localeCompare(b.entity.name) || a.id.localeCompare(b.id));
}
function compareDates(a?: TimeResolution, b?: TimeResolution) {
  if (a?.status !== 'resolved') return b?.status === 'resolved' ? 1 : 0;
  if (b?.status !== 'resolved') return -1;
  return a.calendarId.localeCompare(b.calendarId) || compareTicks(a.earliest, b.earliest);
}
