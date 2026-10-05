import { describe, expect, it } from 'vitest';
import { buildPublicCatalogIndex, searchPublicCatalogIndex } from './publicCatalog';
import { createEntity, createProject, emptyValidity, newId } from './model';
import { createProjection } from './projection';
import type { PublicProjection } from './projection';

describe('public catalog index', () => {
  it('indexes only explicit projected terms, names, and classifications with remapped IDs', () => {
    const project = createProject('作者側の作品');
    const privatePlace = createEntity(project.projectId, 'place', 'SECRET_REAL_PLACE', {
      reading: 'SECRET_READING',
      aliases: [{ id: newId(), text: 'SECRET_OLD_ALIAS', reading: 'SECRET_ALIAS_READING', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false }],
    });
    privatePlace.status = 'confirmed';

    const publicAliasId = newId();
    const character = createEntity(project.projectId, 'character', 'SECRET_CHARACTER_NAME', {
      reading: 'あおい',
      aliases: [
        { id: publicAliasId, text: '青衣', reading: 'あおい', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false },
        { id: newId(), text: 'SECRET_CHARACTER_ALIAS', reading: 'SECRET_CHARACTER_ALIAS_READING', validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: false },
      ],
    });
    character.status = 'confirmed';
    const term = createEntity(project.projectId, 'terminology', 'SECRET_TERM_NAME', {
      canonical: '公開用語', reading: 'こうようご', variants: ['SECRET_VARIANT'],
    });
    term.status = 'confirmed';
    const category = createEntity(project.projectId, 'group', '物語の人物', { groupType: 'category', members: [character.id] });
    category.status = 'confirmed';
    const privateSource = createEntity(project.projectId, 'source', 'SECRET_SOURCE', { locator: 'SECRET_SOURCE_LOCATOR' });
    privateSource.status = 'confirmed';
    project.entities.push(privatePlace, character, term, category, privateSource);

    const profile = createEntity(project.projectId, 'projection_profile', '読者向け索引', {
      audience: '読者',
      publicTitle: '公開作品',
      includedIds: [privatePlace.id, character.id, term.id, category.id],
      allowedKinds: ['place', 'character', 'terminology', 'group'],
      allowedFields: { place: [], character: ['reading'], terminology: ['canonical', 'reading'], group: ['groupType', 'members'] },
      publicTexts: {
        [character.id]: { reading: 'あおい' },
        [term.id]: { canonical: '公開用語', reading: 'こうようご' },
      },
      namePolicy: {
        defaultPolicy: { mode: 'exclude' },
        byEntityId: {
          [privatePlace.id]: { mode: 'replace', replacement: '公開場所' },
          [character.id]: { mode: 'alias', aliasId: publicAliasId },
          [term.id]: { mode: 'replace', replacement: '公開用語の名前' },
          [category.id]: { mode: 'replace', replacement: '登場人物' },
        },
      },
      includedStatuses: ['confirmed'],
      idPolicy: 'remap',
    });
    project.entities.push(profile);

    const result = createProjection(project, profile.id);
    expect(result.ok, result.ok ? '' : JSON.stringify(result.issues)).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const projection = result.projection;
    const index = buildPublicCatalogIndex(projection);
    const publicCharacter = projection.entities.find(entity => entity.kind === 'character')!;
    const publicPlace = projection.entities.find(entity => entity.kind === 'place')!;
    const publicTerm = projection.entities.find(entity => entity.kind === 'terminology')!;

    expect(publicCharacter.id).not.toBe(character.id);
    expect(publicCharacter.name).toBe('青衣');
    expect(publicPlace.name).toBe('公開場所');
    expect(publicPlace.data.reading).toBeUndefined();
    expect(index.some(entry => entry.entityId === character.id || entry.entityId === privatePlace.id || entry.entityId === term.id)).toBe(false);
    expect(index.some(entry => entry.entityId === publicCharacter.id && entry.term === '青衣')).toBe(true);
    expect(index.some(entry => entry.entityId === publicCharacter.id && entry.source === 'reading' && entry.term === 'あおい')).toBe(true);
    expect(index.some(entry => entry.entityId === publicTerm.id && entry.source === 'canonical' && entry.term === '公開用語')).toBe(true);
    expect(index.find(entry => entry.entityId === publicCharacter.id)?.classifications).toEqual(['登場人物']);
    expect(searchPublicCatalogIndex(index, 'アオイ').some(entry => entry.entityId === publicCharacter.id)).toBe(true);

    const serialized = JSON.stringify({ projection, index });
    for (const secret of ['SECRET_REAL_PLACE', 'SECRET_READING', 'SECRET_OLD_ALIAS', 'SECRET_ALIAS_READING', 'SECRET_CHARACTER_NAME', 'SECRET_CHARACTER_ALIAS', 'SECRET_CHARACTER_ALIAS_READING', 'SECRET_TERM_NAME', 'SECRET_VARIANT', 'SECRET_SOURCE', 'SECRET_SOURCE_LOCATOR', privateSource.id]) {
      expect(serialized).not.toContain(secret);
    }
    expect(index.every(entry => !('references' in entry) && !('backReferences' in entry) && !('count' in entry))).toBe(true);
  });

  it('keeps its input limited to the public projection and uses author-index sorting and normalization', () => {
    const project = createProject('公開索引');
    const first = createEntity(project.projectId, 'character', '乙', { reading: 'おと' });
    const second = createEntity(project.projectId, 'character', '甲', { reading: 'あ' });
    const projection: PublicProjection = {
      format: 'scenario-projection', formatVersion: '1.0.0', title: '公開索引', calendars: [], relations: [], searchIndex: [],
      entities: [
        { id: 'public-2', kind: 'character' as const, name: first.name, status: 'confirmed', data: { reading: 'おと', aliases: ['PRIVATE_ALIAS'], variants: ['PRIVATE_VARIANT'] } },
        { id: 'public-1', kind: 'character' as const, name: second.name, status: 'confirmed', data: { reading: 'あ' } },
      ],
    };
    const index = buildPublicCatalogIndex(projection);
    expect(index[0]?.entityId).toBe('public-1');
    expect(searchPublicCatalogIndex(index, ' オト ').map(entry => entry.entityId)).toContain('public-2');
    expect(JSON.stringify(index)).not.toContain('PRIVATE_ALIAS');
    expect(JSON.stringify(index)).not.toContain('PRIVATE_VARIANT');
    expect(JSON.stringify(index)).not.toContain(first.id);
    expect(JSON.stringify(index)).not.toContain(second.id);
  });
});
