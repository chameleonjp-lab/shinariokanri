import { ENTITY_KINDS } from '../domain/model';
import type { EntityKind, Status, ViewState } from '../domain/types';

export type WorkspacePage = 'timeline' | 'structure' | 'materials' | 'search' | 'work';
export type WorkspacePreferences = {
  page: WorkspacePage;
  structureTab: 'chapters' | 'branch' | 'state' | 'foreshadow' | 'reader' | 'production';
  workTab: 'backup' | 'export' | 'history' | 'settings';
  timelineTab: 'timeline' | 'relations';
  kind: EntityKind;
  searchKind: 'all' | EntityKind;
  statusFilter: 'all' | Status;
  query: string;
  scrollY: number;
  hiddenPages?: WorkspacePage[];
};

export const WORKSPACE_VIEW_ID = 'workspace';
export const WORKSPACE_PREFERENCE_KEYS = {
  page: 'workspace.page', structureTab: 'workspace.structureTab', workTab: 'workspace.workTab',
  timelineTab: 'workspace.timelineTab', kind: 'workspace.kind', searchKind: 'workspace.searchKind',
  statusFilter: 'workspace.statusFilter', query: 'workspace.query', scrollY: 'workspace.scrollY', hiddenPages: 'workspace.hiddenPages',
} as const;

const PAGE_VALUES: readonly WorkspacePage[] = ['timeline', 'structure', 'materials', 'search', 'work'];
const STRUCTURE_TABS: readonly WorkspacePreferences['structureTab'][] = ['chapters', 'branch', 'state', 'foreshadow', 'reader', 'production'];
const WORK_TABS: readonly WorkspacePreferences['workTab'][] = ['backup', 'export', 'history', 'settings'];
const TIMELINE_TABS: readonly WorkspacePreferences['timelineTab'][] = ['timeline', 'relations'];
const STATUS_VALUES: readonly Status[] = ['confirmed', 'provisional', 'needs_review', 'rejected', 'alternate'];
const EMPTY_PREFERENCES: WorkspacePreferences = {
  page: 'timeline', structureTab: 'chapters', workTab: 'backup', timelineTab: 'timeline',
  kind: 'character', searchKind: 'all', statusFilter: 'all', query: '', scrollY: 0,
};
const MAX_SCROLL_Y = 100_000_000;
const MAX_RECENT_IDS = 20;
const MAX_FAVORITE_IDS = 10_000;
const MARKS_PREFIX = 'scenario-workspace-marks:v1:';

function readAllowed<T extends string>(value: string | boolean | undefined, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function readScrollY(value: string | boolean | undefined): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(parsed, MAX_SCROLL_Y) : 0;
}

