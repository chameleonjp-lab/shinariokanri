import { describe, expect, it } from 'vitest';
import { createEntity, createProject } from '../src/domain/model';
import { buildTimelineLanes, buildTimelineLayout, timelineWindow } from '../src/domain/timelineLayout';
import { resolveEventTimes } from '../src/domain/timeEditing';
import { MAX_TICK } from '../src/domain/time';
import type { Entity, ProjectData } from '../src/domain/types';
import { createPerformanceFixture } from '../src/testing/performanceFixture';

describe('timeline lanes preserve references and all overlapping events', () => {
  it('keeps shared IDs through nesting, folding, ordering and repeated member lanes', () => {
    const project = createProject(), a = createEntity(project.projectId, 'character', 'A'), b = createEntity(project.projectId, 'character', 'B');
    const root = createEntity(project.projectId, 'group', '親', { members: [a.id, b.id] }), child = createEntity(project.projectId, 'group', '子', { parentId: root.id, members: [a.id] }), second = createEntity(project.projectId, 'group', '別グループ', { members: [a.id] });
    const event = createEntity(project.projectId, 'event', '出来事', { time: { mode: 'instant', at: '0', calendarId: project.calendarId }, laneRole: 'both', participants: [{ characterId: a.id, role: 'witness' }] });
    project.entities = [a, b, root, child, second, event]; const original = structuredClone(project);
    const lanes = buildTimelineLanes(project);
    expect(lanes.filter(lane => lane.characterId === a.id)).toHaveLength(3);
    expect(lanes.find(lane => lane.groupId === child.id && lane.characterId === a.id)?.depth).toBe(2);
    const times = resolveEventTimes([event]), layout = buildTimelineLayout(lanes, times, '-10', '10');
    expect(layout.positions.get(event.id)).toHaveLength(4);
    const collapsed = buildTimelineLanes(project, [root.id]);
    expect(collapsed.some(lane => lane.groupId === child.id)).toBe(false);
    expect(collapsed.filter(lane => lane.characterId === a.id)).toHaveLength(1);
    expect(project).toEqual(original); expect(event.data.participants).toEqual([{ characterId: a.id, role: 'witness' }]);
    root.data.members = [b.id, a.id]; project.entities = [a, b, second, root, child, event];
    expect(buildTimelineLanes(project).filter(lane => lane.groupId === root.id && lane.kind === 'character').map(lane => lane.characterId)).toEqual([b.id, a.id]);
    root.deletedAt = '2026-10-05T00:00:00Z'; child.data.parentId = null;
    expect(buildTimelineLanes(project).some(lane => lane.characterId === b.id)).toBe(true);
    expect(project.entities.find(entity => entity.id === a.id)).toBe(a);
  });
  it('lays out more than 200 overlapping events and can reveal the final event by scrolling', () => {
    const project = createProject(), events: Entity<'event'>[] = [];
    for (let i = 0; i < 1000; i++) { const event = createEntity(project.projectId, 'event', `出来事${i}`, { time: { mode: 'instant', at: '0', calendarId: project.calendarId }, laneRole: 'common' }); event.id = `10000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`; events.push(event); }
    project.entities = events;
    const layout = buildTimelineLayout(buildTimelineLanes(project), resolveEventTimes(events), '-10', '10');
    expect(layout.displayedBoxes).toBe(1000); expect(layout.rows[0].boxes).toHaveLength(1000);
    const first = timelineWindow(layout, 0, 500).flatMap(window => window.boxes), last = timelineWindow(layout, layout.height - 500, 500).flatMap(window => window.boxes);
    expect(first.length).toBeLessThan(20); expect(last.some(box => box.eventId === events[999].id)).toBe(true);
    expect(new Set(layout.rows[0].boxes.map(box => box.slot)).size).toBe(1000);
  });
  it('renders a point at both 38-digit edges with a nonzero clickable box', () => {
    const project = createProject(); project.entities = [-MAX_TICK, MAX_TICK].map((tick, i) => createEntity(project.projectId, 'event', `端${i}`, { time: { mode: 'instant', at: tick.toString(), calendarId: project.calendarId } }));
    const layout = buildTimelineLayout(buildTimelineLanes(project), resolveEventTimes(project.entities as Entity<'event'>[]), (-MAX_TICK).toString(), MAX_TICK.toString());
    expect(layout.visibleEventIds.size).toBe(2); expect(layout.rows[0].boxes.every(box => box.width >= 13 && box.left + box.width <= 100)).toBe(true);
  });
  it.each(['standard', 'large'] as const)('represents every resolved ID in the %s seeded fixture and every ID is reachable in virtual windows', async size => {
    const { project, counts } = await createPerformanceFixture('timeline-rb03-v1', size), originalIds = project.entities.map(entity => entity.id);
    expect(counts.totalRecords).toBe(size === 'standard' ? 8800 : 88000);
    const events = project.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event'), times = resolveEventTimes(events);
    const expected = new Set([...times].filter(([, time]) => time.status === 'resolved').map(([id]) => id));
    const layout = buildTimelineLayout(buildTimelineLanes(project), times, (-MAX_TICK).toString(), MAX_TICK.toString());
    expect(layout.visibleEventIds).toEqual(expected);
    const reached = new Set<string>();
    for (let top = 0; top <= layout.height; top += 590) for (const window of timelineWindow(layout, top, 590)) for (const box of window.boxes) reached.add(box.eventId);
    expect(reached).toEqual(expected); expect(project.entities.map(entity => entity.id)).toEqual(originalIds);
  }, 20000);
});
