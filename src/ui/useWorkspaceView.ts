import { useEffect, useRef, useState } from 'react';
import type { ViewState } from '../domain/types';
import { scenarioStore } from '../storage';
import { recordRecentEntity, restoreWorkspacePreferences, saveWorkspaceViewState, parseEntityNavigationMarks, serializeEntityNavigationMarks, toggleFavoriteEntity, workspaceMarksStorageKey, WORKSPACE_VIEW_ID, type EntityNavigationMarks, type WorkspacePreferences } from './viewPreferences';

function deviceClass(): ViewState['deviceClass'] { return window.innerWidth < 768 ? 'phone' : window.innerWidth < 1200 ? 'tablet' : 'desktop'; }
function localUser() { try { const key = 'scenario-local-view-user'; let id = localStorage.getItem(key); if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); } return id; } catch { return 'local-device'; } }
function mirrorKey(projectId: string, userId: string, device: ViewState['deviceClass']) { return `scenario-workspace-view:v1:${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}:${device}`; }
function mirroredView(projectId: string, userId: string, device: ViewState['deviceClass'], stored?: ViewState): ViewState | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(mirrorKey(projectId, userId, device)) ?? 'null');
    if (!value || !value.filters || typeof value.filters !== 'object' || Array.isArray(value.filters)) return stored;
    const filters = Object.fromEntries(Object.entries(value.filters).filter(([, item]) => typeof item === 'string' || typeof item === 'boolean')) as ViewState['filters'];
    return { userId, deviceClass: device, viewId: WORKSPACE_VIEW_ID, positions: stored?.positions ?? {}, sortIds: stored?.sortIds ?? [], collapsedIds: stored?.collapsedIds ?? [], zoom: stored?.zoom ?? 1, filters, lastOpenedId: typeof value.lastOpenedId === 'string' ? value.lastOpenedId : null };
  } catch { return stored; }
}
export function useWorkspaceView(projectId: string | null, preferences: WorkspacePreferences, selectedId: string | null, restore: (preferences: WorkspacePreferences, selectedId: string | null) => void) {
  const userId = useRef(localUser());
  const latest = useRef({ preferences, selectedId, restore }); latest.current = { preferences, selectedId, restore };
  const previous = useRef<ViewState | undefined>(undefined);
  const scope = useRef<string | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  const [device, setDevice] = useState(deviceClass);
  const [scrollY, setScrollY] = useState(window.scrollY);
  const [marks, setMarks] = useState<EntityNavigationMarks>({ recentIds: [], favoriteIds: [] });
  useEffect(() => { const resize = () => setDevice(deviceClass()); const scroll = () => setScrollY(window.scrollY); window.addEventListener('resize', resize); window.addEventListener('scroll', scroll, { passive: true }); return () => { window.removeEventListener('resize', resize); window.removeEventListener('scroll', scroll); }; }, []);
  useEffect(() => {
    if (!projectId) { scope.current = null; setReady(null); return; }
    let live = true; const switching = scope.current !== projectId; scope.current = projectId; setReady(null);
    if (switching) { try { setMarks(parseEntityNavigationMarks(localStorage.getItem(workspaceMarksStorageKey(userId.current, projectId)))); } catch { setMarks({ recentIds: [], favoriteIds: [] }); } }
    void scenarioStore.getViewState(projectId, userId.current, device, WORKSPACE_VIEW_ID).then(stored => {
      const view = mirroredView(projectId, userId.current, device, stored);
      if (!live) return; previous.current = view;
      if (switching) { const next = restoreWorkspacePreferences(view); latest.current.restore(next, view?.lastOpenedId ?? null); requestAnimationFrame(() => { if (live) window.scrollTo(0, next.scrollY); }); }
      setReady(`${projectId}:${device}`);
    }).catch(() => { if (live) setReady(`${projectId}:${device}`); });
    return () => { live = false; };
  }, [projectId, device]);
  useEffect(() => {
    if (!projectId || ready !== `${projectId}:${device}`) return;
    const mirror = () => {
      const view = saveWorkspaceViewState({ userId: userId.current, deviceClass: device, preferences: { ...latest.current.preferences, scrollY: window.scrollY }, lastOpenedId: latest.current.selectedId, previous: previous.current });
      try { localStorage.setItem(mirrorKey(projectId, userId.current, device), JSON.stringify({ filters: view.filters, lastOpenedId: view.lastOpenedId })); } catch { /* IndexedDB remains available when local preferences are full. */ }
      return view;
    };
    mirror();
    window.addEventListener('pagehide', mirror);
    const timer = window.setTimeout(() => {
      const view = mirror();
      previous.current = view; void scenarioStore.saveViewState(projectId, view).catch(() => undefined);
    }, 200);
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', mirror); };
  }, [projectId, ready, device, preferences.page, preferences.structureTab, preferences.workTab, preferences.timelineTab, preferences.kind, preferences.searchKind, preferences.statusFilter, preferences.query, preferences.hiddenPages?.join(','), selectedId, scrollY]);
  const changeMarks = (next: EntityNavigationMarks) => { setMarks(next); if (projectId) { try { localStorage.setItem(workspaceMarksStorageKey(userId.current, projectId), serializeEntityNavigationMarks(next)); } catch { /* Optional navigation preferences. */ } } };
  return { marks, recordRecent: (id: string) => changeMarks(recordRecentEntity(marks, id)), toggleFavorite: (id: string) => changeMarks(toggleFavoriteEntity(marks, id)) };
}
