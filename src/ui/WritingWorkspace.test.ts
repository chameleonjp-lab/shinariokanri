import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject, textToRichText } from '../domain/model';
import { ChapterReadingView, StructurePreview, WritingWorkspace } from './WritingWorkspace';

function storyFixture() {
  const project = createProject('章と本文');
  const character = createEntity(project.projectId, 'character', 'アオ');
  const firstThread = createEntity(project.projectId, 'group', '門を開ける筋', { groupType: 'plot_thread' });
  const secondThread = createEntity(project.projectId, 'group', '家族の筋', { groupType: 'plot_thread' });
  const scene = createEntity(project.projectId, 'scene', '門の場面', { povId: character.id, threadIds: [firstThread.id, secondThread.id], summary: textToRichText('門が開く'), body: textToRichText('🌙アオは門を開けた。'), tension: null, importance: 3 });
  scene.data.authorNotes = textToRichText('公開しない作者メモ');
  const firstChapter = createEntity(project.projectId, 'chapter', '第一章', { sceneIds: [scene.id] });
  const secondChapter = createEntity(project.projectId, 'chapter', '第二章', { sceneIds: [] });
  scene.data.chapterId = firstChapter.id;
  project.entities = [character, firstThread, secondThread, firstChapter, secondChapter, scene];
  return { project, scene, firstChapter, secondChapter };
}

describe('writing workspace UI', () => {
  it('shows the same canonical scene in independent thread lanes and offers chapter presentation controls', () => {
    const { project, scene } = storyFixture();
    const threadMarkup = renderToStaticMarkup(createElement(WritingWorkspace, { project, initialAxis: 'thread', onOpenEntity: () => undefined }));
    expect(threadMarkup.split(`data-scene-id="${scene.id}"`).length - 1).toBe(2);
    expect(threadMarkup).toContain('門を開ける筋');
    expect(threadMarkup).toContain('家族の筋');

    const chapterMarkup = renderToStaticMarkup(createElement(WritingWorkspace, { project, initialAxis: 'chapter', onOpenEntity: () => undefined, onSaveProject: () => undefined }));
    expect(chapterMarkup).toContain('第一章を上へ');
    expect(chapterMarkup).toContain('第二章を下へ');
    expect(chapterMarkup).toContain('章を移す');
  });

  it('lets the reader choose chapters, preserves deliberate scene revisits, and excludes author notes', () => {
    const { project, scene } = storyFixture();
    const chapterMarkup = renderToStaticMarkup(createElement(ChapterReadingView, { project, onOpenEntity: () => undefined }));
    expect(chapterMarkup).toContain('読む章を選ぶ');
    expect(chapterMarkup).toContain('第一章');
    expect(chapterMarkup).toContain('第二章');

    const routeMarkup = renderToStaticMarkup(createElement(ChapterReadingView, { project, scenePath: [scene.id, scene.id], onOpenEntity: () => undefined }));
    expect(routeMarkup.split(`data-scene-id="${scene.id}"`).length - 1).toBe(2);
    expect(routeMarkup).toContain('🌙アオは門を開けた。');
    expect(routeMarkup).not.toContain('公開しない作者メモ');
    expect(routeMarkup).toContain('縦書き');
  });

  it('shows tension coverage and requires an explicit order preview before applying a template', () => {
    const { project } = storyFixture();
    const markup = renderToStaticMarkup(createElement(StructurePreview, { project, onApplyToDraft: () => undefined }));
    expect(markup).toContain('構成雛形');
    expect(markup).toContain('未入力 1件');
    expect(markup).toContain('順序の差分を確認');
    expect(markup).not.toContain('class="button primary small">別案の下書きへ適用');
  });
});
