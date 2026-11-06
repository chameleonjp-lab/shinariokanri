import { normalizeCatalogText } from './catalog';
import type { EntityKind } from './types';
import { PROJECTION_FIELDS } from './projection';
import type { PublicProjection, ProjectedEntity } from './projection';

export type PublicCatalogTermSource = 'name' | 'reading' | 'canonical';

/** Contains only public names, values, and IDs already emitted by a projection. */
export interface PublicCatalogIndexEntry {
  id: string;
  entityId: string;
  kind: EntityKind;
  name: string;
  term: string;
  reading: string;
  normalizedTerm: string;
  normalizedReading: string;
  source: PublicCatalogTermSource;
  classifications: string[];
}

const collator = new Intl.Collator('ja-JP', { usage: 'sort', sensitivity: 'base', numeric: true });
const compareJapanese = (left: string, right: string): number => collator.compare(left, right);
const stringValue = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

function classificationsByProjectedId(projection: PublicProjection): Map<string, string[]> {
  const groups = new Map<string, Set<string>>();
  for (const entity of projection.entities) {
    if (entity.kind !== 'group' || !PROJECTION_FIELDS.group?.members || !PROJECTION_FIELDS.group?.groupType
      || entity.data.groupType !== 'category' || !Array.isArray(entity.data.members)) continue;
    for (const projectedMemberId of entity.data.members) {
      if (typeof projectedMemberId !== 'string') continue;
      const names = groups.get(projectedMemberId) ?? new Set<string>();
      names.add(entity.name);
      groups.set(projectedMemberId, names);
    }
  }
  return new Map([...groups].map(([id, names]) => [id, [...names].sort(compareJapanese)]));
}

function indexableTerms(entity: ProjectedEntity): { source: PublicCatalogTermSource; term: string; reading: string; suffix: string }[] {
  const data = entity.data as Record<string, unknown>;
  const schema = PROJECTION_FIELDS[entity.kind] ?? {};
  const reading = Object.hasOwn(schema, 'reading') ? stringValue(data.reading) : '';
  const values: { source: PublicCatalogTermSource; term: string; reading: string; suffix: string }[] = [];
  if (entity.name.trim()) values.push({ source: 'name', term: entity.name.trim(), reading, suffix: 'name' });
  if (reading) values.push({ source: 'reading', term: reading, reading, suffix: 'reading' });

  // These fields are indexed only when the projection itself explicitly contains them.
  // Raw author aliases are not copied; a selected public alias is already entity.name.
  const canonical = Object.hasOwn(schema, 'canonical') ? stringValue(data.canonical) : '';
  if (canonical && canonical !== entity.name) values.push({ source: 'canonical', term: canonical, reading, suffix: 'canonical' });
  return values;
}

/** Builds a reader index strictly from a prepared public projection. */
export function buildPublicCatalogIndex(projection: PublicProjection): PublicCatalogIndexEntry[] {
  const classifications = classificationsByProjectedId(projection);
  const entries: PublicCatalogIndexEntry[] = [];
  for (const entity of projection.entities) {
    const categoryNames = classifications.get(entity.id) ?? [];
    for (const value of indexableTerms(entity)) {
      const term = value.term.trim(), reading = value.reading.trim();
      if (!term && !reading) continue;
      entries.push({
        id: `${entity.id}:${value.suffix}`,
        entityId: entity.id,
        kind: entity.kind,
        name: entity.name,
        term: term || reading,
        reading,
        normalizedTerm: normalizeCatalogText(term || reading),
        normalizedReading: normalizeCatalogText(reading),
        source: value.source,
        classifications: [...categoryNames],
      });
    }
  }
  return entries.sort((a, b) => compareJapanese(a.reading || a.term, b.reading || b.term)
    || compareJapanese(a.term, b.term)
    || compareJapanese(a.name, b.name)
    || compareJapanese(a.entityId, b.entityId)
    || compareJapanese(a.id, b.id));
}

export function searchPublicCatalogIndex(entries: readonly PublicCatalogIndexEntry[], query: string, kind?: EntityKind): PublicCatalogIndexEntry[] {
  const needle = normalizeCatalogText(query);
  if (!needle) return entries.filter(entry => !kind || entry.kind === kind).slice();
  return entries.filter(entry => (!kind || entry.kind === kind)
    && (entry.normalizedTerm.includes(needle) || entry.normalizedReading.includes(needle)));
}

export interface PublicReaderPage { id: string; title: string; projection: PublicProjection }

/** Paging is a view of the prepared projection, never a second projection of author data. */
export function buildPublicReaderPages(projection: PublicProjection): PublicReaderPage[] {
  const assigned = new Set<string>(), pages: PublicReaderPage[] = [];
  const page = (id: string, title: string, entities: ProjectedEntity[], includeVersions = false): PublicReaderPage => ({
    id, title, projection: { ...projection, entities, searchIndex: projection.searchIndex.filter(entry => entities.some(entity => entity.id === entry.entityId)), versions: includeVersions ? projection.versions : undefined },
  });
  for (const chapter of projection.entities.filter(entity => entity.kind === 'chapter')) {
    const sceneIds = new Set(Array.isArray(chapter.data.sceneIds) ? chapter.data.sceneIds : []);
    const scenes = projection.entities.filter(entity => entity.kind === 'scene' && (sceneIds.has(entity.id) || entity.data.chapterId === chapter.id));
    const lineIds = new Set(scenes.flatMap(scene => Array.isArray(scene.data.dialogueLineIds) ? scene.data.dialogueLineIds : []));
    const entities = [chapter, ...scenes, ...projection.entities.filter(entity => entity.kind === 'dialogue_line' && lineIds.has(entity.id))];
    entities.forEach(entity => assigned.add(entity.id));
    pages.push(page(chapter.id, chapter.name || '章', entities));
  }
  const remaining = projection.entities.filter(entity => !assigned.has(entity.id));
  if (remaining.length || projection.versions?.length || !pages.length) pages.push(page('public-materials', '人物・資料・引用版', remaining, true));
  return pages;
}
