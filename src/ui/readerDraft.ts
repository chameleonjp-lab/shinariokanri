import {registerAuthorCache,registerAuthorBusy} from './StoreContext';
import { useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import type { AnalysisResult, TrialSession } from '../domain/runtime';

interface ReaderDraft {
  version: string;
  session: TrialSession | null;
  error: string;
  notice: string;
  busy: boolean;
  saving: boolean;
  pendingReplay: { traceId: string; snapshotId: string } | null;
  analysis: AnalysisResult | null;
  analyzing: boolean;
  progress: number;
  analysisOperation: { controller: AbortController | null };
  operation: { current: boolean };
}
type ReaderFields = Omit<ReaderDraft, 'operation' | 'analysisOperation'>;
const drafts = new Map<string, ReaderDraft>(), listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export function readerDraft(projectId: string, initialBusy = false, initialVersion = ''): ReaderDraft {
  let value = drafts.get(projectId);
  if (!value) { value = { version: initialVersion, session: null, error: '', notice: '', busy: initialBusy, saving: false, pendingReplay: null, analysis: null, analyzing: false, progress: 0, analysisOperation: { controller: null }, operation: { current: initialBusy } }; drafts.set(projectId, value); }
  return value;
}
export function updateReaderDraft(projectId: string, patch: Partial<ReaderFields>) {
  drafts.set(projectId, { ...readerDraft(projectId), ...patch }); listeners.forEach(listener => listener());
}
/** Pending operations and their results belong to the project, even when its view unmounts. */
export function useReaderField<K extends keyof ReaderFields>(projectId: string, key: K): [ReaderDraft[K], Dispatch<SetStateAction<ReaderDraft[K]>>] {
  const value = useSyncExternalStore(subscribe, () => readerDraft(projectId)[key]);
  const update: Dispatch<SetStateAction<ReaderDraft[K]>> = action => {
    const current = readerDraft(projectId), next = typeof action === 'function' ? (action as (previous: ReaderDraft[K]) => ReaderDraft[K])(current[key]) : action;
    if (Object.is(current[key], next)) return;
    updateReaderDraft(projectId, { [key]: next });
  };
  return [value, update];
}

registerAuthorCache(account=>{const prefix=account+":";for(const [key,value] of drafts)if(key.startsWith(prefix)){value.analysisOperation.controller?.abort();drafts.delete(key);}});
registerAuthorBusy(account=>[...drafts].some(([key,value])=>key.startsWith(account+":")&&value.busy));
