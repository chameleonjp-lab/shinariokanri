import { describe, expect, it } from 'vitest';
import { createEntity, createProject, validateProject } from '../src/domain/model';
import type { CalendarDefinition, Entity, ProjectData, TimeSpec } from '../src/domain/types';
import { calendarDateToTick, GREGORIAN_CALENDAR, MAX_TICK, tickToCalendarDate, validateEventTimes } from '../src/domain/time';
import { applyTimeEditPreview, calendarAxisTicks, calendarDisplayUnits, calendarUnitBounds, characterTimeSummary, displayUnitTicks, previewTimeEdit, resolveEventTimes, shiftAllEventTimes, undoTimeEdit } from '../src/domain/timeEditing';

const calendar: CalendarDefinition = { id: 'short-years', name: '二年周期暦', kind: 'repeating', originLabel: '原点', ticksPerDay: '10', years: [{ months: [{ name: '芽月', days: 3 }, { name: '葉月', days: 4 }] }, { months: [{ name: '芽月', days: 2 }, { name: '葉月', days: 5 }] }] };
let counter = 0;
function add(project: ProjectData, time: TimeSpec, name = '出来事'): Entity<'event'> {
  const event = createEntity(project.projectId, 'event', name, { time });
  event.id = `10000000-0000-4000-8000-${(++counter).toString(16).padStart(12, '0')}`; project.entities.push(event); return event;
}
function dependentFixture() {
  const project = createProject(), a = add(project, { mode: 'interval', start: '0', end: '100', calendarId: project.calendarId }, 'A'), b = add(project, { mode: 'interval', start: '200', end: '220', calendarId: project.calendarId }, 'B'), c = add(project, { mode: 'instant', at: '340', calendarId: project.calendarId }, 'C');
  a.data.constraints = [{ type: 'end_gap', targetEventId: b.id, minimumTicks: '50', maximumTicks: '100' }];
  b.data.constraints = [{ type: 'end_gap', targetEventId: c.id, minimumTicks: '100', maximumTicks: '150' }];
  const relative = add(project, { mode: 'relative', anchorEventId: b.id, anchorPoint: 'end', minOffset: '5', maxOffset: '5' }, 'Bからの相対日時');
  return { project, a, b, c, relative, edit: { eventId: a.id, time: { ...a.data.time, end: '180' } as TimeSpec } };
}

describe('calendar display keeps world ticks unchanged', () => {
  it('uses actual Gregorian leap boundaries and repeating calendar months/years', () => {
    const february = calendarDateToTick({ year: '2024', month: 2, day: 15 }, GREGORIAN_CALENDAR);
    const bounds = calendarUnitBounds(february, GREGORIAN_CALENDAR, 'month');
    expect((BigInt(bounds.end) - BigInt(bounds.start)) / 86400n).toBe(29n);
    expect(displayUnitTicks(february, GREGORIAN_CALENDAR, 'year') / 86400n).toBe(366n);
    expect(calendarUnitBounds('-1', calendar, 'month')).toEqual({ start: '-50', end: '0' });
    expect(calendarUnitBounds('31', calendar, 'month')).toEqual({ start: '30', end: '70' });
    expect(calendarUnitBounds('80', calendar, 'month')).toEqual({ start: '70', end: '90' });
    expect(calendarUnitBounds('-1', calendar, 'year')).toEqual({ start: '-70', end: '0' });
    expect(calendarAxisTicks('-70', '140', calendar, 'month')).toEqual(['-70', '-50', '0', '30', '70', '90', '140']);
  });
  it('explains absent hours and rejects zero or overflowing custom units', () => {
    expect(calendarDisplayUnits(calendar).find(unit => unit.key === 'hour')).toMatchObject({ available: false, reason: expect.stringContaining('定義') });
    expect(() => calendarUnitBounds('0', calendar, 'hour')).toThrow('時の定義');
    expect(displayUnitTicks('0', calendar, 'custom', '99999999999999999999999999999999999999')).toBe(MAX_TICK);
    expect(() => displayUnitTicks('0', calendar, 'custom', '0')).toThrow('正の整数');
    expect(() => displayUnitTicks('0', calendar, 'custom', '100000000000000000000000000000000000000')).toThrow('38桁');
  });
  it('handles both extrema without converting world time into Number', () => {
    for (const tick of [MAX_TICK.toString(), (-MAX_TICK).toString()]) {
      expect(calendarDateToTick(tickToCalendarDate(tick, calendar), calendar)).toBe(tick);
      const bounds = calendarUnitBounds(tick, calendar, 'month');
      expect(BigInt(bounds.start)).toBeLessThanOrEqual(BigInt(tick)); expect(BigInt(bounds.end)).toBeGreaterThanOrEqual(BigInt(tick));
    }
  });
});