/** Maps a saved per-device state into allowlisted workspace controls. Unknown filters are ignored. */
export function restoreWorkspacePreferences(view?: Pick<ViewState, 'filters'> | null): WorkspacePreferences {
  const filters = view?.filters ?? {};
  const page = readAllowed(filters[WORKSPACE_PREFERENCE_KEYS.page], PAGE_VALUES, EMPTY_PREFERENCES.page);
  const structureTab = readAllowed(filters[WORKSPACE_PREFERENCE_KEYS.structureTab], STRUCTURE_TABS, EMPTY_PREFERENCES.structureTab);
  const workTab = readAllowed(filters[WORKSPACE_PREFERENCE_KEYS.workTab], WORK_TABS, EMPTY_PREFERENCES.workTab);
  const timelineTab = readAllowed(filters[WORKSPACE_PREFERENCE_KEYS.timelineTab], TIMELINE_TABS, EMPTY_PREFERENCES.timelineTab);
  const kindValue = filters[WORKSPACE_PREFERENCE_KEYS.kind];
  const kind = typeof kindValue === 'string' && ENTITY_KINDS.includes(kindValue as EntityKind) ? kindValue as EntityKind : EMPTY_PREFERENCES.kind;
  const searchKindValue = filters[WORKSPACE_PREFERENCE_KEYS.searchKind];
  const searchKind = searchKindValue === 'all' || typeof searchKindValue === 'string' && ENTITY_KINDS.includes(searchKindValue as EntityKind)
    ? searchKindValue as 'all' | EntityKind : EMPTY_PREFERENCES.searchKind;
  const statusValue = filters[WORKSPACE_PREFERENCE_KEYS.statusFilter];
  const statusFilter = statusValue === 'all' || typeof statusValue === 'string' && STATUS_VALUES.includes(statusValue as Status)
    ? statusValue as 'all' | Status : EMPTY_PREFERENCES.statusFilter;
  const query = filters[WORKSPACE_PREFERENCE_KEYS.query];
  return {
    page, structureTab, workTab, timelineTab, kind, searchKind, statusFilter,
    query: typeof query === 'string' ? query.slice(0, 2048) : '',
    scrollY: readScrollY(filters[WORKSPACE_PREFERENCE_KEYS.scrollY]),
    ...(() => { try { const values: unknown = JSON.parse(String(filters[WORKSPACE_PREFERENCE_KEYS.hiddenPages] ?? '[]')); const hiddenPages = Array.isArray(values) ? [...new Set(values.filter((value): value is WorkspacePage => PAGE_VALUES.includes(value) && value !== 'work'))] : []; return hiddenPages.length ? { hiddenPages } : {}; } catch { return {}; } })(),
  };
}

/** Persists workspace controls without changing graph-specific positions, ordering, collapse, or zoom. */
export function saveWorkspaceViewState(input: {
  userId: string;
  deviceClass: ViewState['deviceClass'];
  preferences: WorkspacePreferences;
  lastOpenedId: string | null;
  previous?: ViewState | null;
}): ViewState {
  const previous = input.previous;
  const preferences = input.preferences;
  const filters: Record<string, string | boolean> = {
    ...(previous?.filters ?? {}),
    [WORKSPACE_PREFERENCE_KEYS.hiddenPages]: JSON.stringify(preferences.hiddenPages ?? []),
    [WORKSPACE_PREFERENCE_KEYS.page]: preferences.page,
    [WORKSPACE_PREFERENCE_KEYS.structureTab]: preferences.structureTab,
    [WORKSPACE_PREFERENCE_KEYS.workTab]: preferences.workTab,
    [WORKSPACE_PREFERENCE_KEYS.timelineTab]: preferences.timelineTab,
    [WORKSPACE_PREFERENCE_KEYS.kind]: preferences.kind,
    [WORKSPACE_PREFERENCE_KEYS.searchKind]: preferences.searchKind,
    [WORKSPACE_PREFERENCE_KEYS.statusFilter]: preferences.statusFilter,
    [WORKSPACE_PREFERENCE_KEYS.query]: preferences.query.slice(0, 2048),
    // ViewState has no dedicated scroll field; this namespaced value stays separate from actual filters.
    [WORKSPACE_PREFERENCE_KEYS.scrollY]: String(Math.max(0, Math.min(MAX_SCROLL_Y, Math.floor(preferences.scrollY)))),
  };
  return {
    userId: input.userId,
    deviceClass: input.deviceClass,
    viewId: WORKSPACE_VIEW_ID,
    positions: { ...(previous?.positions ?? {}) },
    sortIds: [...(previous?.sortIds ?? [])],
    collapsedIds: [...(previous?.collapsedIds ?? [])],
    zoom: Number.isFinite(previous?.zoom) && (previous?.zoom ?? 0) > 0 ? previous!.zoom : 1,
    filters,
    lastOpenedId: input.lastOpenedId,
  };
}

export function deviceClassForWidth(width: number): ViewState['deviceClass'] {
  if (!Number.isFinite(width) || width < 0) return 'desktop';
  return width < 768 ? 'phone' : width < 1200 ? 'tablet' : 'desktop';
}

