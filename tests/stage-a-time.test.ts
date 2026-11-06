import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TickInput } from '../src/ui/TimelineEditors';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject } from '../src/domain/model';
import { calendarDisplayUnits } from '../src/domain/timeEditing';
import { GREGORIAN_CALENDAR } from '../src/domain/time';
import { timeLabel } from '../src/ui/Timeline';

describe('stage A human-readable world time', () => {
  it('offers a date input with understandable smallest-unit labels', () => {
    const markup = renderToStaticMarkup(createElement(TickInput, { label: '日時', value: '3661', calendar: GREGORIAN_CALENDAR, onChange: () => undefined }));
    expect(markup).toContain('秒で入力');
    expect(markup).toContain('1日 86400 秒');
    expect(markup).toContain('日時の詳細');
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
