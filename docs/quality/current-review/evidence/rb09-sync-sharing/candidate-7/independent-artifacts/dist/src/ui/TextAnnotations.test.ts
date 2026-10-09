import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject } from '../domain/model';
import type { RichText } from '../domain/types';
import { TextAnnotations } from './TextAnnotations';

describe('TextAnnotations', () => {
  it('renders accessible phrase, occurrence, target, ruby, and block controls without exposing raw JSON', () => {
    const project = createProject('注記 UI');
    const source = createEntity(project.projectId, 'scene', '本文');
    const firstTarget = createEntity(project.projectId, 'character', 'アオ', { reading: 'あお', summary: [{ id: 'target-paragraph', kind: 'paragraph', text: 'アオがいる。' }] });
    const secondTarget = createEntity(project.projectId, 'character', 'アオ');
    project.entities = [source, firstTarget, secondTarget];
    const value: RichText = [{ id: 'source-paragraph', kind: 'paragraph', text: '😀アオとアオ', links: [{ start: 1, end: 3, target: { entityId: firstTarget.id, blockId: 'target-paragraph', start: 0, end: 2 } }] }];
    const markup = renderToStaticMarkup(createElement(TextAnnotations, {
      value,
      project,
      sourceEntityId: source.id,
      onChange: () => undefined,
      onIgnoreCandidate: () => undefined,
      onOpenTarget: () => undefined,
      onOpenReferences: () => undefined,
    }));

    expect(markup).toContain('aria-label="本文のルビとリンク"');
    expect(markup).toContain('本文での出現位置');
    expect(markup).toContain('本文に見つかった候補');
    expect(markup).toContain('リンク先');
    expect(markup).toContain('value="ruby">ルビ</option>');
    expect(markup).toContain('この位置で段落を分割');
    expect(markup).toContain('次の段落と結合');
    expect(markup).toContain('前へ移動');
    expect(markup).toContain('アオ');
    expect(markup).toContain('対象を開く');
    expect(markup).not.toContain('JSON');
    expect(markup).not.toContain('<textarea');
  });
});
