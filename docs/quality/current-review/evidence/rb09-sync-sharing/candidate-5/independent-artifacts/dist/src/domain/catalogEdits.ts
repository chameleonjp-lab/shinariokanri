import type { Alias, Entity, EntityKind, ID, ProjectData } from './types';

export interface JapaneseIndexEdit {
  name: string;
  /** Supported for character, place, lore, and terminology. Empty text clears an optional reading. */
  reading?: string;
  /** Supported for character, place, and lore. Existing privacy metadata is preserved. */
  aliases?: Alias[];
  /** Terminology-only fields. */
  canonical?: string;
  variants?: string[];
  categoryGroupIds: ID[];
  newCategoryNames: string[];
  newCategoryIds: ID[];
  createdAt: string;
}

export interface JapaneseIndexEditPreview {
  /** Changed target and category groups, followed by new category groups; safe for one saveMany call. */
  entities: Entity[];
}

const READING_KINDS = new Set<EntityKind>(['character', 'place', 'lore', 'terminology']);
const ALIAS_KINDS = new Set<EntityKind>(['character', 'place', 'lore']);

function isActive(entity: Entity): boolean { return !entity.deletedAt; }

/** Builds a validated proposal for the author index and category memberships without mutating project. */
export function previewJapaneseIndexEdit(project: ProjectData, entityId: ID, edit: JapaneseIndexEdit): JapaneseIndexEditPreview {
  const source = project.entities.find(entity => entity.id === entityId && isActive(entity));
  if (!source) throw new Error('VALIDATION_FAILED: 索引の対象が見つかりません。');
  const name = edit.name.trim();
  if (!name || name.length > 128) throw new Error('VALIDATION_FAILED: 名前は1〜128文字で入力してください。');

  const data = { ...(source.data as unknown as Record<string, unknown>) };
  if (edit.reading !== undefined) {
    if (!READING_KINDS.has(source.kind)) throw new Error('VALIDATION_FAILED: この種類では読み項目を保存できません。');
    const reading = edit.reading.trim();
    if (reading.length > 128) throw new Error('VALIDATION_FAILED: 読みは128文字以内で入力してください。');
    data.reading = reading;
  }
  if (edit.aliases !== undefined) {
    if (!ALIAS_KINDS.has(source.kind)) throw new Error('VALIDATION_FAILED: この種類では別名を保存できません。');
    if (edit.aliases.some(alias => !alias.id || !alias.text.trim() || alias.text.trim().length > 128 || alias.reading.length > 128)) {
      throw new Error('VALIDATION_FAILED: 別名の表記と読みを確認してください。');
    }
    if (new Set(edit.aliases.map(alias => alias.id)).size !== edit.aliases.length) throw new Error('VALIDATION_FAILED: 別名IDが重複しています。');
    data.aliases = structuredClone(edit.aliases).map(alias => ({ ...alias, text: alias.text.trim(), reading: alias.reading.trim() }));
  }
  if (edit.canonical !== undefined || edit.variants !== undefined) {
    if (source.kind !== 'terminology') throw new Error('VALIDATION_FAILED: 標準表記と候補表記は用語だけに設定できます。');
    if (edit.canonical !== undefined) {
      const canonical = edit.canonical.trim();
      if (!canonical || canonical.length > 128) throw new Error('VALIDATION_FAILED: 標準表記は1〜128文字で入力してください。');
      data.canonical = canonical;
    }
    if (edit.variants !== undefined) {
      if (edit.variants.some(variant => variant.trim().length > 128)) throw new Error('VALIDATION_FAILED: 表記候補は128文字以内で入力してください。');
      data.variants = [...new Set(edit.variants.map(variant => variant.trim()).filter(Boolean))];
    }
  }

  const categoryGroups = project.entities.filter((entity): entity is Entity<'group'> => entity.kind === 'group' && isActive(entity) && entity.data.groupType === 'category');
  const categoryById = new Map(categoryGroups.map(group => [group.id, group]));
  const selectedIds = [...new Set(edit.categoryGroupIds)];
  if (selectedIds.some(id => !categoryById.has(id))) throw new Error('VALIDATION_FAILED: 選択した分類が見つからないか、分類グループではありません。');
  const newNames = edit.newCategoryNames.map(value => value.trim()).filter(Boolean);
  if (newNames.some(value => value.length > 128)) throw new Error('VALIDATION_FAILED: 分類名は128文字以内で入力してください。');
  if (newNames.length !== edit.newCategoryIds.length || new Set(edit.newCategoryIds).size !== edit.newCategoryIds.length || edit.newCategoryIds.some(id => project.entities.some(entity => entity.id === id))) {
    throw new Error('VALIDATION_FAILED: 新しい分類のIDと名前が一致しません。');
  }

  const changedTarget = { ...source, name, data } as Entity;
  const changes = new Map<ID, Entity>([[source.id, changedTarget]]);
  const selected = new Set(selectedIds);
  for (const group of categoryGroups) {
    const oldMembers = group.data.members ?? [];
    const nextMembers = selected.has(group.id)
      ? oldMembers.includes(source.id) ? oldMembers : [...oldMembers, source.id]
      : oldMembers.filter(id => id !== source.id);
    if (nextMembers.length !== oldMembers.length || nextMembers.some((id, index) => id !== oldMembers[index])) {
      const prior = changes.get(group.id);
      const base = prior?.kind === 'group' ? prior : group;
      changes.set(group.id, { ...base, data: { ...base.data, members: nextMembers } });
    }
  }

  for (let index = 0; index < newNames.length; index++) {
    const id = edit.newCategoryIds[index]!;
    const group: Entity<'group'> = {
      id,
      projectId: project.projectId,
      kind: 'group',
      revision: '0',
      name: newNames[index]!,
      status: 'provisional',
      // Classification groups are author-side index metadata by default.
      visibility: 'private',
      createdAt: edit.createdAt,
      updatedAt: edit.createdAt,
      customValues: {},
      data: { groupType: 'category', members: [source.id], parentId: null, summary: [] },
    };
    changes.set(id, group);
  }
  return { entities: [...changes.values()] };
}
