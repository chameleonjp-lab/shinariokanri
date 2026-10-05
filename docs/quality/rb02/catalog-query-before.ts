import { KIND_LABELS, collectReferences } from './model';
import { duplicateCandidates } from './maintenance';
import type { CollectionData, Entity, EntityKind, ID, ProjectData, Query, Sort } from './types';

/** Search normalization is separate from stored text. Original Japanese spelling remains untouched. */
export function normalizeCatalogText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replace(/[\u30a1-\u30f6]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60))
    .replace(/\s+/gu, '');
}

export interface CatalogTextTerm {
  path: string;
  text: string;
  normalized: string;
}

const SEARCH_IGNORED_FIELDS = new Set([
  'id', 'projectId', 'revision', 'createdAt', 'updatedAt', 'deletedAt', 'deletionOperationId',
  'contentHash', 'sourceHash', 'assetPath', 'mediaType', 'byteSize', 'formatVersion', 'kind', 'type',
  'visibility', 'status', 'immutable', 'releasedAt', 'accessedAt', 'timeZone', 'calendarId',
]);

function isReferenceField(key: string): boolean {
  return /(?:Id|Ids)$/.test(key);
}

function collectText(value: unknown, path: string, output: CatalogTextTerm[], depth = 0): void {
  if (depth > 32 || value == null) return;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) output.push({ path, text, normalized: normalizeCatalogText(text) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectText(item, `${path}[${index}]`, output, depth + 1));
    return;
  }
  if (typeof value !== 'object') return;
  const object = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(value)) {
    if (SEARCH_IGNORED_FIELDS.has(key) || isReferenceField(key)) continue;
    if (key === 'value' && object.type === 'ref') continue;
    if (typeof nested === 'string' && ['kind', 'op', 'scope', 'valueType', 'stage', 'role', 'direction', 'mode', 'operation', 'resolutionPolicy'].includes(key)) continue;
    collectText(nested, path ? `${path}.${key}` : key, output, depth + 1);
  }
}

/** User-authored text corpus used by text queries; IDs and hashes are deliberately excluded. */
export function collectCatalogText(entity: Entity): CatalogTextTerm[] {
  const output: CatalogTextTerm[] = [];
  if (entity.name.trim()) output.push({ path: 'name', text: entity.name.trim(), normalized: normalizeCatalogText(entity.name) });
  collectText(entity.data, 'data', output);
  collectText(entity.customValues, 'customValues', output);
  return output;
}

function activeEntities(project: ProjectData): Entity[] {
  return project.entities.filter(entity => !entity.deletedAt);
}

function hasParticipant(project: ProjectData, entity: Entity, characterId: ID): boolean {
  if (entity.kind === 'event') return (entity.data.participants ?? []).some(participant => participant.characterId === characterId);
  if (entity.kind !== 'scene') return false;
  const events = new Map(activeEntities(project).filter((candidate): candidate is Entity<'event'> => candidate.kind === 'event').map(event => [event.id, event]));
  return entity.data.eventIds.some(eventId => events.get(eventId)?.data.participants?.some(participant => participant.characterId === characterId) ?? false);
}

function hasProductionProgress(project: ProjectData, entity: Entity, progress: string): boolean {
  if (entity.kind === 'production_task' && entity.data.progress === progress) return true;
  return activeEntities(project).some((candidate): candidate is Entity<'production_task'> =>
    candidate.kind === 'production_task' && candidate.data.progress === progress && candidate.data.targetIds.includes(entity.id));
}

function matchesChapter(project: ProjectData, entity: Entity, chapterId: ID): boolean {
  const chapter = project.entities.find((candidate): candidate is Entity<'chapter'> => candidate.kind === 'chapter' && candidate.id === chapterId && !candidate.deletedAt);
  if (!chapter) return false;
  if (entity.kind === 'chapter') return entity.id === chapterId;
  return entity.kind === 'scene' && entity.data.chapterId === chapterId;
}

type ForeshadowQuery = Extract<Query, { op: 'foreshadow' }>;
interface ForeshadowMatch { foreshadow: Entity<'foreshadow'>; disclosure: Entity<'disclosure'> }

