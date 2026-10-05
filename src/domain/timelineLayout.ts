import type { Entity, ID, ProjectData, Tick } from './types';
import { compareTicks, parseTick, type TimeResolution } from './time';

export interface TimelineLane { id: string; name: string; kind: 'common' | 'group' | 'character'; groupId?: ID; characterId?: ID; depth: number; eventIds: ID[] }
export interface TimelineBox { eventId: ID; laneId: string; left: number; width: number; slot: number }
export interface TimelineRow { lane: TimelineLane; top: number; height: number; boxes: TimelineBox[] }
export interface TimelinePoint { laneId: string; x: number; y: number }
export interface TimelineLayout { rows: TimelineRow[]; height: number; positions: Map<ID, TimelinePoint[]>; visibleEventIds: Set<ID>; displayedBoxes: number }

/** Repeated lanes reference the same character/event IDs; folding never edits participation. */
export function buildTimelineLanes(project: ProjectData, collapsedIds: ID[] = []): TimelineLane[] {
  const characters = new Map<ID, Entity<'character'>>(), groups: Entity<'group'>[] = [], common: ID[] = [], byCharacter = new Map<ID, ID[]>();
  for (const entity of project.entities) {
    if (entity.deletedAt) continue;
    if (entity.kind === 'character') characters.set(entity.id, entity);
    else if (entity.kind === 'group' && ['display', 'faction'].includes(entity.data.groupType)) groups.push(entity);
    else if (entity.kind === 'event') {
      if (entity.data.laneRole !== 'participants') common.push(entity.id);
      if (entity.data.laneRole !== 'common') for (const characterId of new Set((entity.data.participants ?? []).map(participant => participant.characterId))) {
        const ids = byCharacter.get(characterId) ?? []; ids.push(entity.id); byCharacter.set(characterId, ids);
      }
    }
  }
  const lanes: TimelineLane[] = [{ id: 'common', name: '共通の出来事', kind: 'common', depth: 0, eventIds: common }];
  const groupIds = new Set(groups.map(group => group.id)), collapsed = new Set(collapsedIds), referenced = new Set<ID>(), children = new Map<ID, Entity<'group'>[]>();
  for (const group of groups) {
    for (const member of group.data.members ?? []) if (characters.has(member)) referenced.add(member);
    if (group.data.parentId && groupIds.has(group.data.parentId)) { const nested = children.get(group.data.parentId) ?? []; nested.push(group); children.set(group.data.parentId, nested); }
  }
  const visited = new Set<ID>();
  const addTree = (root: Entity<'group'>) => {
    const pending: { group: Entity<'group'>; depth: number; hidden: boolean }[] = [{ group: root, depth: 0, hidden: false }];
    while (pending.length) {
      const { group, depth, hidden } = pending.pop()!;
      if (visited.has(group.id)) continue;
      visited.add(group.id);
      if (!hidden) lanes.push({ id: group.id, name: group.name, kind: 'group', groupId: group.id, depth, eventIds: [] });
      const folded = hidden || collapsed.has(group.id);
      if (!folded) for (const id of group.data.members ?? []) {
        const character = characters.get(id);
        if (character) lanes.push({ id: `member:${group.id}:${id}`, name: character.name, kind: 'character', groupId: group.id, characterId: id, depth: depth + 1, eventIds: byCharacter.get(id) ?? [] });
      }
      const nested = children.get(group.id) ?? [];
      for (let i = nested.length - 1; i >= 0; i--) pending.push({ group: nested[i], depth: depth + 1, hidden: folded });
    }
  };
  for (const group of groups) if (!group.data.parentId || !groupIds.has(group.data.parentId)) addTree(group);
  // Invalid imported trees still remain inspectable; validation handles the actual cycle.
  for (const group of groups) if (!visited.has(group.id)) addTree(group);
  for (const character of characters.values()) if (!referenced.has(character.id)) lanes.push({ id: character.id, name: character.name, kind: 'character', characterId: character.id, depth: 0, eventIds: byCharacter.get(character.id) ?? [] });
  return lanes;
}

