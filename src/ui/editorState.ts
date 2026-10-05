import type { ID } from '../domain/types';

export type EditorTab = 'main' | 'body' | 'notes' | 'detail' | 'preview';
export interface EditorSelection { fieldKey: string; start: number; end: number; textHash: string; focus?: boolean }
export interface EditorViewState { tab: EditorTab; scrollTop: number; scrollY: number; selection?: EditorSelection }
const tabs: EditorTab[] = ['main', 'body', 'notes', 'detail', 'preview'];
const bounded = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 100_000_000;

export function editorStateKey(projectId: ID, entityId: ID): string { return `scenario-editor-state:v1:${projectId}:${entityId}`; }
export function editorTextFingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}
export function loadEditorViewState(storage: Pick<Storage, 'getItem'>, key: string): EditorViewState {
  try {
    const state = JSON.parse(storage.getItem(key) ?? '{}');
    const selection = state?.selection;
    return { tab: tabs.includes(state?.tab) ? state.tab : 'main', scrollTop: bounded(state?.scrollTop) ? state.scrollTop : 0, scrollY: bounded(state?.scrollY) ? state.scrollY : 0,
      ...(selection && typeof selection.fieldKey === 'string' && selection.fieldKey.length <= 128 && bounded(selection.start) && bounded(selection.end) && selection.end >= selection.start && typeof selection.textHash === 'string' && /^\d+:[0-9a-f]+$/.test(selection.textHash) ? { selection: { fieldKey: selection.fieldKey, start: selection.start, end: selection.end, textHash: selection.textHash, ...(selection.focus === true ? { focus: true } : {}) } } : {}) };
  } catch { return { tab: 'main', scrollTop: 0, scrollY: 0 }; }
}

/** State contains positions and a fingerprint, never a copy of the text. */
export function saveEditorViewState(storage: Pick<Storage, 'setItem'>, key: string, state: EditorViewState): void {
  try { storage.setItem(key, JSON.stringify(state)); } catch { /* Position recovery remains optional when device storage is unavailable. */ }
}
export function restorableEditorSelection(selection: EditorSelection | undefined, text: string): boolean {
  return !!selection && selection.textHash === editorTextFingerprint(text) && selection.start <= selection.end && selection.end <= text.length;
}
