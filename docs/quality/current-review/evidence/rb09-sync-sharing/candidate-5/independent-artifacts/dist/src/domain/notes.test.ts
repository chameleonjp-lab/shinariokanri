import { describe, expect, it } from 'vitest';
import { createEntity, createProject, newId, textToRichText, validateProject } from './model';
import { previewNoteConversion, type NoteConversionOptions } from './notes';
import type { Entity, RichText } from './types';

function setup() {
  const project = createProject();
  const note = createEntity(project.projectId, 'note', '塔の鍵', { body: textToRichText('塔の鍵は鳥が持つ。\n夜にだけ見つかる。') });
  project.entities.push(note);
  return { project, note };
}

function options(note: Entity<'note'>, kind: NoteConversionOptions['kind'] = 'scene'): NoteConversionOptions {
  return { kind, name: '  鍵を探す  ', entityId: newId(), relationId: newId(), createdAt: '2026-10-05T12:00:00.000Z', blockIds: note.data.body.map(() => newId()) };
}

describe('note conversion', () => {
  it.each([
    ['character', 'summary'], ['scene', 'body'], ['foreshadow', 'question'],
  ] as const)('copies note text to the appropriate %s field and keeps the note linked', (kind, field) => {
    const { project, note } = setup();
    const sourceBody = structuredClone(note.data.body);
    const preview = previewNoteConversion(note, options(note, kind));
    project.entities = [preview.note, preview.entity];
    project.relations = [preview.relation];

    expect(preview.entity.name).toBe('鍵を探す');
    const convertedBody = (preview.entity.data as unknown as Record<string, unknown>)[field] as RichText;
    expect(convertedBody).toHaveLength(2);
    expect(convertedBody.map(block => block.text)).toEqual(sourceBody.map(block => block.text));
    expect(convertedBody.map(block => block.id)).not.toContain(sourceBody[0]!.id);
    expect(preview.note.data.body).toEqual(sourceBody);
    expect(preview.note.data.convertedToIds).toEqual([preview.entity.id]);
    expect(preview.relation).toMatchObject({ fromId: note.id, toId: preview.entity.id, relationType: 'reference', direction: 'forward' });
    expect(validateProject(project).ok).toBe(true);
  });

  it('does not mutate source and avoids adding a duplicate conversion target', () => {
    const { note } = setup();
    const targetId = newId();
    note.data.convertedToIds = [targetId];
    const preview = previewNoteConversion(note, { ...options(note), entityId: targetId });
    expect(note.data.convertedToIds).toEqual([targetId]);
    expect(preview.note.data.convertedToIds).toEqual([targetId]);
  });

  it('rejects blank names, duplicate source block IDs, and incomplete ID maps', () => {
    const { note } = setup();
    expect(() => previewNoteConversion(note, { ...options(note), name: '   ' })).toThrow(/名前を入力/);
    expect(() => previewNoteConversion(note, { ...options(note), blockIds: [note.data.body[0]!.id, newId()] })).toThrow(/新しい段落ID/);
    expect(() => previewNoteConversion(note, { ...options(note), blockIds: [newId()] })).toThrow(/段落IDが一致/);
  });
});
