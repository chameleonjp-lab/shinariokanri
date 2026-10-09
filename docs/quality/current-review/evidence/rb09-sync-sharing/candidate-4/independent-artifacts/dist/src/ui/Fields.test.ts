import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEntity, createProject } from '../domain/model';
import type { Entity } from '../domain/types';
import { DataField } from './Fields';

function setup() {
  const project = createProject('Fields 統合');
  const scene = createEntity(project.projectId, 'scene', '本文の場面');
  scene.data.body = [{ id: 'body-block-1', kind: 'paragraph', text: '😀アオが歩く。' }];
  const flowNode = createEntity(project.projectId, 'flow_node', '起動ノード');
  project.entities = [scene, createEntity(project.projectId, 'character', 'アオ'), flowNode];
  const base = { project, entity: scene as Entity, onChange: () => undefined, onValid: () => undefined };
  return { project, scene, flowNode, base };
}

describe('DataField normal authoring controls', () => {
  it('mounts annotation tools beside the combined rich-text editor and exposes block navigation markers', () => {
    const { project, scene, base } = setup();
    const originalBody = structuredClone(scene.data.body);
    const markup = renderToStaticMarkup(createElement(DataField, {
      ...base,
      field: { key: 'body', label: '本文', type: 'rich' },
      value: scene.data.body,
      onOpenTarget: () => undefined,
    }));
    expect(markup).toContain('id="rich-text-editor-');
    expect(markup).toContain('data-rich-text-editor="true"');
    expect(markup).toContain('data-block-id="body-block-1"');
    expect(markup).toContain('data-editor-id="rich-text-editor-');
    expect(markup).toContain('aria-label="本文のルビとリンク"');
    expect(markup).toContain('本文での出現位置');
    expect(markup).not.toContain('<textarea aria-label="JSON"');
    expect(scene.data.body).toEqual(originalBody);
  });

  it('keeps author notes outside public text annotation tools', () => {
    const { scene, base } = setup();
    scene.data.authorNotes = [{ id: 'notes-block-1', kind: 'paragraph', text: '制作メモ' }];
    const markup = renderToStaticMarkup(createElement(DataField, {
      ...base,
      field: { key: 'authorNotes', label: '作者メモ', type: 'rich' },
      value: scene.data.authorNotes,
    }));
    expect(markup).toContain('data-block-id="notes-block-1"');
    expect(markup).not.toContain('ルビとリンク');
  });

  it('uses the structured form for ordinary JSON fields while preserving the anchor picker', () => {
    const { project, scene, flowNode, base } = setup();
    flowNode.data.trigger = { event: 'enter', eventKey: 'start', repeat: 'once' };
    const structured = renderToStaticMarkup(createElement(DataField, {
      ...base,
      entity: flowNode,
      field: { key: 'trigger', label: 'トリガー', type: 'json' },
      value: flowNode.data.trigger,
    }));
    expect(structured).toContain('起動イベント');
    expect(structured).toContain('繰り返し');
    expect(structured).not.toContain('<textarea');

    const anchor = renderToStaticMarkup(createElement(DataField, {
      ...base,
      field: { key: 'anchor', label: '本文位置', type: 'json' },
      value: { entityId: scene.id },
    }));
    expect(anchor).toContain('提示する場面・情報');
    expect(anchor).not.toContain('構造化入力');
  });
});