export interface CurrentWorkspaceSelection { projectId: string; id: string | null }
export interface WorkspaceSelectionResolution { id: string | null; staleId: string | null; source: 'current' | 'stored' | 'none' | 'stale' }

/** Keeps a live selection or draft on rotation, scopes it to its project, and rejects deleted stored IDs. */
export function resolveWorkspaceSelection(input: {
  projectId: string;
  validEntityIds: ReadonlySet<string>;
  draftEntityIds?: ReadonlySet<string>;
  storedId?: string | null;
  current?: CurrentWorkspaceSelection | null;
}): WorkspaceSelectionResolution {
  const current = input.current;
  if (current?.projectId === input.projectId && current.id) {
    if (input.validEntityIds.has(current.id) || input.draftEntityIds?.has(current.id)) return { id: current.id, staleId: null, source: 'current' };
    return { id: null, staleId: current.id, source: 'stale' };
  }
  if (!input.storedId) return { id: null, staleId: null, source: 'none' };
  if (input.validEntityIds.has(input.storedId)) return { id: input.storedId, staleId: null, source: 'stored' };
  return { id: null, staleId: input.storedId, source: 'stale' };
}

export interface EntityNavigationMarks { recentIds: string[]; favoriteIds: string[] }
export const EMPTY_ENTITY_NAVIGATION_MARKS: EntityNavigationMarks = { recentIds: [], favoriteIds: [] };

function uniqueStringIds(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !item || item.length > 256 || seen.has(item)) continue;
    seen.add(item); result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

export function workspaceMarksStorageKey(userId: string, projectId: string): string {
  return `${MARKS_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}`;
}

export function parseEntityNavigationMarks(raw: string | null): EntityNavigationMarks {
  if (!raw) return { recentIds: [], favoriteIds: [] };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { recentIds: [], favoriteIds: [] };
    return {
      recentIds: uniqueStringIds(value.recentIds, MAX_RECENT_IDS),
      favoriteIds: uniqueStringIds(value.favoriteIds, MAX_FAVORITE_IDS),
    };
  } catch { return { recentIds: [], favoriteIds: [] }; }
}

export function serializeEntityNavigationMarks(marks: EntityNavigationMarks): string {
  return JSON.stringify({
    recentIds: uniqueStringIds(marks.recentIds, MAX_RECENT_IDS),
    favoriteIds: uniqueStringIds(marks.favoriteIds, MAX_FAVORITE_IDS),
  });
}

export function recordRecentEntity(marks: EntityNavigationMarks, id: string): EntityNavigationMarks {
  if (!id) return { recentIds: [...marks.recentIds], favoriteIds: [...marks.favoriteIds] };
  return { ...marks, recentIds: [id, ...marks.recentIds.filter(existing => existing !== id)].slice(0, MAX_RECENT_IDS) };
}

export function toggleFavoriteEntity(marks: EntityNavigationMarks, id: string): EntityNavigationMarks {
  if (!id) return { recentIds: [...marks.recentIds], favoriteIds: [...marks.favoriteIds] };
  const favoriteIds = marks.favoriteIds.includes(id) ? marks.favoriteIds.filter(existing => existing !== id) : [...marks.favoriteIds, id];
  return { ...marks, favoriteIds };
}

export function reconcileEntityNavigationMarks(marks: EntityNavigationMarks, validEntityIds: ReadonlySet<string>): {
  marks: EntityNavigationMarks;
  staleIds: string[];
} {
  const staleIds = [...new Set([...marks.recentIds, ...marks.favoriteIds].filter(id => !validEntityIds.has(id)))];
  return {
    marks: {
      recentIds: marks.recentIds.filter(id => validEntityIds.has(id)),
      favoriteIds: marks.favoriteIds.filter(id => validEntityIds.has(id)),
    },
    staleIds,
  };
}