interface SlotEnd { end: number; slot: number }
class SlotHeap {
  private items: SlotEnd[] = [];
  get first() { return this.items[0]; }
  private before(a: SlotEnd, b: SlotEnd) { return a.end < b.end || (a.end === b.end && a.slot < b.slot); }
  push(value: SlotEnd) {
    this.items.push(value); let i = this.items.length - 1;
    while (i > 0) { const parent = (i - 1) >> 1; if (!this.before(value, this.items[parent])) break; this.items[i] = this.items[parent]; i = parent; } this.items[i] = value;
  }
  pop(): SlotEnd {
    const first = this.items[0], last = this.items.pop()!;
    if (this.items.length) { let i = 0; while (i * 2 + 1 < this.items.length) { let child = i * 2 + 1; if (child + 1 < this.items.length && this.before(this.items[child + 1], this.items[child])) child++; if (!this.before(this.items[child], last)) break; this.items[i] = this.items[child]; i = child; } this.items[i] = last; }
    return first;
  }
}
/** No per-lane cutoff. Coordinates convert derived ratios only; world ticks remain strings. */
export function buildTimelineLayout(lanes: TimelineLane[], times: Map<ID, TimeResolution>, origin: Tick, end: Tick, minimumWidth = 13): TimelineLayout {
  const start = parseTick(origin), stop = parseTick(end), span = stop - start;
  if (span <= 0n) throw new RangeError('年表の表示範囲は正の幅が必要です。');
  const percent = (tick: Tick) => Number((parseTick(tick) - start) * 1_000_000n / span) / 10_000;
  const positions = new Map<ID, TimelinePoint[]>(), visibleEventIds = new Set<ID>(), rows: TimelineRow[] = [];
  let top = 50, displayedBoxes = 0;
  for (const lane of lanes) {
    if (lane.kind === 'group') { rows.push({ lane, top, height: 44, boxes: [] }); top += 44; continue; }
    const visible = lane.eventIds.filter(id => { const time = times.get(id); return time?.status === 'resolved' && parseTick(time.earliest) <= stop && parseTick(time.endLatest) >= start; });
    visible.sort((a, b) => {
      const x = times.get(a), y = times.get(b);
      if (x?.status !== 'resolved' || y?.status !== 'resolved') return 0;
      return compareTicks(x.earliest, y.earliest) || compareTicks(x.endLatest, y.endLatest) || a.localeCompare(b);
    });
    const heap = new SlotHeap(), boxes: TimelineBox[] = []; let slotCount = 0;
    for (const id of visible) {
      const time = times.get(id); if (time?.status !== 'resolved') continue;
      const rawLeft = Math.max(0, percent(time.earliest)), right = Math.min(100, percent(time.endLatest));
      const left = Math.min(100 - minimumWidth, rawLeft), width = Math.min(100 - left, Math.max(minimumWidth, right - left));
      const slot = heap.first && heap.first.end + 1 <= left ? heap.pop().slot : slotCount++;
      heap.push({ end: left + width, slot }); boxes.push({ eventId: id, laneId: lane.id, left, width, slot }); visibleEventIds.add(id);
      const points = positions.get(id) ?? []; points.push({ laneId: lane.id, x: left + width / 2, y: top + slot * 60 + 36 }); positions.set(id, points);
    }
    const height = Math.max(88, slotCount * 60 + 24); rows.push({ lane, top, height, boxes }); top += height; displayedBoxes += boxes.length;
  }
  return { rows, height: top, positions, visibleEventIds, displayedBoxes };
}
/** A vertical window can reveal every box by scrolling, including a single highly overlapping lane. */
export function timelineWindow(layout: TimelineLayout, scrollTop: number, viewportHeight: number, overscan = 120): { row: TimelineRow; boxes: TimelineBox[] }[] {
  const start = Math.max(0, scrollTop - overscan), end = scrollTop + viewportHeight + overscan;
  return layout.rows.filter(row => row.top + row.height >= start && row.top <= end).map(row => ({ row, boxes: row.boxes.filter(box => { const top = row.top + box.slot * 60 + 12; return top + 48 >= start && top <= end; }) }));
}
