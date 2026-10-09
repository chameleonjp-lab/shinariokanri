import { ignoredLinkCandidateKey } from '../domain/linkCandidates';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storageKey(projectId: string, sourceEntityId: string): string {
  return `scenario-link-candidate-suppressions:v1:${encodeURIComponent(projectId)}:${encodeURIComponent(sourceEntityId)}`;
}

export function loadIgnoredLinkCandidates(storage: PreferenceStorage, projectId: string, sourceEntityId: string): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKey(projectId, sourceEntityId)) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Store only this device's project-scoped suggestion preference, never author data. */
export function saveIgnoredLinkCandidate(storage: PreferenceStorage, projectId: string, sourceEntityId: string, key: string): ReadonlySet<string> {
  const next = new Set(loadIgnoredLinkCandidates(storage, projectId, sourceEntityId));
  next.add(key);
  try { storage.setItem(storageKey(projectId, sourceEntityId), JSON.stringify([...next])); } catch { /* Preferences must not block editing. */ }
  return next;
}

export function candidateIgnoreKey(projectId: string, sourceEntityId: string, targetEntityId: string, term: string): string {
  return ignoredLinkCandidateKey(projectId, sourceEntityId, targetEntityId, term);
}
