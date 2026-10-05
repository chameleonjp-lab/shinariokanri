import { describe, expect, it } from 'vitest';
import type { ViewState } from '../domain/types';
import {
  deviceClassForWidth, parseEntityNavigationMarks, recordRecentEntity, reconcileEntityNavigationMarks,
  restoreWorkspacePreferences, resolveWorkspaceSelection, saveWorkspaceViewState, serializeEntityNavigationMarks,
  toggleFavoriteEntity, workspaceMarksStorageKey, WORKSPACE_VIEW_ID,
  type EntityNavigationMarks, type WorkspacePreferences,
} from './viewPreferences';

const preferences: WorkspacePreferences = {
  page: 'structure', structureTab: 'branch', workTab: 'history', timelineTab: 'relations', kind: 'flow_node',
  searchKind: 'scene', statusFilter: 'needs_review', query: '霧の門', scrollY: 840,
};

describe('per-device workspace preferences', () => {
  it('retains hidden workspace screens while preserving access to their display settings', () => {
    const saved = saveWorkspaceViewState({ userId: 'author', deviceClass: 'phone', preferences: { ...preferences, hiddenPages: ['timeline', 'materials'] }, lastOpenedId: null });
    expect(restoreWorkspacePreferences(saved).hiddenPages).toEqual(['timeline', 'materials']);
    saved.filters['workspace.hiddenPages'] = '["work","unknown","search","search"]';
    expect(restoreWorkspacePreferences(saved).hiddenPages).toEqual(['search']);
  });
  it('round-trips navigation and scroll while preserving graph view fields and unrelated filters', () => {
    const previous: ViewState = {
      userId: 'author', deviceClass: 'desktop', viewId: 'graph', positions: { node: { x: 120, y: 40 } },
      sortIds: ['first', 'second'], collapsedIds: ['group'], zoom: 1.5,
      filters: { 'graph.showLabels': false, 'custom.filter': 'kept' }, lastOpenedId: 'old-scene',
    };
    const saved = saveWorkspaceViewState({ userId: 'author', deviceClass: 'phone', preferences, lastOpenedId: 'selected-scene', previous });

    expect(saved.viewId).toBe(WORKSPACE_VIEW_ID);
    expect(saved.deviceClass).toBe('phone');
    expect(saved.lastOpenedId).toBe('selected-scene');
    expect(saved.positions).toEqual(previous.positions);
    expect(saved.sortIds).toEqual(previous.sortIds);
    expect(saved.collapsedIds).toEqual(previous.collapsedIds);
    expect(saved.zoom).toBe(previous.zoom);
    expect(saved.filters['graph.showLabels']).toBe(false);
    expect(saved.filters['custom.filter']).toBe('kept');
    expect(restoreWorkspacePreferences(saved)).toEqual(preferences);
  });

  it('falls back safely for malformed or unsupported stored values', () => {
    const restored = restoreWorkspacePreferences({ filters: {
      'workspace.page': 'invented-page', 'workspace.structureTab': false, 'workspace.kind': 'unknown-kind',
      'workspace.searchKind': 'not-a-kind', 'workspace.statusFilter': 'deleted', 'workspace.query': false,
      'workspace.scrollY': '-900',
    } });
    expect(restored).toEqual({
      page: 'timeline', structureTab: 'chapters', workTab: 'backup', timelineTab: 'timeline', kind: 'character',
      searchKind: 'all', statusFilter: 'all', query: '', scrollY: 0,
    });
  });

  it('classifies device widths without applying desktop layout to small screens', () => {
    expect([320, 767, 768, 1199, 1200].map(deviceClassForWidth)).toEqual(['phone', 'phone', 'tablet', 'tablet', 'desktop']);
    expect(deviceClassForWidth(Number.NaN)).toBe('desktop');
  });

  it('keeps a current same-project selection or draft across rotation and refuses stale or cross-project IDs', () => {
    const validEntityIds = new Set(['chapter-a', 'scene-b']);
    expect(resolveWorkspaceSelection({
      projectId: 'project-a', validEntityIds, storedId: 'chapter-a', current: { projectId: 'project-a', id: 'scene-b' },
    })).toEqual({ id: 'scene-b', staleId: null, source: 'current' });
    expect(resolveWorkspaceSelection({
      projectId: 'project-a', validEntityIds, draftEntityIds: new Set(['unsaved-scene']),
      current: { projectId: 'project-a', id: 'unsaved-scene' },
    })).toEqual({ id: 'unsaved-scene', staleId: null, source: 'current' });
    expect(resolveWorkspaceSelection({
      projectId: 'project-b', validEntityIds: new Set(['other-scene']), storedId: 'other-scene',
      current: { projectId: 'project-a', id: 'scene-b' },
    })).toEqual({ id: 'other-scene', staleId: null, source: 'stored' });
    expect(resolveWorkspaceSelection({ projectId: 'project-a', validEntityIds, storedId: 'deleted-scene' }))
      .toEqual({ id: null, staleId: 'deleted-scene', source: 'stale' });
  });

  it('scopes recent and favorite items by user and project and tolerates malformed local data', () => {
    expect(workspaceMarksStorageKey('user-a', 'project-a')).not.toBe(workspaceMarksStorageKey('user-a', 'project-b'));
    expect(workspaceMarksStorageKey('user-a', 'project-a')).not.toBe(workspaceMarksStorageKey('user-b', 'project-a'));
    expect(parseEntityNavigationMarks('{broken')).toEqual({ recentIds: [], favoriteIds: [] });

    const start: EntityNavigationMarks = { recentIds: ['scene-a'], favoriteIds: [] };
    const updated = toggleFavoriteEntity(recordRecentEntity(start, 'scene-b'), 'scene-b');
    expect(updated).toEqual({ recentIds: ['scene-b', 'scene-a'], favoriteIds: ['scene-b'] });
    expect(toggleFavoriteEntity(updated, 'scene-b').favoriteIds).toEqual([]);
    expect(parseEntityNavigationMarks(serializeEntityNavigationMarks(updated))).toEqual(updated);
  });

  it('removes archived IDs from visible marks while returning them for recovery guidance', () => {
    const marks: EntityNavigationMarks = { recentIds: ['scene-a', 'archived-scene'], favoriteIds: ['archived-scene', 'chapter-b'] };
    expect(reconcileEntityNavigationMarks(marks, new Set(['scene-a', 'chapter-b']))).toEqual({
      marks: { recentIds: ['scene-a'], favoriteIds: ['chapter-b'] }, staleIds: ['archived-scene'],
    });
  });
});
