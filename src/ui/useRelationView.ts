import { useEffect, useRef, useState } from 'react';
import type { ProjectData, ViewState } from '../domain/types';
import { scenarioStore } from '../storage';

function actor() { try { const key = 'scenario-local-view-user', current = localStorage.getItem(key); if (current) return current; const id = crypto.randomUUID(); localStorage.setItem(key, id); return id; } catch { return 'local-device'; } }
function deviceClass(): ViewState['deviceClass'] { return window.innerWidth < 768 ? 'phone' : window.innerWidth < 1200 ? 'tablet' : 'desktop'; }
export function safeGraphPositions(value: unknown): ViewState['positions'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, { x: number; y: number }] => { const v = entry[1] as { x?: unknown; y?: unknown } | null; return !!v && typeof v.x === 'number' && Number.isFinite(v.x) && v.x >= 0 && v.x <= 10000 && typeof v.y === 'number' && Number.isFinite(v.y) && v.y >= 0 && v.y <= 10000; }));
}
function normalizedView(value: unknown, initial: ViewState): ViewState {
  if (!value || typeof value !== 'object') return initial;
  const stored = value as Partial<ViewState>;
  return { ...initial, positions: safeGraphPositions(stored.positions), zoom: typeof stored.zoom === 'number' && stored.zoom >= 0.25 && stored.zoom <= 4 ? stored.zoom : 1, lastOpenedId: typeof stored.lastOpenedId === 'string' ? stored.lastOpenedId : null, filters: stored.filters && typeof stored.filters === 'object' ? Object.fromEntries(Object.entries(stored.filters).filter(([, v]) => typeof v === 'string' || typeof v === 'boolean')) : {} };
}
function mirroredView(key: string, initial: ViewState): ViewState | null { try { const raw = localStorage.getItem(key); return raw ? normalizedView(JSON.parse(raw), initial) : null; } catch { return null; } }
function semanticFilters(filters: ViewState['filters']): ViewState['filters'] { return Object.fromEntries(Object.entries(filters).filter(([key]) => key !== 'scrollX' && key !== 'scrollY')); }
function withSemanticFilters(view: ViewState, preserved?: ViewState['filters'], selectedId?: ViewState['lastOpenedId']): ViewState { return preserved === undefined ? view : { ...view, lastOpenedId: selectedId ?? null, filters: { ...Object.fromEntries(Object.entries(view.filters).filter(([key]) => key === 'scrollX' || key === 'scrollY')), ...preserved } }; }
/** Layout is device view state. It never saves changes to world membership or relations. */
export function useRelationView(project: ProjectData) {
  const userId = useRef(actor()), [device, setDevice] = useState(deviceClass);
  const key = `scenario-relations:v1:${userId.current}:${project.projectId}:${device}`;
  const initial: ViewState = { userId: userId.current, deviceClass: device, viewId: 'relations', positions: {}, sortIds: [], collapsedIds: [], zoom: 1, filters: {}, lastOpenedId: null };
  const [record, setRecord] = useState(() => ({ key, view: mirroredView(key, initial) ?? initial }));
  const currentKey = useRef(key), loadedProject = useRef(project.projectId), dirtyKey = useRef<string | null>(null); currentKey.current = key;
  const carried = record.key !== key && loadedProject.current === project.projectId ? semanticFilters(record.view.filters) : undefined;
  const incoming = mirroredView(key, initial) ?? initial;
  const state = record.key === key ? record.view : withSemanticFilters(incoming, carried, record.view.lastOpenedId);
  const update = (change: ViewState | ((previous: ViewState) => ViewState)) => { dirtyKey.current = key; setRecord(previous => { const view = previous.key === key ? previous.view : state; return { key, view: typeof change === 'function' ? change(view) : change }; }); };
  useEffect(() => { const resize = () => setDevice(deviceClass()); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => {
    let live = true; dirtyKey.current = null;
    const fresh = { ...initial, deviceClass: device }, mirrored = mirroredView(key, fresh), preserved = record.key !== key && loadedProject.current === project.projectId ? semanticFilters(record.view.filters) : undefined;
    const applySemantic = (view: ViewState) => withSemanticFilters(view, preserved, record.view.lastOpenedId); loadedProject.current = project.projectId;
    setRecord({ key, view: applySemantic(mirrored ?? fresh) });
    void scenarioStore.getViewState(project.projectId, userId.current, device, 'relations').then(stored => { if (live && currentKey.current === key && dirtyKey.current !== key && !mirrored && stored) setRecord({ key, view: applySemantic(normalizedView(stored, fresh)) }); }).catch(() => undefined);
    return () => { live = false; };
  }, [project.projectId, key, device]);
  useEffect(() => {
    if (record.key !== key) return;
    const view = record.view, projectId = project.projectId;
    const mirror = () => { try { localStorage.setItem(key, JSON.stringify(view)); } catch { /* The stored view remains available. */ } };
    const persist = () => { mirror(); void scenarioStore.saveViewState(projectId, view).catch(() => undefined); };
    mirror(); const timer = window.setTimeout(persist, 250);
    window.addEventListener('pagehide', mirror);
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', mirror); persist(); };
  }, [project.projectId, key, record]);
  return [state, update] as const;
}
