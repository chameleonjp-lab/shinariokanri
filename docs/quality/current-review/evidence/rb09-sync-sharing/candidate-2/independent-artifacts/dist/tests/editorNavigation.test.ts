import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId } from '../src/domain/model';
import { resolveEditorNavigation } from '../src/ui/editorNavigation';

describe('RB02: precise editor reference navigation', () => {
  it('chooses the stable paragraph ID among repeated words and translates Unicode offsets', () => {
    const project = createProject('段落の移動');
    const first = { id: newId(), kind: 'paragraph' as const, text: '😀アオ。' }, second = { id: newId(), kind: 'paragraph' as const, text: '再び😀アオ。' };
    const scene = createEntity(project.projectId, 'scene', '場面', { body: [first, second] });
    const target = resolveEditorNavigation(scene, { entityId: scene.id, blockId: second.id, start: 3, end: 5 });
    expect(target.ok).toBe(true);
    if (!target.ok) throw new Error(target.message);
    expect(target.fieldKey).toBe('body'); expect(target.blockId).toBe(second.id);
    expect([first.text, second.text].join('\n').slice(target.start, target.end)).toBe('アオ');
  });
  it('focuses author-note paragraphs through their own field', () => {
    const project = createProject('項目の移動'), block = { id: newId(), kind: 'paragraph' as const, text: '作者の確認' };
    const scene = createEntity(project.projectId, 'scene', '場面', { authorNotes: [block] });
    expect(resolveEditorNavigation(scene, { entityId: scene.id, blockId: block.id })).toMatchObject({ ok: true, fieldKey: 'authorNotes', start: 0, end: 5 });
  });
  it('opens an explicitly current project version at the same exact Unicode range', () => {
    const project = createProject('現在版の参照'), block = { id: newId(), kind: 'paragraph' as const, text: '😀アオ' };
    const scene = createEntity(project.projectId, 'scene', '場面', { body: [block] });
    expect(resolveEditorNavigation(scene, { entityId: scene.id, sourceVersionId: project.projectId, blockId: block.id, start: 1, end: 3 })).toEqual({ ok: true, fieldKey: 'body', blockId: block.id, start: 2, end: 4 });
  });
  it('navigates a line-ID anchor to the line text without guessing the scene text', () => {
    const project = createProject('台詞の移動');
    const line = createEntity(project.projectId, 'dialogue_line', '台詞', { text: [{ id: newId(), kind: 'paragraph', text: '😀アオ' }] });
    expect(resolveEditorNavigation(line, { entityId: newId(), lineId: line.id, start: 1, end: 3 })).toEqual({ ok: true, fieldKey: 'text', start: 2, end: 4 });
  });
  it('keeps unresolved, missing, out-of-range and fixed-version positions explanatory', () => {
    const project = createProject('参照位置の確認'), block = { id: newId(), kind: 'paragraph' as const, text: '同じ言葉' };
    const scene = createEntity(project.projectId, 'scene', '場面', { body: [block] });
    const unresolved = resolveEditorNavigation(scene, { entityId: scene.id, blockId: block.id, positionStatus: 'unresolved', positionReason: '元の段落を削除', quotedText: '同じ言葉' });
    expect(unresolved).toEqual({ ok: false, message: '元の段落を削除 引用: 同じ言葉' });
    expect(resolveEditorNavigation(scene, { entityId: scene.id, blockId: newId() })).toMatchObject({ ok: false, message: expect.stringContaining('段落がありません') });
    expect(resolveEditorNavigation(scene, { entityId: scene.id, blockId: block.id, start: 0, end: 20 })).toMatchObject({ ok: false, message: expect.stringContaining('文字範囲') });
    expect(resolveEditorNavigation(scene, { entityId: scene.id, blockId: block.id, sourceVersionId: newId() })).toMatchObject({ ok: false, message: expect.stringContaining('固定版') });
  });
});