function qualifyingForeshadowMatches(project: ProjectData, query: ForeshadowQuery): ForeshadowMatch[] {
  const active = activeEntities(project);
  const foreshadows = new Map(active.filter((candidate): candidate is Entity<'foreshadow'> => candidate.kind === 'foreshadow').map(item => [item.id, item]));
  const result: ForeshadowMatch[] = [];
  for (const disclosure of active) {
    if (disclosure.kind !== 'disclosure' || query.role && disclosure.data.role !== query.role || query.stage && disclosure.data.stage !== query.stage) continue;
    const foreshadow = foreshadows.get(disclosure.data.foreshadowId);
    if (!foreshadow || query.foreshadowId && foreshadow.id !== query.foreshadowId || query.resolutionPolicy && foreshadow.data.resolutionPolicy !== query.resolutionPolicy) continue;
    result.push({ foreshadow, disclosure });
  }
  return result;
}

function matchesForeshadow(project: ProjectData, entity: Entity, query: ForeshadowQuery): boolean {
  const matches = qualifyingForeshadowMatches(project, query);
  const parentMatches = (candidate: Entity<'foreshadow'>) =>
    (!query.foreshadowId || candidate.id === query.foreshadowId)
    && (!query.resolutionPolicy || candidate.data.resolutionPolicy === query.resolutionPolicy);

  if (entity.kind === 'foreshadow') {
    if (!parentMatches(entity)) return false;
    return !query.role && !query.stage || matches.some(match => match.foreshadow.id === entity.id);
  }
  if (entity.kind === 'disclosure') return matches.some(match => match.disclosure.id === entity.id);
  if (matches.some(match => match.disclosure.data.anchor.entityId === entity.id)) return true;
  if (entity.kind !== 'scene') return false;
  const anchoredNodes = new Set(matches.map(match => match.disclosure.data.anchor.entityId));
  return activeEntities(project).some((candidate): candidate is Entity<'flow_node'> => candidate.kind === 'flow_node' && anchoredNodes.has(candidate.id) && candidate.data.sceneId === entity.id);
}

/** Evaluates the Query union supported by the current saved-data contract. */
export function matchesQuery(project: ProjectData, entity: Entity, query: Query): boolean {
  switch (query.op) {
    case 'all': return query.children.every(child => matchesQuery(project, entity, child));
    case 'any': return query.children.some(child => matchesQuery(project, entity, child));
    case 'kind': return entity.kind === query.value;
    case 'status': return entity.status === query.value;
    case 'text': {
      const needle = normalizeCatalogText(query.value);
      return !needle || collectCatalogText(entity).some(term => term.normalized.includes(needle));
    }
    case 'participant': return hasParticipant(project, entity, query.characterId);
    case 'production': return hasProductionProgress(project, entity, query.value);
    case 'chapter': return matchesChapter(project, entity, query.chapterId);
    case 'foreshadow': return matchesForeshadow(project, entity, query);
  }
}

const collator = new Intl.Collator('ja-JP', { usage: 'sort', sensitivity: 'base', numeric: true });

function compareValues(left: string, right: string): number {
  return collator.compare(left, right);
}

/** Stable sorting for list consumers; absent sort retains the caller's order. */
export function sortCatalogEntities(entities: readonly Entity[], sort?: Sort | null): Entity[] {
  if (!sort) return [...entities];
  const direction = sort.direction === 'desc' ? -1 : 1;
  return entities.map((entity, index) => ({ entity, index })).sort((a, b) => {
    const left = sort.field === 'kind' ? KIND_LABELS[a.entity.kind] : sort.field === 'createdAt' ? a.entity.createdAt : sort.field === 'updatedAt' ? a.entity.updatedAt : a.entity.name;
    const right = sort.field === 'kind' ? KIND_LABELS[b.entity.kind] : sort.field === 'createdAt' ? b.entity.createdAt : sort.field === 'updatedAt' ? b.entity.updatedAt : b.entity.name;
    return direction * compareValues(left, right) || a.index - b.index;
  }).map(row => row.entity);
}

export interface CollectionEvaluation {
  collectionId: ID;
  mode: CollectionData['mode'];
  /** The active, sorted results that a card/list/diagram can all display. */
  entities: Entity[];
  entityIds: ID[];
  /** Fixed-list IDs that are missing or archived. They are informational, not validation errors. */
  missingIds: ID[];
  query: Query | null;
}

