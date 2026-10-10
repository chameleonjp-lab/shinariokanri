import { KIND_LABELS, collectReferences } from './model';
import { duplicateCandidates } from './maintenance';
import { requiresFixedStateUsageVerification,stateUsageIndex } from './stateUsage';
import type {StateUsage} from './stateUsage';
import {verifyReusePins} from './reuse';
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

interface CatalogQueryIndex {
  byId: Map<ID, Entity>;
  participantEvents: Map<ID, Set<ID>>;
  scenesByEvent: Map<ID, Set<ID>>;
  productionTargets: Map<string, Set<ID>>;
  chapters: Set<ID>;
  foreshadows: Map<ID, Entity<'foreshadow'>>;
  disclosures: Entity<'disclosure'>[];
  sceneByNode: Map<ID, ID>;
}
function buildQueryIndex(project: ProjectData): CatalogQueryIndex {
  const index: CatalogQueryIndex = { byId: new Map(), participantEvents: new Map(), scenesByEvent: new Map(), productionTargets: new Map(), chapters: new Set(), foreshadows: new Map(), disclosures: [], sceneByNode: new Map() };
  const add = <K>(map: Map<K, Set<ID>>, key: K, id: ID) => { let ids = map.get(key); if (!ids) { ids = new Set(); map.set(key, ids); } ids.add(id); };
  // One scan serves all dependency operators in the complete compound query.
  for (const entity of project.entities) {
    if (entity.deletedAt) continue;
    index.byId.set(entity.id, entity);
    switch (entity.kind) {
      case 'event': for (const participant of entity.data.participants ?? []) add(index.participantEvents, participant.characterId, entity.id); break;
      case 'scene': for (const eventId of entity.data.eventIds) add(index.scenesByEvent, eventId, entity.id); break;
      case 'production_task': add(index.productionTargets, entity.data.progress, entity.id); for (const id of entity.data.targetIds) add(index.productionTargets, entity.data.progress, id); break;
      case 'chapter': index.chapters.add(entity.id); break;
      case 'foreshadow': index.foreshadows.set(entity.id, entity); break;
      case 'disclosure': index.disclosures.push(entity); break;
      case 'flow_node': if (entity.data.sceneId) index.sceneByNode.set(entity.id, entity.data.sceneId); break;
    }
  }
  return index;
}

/** Captures one evaluation's dependencies; rebuild after project edits rather than caching mutable drafts. */
export function compileCatalogQuery(project: ProjectData, query: Query): (entity: Entity) => boolean {
  let index: CatalogQueryIndex | undefined;
  const dependencies = () => index ??= buildQueryIndex(project);
  const text = new WeakMap<Entity, string[]>();
  const compile = (query: Query): ((entity: Entity) => boolean) => {
    switch (query.op) {
      case 'all': { const children = query.children.map(compile); return entity => children.every(matches => matches(entity)); }
      case 'any': { const children = query.children.map(compile); return entity => children.some(matches => matches(entity)); }
      case 'kind': return entity => entity.kind === query.value;
      case 'status': return entity => entity.status === query.value;
      case 'text': {
        const needle = normalizeCatalogText(query.value);
        if (!needle) return () => true;
        return entity => { let terms = text.get(entity); if (!terms) { terms = collectCatalogText(entity).map(term => term.normalized); text.set(entity, terms); } return terms.some(term => term.includes(needle)); };
      }
      case 'production': {
        const ids = dependencies().productionTargets.get(query.value);
        // The single-record API historically accepts an archived/foreign task supplied by its caller.
        return entity => entity.kind === 'production_task' && entity.data.progress === query.value || ids?.has(entity.id) === true;
      }
      case 'chapter': {
        const exists = dependencies().chapters.has(query.chapterId);
        return entity => exists && (entity.kind === 'chapter' ? entity.id === query.chapterId : entity.kind === 'scene' && entity.data.chapterId === query.chapterId);
      }
      case 'participant': {
        const current = dependencies(), events = current.participantEvents.get(query.characterId), scenes = new Set<ID>();
        for (const eventId of events ?? []) for (const sceneId of current.scenesByEvent.get(eventId) ?? []) scenes.add(sceneId);
        return entity => {
          if (entity.kind === 'event') return current.byId.get(entity.id) === entity ? events?.has(entity.id) === true : (entity.data.participants ?? []).some(participant => participant.characterId === query.characterId);
          if (entity.kind !== 'scene') return false;
          return current.byId.get(entity.id) === entity ? scenes.has(entity.id) : entity.data.eventIds.some(eventId => events?.has(eventId));
        };
      }
      case 'foreshadow': {
        const current = dependencies(), parents = new Set<ID>(), disclosures = new Set<ID>(), anchors = new Set<ID>(), scenes = new Set<ID>();
        const parentMatches = (parent: Entity<'foreshadow'>) => (!query.foreshadowId || parent.id === query.foreshadowId) && (!query.resolutionPolicy || parent.data.resolutionPolicy === query.resolutionPolicy);
        for (const disclosure of current.disclosures) {
          if (query.role && disclosure.data.role !== query.role || query.stage && disclosure.data.stage !== query.stage) continue;
          const parent = current.foreshadows.get(disclosure.data.foreshadowId); if (!parent || !parentMatches(parent)) continue;
          parents.add(parent.id); disclosures.add(disclosure.id); anchors.add(disclosure.data.anchor.entityId);
          const sceneId = current.sceneByNode.get(disclosure.data.anchor.entityId); if (sceneId) scenes.add(sceneId);
        }
        return entity => entity.kind === 'foreshadow' ? parentMatches(entity) && (!query.role && !query.stage || parents.has(entity.id))
          : entity.kind === 'disclosure' ? disclosures.has(entity.id) : anchors.has(entity.id) || entity.kind === 'scene' && scenes.has(entity.id);
      }
    }
  };
  return compile(query);
}

