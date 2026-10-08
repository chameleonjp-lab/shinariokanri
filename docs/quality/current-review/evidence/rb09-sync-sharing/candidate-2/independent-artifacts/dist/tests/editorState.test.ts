import { describe, expect, it } from 'vitest';
import { editorStateKey, editorTextFingerprint, loadEditorViewState, restorableEditorSelection, saveEditorViewState } from '../src/ui/editorState';

describe('RB02: device-local editor position recovery', () => {
  it('restores the tab and selection without storing text or changing the source', () => {
    const source = '😀同じ言葉。', key = editorStateKey('project', 'scene');
    const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const state = { tab: 'body' as const, scrollTop: 240, scrollY: 800, selection: { fieldKey: 'body', start: 2, end: 6, textHash: editorTextFingerprint(source) } };
    saveEditorViewState(storage, key, state);
    expect(loadEditorViewState(storage, key)).toEqual(state);
    expect(values.get(key)).not.toContain(source);
    expect(restorableEditorSelection(state.selection, source)).toBe(true);
    expect(restorableEditorSelection(state.selection, '😀違う言葉。')).toBe(false);
    expect(editorStateKey('project', 'other')).not.toBe(key);
    expect(editorStateKey('other', 'scene')).not.toBe(key);
  });
  it('ignores malformed or impossible saved selection and scroll positions', () => {
    const storage = { getItem: () => JSON.stringify({ tab: 'unknown', scrollTop: -1, scrollY: 1e20, selection: { fieldKey: 'body', start: 7, end: 1, textHash: 'abc' } }) };
    expect(loadEditorViewState(storage, 'key')).toEqual({ tab: 'main', scrollTop: 0, scrollY: 0 });
    expect(loadEditorViewState({ getItem: () => 'null' }, 'key')).toEqual({ tab: 'main', scrollTop: 0, scrollY: 0 });
    expect(loadEditorViewState({ getItem: () => '{bad' }, 'key')).toEqual({ tab: 'main', scrollTop: 0, scrollY: 0 });
  });
});
