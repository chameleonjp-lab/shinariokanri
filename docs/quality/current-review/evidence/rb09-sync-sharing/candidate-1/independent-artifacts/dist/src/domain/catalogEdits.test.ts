import { describe, expect, it } from 'vitest';
import { emptyValidity, createEntity, createProject, newId, validateProject } from './model';
import { previewJapaneseIndexEdit, type JapaneseIndexEdit } from './catalogEdits';
import type { Entity } from './types';

function edit(overrides: Partial<JapaneseIndexEdit> = {}): JapaneseIndexEdit {
  return { name: '葵', categoryGroupIds: [], newCategoryNames: [], newCategoryIds: [], createdAt: '2026-10-05T12:00:00.000Z', ...overrides };
}

describe('Japanese author index editing proposal', () => {
  it('updates reading and alias terms while retaining alias audience/validity fields', () => {
    const project = createProject();
    const character = createEntity(project.projectId, 'character', '葵', { reading: 'あおい', aliases: [{ id: newId(), text: '青衣', reading: 'あおい', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false }] });
    project.entities.push(character);
    const changedAliases = structuredClone(character.data.aliases!);
    changedAliases[0]!.text = '青い人'; changedAliases[0]!.reading = 'あおい';
    const preview = previewJapaneseIndexEdit(project, character.id, edit({ name: '葵・記録係', reading: 'あおい', aliases: changedAliases }));
    const changed = preview.entities[0] as Entity<'character'>;

    expect(changed.name).toBe('葵・記録係');
    expect(changed.data.reading).toBe('あおい');
    expect(changed.data.aliases?.[0]).toMatchObject({ text: '青い人', isPublicDefault: false, audienceHolderIds: [], validity: emptyValidity() });
    expect(character.name).toBe('葵');
  });

  it('updates terminology canonical/variants and classification memberships in one preview', () => {
    const project = createProject();
    const term = createEntity(project.projectId, 'terminology', '霧門', { canonical: '霧門', reading: 'きりもん', variants: ['霧の門'] });
    const oldClass = createEntity(project.projectId, 'group', '古い表記', { groupType: 'category', members: [term.id] });
    const keptMember = createEntity(project.projectId, 'character', '別人物');
    const newClass = createEntity(project.projectId, 'group', '地名', { groupType: 'category', members: [keptMember.id] });
    project.entities.push(term, oldClass, keptMember, newClass);

    const preview = previewJapaneseIndexEdit(project, term.id, edit({
      name: '霧の門', reading: 'きりのもん', canonical: '霧の門', variants: ['霧門', 'きりもん', ''],
      categoryGroupIds: [newClass.id], newCategoryNames: ['象徴語'], newCategoryIds: [newId()],
    }));
    const changed = Object.fromEntries(preview.entities.map(entity => [entity.id, entity]));
    const updatedTerm = changed[term.id] as Entity<'terminology'>;
    const updatedOldClass = changed[oldClass.id] as Entity<'group'>;
    const updatedNewClass = changed[newClass.id] as Entity<'group'>;
    const createdClass = preview.entities.find(entity => entity.id !== term.id && entity.id !== oldClass.id && entity.id !== newClass.id)! as Entity<'group'>;

    expect(updatedTerm.data.canonical).toBe('霧の門');
    expect(updatedTerm.data.variants).toEqual(['霧門', 'きりもん']);
    expect(updatedOldClass.data.members).toEqual([]);
    expect(updatedNewClass.data.members).toEqual([keptMember.id, term.id]);
    expect(createdClass.data).toMatchObject({ groupType: 'category', members: [term.id] });
    const candidate = { ...project, entities: project.entities.map(entity => changed[entity.id] ?? entity).concat(createdClass) };
    expect(validateProject(candidate).ok).toBe(true);
  });

  it('does not allow an unrelated group to be assigned as a classification', () => {
    const project = createProject();
    const character = createEntity(project.projectId, 'character', '葵');
    const displayGroup = createEntity(project.projectId, 'group', '主要人物', { groupType: 'display', members: [] });
    project.entities.push(character, displayGroup);
    expect(() => previewJapaneseIndexEdit(project, character.id, edit({ categoryGroupIds: [displayGroup.id] }))).toThrow(/分類グループではありません/);
  });

  it('requires unique alias IDs and a usable index name', () => {
    const project = createProject();
    const character = createEntity(project.projectId, 'character', '葵');
    project.entities.push(character);
    const alias = { id: newId(), text: '別名', reading: '', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false };
    expect(() => previewJapaneseIndexEdit(project, character.id, edit({ name: '  ' }))).toThrow(/名前は/);
    expect(() => previewJapaneseIndexEdit(project, character.id, edit({ aliases: [alias, alias] }))).toThrow(/別名IDが重複/);
  });
});
