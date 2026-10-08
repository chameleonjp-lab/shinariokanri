import { describe, expect, it } from 'vitest';
import { candidateIgnoreKey, loadIgnoredLinkCandidates, saveIgnoredLinkCandidate } from './linkCandidatePreferences';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe('device link-candidate preferences', () => {
  it('persists ignored candidates within one project and source entity only', () => {
    const storage = memoryStorage();
    const key = candidateIgnoreKey('project / 一', 'source:1', 'target:2', '青');
    expect(saveIgnoredLinkCandidate(storage, 'project / 一', 'source:1', key)).toEqual(new Set([key]));
    expect(loadIgnoredLinkCandidates(storage, 'project / 一', 'source:1')).toEqual(new Set([key]));
    expect(loadIgnoredLinkCandidates(storage, 'project / 一', 'source:other')).toEqual(new Set());
    expect(loadIgnoredLinkCandidates(storage, 'project:other', 'source:1')).toEqual(new Set());
  });

  it('tolerates malformed, unexpected, or unavailable preference records', () => {
    const storage = memoryStorage();
    storage.setItem('scenario-link-candidate-suppressions:v1:p:s', '{');
    expect(loadIgnoredLinkCandidates(storage, 'p', 's')).toEqual(new Set());
    const failingStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadIgnoredLinkCandidates(failingStorage, 'p', 's')).toEqual(new Set());
    expect(saveIgnoredLinkCandidate(failingStorage, 'p', 's', 'key')).toEqual(new Set(['key']));
  });
});
