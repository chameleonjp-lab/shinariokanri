import type { ProjectData } from '../domain/types';

export interface ProjectSettingsDraft {
  projectId: string;
  base: Pick<ProjectData, 'revision' | 'name' | 'mainStart' | 'calendars'>;
  name: string; mainStart: string; calendars: unknown; calendarRaw?: string; snapshotName: string; calendarValid: boolean;
}
export function projectSettingsDraft(project: ProjectData): ProjectSettingsDraft {
  const { revision, name, mainStart, calendars } = project;
  return { projectId: project.projectId, base: structuredClone({ revision, name, mainStart, calendars }), name, mainStart, calendars: structuredClone(calendars), snapshotName: '', calendarValid: true };
}
export function settingsDraftChanged(draft: ProjectSettingsDraft): boolean {
  return draft.name !== draft.base.name || draft.mainStart !== draft.base.mainStart || JSON.stringify(draft.calendars) !== JSON.stringify(draft.base.calendars) || !!draft.snapshotName || !draft.calendarValid;
}
/** A save can acknowledge the submitted input while newer edits remain a draft on its new base. */
export function acknowledgeSettingsDraft(current: ProjectSettingsDraft, submitted: ProjectSettingsDraft, saved: ProjectData, consumedSnapshotName?: string): ProjectSettingsDraft {
  const next = projectSettingsDraft(saved);
  for (const key of ['name', 'mainStart', 'calendars'] as const) if (JSON.stringify(current[key]) !== JSON.stringify(submitted[key])) (next as unknown as Record<string, unknown>)[key] = current[key];
  next.snapshotName = current.snapshotName === consumedSnapshotName ? '' : current.snapshotName; next.calendarValid = current.calendarValid; next.calendarRaw = current.calendarRaw;
  return next;
}