/** Evaluates a single record. Lists should use filterCatalogEntities to share one dependency index. */
export function matchesQuery(project: ProjectData, entity: Entity, query: Query): boolean { return compileCatalogQuery(project, query)(entity); }

/** Evaluates active rows in caller order, with one compilation and dependency scan for the whole list. */
export function filterCatalogEntities(project: ProjectData, query: Query, entities: readonly Entity[] = project.entities): Entity[] {
  const matches = compileCatalogQuery(project, query), result: Entity[] = [];
  for (const entity of entities) if (!entity.deletedAt && matches(entity)) result.push(entity);
  return result;
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
    selected = query === null ? active : filterCatalogEntities(project, query, active);
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
  if(requiresFixedStateUsageVerification(project))return catalogMaintenance(project,undefined,'固定版のhash検証前です。');
  try{return catalogMaintenance(project,stateUsageIndex(project));}
  catch(error){return catalogMaintenance(project,undefined,(error as Error).message);}
}
/** Verify the declared, immutable fixed edition; never substitute current text
 * or overwrite the expected hash to make a stale pin appear valid. */
export async function findCatalogMaintenanceVerified(project:ProjectData):Promise<CatalogMaintenanceFinding[]> {
  // Hash verification and the assessment must observe the same image. Retain
  // dictionary sharing inside that image, without expanding unrelated history
  // or author alternatives into a second copy of the entire project.
  const {history:_history,authorAlternatives:_alternatives,...current}=project;
  const captured:ProjectData=structuredClone({...current,history:[]});
  try{await verifyReusePins(captured,captured.snapshots);return catalogMaintenance(captured,stateUsageIndex(captured));}
  catch(error){return catalogMaintenance(captured,undefined,(error as Error).message);}
}
function catalogMaintenance(project:ProjectData,stateUses:Map<ID,StateUsage[]>|undefined,stateUsageReason?:string):CatalogMaintenanceFinding[] {
  const active = activeEntities(project);
  const findings: CatalogMaintenanceFinding[] = [];
  for (const duplicate of duplicateCandidates(project)) {
    if (duplicate.kind !== 'review') findings.push(finding('possible_duplicate', duplicate.ids, `同じ種類に正規化後の名前が「${duplicate.name}」となる項目があります。名前だけで重複とは決めず、内容と参照を確認してください。`, duplicate.ids.map(id => 'name')));
  }
  const referenced = referencedIds(project);
  for (const entity of active) {
    const usageUnknown=entity.kind==='variable'&&!stateUses;
    const used = entity.kind === 'variable' ? usageUnknown||(stateUses?.get(entity.id)?.length ?? 0) > 0 : referenced.has(entity.id);
    if (entity.kind !== 'review' && !used) {
      if (entity.retainIfUnreferenced) {
        findings.push(finding('retained', [entity.id], entity.kind === 'variable'
          ? '未使用ですが、作者が保持するよう指定しています。保存経路などの参照も保護し、利用箇所がないことだけを理由に削除しません。'
          : '未参照ですが、作者が保持するよう指定しています。参照がないことだけを理由に削除しません。', ['retainIfUnreferenced']));
      } else if (entity.kind === 'variable' && entity.data.externalUseDeclared) {
        findings.push(finding('external_use', [entity.id], '作品外から使う状態として宣言されています。外部連携の利用先を確認し、宣言を外す前に影響を調べてください。', ['data.externalUseDeclared']));
      } else {
        findings.push(finding('unreferenced', [entity.id], entity.kind === 'variable'
          ? '採用された宣言に読取・更新・初期化の利用がありません。試読の保存状態に値が含まれるだけでは利用と数えません。保存経路などの参照は引き続き保護し、保持指定または削除前の影響確認を選んでください。'
          : '有効な項目・関係・保存ビューから直接参照されていません。背景設定など意図して保持する情報の可能性もあるため、保持指定または削除前の影響確認を選んでください。'));
      }
    }
    if (hasReadingField(entity) && !readingOf(entity)) {
      findings.push(finding('missing_reading', [entity.id], '読みが未登録です。名前から探すための候補であり、読みが不要な場合もあります。', ['data.reading']));
    }
    const paths = reviewPaths(entity);
    if(usageUnknown)findings.push(finding('needs_review',[entity.id],`固定使用先を確認できず、状態の利用は未判定です。${stateUsageReason??''} 未使用や外部利用だけとは判定せず、固定版とID対応を確認してください。`,paths));
    else if (paths.length) findings.push(finding('needs_review', [entity.id], 'この項目には確認待ちの状態があります。関連する本文や素材を確認し、対応済みか再確認済みかを判断してください。', paths));
  }
  return findings.sort((a, b) => compareValues(a.kind, b.kind) || compareValues(a.targetIds.join(','), b.targetIds.join(',')));
}