/** Resolves fixed membership or re-runs a dynamic query against current active entities. */
export function evaluateCollection(project: ProjectData, collection: Entity<'collection'>): CollectionEvaluation {
  const active = activeEntities(project);
  let selected: Entity[];
  let missingIds: ID[] = [];
  const query = collection.data.query ?? null;
  if (collection.data.mode === 'fixed') {
    const byId = new Map(active.map(entity => [entity.id, entity]));
    const ordered = [...new Set(collection.data.memberIds ?? [])];
    selected = ordered.flatMap(id => {
      const entity = byId.get(id);
      if (entity) return [entity];
      missingIds.push(id);
      return [];
    });
  } else {
    selected = active.filter(entity => query === null || matchesQuery(project, entity, query));
  }
  selected = sortCatalogEntities(selected, collection.data.sort);
  return { collectionId: collection.id, mode: collection.data.mode, entities: selected, entityIds: selected.map(entity => entity.id), missingIds, query };
}

export type JapaneseIndexSource = 'name' | 'reading' | 'alias' | 'alias_reading' | 'canonical' | 'variant';

export interface JapaneseAuthorIndexEntry {
  id: string;
  entityId: ID;
  kind: EntityKind;
  entityName: string;
  term: string;
  reading: string;
  normalizedTerm: string;
  normalizedReading: string;
  source: JapaneseIndexSource;
  /** Names of author-defined category groups containing this entity. */
  classifications: string[];
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readingOf(entity: Entity): string {
  const data = entity.data as unknown as Record<string, unknown>;
  return stringValue(data.reading);
}

function aliasesOf(entity: Entity): unknown[] {
  const data = entity.data as unknown as Record<string, unknown>;
  return Array.isArray(data.aliases) ? data.aliases : [];
}

/** Builds an author-side index. It can include private aliases; do not use it as a public projection. */
export function buildJapaneseAuthorIndex(project: ProjectData): JapaneseAuthorIndexEntry[] {
  const entities = activeEntities(project);
  const categoryByMember = new Map<ID, string[]>();
  for (const group of entities) {
    if (group.kind !== 'group' || group.data.groupType !== 'category') continue;
    for (const memberId of group.data.members ?? []) categoryByMember.set(memberId, [...(categoryByMember.get(memberId) ?? []), group.name]);
  }
  const entries: JapaneseAuthorIndexEntry[] = [];
  const addEntry = (entity: Entity, source: JapaneseIndexSource, term: string, reading: string, suffix: string) => {
    const cleanTerm = term.trim(), cleanReading = reading.trim();
    if (!cleanTerm && !cleanReading) return;
    const displayTerm = cleanTerm || cleanReading;
    entries.push({
      id: `${entity.id}:${source}:${suffix}`,
      entityId: entity.id,
      kind: entity.kind,
      entityName: entity.name,
      term: displayTerm,
      reading: cleanReading,
      normalizedTerm: normalizeCatalogText(displayTerm),
      normalizedReading: normalizeCatalogText(cleanReading),
      source,
      classifications: [...new Set(categoryByMember.get(entity.id) ?? [])].sort(compareValues),
    });
  };
  for (const entity of entities) {
    const rootReading = readingOf(entity);
    if (entity.name.trim()) addEntry(entity, 'name', entity.name, rootReading, 'primary');
    if (rootReading) addEntry(entity, 'reading', rootReading, rootReading, 'primary');
    aliasesOf(entity).forEach((raw, index) => {
      if (typeof raw === 'string') { addEntry(entity, 'alias', raw, '', String(index)); return; }
      const alias = objectValue(raw);
      if (!alias) return;
      const text = stringValue(alias.text), reading = stringValue(alias.reading);
      if (text) addEntry(entity, 'alias', text, reading, String(alias.id ?? index));
      if (reading) addEntry(entity, 'alias_reading', reading, reading, String(alias.id ?? index));
    });
    if (entity.kind === 'terminology') {
      const canonical = stringValue(entity.data.canonical);
      const reading = stringValue(entity.data.reading);
      if (canonical && canonical !== entity.name) addEntry(entity, 'canonical', canonical, reading, 'canonical');
      (entity.data.variants ?? []).forEach((variant, index) => addEntry(entity, 'variant', variant, reading, String(index)));
    }
  }
  return entries.sort((a, b) => compareValues(a.reading || a.term, b.reading || b.term) || compareValues(a.term, b.term) || compareValues(a.entityName, b.entityName) || compareValues(a.entityId, b.entityId) || compareValues(a.id, b.id));
}

export function searchJapaneseAuthorIndex(entries: readonly JapaneseAuthorIndexEntry[], query: string, kind?: EntityKind): JapaneseAuthorIndexEntry[] {
  const needle = normalizeCatalogText(query);
  if (!needle) return entries.filter(entry => !kind || entry.kind === kind).slice();
  return entries.filter(entry => (!kind || entry.kind === kind) && (entry.normalizedTerm.includes(needle) || entry.normalizedReading.includes(needle)));
}

export type CatalogFindingKind = 'possible_duplicate' | 'unreferenced' | 'retained' | 'external_use' | 'missing_reading' | 'needs_review';

export interface CatalogMaintenanceFinding {
  id: string;
  kind: CatalogFindingKind;
  targetIds: ID[];
  reason: string;
  paths: string[];
  /** These are review candidates, never validation failures or automatic delete/merge commands. */
  disposition: 'candidate';
}

function hasReadingField(entity: Entity): boolean {
  return ['character', 'place', 'lore', 'terminology'].includes(entity.kind);
}

function finding(kind: CatalogFindingKind, targetIds: ID[], reason: string, paths: string[] = []): CatalogMaintenanceFinding {
  const ordered = [...new Set(targetIds)].sort((a, b) => a.localeCompare(b));
  return { id: `${kind}:${ordered.join(',')}`, kind, targetIds: ordered, reason, paths, disposition: 'candidate' };
}

function referencedIds(project: ProjectData): Set<ID> {
  const referenced = new Set<ID>();
  for (const entity of project.entities) {
    // Review targets explain a change; they do not mean the target is in use.
    if (entity.deletedAt || entity.kind === 'review') continue;
    for (const reference of collectReferences(entity)) referenced.add(reference.id);
  }
  for (const relation of project.relations) {
    if (relation.deletedAt) continue;
    referenced.add(relation.fromId);
    referenced.add(relation.toId);
    relation.evidenceIds.forEach(id => referenced.add(id));
  }
  for (const view of project.views) view.entityIds.forEach(id => referenced.add(id));
  return referenced;
}

function reviewPaths(entity: Entity): string[] {
  const paths: string[] = [];
  if (entity.kind === 'review') {
    if (entity.data.stage === 'open') paths.push('data.stage');
  } else if (entity.status === 'needs_review') paths.push('status');
  if ((entity.kind === 'localization' || entity.kind === 'recording') && entity.data.stage === 'needs_review') paths.push('data.stage');
  if (entity.kind === 'media_variant' && entity.data.needsReview) paths.push('data.needsReview');
  return paths;
}

/** Returns actionable review candidates without asserting that any item is erroneous or safe to delete. */
export function findCatalogMaintenance(project: ProjectData): CatalogMaintenanceFinding[] {
  const active = activeEntities(project);
  const findings: CatalogMaintenanceFinding[] = [];
  for (const duplicate of duplicateCandidates(project)) {
    if (duplicate.kind !== 'review') findings.push(finding('possible_duplicate', duplicate.ids, `同じ種類に正規化後の名前が「${duplicate.name}」となる項目があります。名前だけで重複とは決めず、内容と参照を確認してください。`, duplicate.ids.map(id => 'name')));
  }
  const referenced = referencedIds(project);
  for (const entity of active) {
    if (entity.kind !== 'review' && !referenced.has(entity.id)) {
      if (entity.retainIfUnreferenced) {
        findings.push(finding('retained', [entity.id], '未参照ですが、作者が保持するよう指定しています。参照がないことだけを理由に削除しません。', ['retainIfUnreferenced']));
      } else if (entity.kind === 'variable' && entity.data.externalUseDeclared) {
        findings.push(finding('external_use', [entity.id], '作品外から使う状態として宣言されています。外部連携の利用先を確認し、宣言を外す前に影響を調べてください。', ['data.externalUseDeclared']));
      } else {
        findings.push(finding('unreferenced', [entity.id], '有効な項目・関係・保存ビューから直接参照されていません。背景設定など意図して保持する情報の可能性もあるため、保持指定または削除前の影響確認を選んでください。'));
      }
    }
    if (hasReadingField(entity) && !readingOf(entity)) {
      findings.push(finding('missing_reading', [entity.id], '読みが未登録です。名前から探すための候補であり、読みが不要な場合もあります。', ['data.reading']));
    }
    const paths = reviewPaths(entity);
    if (paths.length) findings.push(finding('needs_review', [entity.id], 'この項目には確認待ちの状態があります。関連する本文や素材を確認し、対応済みか再確認済みかを判断してください。', paths));
  }
  return findings.sort((a, b) => compareValues(a.kind, b.kind) || compareValues(a.targetIds.join(','), b.targetIds.join(',')));
}
