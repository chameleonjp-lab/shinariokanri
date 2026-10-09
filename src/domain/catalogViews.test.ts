import { describe, expect, it } from 'vitest';
import { createEntity, createProject } from './model';
import { catalogTimelineEntries } from './catalogViews';

describe('the same saved results in a chronological view', () => {
  it('keeps every supplied ID, sorts scene dates without modifying data, and keeps missing/rejected sources unknown', () => {
    const project = createProject('一覧');
    const early = createEntity(project.projectId, 'event', '先', { time: { mode: 'instant', at: '2', calendarId: project.calendarId } });
    const later = createEntity(project.projectId, 'event', '後', { time: { mode: 'instant', at: '7', calendarId: project.calendarId } });
    const rejected = { ...createEntity(project.projectId, 'event', '没', { time: { mode: 'instant', at: '1', calendarId: project.calendarId } }), status: 'rejected' as const };
    const scene = createEntity(project.projectId, 'scene', '場面', { eventIds: [later.id, early.id, early.id, rejected.id, 'missing'] });
    const note = createEntity(project.projectId, 'note', '日時なし');
    const chapter = createEntity(project.projectId, 'chapter', '章', { sceneIds: [scene.id] });
    project.entities = [early, later, rejected, scene, note, chapter];
    const before = JSON.stringify(project), results = [note, scene, rejected, chapter];
    const view = catalogTimelineEntries(project, results);
    expect(new Set(view.map(entry => entry.id))).toEqual(new Set(results.map(entity => entity.id)));
    expect(view.find(entry => entry.id === scene.id)?.dates.map(date => [date.sourceId, date.time.status])).toEqual([[early.id, 'resolved'], [later.id, 'resolved'], [rejected.id, 'unknown'], ['missing', 'unknown']]);
    expect(view.find(entry => entry.id === note.id)?.dates).toEqual([]);
    expect(view.find(entry => entry.id === rejected.id)?.dates[0].time.status).toBe('unknown');
    expect(JSON.stringify(project)).toBe(before);
  });
  it('does not compare independent calendar origins and preserves unknown relative anchors', () => {
    const project = createProject('別暦');
    const a = createEntity(project.projectId, 'event', '別暦A', { time: { mode: 'instant', at: '100', calendarId: 'a' } });
    const z = createEntity(project.projectId, 'event', '別暦Z', { time: { mode: 'instant', at: '-100', calendarId: 'z' } });
    const relative = createEntity(project.projectId, 'event', '相対', { time: { mode: 'relative', anchorEventId: 'missing', anchorPoint: 'start', minOffset: '1', maxOffset: '1' } });
    project.entities = [z, relative, a];
    const entries = catalogTimelineEntries(project, project.entities);
    expect(entries.map(entry => entry.id)).toEqual([a.id, z.id, relative.id]);
    expect(entries[2].dates[0].time.status).toBe('unknown');
  });
});
