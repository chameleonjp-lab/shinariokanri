import {createEntity, textToRichText} from './model';
import type { Entity, ID, Relation } from './types';

export type NoteConversionKind = 'character' | 'scene' | 'foreshadow';

export interface NoteConversionOptions {
  kind: NoteConversionKind;
  name: string;
  entityId: ID;
  relationId: ID;
  createdAt: string;
  /** Fresh block IDs are supplied because source and converted notes remain side-by-side. */
  blockIds: ID[];
}

export interface NoteConversionPreview {
  entity: Entity<NoteConversionKind>;
  note: Entity<'note'>;
  relation: Relation;
}

/**
 * Builds a conversion proposal without mutating the note or project. The source remains intact,
 * the copied rich-text blocks receive fresh IDs, and both directions of provenance are explicit.
 */
export function previewNoteConversion(note: Entity<'note'>, options: NoteConversionOptions): NoteConversionPreview {
  const name = options.name.trim();
  if (!name) throw new Error('VALIDATION_FAILED: 変換先の名前を入力してください。');
  if (!options.entityId || options.entityId === note.id || !options.relationId || options.relationId === note.id) {
    throw new Error('VALIDATION_FAILED: 変換先と参照関係には別のIDが必要です。');
  }
  if (options.blockIds.length !== note.data.body.length || new Set(options.blockIds).size !== options.blockIds.length) {
    throw new Error('VALIDATION_FAILED: 変換先本文の段落IDが一致しません。');
  }
  if (options.blockIds.some(id => !id || id === note.id || note.data.body.some(block => block.id === id))) {
    throw new Error('VALIDATION_FAILED: 変換先には新しい段落IDを指定してください。');
  }

  const copiedBody = note.data.body.map((block, index) => ({ ...structuredClone(block), id: options.blockIds[index]! }));
  const common = {
    id: options.entityId,
    projectId: note.projectId,
    revision: '0' as const,
    name,
    status: note.status,
    visibility: note.visibility,
    ...(note.projectionProfileId ? { projectionProfileId: note.projectionProfileId } : {}),
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
    customValues: {},
  };

  const data = options.kind === 'character'
    ? { reading: '', aliases: [], summary: copiedBody, body: [], authorNotes: [], goals: [], voiceRules: [] }
    : options.kind === 'scene'
      ? { summary: [], body: copiedBody, authorNotes: [], eventIds: [], chapterId: null, threadIds: [], povId: null, goals: [], conflicts: [], results: [], newInformation: [], tension: null, importance: null, blockIds: [] }
      : { question: copiedBody, intent: [], resolutionPolicy: 'undecided' as const, truthAssertionIds: [], clueIds: [], payoffIds: [], requiredInfo: [], deadline: null, exceptions: [] };
  const entity = { ...common, kind: options.kind, data } as Entity<NoteConversionKind>;

  const updatedNote: Entity<'note'> = {
    ...structuredClone(note),
    data: {
      ...structuredClone(note.data),
      convertedToIds: [...new Set([...(note.data.convertedToIds ?? []), entity.id])],
    },
  };
  const relation: Relation = {
    id: options.relationId,
    projectId: note.projectId,
    revision: '0',
    fromId: note.id,
    toId: entity.id,
    relationType: 'reference',
    direction: 'forward',
    validity: { worldRange: null, routeCondition: null, presentationAnchor: null },
    evidenceIds: [],
    status: note.status,
    visibility: note.visibility,
    ...(note.projectionProfileId ? { projectionProfileId: note.projectionProfileId } : {}),
  };
  return { entity, note: updatedNote, relation };
}

/** One independent note per capture; existing note conversion preserves its source. */
export function createQuickNote(projectId: string, text: string): Entity<'note'> {
  const body = text.trim();
  if (!body) throw new Error('一文メモを入力してください。');
  return createEntity(projectId, 'note', Array.from(body).slice(0, 40).join(''), {body:textToRichText(body)});
}
export function unorganizedNotes(project: import('./types').ProjectData): Entity<'note'>[] {
  return project.entities.filter((entity): entity is Entity<'note'> => entity.kind === 'note' && !entity.deletedAt && !(entity.data.convertedToIds ?? []).some(id => project.entities.some(target => target.id === id && !target.deletedAt)));
}
/** The retained ID also recognizes a commit completed before input cleanup. */
export function prepareQuickNote(project: import('./types').ProjectData, raw: string, noteId: string): import('./types').ProjectData {
  const existing = project.entities.find(entity => entity.id === noteId);
  if (existing) {
    if (existing.kind === 'note' && !existing.deletedAt && existing.data.body.map(block => block.text).join('\n') === raw.trim()) return project;
    throw new Error('この入力のメモは保存済みで内容が変わりました。一文を入力し直してください。');
  }
  return {...project, entities:[...project.entities, {...createQuickNote(project.projectId, raw), id:noteId}]};
}
