import { useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import type { TrialSession } from '../domain/runtime';

interface ReaderDraft {
  version: string;
  session: TrialSession | null;
  error: string;
  notice: string;
  busy: boolean;
  saving: boolean;
  pendingReplay: { traceId: string; snapshotId: string } | null;
  operation: { current: boolean };
}
const drafts = new Map<string, ReaderDraft>(), listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export function readerDraft(projectId: string, initialBusy = false, initialVersion = ''): ReaderDraft {
  let value = drafts.get(projectId);
  if (!value) { value = { version: initialVersion, session: null, error: '', notice: '', busy: initialBusy, saving: false, pendingReplay: null, operation: { current: initialBusy } }; drafts.set(projectId, value); }
  return value;
}
export function updateReaderDraft(projectId: string, patch: Partial<Omit<ReaderDraft, 'operation'>>) {
  drafts.set(projectId, { ...readerDraft(projectId), ...patch }); listeners.forEach(listener => listener());
}
/** Pending operations and their results belong to the project, even when its view unmounts. */
export function useReaderField<K extends keyof Omit<ReaderDraft, 'operation'>>(projectId: string, key: K): [ReaderDraft[K], Dispatch<SetStateAction<ReaderDraft[K]>>] {
  const value = useSyncExternalStore(subscribe, () => readerDraft(projectId)[key]);
  const update: Dispatch<SetStateAction<ReaderDraft[K]>> = action => {
    const current = readerDraft(projectId), next = typeof action === 'function' ? (action as (previous: ReaderDraft[K]) => ReaderDraft[K])(current[key]) : action;
    if (Object.is(current[key], next)) return;
    updateReaderDraft(projectId, { [key]: next });
  };
  return [value, update];
}