describe('reviewable atomic date changes', () => {
  it('shows fixed collisions without mutating data and moves only individually approved dates', () => {
    const f = dependentFixture(), saved = structuredClone(f.project);
    const report = previewTimeEdit(f.project, f.edit);
    expect(report.canApply).toBe(false); expect(report.conflicts.some(conflict => conflict.message.includes('固定日時'))).toBe(true);
    expect(report.changes.map(change => change.eventId)).toEqual([f.a.id]); expect(f.project).toEqual(saved);
    const partlyApproved = previewTimeEdit(f.project, f.edit, { moveDependents: true, movableEventIds: [f.b.id] });
    expect(partlyApproved.canApply).toBe(false); expect(partlyApproved.impacts.find(impact => impact.eventId === f.c.id)?.fixed).toBe(true);
    const preview = previewTimeEdit(f.project, f.edit, { moveDependents: true, movableEventIds: [f.b.id, f.c.id] });
    expect(preview.canApply).toBe(true); expect(preview.changes.map(change => change.eventId)).toEqual([f.a.id, f.b.id, f.c.id]);
    expect(preview.candidate.entities.find(event => event.id === f.b.id)?.data).toMatchObject({ time: { start: '230', end: '250' } });
    expect(preview.candidate.entities.find(event => event.id === f.c.id)?.data).toMatchObject({ time: { at: '350' } });
    expect(preview.impacts.find(impact => impact.eventId === f.relative.id)?.after).toMatchObject({ earliest: '255' });
    expect(validateProject(preview.candidate).ok).toBe(true);
    const applied = applyTimeEditPreview(f.project, preview);
    const unrelated = createEntity(f.project.projectId, 'note', '後から追加したメモ'); applied.entities = [...applied.entities, unrelated];
    const undone = undoTimeEdit(applied, preview.changes);
    expect(undone.entities.filter(event => event.id !== unrelated.id)).toEqual(saved.entities);
    expect(undone.entities.find(event => event.id === unrelated.id)).toEqual(unrelated);
    expect(validateProject(undone).ok).toBe(true);
  });
  it('rejects stale previews, subsequent edits to an applied date, and deleted targets', () => {
    const f = dependentFixture(), preview = previewTimeEdit(f.project, f.edit, { moveDependents: true, movableEventIds: [f.b.id, f.c.id] });
    expect(() => applyTimeEditPreview({ ...f.project, revision: '1' }, preview)).toThrow('確認後');
    const applied = structuredClone(preview.candidate), changed = applied.entities.find(entity => entity.id === f.b.id) as Entity<'event'>;
    changed.data.time = { mode: 'instant', at: '999', calendarId: f.project.calendarId };
    expect(() => undoTimeEdit(applied, preview.changes)).toThrow('後から変更');
    f.b.deletedAt = new Date().toISOString();
    expect(previewTimeEdit(f.project, f.edit).conflicts.some(conflict => conflict.message.includes('ありません'))).toBe(true);
  });
  it('checks constraints coming in to the edited target and keeps strict before semantics', () => {
    const project = createProject(), a = add(project, { mode: 'instant', at: '100', calendarId: project.calendarId }), b = add(project, { mode: 'instant', at: '200', calendarId: project.calendarId });
    a.data.constraints = [{ type: 'before', targetEventId: b.id }];
    expect(previewTimeEdit(project, { eventId: b.id, time: { ...b.data.time, at: '50' } as TimeSpec }).canApply).toBe(false);
    const preview = previewTimeEdit(project, { eventId: a.id, time: { ...a.data.time, at: '200' } as TimeSpec }, { moveDependents: true, movableEventIds: [b.id] });
    expect(preview.canApply).toBe(true); expect(preview.candidate.entities.find(entity => entity.id === b.id)?.data).toMatchObject({ time: { at: '201' } });
    expect(validateEventTimes(preview.candidate.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event'))).toEqual([]);
  });
  it('reports constraint/relative cycles, incompatible calendars, conflicting bounds, and overflow', () => {
    const project = createProject(), a = add(project, { mode: 'instant', at: '0', calendarId: project.calendarId }), b = add(project, { mode: 'relative', anchorEventId: a.id, anchorPoint: 'start', minOffset: '1', maxOffset: '1' });
    b.data.constraints = [{ type: 'before', targetEventId: a.id }];
    expect(previewTimeEdit(project, { eventId: a.id, time: { mode: 'instant', at: '1', calendarId: project.calendarId } }).conflicts.some(conflict => conflict.message.includes('循環'))).toBe(true);
    b.data.constraints = []; b.data.time = { mode: 'instant', at: '20', calendarId: calendar.id }; a.data.constraints = [{ type: 'same_start', targetEventId: b.id }];
    expect(previewTimeEdit(project, { eventId: a.id, time: a.data.time }).conflicts.some(conflict => conflict.message.includes('暦の対応'))).toBe(true);
    b.data.time = { mode: 'instant', at: MAX_TICK.toString(), calendarId: project.calendarId }; a.data.constraints = [{ type: 'before', targetEventId: b.id }];
    const overflowing = previewTimeEdit(project, { eventId: a.id, time: { mode: 'instant', at: MAX_TICK.toString(), calendarId: project.calendarId } }, { moveDependents: true, movableEventIds: [b.id] });
    expect(overflowing.canApply).toBe(false); expect(overflowing.conflicts.some(conflict => conflict.message.includes('38桁'))).toBe(true);
    const c = add(project, { mode: 'instant', at: '0', calendarId: project.calendarId });
    a.data.constraints = [{ type: 'same_start', targetEventId: b.id }]; c.data.constraints = [{ type: 'same_start', targetEventId: b.id }];
    const incompatible = previewTimeEdit(project, { eventId: a.id, time: { mode: 'instant', at: '100', calendarId: project.calendarId } }, { moveDependents: true, movableEventIds: [b.id] });
    expect(incompatible.conflicts.some(conflict => conflict.message.includes('同時に満たせません'))).toBe(true);
  });
  it('separates moving every event from moving the main-start marker and makes the batch reversible', () => {
    const f = dependentFixture(), original = structuredClone(f.project), preview = shiftAllEventTimes(f.project, '-200');
    expect(preview.canApply).toBe(true); expect(preview.candidate.mainStart).toBe(original.mainStart);
    expect(preview.impacts.find(impact => impact.eventId === f.relative.id)?.after).toMatchObject({ earliest: '25' });
    expect(undoTimeEdit(preview.candidate, preview.changes)).toEqual(original);
    const markerOnly = { ...f.project, mainStart: '99999999999999999999999999999999999999' };
    expect(resolveEventTimes(markerOnly.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event'))).toEqual(resolveEventTimes(f.project.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event')));
  });
  it('resolves pinned-world anchors but never moves or copies frozen world events into a work', () => {
    const world = createProject('世界'), frozen = add(world, { mode: 'instant', at: '100', calendarId: world.calendarId }, '世界の基準');
    const work = createProject('作品'), relative = add(work, { mode: 'relative', anchorEventId: frozen.id, anchorPoint: 'start', minOffset: '10', maxOffset: '10' }), own = add(work, { mode: 'instant', at: '50', calendarId: world.calendarId }); own.data.constraints = [{ type: 'before', targetEventId: frozen.id }];
    const preview = previewTimeEdit(work, { eventId: relative.id, time: { ...relative.data.time, minOffset: '20', maxOffset: '20' } as TimeSpec }, { referenceEvents: [frozen] });
    expect(preview.canApply).toBe(true); expect(preview.impacts.find(impact => impact.eventId === relative.id)?.after).toMatchObject({ earliest: '120' }); expect(preview.candidate.entities.some(entity => entity.id === frozen.id)).toBe(false);
    const conflict = previewTimeEdit(work, { eventId: own.id, time: { mode: 'instant', at: '150', calendarId: world.calendarId } }, { moveDependents: true, movableEventIds: [frozen.id], referenceEvents: [frozen] }); expect(conflict.canApply).toBe(false); expect(conflict.changes.map(change => change.eventId)).toEqual([own.id]); expect(frozen.data.time).toMatchObject({ at: '100' });
    expect(shiftAllEventTimes(work, '100', [frozen]).canApply).toBe(false);
    expect(previewTimeEdit(work, { eventId: frozen.id, time: frozen.data.time }, { referenceEvents: [frozen] }).canApply).toBe(false);
  });
});

describe('relative chains and selected-time ages', () => {
  it('resolves a long chain iteratively and flags a relative cycle', () => {
    const project = createProject(); let anchor = add(project, { mode: 'instant', at: '-100', calendarId: project.calendarId });
    for (let i = 0; i < 10000; i++) anchor = add(project, { mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'start', minOffset: '1', maxOffset: '2' });
    const events = project.entities as Entity<'event'>[], times = resolveEventTimes(events);
    expect(times.get(anchor.id)).toMatchObject({ earliest: '9900', latest: '19900' });
    events[0].data.time = { mode: 'relative', anchorEventId: events[1].id, anchorPoint: 'start', minOffset: '0', maxOffset: '0' };
    expect(resolveEventTimes(events).get(events[0].id)).toMatchObject({ status: 'conflict', reason: expect.stringContaining('循環') });
  });
  it('shows birthdays, uncertainty, deaths and missing calendar correspondence honestly', () => {
    const person = createEntity(createProject().projectId, 'character', 'アオ', { birth: { mode: 'instant', at: '30', calendarId: calendar.id }, death: { mode: 'uncertain', earliest: '139', latest: '145', precision: '概算', calendarId: calendar.id } });
    expect(characterTimeSummary(person, '89', calendar, [])).toMatchObject({ age: '0歳', state: 'alive' });
    expect(characterTimeSummary(person, '90', calendar, [])).toMatchObject({ age: '1歳', state: 'alive' });
    expect(characterTimeSummary(person, '140', calendar, [])).toMatchObject({ state: 'uncertain' });
    expect(characterTimeSummary(person, '146', calendar, [])).toMatchObject({ state: 'dead' });
    expect(characterTimeSummary(person, '29', calendar, [])).toMatchObject({ state: 'unborn' });
    person.data.birth = { mode: 'uncertain', earliest: '0', latest: '70', calendarId: calendar.id, precision: '年だけ判明' };
    expect(characterTimeSummary(person, '140', calendar, []).age).toBe('1〜2歳');
    expect(characterTimeSummary(person, '140', GREGORIAN_CALENDAR, []).age).toBe('年齢不明');
    person.data.birth = { mode: 'unknown', reason: '誕生日未定' };
    expect(characterTimeSummary(person, '140', calendar, [])).toMatchObject({ age: '年齢不明', reason: '誕生日未定' });
  });
});
