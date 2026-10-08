import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Entity, ProjectData, TimeSpec } from '../src/domain/types';
import { createEntity, createProject, newId, validateProject } from '../src/domain/model';
import { MAX_TICK, resolveEventTimes, resolveTime, validateEventTimes } from '../src/domain/time';
import { ScenarioStore } from '../src/storage/store';
import { inspectScenario } from '../src/storage/archive';

function event(project: ProjectData, time: TimeSpec): Entity<'event'> { const result = createEntity(project.projectId, 'event', '出来事', { time }); project.entities.push(result); return result; }
const relative = (anchorEventId: string, minOffset = '1', maxOffset = minOffset, anchorPoint: 'start' | 'end' = 'start'): TimeSpec => ({ mode: 'relative', anchorEventId, anchorPoint, minOffset, maxOffset });

describe('canonical iterative time resolution', () => {
  it('validates, saves, reloads and restores a real 5,001-event relative chain', async () => {
    const project = createProject('長い相対日時の作品'); let previous = event(project, { mode: 'instant', at: '0', calendarId: project.calendarId });
    for (let i = 1; i <= 5000; i++) previous = event(project, relative(previous.id));
    const events = project.entities as Entity<'event'>[];
    expect(resolveTime(previous.data.time, events, [previous.id])).toMatchObject({ status: 'resolved', earliest: '5000' });
    expect(validateProject(project).ok).toBe(true);
    const databaseName = `canonical-time-${newId()}`, store = new ScenarioStore({ databaseName });
    let reopened: ScenarioStore | undefined;
    try {
      await store.saveProject(project, { reason: '長い相対日時を一括保存' }); store.close(); reopened = new ScenarioStore({ databaseName });
      const loaded = (await reopened.getProject(project.projectId))!;
      expect(loaded.entities).toHaveLength(5001); expect(validateProject(loaded).ok).toBe(true);
      const restored = await inspectScenario(await reopened.exportProject(project.projectId), { worker: false });
      expect(resolveEventTimes(restored.project.entities as Entity<'event'>[]).get(previous.id)).toMatchObject({ status: 'resolved', earliest: '5000' });
      expect(restored.project.entities).toEqual(loaded.entities);
    } finally { store.close(); await (reopened ?? store).deleteDatabase(); }
  }, 20000);

  it('preserves interval ends and uncertainty for batch and arbitrary-TimeSpec calls', () => {
    const project = createProject(), interval = event(project, { mode: 'interval', start: '-10', end: '0', calendarId: project.calendarId }), endRelative = event(project, relative(interval.id, '-5', '5', 'end')), uncertain = event(project, { mode: 'uncertain', earliest: '-4', latest: '9', precision: '概算', calendarId: project.calendarId }), uncertainRelative = event(project, relative(uncertain.id, '2', '3'));
    const events = project.entities as Entity<'event'>[], times = resolveEventTimes(events);
    expect(times.get(endRelative.id)).toMatchObject({ status: 'resolved', earliest: '-5', latest: '5', endEarliest: '-5', endLatest: '5' });
    expect(times.get(uncertainRelative.id)).toMatchObject({ status: 'resolved', earliest: '-2', latest: '12' });
    for (const entry of events) expect(resolveTime(entry.data.time, events, [entry.id])).toEqual(times.get(entry.id));
  });

  it('retains caller chain semantics and treats missing or archived anchors as unknown', () => {
    const project = createProject(), anchor = event(project, { mode: 'instant', at: '0', calendarId: project.calendarId }), chain = [anchor.id];
    expect(resolveTime(relative(anchor.id), [anchor], chain)).toEqual({ status: 'conflict', reason: '相対日時の参照が循環しています。', path: [anchor.id, anchor.id] });
    expect(chain).toEqual([anchor.id]); expect(resolveTime(relative(anchor.id), [anchor])).toMatchObject({ status: 'resolved', earliest: '1' });
    anchor.deletedAt = new Date().toISOString(); const child = event(project, relative(anchor.id));
    expect(resolveTime(child.data.time, [anchor, child], [child.id])).toEqual({ status: 'unknown', reason: '基準となる出来事がありません。', path: [child.id, anchor.id] });
    expect(resolveEventTimes([anchor, child]).get(child.id)).toEqual(resolveTime(child.data.time, [anchor, child], [child.id]));
    expect(resolveTime(relative(newId(), '2', '1'))).toMatchObject({ status: 'conflict', reason: '相対日時の範囲が逆転しています。' });
  });

  it('reports cycles, invalid periods, reversed uncertainty and overflow without recursive errors', () => {
    const project = createProject(), a = event(project, { mode: 'unknown', reason: '未定' }), b = event(project, relative(a.id)); a.data.time = relative(b.id);
    for (const value of resolveEventTimes([a, b]).values()) { expect(value.status).toBe('conflict'); if (value.status !== 'resolved') { expect(value.reason).toContain('循環'); expect(value.path.length).toBeLessThanOrEqual(64); } }
    const invalidPeriod = event(project, { mode: 'interval', start: '2', end: '1', calendarId: project.calendarId }), invalidUncertainty = event(project, { mode: 'uncertain', earliest: '2', latest: '1', precision: '概算', calendarId: project.calendarId }), maximum = event(project, { mode: 'instant', at: MAX_TICK.toString(), calendarId: project.calendarId }), overflow = event(project, relative(maximum.id));
    const events = project.entities as Entity<'event'>[], batch = resolveEventTimes(events);
    for (const entry of [invalidPeriod, invalidUncertainty, overflow]) { const direct = resolveTime(entry.data.time, events, [entry.id]); expect(direct).toEqual(batch.get(entry.id)); expect(direct.status).toBe('conflict'); }
  });

  it('rejects dependency cycles that combine relative anchors with explicit constraints', () => {
    const project = createProject(), base = event(project, { mode: 'unknown', reason: '基準未定' }), child = event(project, relative(base.id, '0'));
    child.data.constraints = [{ type: 'same_start', targetEventId: base.id }];
    expect(validateEventTimes([base, child]).some(issue => issue.message.includes('循環'))).toBe(true);
    expect(validateProject(project).ok).toBe(false);
  });
});
