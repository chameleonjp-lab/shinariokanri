import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TickInput, TimelineTimeEditor } from '../src/ui/TimelineEditors';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject } from '../src/domain/model';
import { calendarDisplayUnits, calendarForTime } from '../src/domain/timeEditing';
import { GREGORIAN_CALENDAR } from '../src/domain/time';
import { timeLabel } from '../src/ui/Timeline';

describe('stage A human-readable world time', () => {
  it('offers a date input with understandable smallest-unit labels', () => {
    const markup = renderToStaticMarkup(createElement(TickInput, { label: '日時', value: '3661', calendar: GREGORIAN_CALENDAR, onChange: () => undefined }));
    expect(markup).toContain('秒で入力');
    expect(markup).toContain('1日 86400 秒');
    expect(markup).toContain('日時の詳細');
  });
  it('inherits relative editor units from the resolved anchor instead of the project default', () => {
    const project = createProject();
    project.calendars.push({ id: 'fiction', name: '架空暦', kind: 'repeating', originLabel: '創世', ticksPerDay: '24', years: [{ months: [{ name: '始月', days: 30 }] }] });
    const anchor = createEntity(project.projectId, 'event', '独自暦の基準', { time: { mode: 'instant', at: '0', calendarId: 'fiction' } });
    const relative = createEntity(project.projectId, 'event', '一日後', { time: { mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'start', minOffset: '24', maxOffset: '24' } });
    project.entities.push(anchor, relative);
    const markup = renderToStaticMarkup(createElement(TimelineTimeEditor, { project, event: relative, onClose: () => undefined, onSave: async p => p, onApplied: () => undefined }));
    expect(markup).toContain('1日 24 時間の最小単位');
    expect(markup).not.toContain('秒');
    expect(timeLabel(relative.data.time, project)).toContain('時間の最小単位');
  });
  it.each([
    { minOffset: '', maxOffset: '48' },
    { minOffset: '72', maxOffset: '48' },
    { minOffset: '-48', maxOffset: '-24' },
  ])('retains the inherited calendar through current offset edits $minOffset to $maxOffset', offsets => {
    const project = createProject();
    const calendar = { id: 'fiction', name: '架空暦', kind: 'repeating' as const, originLabel: '創世', ticksPerDay: '24', years: [{ months: [{ name: '始月', days: 30 }] }] };
    project.calendars.push(calendar);
    const origin = createEntity(project.projectId, 'event', '独自暦の基準', { time: { mode: 'instant', at: '0', calendarId: calendar.id } });
    const anchor = createEntity(project.projectId, 'event', '翌日の基準', { time: { mode: 'relative', anchorEventId: origin.id, anchorPoint: 'start', minOffset: '24', maxOffset: '24' } });
    project.entities.push(origin, anchor);
    expect(calendarForTime({ mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'start', ...offsets }, project)).toBe(calendar);
    anchor.data.time = { ...anchor.data.time as Extract<typeof anchor.data.time, { mode: 'relative' }>, minOffset: '', maxOffset: '24' };
    expect(calendarForTime({ mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'start', ...offsets }, project)).toBeUndefined();
  });
  it.each(['missing', 'cycle', 'unknown', 'conflict'])('uses only smallest units for a relative editor with a %s anchor', mode => {
    const project = createProject();
    const anchor = createEntity(project.projectId, 'event', '基準', { time: { mode: 'instant', at: '0', calendarId: project.calendarId } });
    const relative = createEntity(project.projectId, 'event', '相対日時', { time: { mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'start', minOffset: '24', maxOffset: '24' } });
    if (mode === 'unknown') anchor.data.time = { mode: 'unknown', reason: '未定' };
    if (mode === 'conflict') anchor.data.time = { mode: 'interval', start: '1', end: '0', calendarId: project.calendarId };
    if (mode === 'cycle') anchor.data.time = { ...relative.data.time as Extract<typeof relative.data.time, { mode: 'relative' }>, anchorEventId: relative.id };
    project.entities.push(...(mode === 'missing' ? [] : [anchor]), relative);
    const markup = renderToStaticMarkup(createElement(TimelineTimeEditor, { project, event: relative, onClose: () => undefined, onSave: async p => p, onApplied: () => undefined }));
    expect(markup).toContain('時間の最小単位');
    expect(markup).not.toContain('秒');
    expect(markup).not.toContain('1日 86400');
  });
  it('shows seconds and clock time only for the calendar that defines them', () => {
    const project = createProject();
    expect(timeLabel({ mode: 'instant', at: '3661', calendarId: project.calendarId }, project)).toBe('0年1月1日 01:01:01');
    expect(calendarDisplayUnits(GREGORIAN_CALENDAR).find(unit => unit.key === 'tick')?.label).toBe('秒');
  });
  it('does not invent hours in a repeating calendar even with 24 ticks per day', () => {
    const project = createProject();
    project.calendars = [{ id: 'fiction', name: '架空暦', kind: 'repeating', originLabel: '創世', ticksPerDay: '24', years: [{ months: [{ name: '始月', days: 30 }] }] }];
    project.calendarId = 'fiction';
    expect(timeLabel({ mode: 'instant', at: '25', calendarId: 'fiction' }, project)).toBe('0年1月2日 + 時間の最小単位 1');
    expect(calendarDisplayUnits(project.calendars[0]).find(unit => unit.key === 'tick')?.label).toBe('時間の最小単位');
    expect(calendarDisplayUnits(project.calendars[0]).find(unit => unit.key === 'hour')?.available).toBe(false);
  });
  it('keeps unconvertible values and relative offsets explicit without technical unit names', () => {
    const project = createProject();
    expect(timeLabel({ mode: 'instant', at: '99999999999999999999999999999999999999', calendarId: 'missing' }, project)).toBe('時間の最小単位 99999999999999999999999999999999999999（暦の対応未定）');
    const anchor = createEntity(project.projectId, 'event', '出発', { time: { mode: 'instant', at: '0', calendarId: project.calendarId } });
    project.entities.push(anchor);
    expect(timeLabel({ mode: 'relative', anchorEventId: anchor.id, anchorPoint: 'start', minOffset: '60', maxOffset: '120' }, project)).toBe('出発の開始から 60〜120 秒');
  });
});
