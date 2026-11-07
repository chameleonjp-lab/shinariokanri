import { expect, it } from 'vitest';
import { createEntity, createProject } from '../src/domain/model';
import { applySceneMove, capturePresentationOrderChange, moveChapterPresentation, previewSceneMove, undoPresentationOrder } from '../src/domain/writingWorkspace';
import { applyTimeEditPreview, previewTimeEdit, undoTimeEdit } from '../src/domain/timeEditing';

function fixture() {
  const project = createProject('回想と日時');
  const first = createEntity(project.projectId, 'chapter', '第1章'), second = createEntity(project.projectId, 'chapter', '第2章');
  const departure = createEntity(project.projectId, 'event', '出発', { time: { mode: 'instant', at: '100', calendarId: project.calendarId } });
  const arrival = createEntity(project.projectId, 'event', '到着', { time: { mode: 'instant', at: '200', calendarId: project.calendarId } });
  departure.data.constraints = [{ type: 'before', targetEventId: arrival.id }];
  const flashback = createEntity(project.projectId, 'scene', '回想', { chapterId: second.id, eventIds: [departure.id] });
  second.data.sceneIds = [flashback.id];
  project.entities = [first, second, flashback, departure, arrival];
  return { project, first, second, departure, arrival, flashback };
}

it('moves a flashback to chapter one and independently undoes presentation after a later date edit', () => {
  const f = fixture();
  const moved = applySceneMove(f.project, previewSceneMove(f.project, f.flashback.id, f.first.id, null));
  const receipt = capturePresentationOrderChange(f.project, moved);
  expect(moved.entities.find(entity => entity.id === f.departure.id)?.data).toEqual(f.departure.data);
  const date = previewTimeEdit(moved, { eventId: f.arrival.id, time: { mode: 'instant', at: '300', calendarId: f.project.calendarId } });
  expect(date.canApply).toBe(true);
  const dated = applyTimeEditPreview(moved, date), undone = undoPresentationOrder(dated, receipt);
  expect(undone.entities.find(entity => entity.id === f.flashback.id)?.data).toMatchObject({ chapterId: f.second.id });
  expect(undone.entities.find(entity => entity.id === f.second.id)?.data).toMatchObject({ sceneIds: [f.flashback.id] });
  expect(undone.entities.find(entity => entity.id === f.arrival.id)?.data).toMatchObject({ time: { mode: 'instant', at: '300', calendarId: f.project.calendarId } });
  expect(undoTimeEdit(undone, date.changes).entities).toEqual(f.project.entities);
});

it('undoes only chapter order and refuses to overwrite a subsequent order or another work', () => {
  const f = fixture(), moved = moveChapterPresentation(f.project, f.second.id, -1), receipt = capturePresentationOrderChange(f.project, moved);
  const dated = { ...moved, entities: moved.entities.map(entity => entity.id === f.flashback.id ? { ...entity, name: '後から直した本文名' } : entity) };
  expect(undoPresentationOrder(dated, receipt).entities.filter(entity => entity.kind === 'chapter').map(entity => entity.id)).toEqual([f.first.id, f.second.id]);
  expect(undoPresentationOrder(dated, receipt).entities.find(entity => entity.id === f.flashback.id)?.name).toBe('後から直した本文名');
  expect(() => undoPresentationOrder(f.project, receipt)).toThrow('提示順が後から');
  expect(() => undoPresentationOrder({ ...moved, projectId: crypto.randomUUID() }, receipt)).toThrow('作品');
});

it('identifies departure-after-arrival conflict before saving and a date-only undo keeps the order', () => {
  const f = fixture(), original = structuredClone(f.project);
  const conflict = previewTimeEdit(f.project, { eventId: f.arrival.id, time: { mode: 'instant', at: '50', calendarId: f.project.calendarId } });
  expect(conflict.canApply).toBe(false);
  expect(conflict.conflicts.some(issue => issue.message.includes('「出発」の後に「到着」'))).toBe(true);
  expect(conflict.impacts.map(impact => impact.eventId)).toEqual(expect.arrayContaining([f.departure.id, f.arrival.id]));
  expect(f.project).toEqual(original);
  expect(() => applyTimeEditPreview(f.project, conflict)).toThrow();
  const valid = previewTimeEdit(f.project, { eventId: f.arrival.id, time: { mode: 'instant', at: '250', calendarId: f.project.calendarId } });
  const saved = applyTimeEditPreview(f.project, valid);
  expect(saved.entities.filter(entity => entity.kind === 'chapter' || entity.kind === 'scene')).toEqual(f.project.entities.filter(entity => entity.kind === 'chapter' || entity.kind === 'scene'));
  expect(undoTimeEdit(saved, valid.changes)).toEqual(f.project);
});
