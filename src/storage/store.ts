import Dexie, { type Table } from 'dexie';
import { prepareWorldPin, type WorldPinInput } from './worldPins';
import type { Block, CommandRecord, ContentState, Entity, ProjectContent, ProjectData, ProjectSnapshot, Relation, SavedView, ViewState } from '../domain/types';
import { collectReferences, ID_PATTERN, newId, rewriteEntityReferences, rewriteRelationReferences, validateCurrentProject, validateProject, type DomainReference } from '../domain/model';
import { remapEditedTextReferences, remapEditedTextRelationReferences } from '../domain/text';
import { reconcileDeliverables } from '../domain/production';
import { addChangeReviews } from '../domain/changeReviews';
import { validateProjectIntegrity } from '../domain/projectRecordValidation';
import { sealAuthorAlternative } from '../domain/authorAlternativeIntegrity';
import { appendAlternativeVersion, applyAlternativeChanges, projectContent } from '../domain/writingWorkspace';
import { assetPath, attachmentMetadata, exportScenario, referencedWorlds, validateAsset, verifySnapshotHashes, verifyWorlds, worldSnapshotContents, type PreparedScenario } from './archive';
import { checkCancelled, saveError, StorageError } from './errors';
import { canonicalJson, equalJson, jsonBytes, sha256 } from './json';
import { recoveryImages, projectWithRecoveryHistory, validateRecovery, type PortableRecovery } from './recovery';
import { planCrossProjectImport, type CrossProjectImportPlan } from './importMapping';

type StoredProject = Omit<ProjectData, 'entities' | 'relations' | 'snapshots' | 'history' | 'views'> & {
  entityIds: string[]; relationIds: string[]; snapshotIds: string[]; historyIds: string[]; viewIds: string[];
  contentHeadOperationId?: string;
};
interface StoredEntity { id: string; projectId: string; kind: Entity['kind']; record: unknown }
interface StoredBlock { id: string; projectId: string; entityId: string; block: Block }
type CommandMetadata = Omit<CommandRecord, 'before' | 'after'>;
type ContentHeader = Omit<ContentState, 'entities' | 'relations'>;
interface ContentDelta {
  header: Partial<ContentHeader>;
  entities: { id: string; record: Entity | null }[];
  relations: { id: string; record: Relation | null }[];
  entityIds?: string[]; relationIds?: string[];
}
interface StoredCommand {
  operationId: string; projectId: string; revision: string; requestHash?: string; requestHashVersion?: 2;
  // Original rows and imported histories remain readable without destructive migration.
  record?: CommandRecord;
  delta?: { metadata: CommandMetadata; parentOperationId?: string; checkpoint?: ContentState; patch: ContentDelta };
}
interface AssetRecord { contentHash: string; mediaType: string; path: string; bytes: Uint8Array }
export interface AssetInput { contentHash: string; bytes: Uint8Array; mediaType: string; assetPath?: string }
export type Presence = { present: false } | { present: true; value: unknown };
export interface FieldChange { field: string; oldValueHash: string; before: Presence; after: Presence }
export type ProjectTarget = Omit<ContentState, 'entities' | 'relations'> & { id: string; kind: 'project' };
type TargetRecord = Entity | Relation | ProjectTarget;
export interface TargetChange { targetId: string; before: TargetRecord | null; after: TargetRecord | null; fields: FieldChange[] }
export interface OutboxRecord {
  operationId: string; projectId: string; accountId: string | null; baseRevision: string; localRevision: string;
  createdAt: string; targetIds: string[]; changes: TargetChange[]; command: CommandRecord;
}
type StoredOutbox = Omit<OutboxRecord, 'command' | 'changes'> & {
  command?: CommandRecord; commandOperationId?: string;
  changes: (Omit<TargetChange, 'before' | 'after'> & { before?: TargetRecord | null; after?: TargetRecord | null })[];
};
export interface PersistedAck { operationId: string; projectId: string; serverRevision: string; status: 'applied' | 'conflict'; payload?: unknown }
interface SyncMetadata { projectId: string; serverRevision: string; state: 'pending' | 'synced' | 'conflict' }
export interface RestorePoint { id: string; projectId: string; createdAt: string; reason: string; project: ProjectData; assetHashes: string[] }
interface StoredView extends SavedView { projectId: string }
interface StoredViewState extends ViewState { key: string; projectId: string }
interface ImportLog { operationId: string; projectId: string; mode: ImportMode; createdAt: string; idMap?: Record<string, string> }
export interface SaveResult { project: ProjectData; operationId: string; localSaved: true; pendingSync: boolean }
export interface SaveOptions { worldPin?: WorldPinInput; reason: string; operationId?: string; assets?: AssetInput[]; signal?: AbortSignal; compensatesOperationId?: string; includeHistory?: boolean }
export type FaultStage = 'after-content' | 'after-history' | 'after-outbox' | 'before-commit';
export interface SaveMetrics {
  operationId: string; projectId: string;
  milliseconds: { prepare: number; hash: number; read: number; reconcile: number; validate: number; diff: number; database: number; total: number };
  written: { entities: number; relations: number; blocks: number; snapshots: number; views: number; commands: number; outbox: number };
  historyRead: number;
}
export interface StoreOptions { databaseName?: string; accountId?: string; faultInjector?: (stage: FaultStage) => void; onSaveMetrics?: (metrics: SaveMetrics) => void }
export type ImportMode = 'new' | 'clone' | 'replace' | 'merge' | 'mapped_merge';
export interface ImportOptions {
  mode: ImportMode; targetProjectId?: string; baseRevision?: string; operationId?: string; signal?: AbortSignal;
  resolutions?: Record<string, 'existing' | 'incoming'>;
  idMap?: Record<string, string>; confirmationHash?: string;
}
export interface ImportPreview { conflicts: ImportConflict[]; pendingChanges: number; target?: ProjectData; additions: number; mappedPlan?: CrossProjectImportPlan; mappedRecovery?: PortableRecovery; confirmationHash?: string }
export interface RecoveredPendingIntent { key: string; projectId: string; importOperationId: string; sequence: number; operation: PortableRecovery['pending'][number]; status: 'needs_reconnect' }
export interface ImportDraft { key: string; bytes?: Uint8Array; sourceHash?: string; mode: ImportMode; targetProjectId: string; idMap: Record<string, string>; resolutions: Record<string, 'existing' | 'incoming'>; selectedId?: string }
export interface AuthorToolDraft { key: string; projectId: string; baseRevision: string; fields: Record<string, unknown>; asset?: { bytes: Uint8Array; contentHash: string } }
export interface HistoryPage { entries: CommandMetadata[]; page: number; maximum: number; total: number; size: number }
export interface ImportConflict { id: string; kind: 'project' | 'entity' | 'relation' | 'snapshot' | 'view' | 'alternative'; existing: unknown; incoming: unknown }
export interface ImportResult extends SaveResult { mode: ImportMode; idMap?: Record<string, string>; restorePointId?: string; warnings: string[] }

class ScenarioDatabase extends Dexie {
  projects!: Table<StoredProject, string>;
  entities!: Table<StoredEntity, [string, string]>;
  relations!: Table<Relation, [string, string]>;
  blocks!: Table<StoredBlock, [string, string]>;
  snapshots!: Table<ProjectSnapshot & { projectId: string }, [string, string]>;
  commands!: Table<StoredCommand, string>;
  outbox!: Table<StoredOutbox, string>;
  assets!: Table<AssetRecord, string>;
  views!: Table<StoredView, [string, string]>;
  viewStates!: Table<StoredViewState, string>;
  syncMetadata!: Table<SyncMetadata, string>;
  acks!: Table<PersistedAck, string>;
  restorePoints!: Table<RestorePoint, string>;
  worlds!: Table<{ id: string; project: ProjectData }, string>;
  importLogs!: Table<ImportLog, string>;
  importDrafts!: Table<ImportDraft, string>;
  authorToolDrafts!: Table<AuthorToolDraft, string>;
  recoveredPending!: Table<RecoveredPendingIntent, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      projects: 'projectId,name', entities: '[projectId+id],projectId,[projectId+kind]', relations: '[projectId+id],projectId,[projectId+fromId],[projectId+toId]',
      blocks: '[projectId+id],projectId,[projectId+entityId]', snapshots: '[projectId+id],projectId',
      commands: 'operationId,projectId,[projectId+revision]', outbox: 'operationId,projectId,accountId', assets: 'contentHash',
      views: '[projectId+id],projectId', viewStates: 'key,projectId', syncMetadata: 'projectId', acks: 'operationId,projectId',
      restorePoints: 'id,projectId,createdAt', worlds: 'id', importLogs: 'operationId,projectId',
    });
    this.version(2).stores({ importDrafts: 'key' });
    this.version(3).stores({ recoveredPending: 'key,projectId' });
    this.version(4).stores({ authorToolDrafts: 'key,projectId' });
  }
}

const copy = <T>(value: T): T => structuredClone(value);
const sameJson = (left: unknown, right: unknown): boolean => left === right || equalJson(left ?? null, right ?? null);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function projectCopy(project: ProjectData): ProjectData {
  return { ...copy(withoutHistory(project)), history: project.history };
}
function contentDelta(before: ContentState, after: ContentState): ContentDelta {
  const changes = <T extends Entity | Relation>(previous: T[], next: T[]) => {
    const old = new Map(previous.map(record => [record.id, record]));
    const current = new Map(next.map(record => [record.id, record]));
    return [...new Set([...old.keys(), ...current.keys()])].flatMap(id => sameJson(old.get(id) ?? null, current.get(id) ?? null) ? [] : [{ id, record: current.get(id) ?? null }]);
  };
  const beforeHeader = headerTarget(before), afterHeader = headerTarget(after), header: Partial<ContentHeader> = {};
  for (const field of Object.keys(afterHeader) as (keyof ContentHeader)[]) if (field !== ('id' as string) && field !== ('kind' as string) && !sameJson(beforeHeader[field], afterHeader[field])) {
    (header as Record<string, unknown>)[field] = afterHeader[field];
  }
  const orderedIds = (previous: { id: string }[], next: { id: string }[]) => previous.length === next.length && previous.every((record, index) => record.id === next[index].id) ? undefined : next.map(record => record.id);
  return { header, entities: changes(before.entities, after.entities), relations: changes(before.relations, after.relations), entityIds: orderedIds(before.entities, after.entities), relationIds: orderedIds(before.relations, after.relations) };
}
function applyContentDelta(before: ContentState, patch: ContentDelta): ContentState {
  const apply = <T extends Entity | Relation>(records: T[], changes: { id: string; record: T | null }[], ids?: string[]): T[] => {
    if (!changes.length && !ids) return records;
    const next = new Map(records.map(record => [record.id, record]));
    for (const change of changes) if (change.record) next.set(change.id, change.record); else next.delete(change.id);
    return (ids ?? [...next.keys()]).map(id => {
      const record = next.get(id);
      if (!record) throw new StorageError('SAVE_FAILED', '履歴の差分に必要な情報が不足しています。', id);
      return record;
    });
  };
  return { ...before, ...patch.header, entities: apply(before.entities, patch.entities, patch.entityIds), relations: apply(before.relations, patch.relations, patch.relationIds) };
}
const increment = (revision: string): string => (BigInt(revision) + 1n).toString();
const withoutHistory = ({ history: _history, ...content }: ProjectData): ContentState => content;
const blankBefore = (project: ProjectData): ContentState => {
  const before = { ...withoutHistory(project), entities: [], relations: [], snapshots: [], views: [], revision: '0' };
  // Keep the established optional-field shape for legacy projects, but never
  // borrow branch evidence from the new image into the blank initial state.
  if (project.authorAlternatives?.length) before.authorAlternatives = [];
  else delete before.authorAlternatives;
  return before;
};

function validated(input: unknown, worldSnapshots: Record<string, ProjectContent> = {}): ProjectData {
  const result = validateProject(input, { worldSnapshots });
  if (!result.ok) throw Object.assign(new StorageError('VALIDATION_FAILED', result.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), { issues: result.issues });
  canonicalJson(result.value);
  return result.value;
}
function validatedCurrent(input: ProjectData, worldSnapshots: Record<string, ProjectContent>, previous?: ProjectData, references = new WeakMap<Entity, DomainReference[]>()): ProjectData {
  const result = validateCurrentProject(input, { worldSnapshots }, previous ? { previous, references } : undefined);
  if (!result.ok) {
    const error = new StorageError('VALIDATION_FAILED', result.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
    Object.assign(error, { issues: result.issues });
    throw error;
  }
  return input;
}
async function validateDurableIntegrity(project: ProjectData, worldSnapshots: Record<string, ProjectContent> = {}, requireReceiptHistory = project.history.length > 0): Promise<void> {
  const issues = await validateProjectIntegrity(project, { worldSnapshots }, requireReceiptHistory);
  if (issues.length) throw Object.assign(new StorageError('VALIDATION_FAILED', issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), { issues });
}

function withoutRevision(record: TargetRecord): unknown {
  return Object.fromEntries(Object.entries(record).filter(([field]) => !['revision', 'updatedAt'].includes(field)));
}

function normalizeRecords<T extends Entity | Relation>(before: T[], incoming: T[], operationId: string, time: string): T[] {
  const old = new Map(before.map(record => [record.id, record]));
  const result = incoming.map(record => {
    const previous = old.get(record.id);
    if (previous && 'kind' in previous && 'kind' in record && previous.kind !== record.kind) throw new StorageError('OPERATION_CONFLICT', '既存IDを別の種類へ再利用できません。', record.id);
    if (!previous) return copy(record);
    if ('createdAt' in previous && 'createdAt' in record && previous.createdAt !== record.createdAt) throw new StorageError('OPERATION_CONFLICT', '既存IDの作成日時は変更できません。', record.id);
    if (sameJson(previous, record) || sameJson(withoutRevision(previous), withoutRevision(record))) return previous;
    return { ...copy(record), revision: increment(previous.revision), ...('updatedAt' in record ? { updatedAt: time } : {}) };
  });
  const ids = new Set(incoming.map(record => record.id));
  for (const previous of before) if (!ids.has(previous.id)) {
    result.push(previous.deletedAt ? previous : { ...copy(previous), deletedAt: time, deletionOperationId: operationId, revision: increment(previous.revision), ...('updatedAt' in previous ? { updatedAt: time } : {}) });
  }
  return result as T[];
}

function protectSnapshots(before: ProjectData, after: ProjectData): void {
  for (const snapshot of before.snapshots) {
    const next = after.snapshots.find(item => item.id === snapshot.id);
    if (!next || !equalJson(snapshot, next)) throw new StorageError('IMMUTABLE_SNAPSHOT', '公開済み・保存済みの不変snapshotは変更や削除ができません。', snapshot.id);
  }
  for (const entity of before.entities.filter(item => item.kind === 'snapshot')) {
    const next = after.entities.find(item => item.id === entity.id);
    if (!next || !equalJson(entity, next)) throw new StorageError('IMMUTABLE_SNAPSHOT', '不変snapshotは変更や削除ができません。', entity.id);
  }
}

function assertAppendOnlyArray<T>(previous: readonly T[], next: readonly T[], label: string): boolean {
  const common = Math.min(previous.length, next.length);
  for (let index = 0; index < common; index++) if (!sameJson(previous[index], next[index])) throw new StorageError('VALIDATION_FAILED', `${label}の既存記録は変更できません。`);
  return next.length < previous.length;
}

async function preserveAlternativeHistory(previous: ProjectData, candidate: ProjectData): Promise<void> {
  const old = new Map((previous.authorAlternatives ?? []).map(alternative => [alternative.id, alternative]));
  const incoming = new Map((candidate.authorAlternatives ?? []).map(alternative => [alternative.id, alternative]));
  const merged = [];
  for (const prior of old.values()) {
    const next = incoming.get(prior.id);
    if (!next) {
      merged.push(await sealAuthorAlternative({ ...copy(prior), status: 'rejected', updatedAt: new Date().toISOString() }));
      continue;
    }
    if (next.projectId !== prior.projectId || next.baseRevision !== prior.baseRevision || (next.sourceSnapshotId ?? null) !== (prior.sourceSnapshotId ?? null)
      || next.createdAt !== prior.createdAt || !sameJson(next.baseContent, prior.baseContent) || next.baseContentHash !== prior.baseContentHash) {
      throw new StorageError('VALIDATION_FAILED', '別案の分岐元と識別情報は変更できません。', prior.id);
    }
    const rollbackVersions = assertAppendOnlyArray(prior.versions, next.versions, '別案の版');
    const rollbackReceipts = assertAppendOnlyArray(prior.applyReceipts, next.applyReceipts, '正本採用履歴');
    let versionSource = next.versions.find(version => version.id === next.headVersionId);
    if (!versionSource) throw new StorageError('VALIDATION_FAILED', '別案の現在版が見つかりません。', prior.id);
    const needsMerge = rollbackVersions || rollbackReceipts || next.headVersionId !== next.versions.at(-1)?.id;
    if (!needsMerge) { merged.push(next); continue; }
    let restored = { ...copy(next), versions: rollbackVersions ? copy(prior.versions) : copy(next.versions), applyReceipts: rollbackReceipts ? copy(prior.applyReceipts) : copy(next.applyReceipts) };
    if (rollbackVersions || restored.headVersionId !== restored.versions.at(-1)?.id) {
      const content = versionSource.content, structurePlan = versionSource.structurePlan;
      const lastCreated = Date.parse(restored.versions.at(-1)?.createdAt ?? '');
      const restoredAt = new Date(Math.max(Date.now(), Number.isFinite(lastCreated) ? lastCreated + 1 : 0)).toISOString();
      restored = appendAlternativeVersion(restored, content, `「${versionSource.label}」から復元`, restoredAt, newId(), structurePlan);
    }
    merged.push(await sealAuthorAlternative(restored));
  }
  for (const next of incoming.values()) if (!old.has(next.id)) merged.push(next);
  candidate.authorAlternatives = merged;
}

function verifyAlternativeApplicationInput(previous: ProjectData, draft: ProjectData): void {
  const priorById = new Map((previous.authorAlternatives ?? []).map(alternative => [alternative.id, alternative]));
  const added: Array<{ alternativeId: string; receipt: NonNullable<ProjectData['authorAlternatives']>[number]['applyReceipts'][number] }> = [];
  for (const alternative of draft.authorAlternatives ?? []) {
    const prior = priorById.get(alternative.id), oldReceiptIds = new Set(prior?.applyReceipts.map(receipt => receipt.id) ?? []);
    for (const receipt of alternative.applyReceipts) if (!oldReceiptIds.has(receipt.id)) added.push({ alternativeId: alternative.id, receipt });
  }
  if (!added.length) return;
  if (added.length !== 1) throw new StorageError('VALIDATION_FAILED', '一回の保存では一件の作者別案採用を記録してください。');
  const { alternativeId, receipt } = added[0]!, prior = priorById.get(alternativeId);
  if (!prior || receipt.alternativeVersionId !== prior.headVersionId || receipt.fromCanonicalRevision !== previous.revision || receipt.appliedRevision !== increment(previous.revision)) throw new StorageError('VALIDATION_FAILED', '採用記録の正本版または別案版が保存元と一致しません。', alternativeId);
  let expected;
  try { expected = applyAlternativeChanges(previous, prior, [], new Set(receipt.selectedChangeKeys ?? []), receipt.createdAt, receipt.id); }
  catch (error) { throw new StorageError('VALIDATION_FAILED', error instanceof Error ? error.message : '採用差分を再計算できません。', alternativeId); }
  const { appliedRevision: _appliedRevision, ...receiptWithoutRevision } = receipt;
  if (!sameJson(receiptWithoutRevision, expected.receipt)) throw new StorageError('VALIDATION_FAILED', '作者別案の採用差分が現在の正本・選択元版と一致しません。', alternativeId);

  // App persistence may add deterministic review records derived from this exact
  // adoption. Permit those records only, while comparing all authored content and
  // the semantic body of each generated review.
  const reviewMarker = 'semantic-change-review/v1';
  const generatedKey = (entity: Entity): string | undefined => entity.kind === 'review'
    && entity.customValues['changeReview.generatedBy'] === reviewMarker
    && typeof entity.customValues['changeReview.key'] === 'string'
    ? entity.customValues['changeReview.key'] as string : undefined;
  const priorKeys = new Set(previous.entities.flatMap(entity => generatedKey(entity) ?? []));
  const expectedWithReviews = addChangeReviews(previous, expected.project);
  const newReviews = (project: ProjectData) => project.entities.filter(entity => { const key = generatedKey(entity); return key !== undefined && !priorKeys.has(key); });
  const normalizeReview = (entity: Entity) => {
    const normalized = copy(entity) as unknown as Record<string, unknown>;
    delete normalized.id; delete normalized.createdAt; delete normalized.updatedAt;
    if (normalized.kind === 'review') {
      const data = normalized.data as Record<string, unknown>;
      if (Array.isArray(data.body)) data.body = data.body.map(item => {
        const block = { ...(item as Record<string, unknown>) }; delete block.id; return block;
      });
    }
    return normalized;
  };
  const expectedReviews = newReviews(expectedWithReviews).sort((a, b) => (generatedKey(a) ?? '').localeCompare(generatedKey(b) ?? ''));
  const actualReviews = newReviews(draft).sort((a, b) => (generatedKey(a) ?? '').localeCompare(generatedKey(b) ?? ''));
  const withoutNewReviews = (project: ProjectData, reviews: Entity[]) => {
    const newIds = new Set(reviews.map(entity => entity.id));
    return { ...projectContent(project), entities: project.entities.filter(entity => !newIds.has(entity.id)) };
  };
  const exactAuthoredContent = sameJson(withoutNewReviews(expectedWithReviews, expectedReviews), withoutNewReviews(draft, actualReviews));
  const exactGeneratedReviews = expectedReviews.length === actualReviews.length
    && expectedReviews.every((entity, index) => sameJson(normalizeReview(entity), normalizeReview(actualReviews[index]!)));
  if (!exactAuthoredContent || !exactGeneratedReviews) throw new StorageError('VALIDATION_FAILED', '作者別案の採用差分が現在の正本・選択元版と一致しません。', alternativeId);
}

function extractBlocks(entity: Entity): { record: unknown; blocks: StoredBlock[] } {
  const blocks: StoredBlock[] = [];
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      if (value.length && value.every(item => item && typeof item === 'object' && 'id' in item && 'text' in item && ['paragraph', 'heading', 'list_item', 'quote'].includes((item as Block).kind))) {
        for (const block of value as Block[]) blocks.push({ id: block.id, projectId: entity.projectId, entityId: entity.id, block: copy(block) });
        return { __scenarioRichText: value.map(item => (item as Block).id) };
      }
      return value.map(visit);
    }
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    return value;
  };
  return { record: visit(entity), blocks };
}

function hydrateBlocks(record: unknown, blocks: Map<string, Block>): Entity {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object') {
      const data = value as Record<string, unknown>;
      if (Array.isArray(data.__scenarioRichText)) return data.__scenarioRichText.map(id => {
        const block = blocks.get(id as string);
        if (!block) throw new StorageError('SAVE_FAILED', '本文blockが不足しています。完全保存ファイルから復元してください。', id as string);
        return copy(block);
      });
      return Object.fromEntries(Object.entries(data).map(([key, item]) => [key, visit(item)]));
    }
    return value;
  };
  return visit(record) as Entity;
}

function headerTarget(content: ContentState): ProjectTarget {
  const { entities: _entities, relations: _relations, ...header } = content;
  return { ...header, id: content.projectId, kind: 'project' };
}
async function targetChanges(before: ContentState, after: ContentState, isNew = false): Promise<TargetChange[]> {
  const old = new Map<string, TargetRecord>([...before.entities, ...before.relations, ...(isNew ? [] : [headerTarget(before)])].map(record => [record.id, record]));
  const current = new Map<string, TargetRecord>([...after.entities, ...after.relations, headerTarget(after)].map(record => [record.id, record]));
  const result: TargetChange[] = [];
  for (const id of new Set([...old.keys(), ...current.keys()])) {
    const previous = old.get(id) ?? null, next = current.get(id) ?? null;
    if (id !== after.projectId && (previous === next || sameJson(previous ? withoutRevision(previous) : null, next ? withoutRevision(next) : null))) continue;
    const fields: FieldChange[] = [];
    for (const field of new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})])) {
      if (['revision', 'updatedAt'].includes(field)) continue;
      const previousValue: Presence = previous && field in previous ? { present: true, value: (previous as unknown as Record<string, unknown>)[field] } : { present: false };
      const nextValue: Presence = next && field in next ? { present: true, value: (next as unknown as Record<string, unknown>)[field] } : { present: false };
      if (previousValue.present && nextValue.present && previousValue.value === nextValue.value) continue;
      if (!sameJson(previousValue, nextValue)) fields.push({ field, oldValueHash: await sha256(jsonBytes(previousValue)), before: previousValue, after: nextValue });
    }
    result.push({ targetId: id, before: previous, after: next, fields });
  }
  return result;
}

export class ScenarioStore {
  private readonly db: ScenarioDatabase;
  readonly accountId: string | null;
  private readonly faultInjector?: StoreOptions['faultInjector'];
  private readonly onSaveMetrics?: StoreOptions['onSaveMetrics'];
  private readonly cachedProjects = new Map<string, ProjectData>();
  private readonly contentHeads = new Map<string, string | undefined>();
  private readonly cachedHistoryIds = new Map<string, string[]>();
  private readonly completeHistories = new Set<string>();
  private readonly cacheEpochs = new Map<string, number>();
  private cacheLifetime = 0;
  private readonly editingHistories = new WeakMap<CommandRecord[], { projectId: string; revision: string; historyIds: string[] }>();
  private readonly validationReferences = new WeakMap<Entity, DomainReference[]>();
  constructor(options: StoreOptions = {}) {
    this.accountId = options.accountId ?? null;
    this.faultInjector = options.faultInjector;
    this.onSaveMetrics = options.onSaveMetrics;
    this.db = new ScenarioDatabase(options.databaseName ?? (this.accountId ? `scenario-manager-account-${encodeURIComponent(this.accountId)}` : 'scenario-manager-local-v1'));
  }
  // Store names avoid Dexie's recursive KeyPaths expansion on the domain's large discriminated unions.
  private get writeTables(): string[] { return ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'views', 'syncMetadata', 'restorePoints', 'worlds', 'importLogs', 'recoveredPending']; }
  private async guardWorldRegistry(incoming: ProjectData[]): Promise<void> {
    const snapshots = new Map<string, ProjectSnapshot>();
    for (const project of [...(await this.db.worlds.toArray()).map(row => row.project), ...incoming]) for (const snapshot of project.snapshots) {
      const existing = snapshots.get(snapshot.id);
      if (existing && !sameJson(existing, snapshot)) throw new StorageError('IMMUTABLE_SNAPSHOT', '固定版IDが別の保存済み内容と衝突しています。', snapshot.id);
      snapshots.set(snapshot.id, snapshot);
    }
  }
  close(): void { this.cacheLifetime++; for (const id of this.cacheEpochs.keys()) this.invalidateProjectCache(id); this.db.close(); }
  async deleteDatabase(): Promise<void> { this.close(); await this.db.delete(); }

  private invalidateProjectCache(projectId: string): void {
    this.cacheEpochs.set(projectId, (this.cacheEpochs.get(projectId) ?? 0) + 1);
    this.cachedProjects.delete(projectId); this.contentHeads.delete(projectId); this.cachedHistoryIds.delete(projectId); this.completeHistories.delete(projectId);
  }
  private rememberProject(project: ProjectData, contentHeadOperationId?: string, historyIds = project.history.map(command => command.operationId), readEpoch?: { project: number; lifetime: number }): ProjectData {
    const cachedBefore = this.cachedProjects.get(project.projectId), epoch = this.cacheEpochs.get(project.projectId) ?? 0;
    // Validation continues outside the read transaction. A newer save/import
    // or completed read must not be replaced when an earlier read resumes.
    if (readEpoch && (readEpoch.project !== epoch || readEpoch.lifetime !== this.cacheLifetime) || cachedBefore && BigInt(cachedBefore.revision) > BigInt(project.revision)) return project;
    const cached = freeze({ ...withoutHistory(project), history: freeze(project.history.map(command => freeze(command))) });
    this.cachedProjects.set(project.projectId, cached);
    this.contentHeads.set(project.projectId, contentHeadOperationId);
    this.cachedHistoryIds.set(project.projectId, historyIds);
    if (sameJson(historyIds, project.history.map(command => command.operationId))) this.completeHistories.add(project.projectId); else this.completeHistories.delete(project.projectId);
    this.cacheEpochs.set(project.projectId, epoch + 1);
    return cached;
  }
  private editingCopy(project: ProjectData, historyIds = project.history.map(command => command.operationId)): ProjectData {
    const history: CommandRecord[] = freeze([]);
    this.editingHistories.set(history, { projectId: project.projectId, revision: project.revision, historyIds });
    return { ...copy(withoutHistory(project)), history };
  }
  getHistoryCount(project: ProjectData): number { return this.editingHistories.get(project.history)?.historyIds.length ?? project.history.length; }

  private async materializeCommand(row: StoredCommand, rows = new Map<string, StoredCommand>(), ready = new Map<string, CommandRecord>(), active = new Set<string>(), allowRead = true): Promise<CommandRecord> {
    const cached = ready.get(row.operationId);
    if (cached) return cached;
    if (row.record) { ready.set(row.operationId, row.record); return row.record; }
    const delta = row.delta;
    if (!delta || active.has(row.operationId)) throw new StorageError('SAVE_FAILED', '履歴の差分または復元点が破損しています。', row.operationId);
    active.add(row.operationId);
    let before = delta.checkpoint;
    if (!before && delta.parentOperationId) {
      const parent = rows.get(delta.parentOperationId) ?? (allowRead ? await this.db.commands.get(delta.parentOperationId) : undefined);
      if (!parent || parent.projectId !== row.projectId) throw new StorageError('SAVE_FAILED', '履歴の元の版が不足しています。', delta.parentOperationId);
      before = (await this.materializeCommand(parent, rows, ready, active, allowRead)).after;
    }
    if (!before || before.projectId !== row.projectId || before.revision !== delta.metadata.baseRevision) throw new StorageError('SAVE_FAILED', '履歴の復元点と元の版が一致しません。', row.operationId);
    const record: CommandRecord = { ...delta.metadata, before, after: applyContentDelta(before, delta.patch) };
    if (record.operationId !== row.operationId || record.projectId !== row.projectId || record.after.revision !== row.revision) throw new StorageError('SAVE_FAILED', '履歴の差分と操作情報が一致しません。', row.operationId);
    active.delete(row.operationId); ready.set(row.operationId, record);
    return record;
  }

  private async readProject(projectId: string, includeHistory = true): Promise<{ project: ProjectData; historyIds: string[]; contentHeadOperationId?: string } | undefined> {
    const header = await this.db.projects.get(projectId);
    if (!header) return undefined;
    const { entityIds, relationIds, snapshotIds, historyIds, viewIds, contentHeadOperationId, ...project } = header;
    const [entities, relations, snapshots, commands, views, blockRows] = await Promise.all([
      this.db.entities.bulkGet(entityIds.map(id => [projectId, id] as [string, string])),
      this.db.relations.bulkGet(relationIds.map(id => [projectId, id] as [string, string])),
      this.db.snapshots.bulkGet(snapshotIds.map(id => [projectId, id] as [string, string])),
      includeHistory ? this.db.commands.bulkGet(historyIds) : Promise.resolve([] as StoredCommand[]), this.db.views.bulkGet(viewIds.map(id => [projectId, id] as [string, string])),
      this.db.blocks.where('projectId').equals(projectId).toArray(),
    ]);
    if ([...entities, ...relations, ...snapshots, ...commands, ...views].some(item => !item)) throw new StorageError('SAVE_FAILED', '作品の保存情報が不足しています。完全保存ファイルから復元してください。', projectId);
    const blocks = new Map(blockRows.map(row => [row.id, row.block]));
    const commandRows = new Map(commands.map(row => [row!.operationId, row!])), ready = new Map<string, CommandRecord>();
    const history: CommandRecord[] = [];
    for (const row of commands) history.push(await this.materializeCommand(row!, commandRows, ready));
    return { historyIds, contentHeadOperationId, project: { ...project, entities: entities.map(row => hydrateBlocks(row!.record, blocks)), relations: relations as Relation[],
      snapshots: snapshots.map(row => { const { projectId: _projectId, ...snapshot } = row!; return snapshot; }),
      history, views: views.map(row => { const { projectId: _projectId, ...view } = row!; return view; }) } };
  }

  async getProject(projectId: string): Promise<ProjectData | undefined> {
    try {
      const readEpoch = { project: this.cacheEpochs.get(projectId) ?? 0, lifetime: this.cacheLifetime };
      const read = await this.db.transaction('r', this.writeTables, async () => {
        const header = await this.db.projects.get(projectId), cached = this.cachedProjects.get(projectId);
        if (!header) return undefined;
        return cached?.revision === header.revision && this.completeHistories.has(projectId) && sameJson(this.cachedHistoryIds.get(projectId), header.historyIds) ? { project: cached, historyIds: header.historyIds, contentHeadOperationId: header.contentHeadOperationId } : this.readProject(projectId);
      });
      if (!read) return undefined;
      let { project } = read;
      if (project !== this.cachedProjects.get(projectId)) {
        const worlds = await this.validationWorlds();
        validated(project, worldSnapshotContents(worlds)); verifyWorlds([project], worlds); await verifySnapshotHashes([project]); await validateDurableIntegrity(project, worldSnapshotContents(worlds));
        project = this.rememberProject(project, read.contentHeadOperationId, read.historyIds, readEpoch);
      }
      return projectCopy(project);
    }
    catch (error) { throw saveError(error); }
  }
  /** Editing reads current rows only. Its immutable history token lets saves retain history without loading it. */
  async getProjectForEditing(projectId: string): Promise<ProjectData | undefined> {
    try {
      const readEpoch = { project: this.cacheEpochs.get(projectId) ?? 0, lifetime: this.cacheLifetime };
      const read = await this.db.transaction('r', this.writeTables, async () => {
        const header = await this.db.projects.get(projectId), cached = this.cachedProjects.get(projectId);
        if (!header) return undefined;
        return cached?.revision === header.revision && sameJson(this.cachedHistoryIds.get(projectId), header.historyIds) ? { project: cached, historyIds: header.historyIds, contentHeadOperationId: header.contentHeadOperationId } : this.readProject(projectId, false);
      });
      if (!read) return undefined;
      let { project } = read;
      if (project !== this.cachedProjects.get(projectId)) {
        const worlds = await this.validationWorlds();
        validated({ ...project, history: [] }, worldSnapshotContents(worlds));
        verifyWorlds([{ ...project, history: [] }], worlds); await verifySnapshotHashes([{ ...project, history: [] }]); await validateDurableIntegrity(project, worldSnapshotContents(worlds), false);
        project = this.rememberProject(project, read.contentHeadOperationId, read.historyIds, readEpoch);
      }
      return this.editingCopy(project, read.historyIds);
    } catch (error) { throw saveError(error); }
  }
  async listProjectsForEditing(): Promise<ProjectData[]> {
    const headers = await this.db.projects.toArray();
    return (await Promise.all(headers.map(header => this.getProjectForEditing(header.projectId)))).filter((project): project is ProjectData => !!project);
  }
  async listProjects(): Promise<ProjectData[]> {
    try {
      const headers = await this.db.projects.toArray();
      return (await Promise.all(headers.map(header => this.getProject(header.projectId)))).filter((item): item is ProjectData => !!item);
    } catch (error) { throw saveError(error); }
  }
  async listHistory(projectId: string): Promise<CommandRecord[]> { return (await this.getProject(projectId))?.history ?? []; }
  async historyPage(projectId: string, options: { query?: string; page?: number; size?: number } = {}): Promise<HistoryPage> {
    const query = (options.query ?? '').normalize('NFKC').toLocaleLowerCase(), page = options.page ?? 0, size = options.size ?? 30;
    if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 60) throw new StorageError('VALIDATION_FAILED', '履歴のページは0以上、ページ件数は1〜60です。');
    const header = await this.db.projects.get(projectId); if (!header) throw new StorageError('NOT_FOUND', '作品が見つかりません。');
    const rows = await this.db.commands.bulkGet(header.historyIds);
    const entries = rows.map((row, index) => {
      const value = row?.delta?.metadata ?? row?.record;
      if (!value || value.projectId !== projectId || value.operationId !== header.historyIds[index]) throw new StorageError('SAVE_FAILED', '履歴の操作情報が不足しています。', header.historyIds[index]);
      const { before: _before, after: _after, ...metadata } = value as CommandRecord;
      return metadata;
    }).reverse().filter(entry => !query || [entry.reason, entry.revision, entry.baseRevision, entry.operationId, entry.createdAt, ...entry.targetIds].some(value => value.normalize('NFKC').toLocaleLowerCase().includes(query)));
    const maximum = Math.max(0, Math.ceil(entries.length / size) - 1), bounded = Math.min(page, maximum);
    return { entries: entries.slice(bounded * size, (bounded + 1) * size), page: bounded, maximum, total: entries.length, size };
  }
  async historyCommand(projectId: string, operationId: string): Promise<CommandRecord> {
    const header = await this.db.projects.get(projectId), row = await this.db.commands.get(operationId);
    if (!header?.historyIds.includes(operationId) || !row || row.projectId !== projectId) throw new StorageError('NOT_FOUND', 'この作品の履歴操作が見つかりません。', operationId);
    return copy(await this.materializeCommand(row));
  }
  private async validationWorlds(extra: Record<string, ProjectData> = {}): Promise<Record<string, ProjectData>> {
    const rows = await this.db.worlds.toArray();
    const worlds = Object.fromEntries(rows.map(row => [row.id, row.project]));
    for (const [id, world] of Object.entries(extra)) worlds[id] = world;
    return worlds;
  }
  async listWorldSnapshots(): Promise<Record<string, ProjectData>> { return copy(await this.validationWorlds()); }
  async getProjectAtRevision(projectId: string, revision: string): Promise<ProjectData | undefined> {
    if (!/^(?:0|[1-9]\d*)$/.test(revision)) throw new StorageError('VALIDATION_FAILED', 'revisionは正規の10進整数文字列で指定してください。');
    const current = await this.getProject(projectId);
    if (!current) return undefined;
    const candidates = current.history.filter(item => item.revision === revision);
    if (candidates.length > 1 && candidates.some(item => !equalJson(item.after, candidates[0].after))) throw new StorageError('RESTORE_CONFLICT', '同じrevisionに複数の履歴があります。操作IDまたは不変snapshotで対象版を選んでください。');
    if (current.revision === revision) {
      if (candidates.some(item => !equalJson(item.after, withoutHistory(current)))) throw new StorageError('RESTORE_CONFLICT', '現在版と同じrevisionに別の履歴があります。操作IDまたは不変snapshotで対象版を選んでください。');
      return current;
    }
    const command = candidates[0];
    if (command) return { ...copy(command.after), history: current.history.filter(item => BigInt(item.revision) <= BigInt(revision)) };
    const first = current.history.find(item => item.baseRevision === revision);
    return first ? { ...copy(first.before), history: current.history.filter(item => BigInt(item.revision) <= BigInt(revision)) } : undefined;
  }
  async getProjectAtSnapshot(projectId: string, snapshotId: string): Promise<ProjectData | undefined> {
    const current = await this.getProject(projectId), snapshot = current?.snapshots.find(item => item.id === snapshotId);
    return snapshot ? { ...copy(snapshot.content), snapshots: copy(current!.snapshots), history: current!.history.filter(item => BigInt(item.revision) <= BigInt(snapshot.content.revision)) } : undefined;
  }

  private async writeContent(project: ProjectData, previous?: ProjectData, contentHeadOperationId?: string, historyIds = project.history.map(command => command.operationId)): Promise<SaveMetrics['written']> {
    const { entities, relations, snapshots, history, views, ...header } = project;
    const changed = <T extends { id: string }>(old: T[], current: T[]) => {
      const oldById = new Map(old.map(record => [record.id, record])), ids = new Set(current.map(record => record.id));
      return { put: current.filter(record => !sameJson(oldById.get(record.id), record)), remove: old.filter(record => !ids.has(record.id)).map(record => [project.projectId, record.id] as [string, string]) };
    };
    const entityChanges = changed(previous?.entities ?? [], entities), relationChanges = changed(previous?.relations ?? [], relations);
    const snapshotChanges = changed(previous?.snapshots ?? [], snapshots), viewChanges = changed(previous?.views ?? [], views);
    const extracted = entityChanges.put.map(entity => ({ entity, ...extractBlocks(entity) }));
    const changedEntityIds = new Set([...entityChanges.put.map(entity => entity.id), ...entityChanges.remove.map(key => key[1])]);
    const oldBlocks = (previous?.entities ?? []).filter(entity => changedEntityIds.has(entity.id)).flatMap(entity => extractBlocks(entity).blocks);
    const blockChanges = changed(oldBlocks, extracted.flatMap(row => row.blocks));
    await Promise.all([
      this.db.entities.bulkDelete(entityChanges.remove), this.db.relations.bulkDelete(relationChanges.remove),
      this.db.blocks.bulkDelete(blockChanges.remove), this.db.snapshots.bulkDelete(snapshotChanges.remove), this.db.views.bulkDelete(viewChanges.remove),
    ]);
    await this.db.projects.put({ ...header, entityIds: entities.map(row => row.id), relationIds: relations.map(row => row.id), snapshotIds: snapshots.map(row => row.id), historyIds, viewIds: views.map(row => row.id), ...(contentHeadOperationId ? { contentHeadOperationId } : {}) });
    await Promise.all([
      this.db.entities.bulkPut(extracted.map(row => ({ id: row.entity.id, projectId: project.projectId, kind: row.entity.kind, record: row.record }))),
      this.db.relations.bulkPut(relationChanges.put), this.db.blocks.bulkPut(blockChanges.put),
      this.db.snapshots.bulkPut(snapshotChanges.put.map(row => ({ ...row, projectId: project.projectId }))),
      this.db.views.bulkPut(viewChanges.put.map(row => ({ ...row, projectId: project.projectId }))),
    ]);
    return { entities: entityChanges.put.length + entityChanges.remove.length, relations: relationChanges.put.length + relationChanges.remove.length, blocks: blockChanges.put.length + blockChanges.remove.length, snapshots: snapshotChanges.put.length + snapshotChanges.remove.length, views: viewChanges.put.length + viewChanges.remove.length, commands: 1, outbox: 1 };
  }

  private async checkedAssets(inputs: AssetInput[] = []): Promise<AssetRecord[]> {
    const records: AssetRecord[] = [];
    for (const input of inputs) {
      const bytes = input.bytes.slice(), path = input.assetPath ?? assetPath(input.contentHash, input.mediaType);
      const hash = validateAsset(path, input.mediaType, bytes);
      if (bytes.byteLength > 32 * 1024 * 1024) throw new StorageError('LIMIT_EXCEEDED', '一つの添付は32 MiB以下にしてください。', path);
      if (hash !== input.contentHash || await sha256(bytes) !== hash) throw new StorageError('HASH_MISMATCH', '添付bytesのhashが一致しません。', path);
      records.push({ contentHash: hash, mediaType: input.mediaType, path, bytes });
    }
    return records;
  }
  private async writeAssets(records: AssetRecord[], project: ProjectData, requireAll: boolean): Promise<void> {
    for (const record of records) {
      const existing = await this.db.assets.get(record.contentHash);
      if (existing && (!equalBytes(existing.bytes, record.bytes))) throw new StorageError('HASH_MISMATCH', '既存hashの素材bytesが異なります。', record.path);
      await this.db.assets.put(record);
    }
    for (const metadata of attachmentMetadata(project)) {
      const asset = await this.db.assets.get(metadata.contentHash);
      if (asset && asset.bytes.byteLength !== metadata.byteSize) throw new StorageError('ASSET_INVALID', '添付bytesとメタデータのサイズが一致しません。', metadata.assetPath);
      if (requireAll && !asset) throw new StorageError('ASSET_MISSING', '完全復元に必要な添付bytesがありません。', metadata.assetPath);
    }
  }

  async saveProject(input: ProjectData, options: SaveOptions): Promise<SaveResult> {
    const started = performance.now();
    let mark = started;
    const milliseconds: SaveMetrics['milliseconds'] = { prepare: 0, hash: 0, read: 0, reconcile: 0, validate: 0, diff: 0, database: 0, total: 0 };
    const measure = (stage: keyof SaveMetrics['milliseconds']) => { const time = performance.now(); milliseconds[stage] += time - mark; mark = time; };
    try {
      checkCancelled(options.signal);
      const draft = projectCopy(input), operationId = options.operationId ?? newId(), now = new Date().toISOString();
      const assets = await this.checkedAssets(options.assets);
      measure('prepare');
      const duplicate = await this.db.commands.get(operationId);
      const editingHistory = this.editingHistories.get(draft.history);
      if (editingHistory && (editingHistory.projectId !== draft.projectId || editingHistory.revision !== draft.revision)) throw new StorageError('OPERATION_CONFLICT', '履歴の読込元と編集中の作品・版が一致しません。');
      const cachedBefore = this.cachedProjects.get(draft.projectId);
      const currentHeader = await this.db.projects.get(draft.projectId);
      if (currentHeader && (cachedBefore?.revision !== currentHeader.revision || !sameJson(this.cachedHistoryIds.get(draft.projectId), currentHeader.historyIds) || !editingHistory && !this.completeHistories.has(draft.projectId))) {
        if (editingHistory) await this.getProjectForEditing(draft.projectId); else await this.getProject(draft.projectId);
      }
      const previous = currentHeader ? this.cachedProjects.get(draft.projectId) : undefined;
      const knownWorlds = await this.validationWorlds();
      const pinnedWorlds = options.worldPin ? await prepareWorldPin(draft, options.worldPin, knownWorlds) : {};
      const worlds = { ...knownWorlds, ...pinnedWorlds }, worldContents = worldSnapshotContents(worlds);
      measure('read');
      if (!duplicate && (previous && previous.revision !== draft.revision || !previous && draft.revision !== '0')) throw new StorageError('REVISION_CONFLICT', '別の編集が先に保存されています。現在版を読み直して変更を比較してください。', draft.projectId);
      const previousHistoryIds = currentHeader?.historyIds ?? [];
      const expectedHistoryIds = duplicate ? previousHistoryIds.slice(0, previousHistoryIds.indexOf(operationId)) : previousHistoryIds;
      const suppliedHistoryIds = editingHistory?.historyIds ?? draft.history.map(command => command.operationId);
      const expectedHistory = duplicate ? previous?.history.slice(0, previous.history.findIndex(command => command.operationId === operationId)) ?? [] : previous?.history ?? [];
      if (!sameJson(expectedHistoryIds, suppliedHistoryIds) || !editingHistory && (expectedHistory.length !== draft.history.length || expectedHistory.some((command, index) => !sameJson(command, draft.history[index])))) throw new StorageError('OPERATION_CONFLICT', '履歴は保存コマンドからのみ追加できます。');
      const requestHash = await sha256(jsonBytes({ draft: duplicate && !duplicate.requestHashVersion ? draft : withoutHistory(draft), ...(duplicate && !duplicate.requestHashVersion ? {} : { historyIds: suppliedHistoryIds }), reason: options.reason, assets: (options.assets ?? []).map(asset => ({ contentHash: asset.contentHash, mediaType: asset.mediaType, path: asset.assetPath ?? null })), compensatesOperationId: options.compensatesOperationId ?? null, ...(options.worldPin ? { worldPins: pinnedWorlds } : {}) }));
      measure('hash');
      if (duplicate) return this.duplicateResult(duplicate, requestHash, draft.projectId);
      if (!previous && draft.history.length) throw new StorageError('OPERATION_CONFLICT', '既存履歴の復元には専用読み込みを使用してください。');
      if (!ID_PATTERN.test(operationId) || options.compensatesOperationId && !ID_PATTERN.test(options.compensatesOperationId)) throw new StorageError('VALIDATION_FAILED', '操作IDは安定したUUIDで指定してください。');
      if (typeof options.reason !== 'string' || !options.reason.trim() || new TextEncoder().encode(options.reason).byteLength > 1024 * 1024) throw new StorageError('VALIDATION_FAILED', '変更の理由を1 MiB以内で指定してください。');
      if (previous) verifyAlternativeApplicationInput(previous, draft);
      let candidate = { ...draft, entities: normalizeRecords(previous?.entities ?? [], draft.entities, operationId, now), relations: normalizeRecords(previous?.relations ?? [], draft.relations, operationId, now), revision: increment(draft.revision) };
      if (previous) {
        protectSnapshots(previous, candidate);
        await preserveAlternativeHistory(previous, candidate);
        const snapshots = new Map(previous.snapshots.map(snapshot => [snapshot.id, snapshot]));
        candidate.snapshots = candidate.snapshots.map(snapshot => snapshots.get(snapshot.id) ?? snapshot);
        candidate = await reconcileDeliverables(previous, candidate);
        candidate.entities = normalizeRecords(previous.entities, candidate.entities, operationId, now);
      }
      if (new Set(candidate.snapshots.map(snapshot => snapshot.id)).size !== candidate.snapshots.length) throw new StorageError('VALIDATION_FAILED', '公開版IDが重複しています。');
      measure('reconcile');
      candidate = validatedCurrent(candidate, worldContents, previous, this.validationReferences);
      const oldSnapshots = new Set(previous?.snapshots.map(snapshot => snapshot.id) ?? []), addedSnapshots = candidate.snapshots.filter(snapshot => !oldSnapshots.has(snapshot.id));
      if (addedSnapshots.length) {
        // Snapshot contents are validated once; all IDs remain visible to pinned anchors.
        validated({ ...candidate, history: [] }, worldContents);
        await verifySnapshotHashes([{ ...candidate, history: [], snapshots: addedSnapshots }]);
      }
      verifyWorlds([{ ...candidate, history: [] }], worlds);
      measure('validate');
      const before = previous ? withoutHistory(previous) : blankBefore(draft), after = withoutHistory(candidate);
      const changes = await targetChanges(before, after, !previous);
      const command: CommandRecord = { operationId, projectId: candidate.projectId, baseRevision: draft.revision, revision: candidate.revision, targetIds: changes.map(change => change.targetId), reason: options.reason, createdAt: now, before, after, ...(options.compensatesOperationId ? { compensatesOperationId: options.compensatesOperationId } : {}) };
      freeze(command);
      candidate.history = freeze(editingHistory ? [] : [...(previous?.history ?? []), command]);
      await validateDurableIntegrity(candidate, worldContents, !editingHistory);
      const historyIds = [...previousHistoryIds, operationId];
      const parentOperationId = this.contentHeads.get(candidate.projectId);
      const checkpoint = !parentOperationId || previousHistoryIds.length % 64 === 0;
      const { before: _before, after: _after, ...metadata } = command;
      const storedCommand: StoredCommand = { operationId, projectId: candidate.projectId, revision: candidate.revision, requestHash, requestHashVersion: 2, delta: { metadata, ...(checkpoint ? { checkpoint: before } : { parentOperationId }), patch: contentDelta(before, after) } };
      let written: SaveMetrics['written'] = { entities: 0, relations: 0, blocks: 0, snapshots: 0, views: 0, commands: 1, outbox: 1 };
      measure('diff');
      const result = await this.db.transaction('rw', this.writeTables, async () => {
        checkCancelled(options.signal);
        const replay = await this.db.commands.get(operationId);
        if (replay) return this.duplicateResult(replay, requestHash, candidate.projectId);
        const header = await this.db.projects.get(candidate.projectId);
        if (previous ? !header || header.revision !== previous.revision : !!header) throw new StorageError('REVISION_CONFLICT', '保存中に現在版が変わりました。変更を比較して再試行してください。', candidate.projectId);
        if (Object.keys(pinnedWorlds).length || addedSnapshots.length) await this.guardWorldRegistry([candidate, ...Object.values(pinnedWorlds)]);
        for (const [id, world] of Object.entries(pinnedWorlds)) {
          const existingWorld = await this.db.worlds.get(id);
          const existingSnapshot = existingWorld?.project.snapshots.find(snapshot => snapshot.id === id);
          if (existingWorld && !sameJson(existingSnapshot, world.snapshots[0])) throw new StorageError('IMMUTABLE_SNAPSHOT', '保存中に共通世界の固定版が変わりました。', id);
          await this.writeAssets([], world, false);
          if (!existingWorld) await this.db.worlds.add({ id, project: world });
        }
        await this.writeAssets(assets, candidate, false);
        written = await this.writeContent(candidate, previous, operationId, historyIds);
        this.faultInjector?.('after-content');
        await this.db.commands.add(storedCommand);
        this.faultInjector?.('after-history');
        const metadata = await this.db.syncMetadata.get(candidate.projectId);
        await this.db.outbox.add({ operationId, projectId: candidate.projectId, accountId: this.accountId, baseRevision: metadata?.serverRevision ?? '0', localRevision: candidate.revision, createdAt: now, targetIds: command.targetIds, changes: changes.map(({ before, after, ...change }) => ({ ...change, ...(before === null ? { before: null } : {}), ...(after === null ? { after: null } : {}) })), commandOperationId: operationId });
        await this.db.syncMetadata.put({ projectId: candidate.projectId, serverRevision: metadata?.serverRevision ?? '0', state: 'pending' });
        this.faultInjector?.('after-outbox');
        checkCancelled(options.signal); this.faultInjector?.('before-commit');
        return { project: candidate, operationId, localSaved: true as const, pendingSync: true as const };
      });
      measure('database'); milliseconds.total = performance.now() - started;
      if (result.project === candidate) this.rememberProject(candidate, operationId, historyIds);
      try { this.onSaveMetrics?.({ operationId, projectId: candidate.projectId, milliseconds, written, historyRead: previous === cachedBefore ? 0 : previous?.history.length ?? 0 }); } catch { /* Diagnostics never change a committed save's result. */ }
      if (editingHistory && options.includeHistory === true) {
        const rows = await this.db.commands.bulkGet(historyIds), byId = new Map(rows.filter((row): row is StoredCommand => !!row).map(row => [row.operationId, row])), ready = new Map<string, CommandRecord>();
        if (rows.some(row => !row)) throw new StorageError('SAVE_FAILED', '保存した対象版の履歴を読み込めません。');
        const history: CommandRecord[] = []; for (const row of rows) history.push(await this.materializeCommand(row!, byId, ready));
        return { ...result, project: { ...projectCopy(result.project), history } };
      }
      return { ...result, project: editingHistory || options.includeHistory === false ? this.editingCopy(result.project, result.project === candidate ? historyIds : result.project.history.map(command => command.operationId)) : projectCopy(result.project) };
    } catch (error) { throw saveError(error); }
  }

  private async duplicateResult(command: StoredCommand, hash: string, projectId: string): Promise<SaveResult> {
    if (command.projectId !== projectId || command.requestHash !== hash) throw new StorageError('OPERATION_CONFLICT', '同じ操作IDが異なる変更に使われています。', command.operationId);
    const project = await this.getProject(projectId);
    if (!project) throw new StorageError('NOT_FOUND', '作品が見つかりません。', projectId);
    const record = project.history.find(record => record.operationId === command.operationId) ?? await this.materializeCommand(command);
    return { project: { ...copy(record.after), history: project.history.filter(record => BigInt(record.revision) <= BigInt(command.revision)) }, operationId: command.operationId, localSaved: true, pendingSync: !!(await this.db.outbox.get(command.operationId)) };
  }

  async undo(projectId: string, operationId?: string): Promise<SaveResult> {
    const current = await this.getProject(projectId);
    if (!current) throw new StorageError('NOT_FOUND', '作品が見つかりません。', projectId);
    const command = operationId ? current.history.find(record => record.operationId === operationId) : current.history.at(-1);
    if (!command) throw new StorageError('NOT_FOUND', '取り消せる履歴がありません。');
    const next = compensate(current, command);
    return this.saveProject(next, { reason: `取り消し: ${command.reason}`, compensatesOperationId: command.operationId });
  }

  async previewRestoreEntity(projectId: string, historyOperationId: string, entityId: string, side: 'before' | 'after' = 'after') {
    const current = await this.getProjectForEditing(projectId);
    const command = await this.historyCommand(projectId, historyOperationId), source = command[side].entities.find(entity => entity.id === entityId);
    if (!current || !command || !source) throw new StorageError('NOT_FOUND', '指定した版の情報が見つかりません。', entityId);
    const referrers = current.entities.filter(entity => entity.id !== entityId && collectReferences(entity).some(reference => reference.id === entityId)).map(entity => entity.id);
    return { project: current, source: copy(source), referrers, warnings: referrers.length ? [`${referrers.length}件の参照があります。翻訳・音声・媒体版は内容の変更に応じて確認待ちになります。`] : [] };
  }
  async restoreEntity(projectId: string, historyOperationId: string, entityId: string, side: 'before' | 'after' = 'after', expectedRevision?: string): Promise<SaveResult> {
    const preview = await this.previewRestoreEntity(projectId, historyOperationId, entityId, side);
    const project = preview.project;
    if (expectedRevision !== undefined && project.revision !== expectedRevision) throw new StorageError('REVISION_CONFLICT', '復元の影響確認後に作品が更新されました。選択を保持して再確認してください。');
    const existing = project.entities.find(entity => entity.id === entityId);
    project.entities = project.entities.some(entity => entity.id === entityId) ? project.entities.map(entity => entity.id === entityId ? preview.source : entity) : [...project.entities, preview.source];
    if (existing) {
      project.entities = remapEditedTextReferences(project.entities, existing, preview.source);
      project.relations = remapEditedTextRelationReferences(project.relations, existing, preview.source);
    }
    return this.saveProject(project, { reason: `履歴から単体復元: ${preview.source.name}`, compensatesOperationId: historyOperationId, includeHistory: true });
  }
  async restoreRelation(projectId: string, historyOperationId: string, relationId: string, side: 'before' | 'after' = 'after', expectedRevision?: string): Promise<SaveResult> {
    const current = await this.getProjectForEditing(projectId), command = await this.historyCommand(projectId, historyOperationId);
    const source = command?.[side].relations.find(item => item.id === relationId);
    if (!current || !source) throw new StorageError('NOT_FOUND', '指定した版の関係が見つかりません。', relationId);
    if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new StorageError('REVISION_CONFLICT', '復元の影響確認後に作品が更新されました。選択を保持して再確認してください。');
    current.relations = current.relations.some(item => item.id === relationId) ? current.relations.map(item => item.id === relationId ? copy(source) : item) : [...current.relations, copy(source)];
    return this.saveProject(current, { reason: '履歴から関係を単体復元', compensatesOperationId: historyOperationId, includeHistory: true });
  }
  async previewRestoreVersion(projectId: string, historyOperationId: string, side: 'before' | 'after' = 'after') {
    const current = await this.getProjectForEditing(projectId), command = await this.historyCommand(projectId, historyOperationId);
    if (!current) throw new StorageError('NOT_FOUND', '復元先の作品が見つかりません。');
    const source = command[side], candidate = preservePublishedVersions({ ...copy(source), revision: current.revision, history: current.history }, current);
    const changes = await targetChanges(withoutHistory(current), withoutHistory(candidate));
    const payload = { projectId, historyOperationId, side, baseRevision: current.revision, sourceRevision: source.revision, changes: changes.map(change => ({ id: change.targetId, fields: change.fields.map(field => field.field) })) };
    return { ...payload, confirmationHash: await sha256(jsonBytes(payload)) };
  }
  async restoreHistoryVersion(projectId: string, approved: Awaited<ReturnType<ScenarioStore['previewRestoreVersion']>>): Promise<SaveResult> {
    const request = copy(approved), preview = await this.previewRestoreVersion(projectId, request.historyOperationId, request.side);
    const { confirmationHash, ...payload } = request;
    if (await sha256(jsonBytes(payload)) !== confirmationHash || projectId !== request.projectId || preview.baseRevision !== request.baseRevision || preview.confirmationHash !== request.confirmationHash) throw new StorageError('REVISION_CONFLICT', '作品全体の復元差分が変わりました。対象操作と差分を再確認してください。');
    const current = await this.getProjectForEditing(projectId), command = await this.historyCommand(projectId, request.historyOperationId);
    if (!current || current.revision !== request.baseRevision) throw new StorageError('REVISION_CONFLICT', '復元の確定前に作品が更新されました。');
    const next = preservePublishedVersions({ ...copy(command[request.side]), revision: current.revision, history: current.history }, current);
    return this.saveProject(next, { reason: `作品全体を操作 ${request.historyOperationId} の${request.side === 'before' ? '変更前' : '変更後'}（版 ${request.sourceRevision}）へ復元`, compensatesOperationId: request.historyOperationId, includeHistory: true });
  }

  async restoreRevision(projectId: string, revision: string): Promise<SaveResult> {
    const [current, historical] = await Promise.all([this.getProject(projectId), this.getProjectAtRevision(projectId, revision)]);
    if (!current || !historical) throw new StorageError('NOT_FOUND', '復元する版が見つかりません。');
    const next = preservePublishedVersions({ ...historical, revision: current.revision, history: current.history }, current);
    return this.saveProject(next, { reason: `作品全体をrevision ${revision}から復元` });
  }

  async putAsset(contentHash: string, bytes: Uint8Array, mediaType = 'application/octet-stream'): Promise<void> {
    const records = await this.checkedAssets([{ contentHash, bytes, mediaType }]);
    try { await this.db.transaction('rw', this.db.assets, async () => {
      const existing = await this.db.assets.get(contentHash);
      if (existing && !equalBytes(existing.bytes, records[0].bytes)) throw new StorageError('HASH_MISMATCH', '既存hashの素材bytesが異なります。');
      await this.db.assets.put(records[0]);
    }); } catch (error) { throw saveError(error); }
  }
  async getAsset(contentHash: string): Promise<Uint8Array | undefined> { const asset = await this.db.assets.get(contentHash); return asset?.bytes.slice(); }
  async availableAssetHashes(): Promise<Set<string>> { return new Set(await this.db.assets.toCollection().primaryKeys()); }
  private async materializeOutbox(rows: StoredOutbox[], commands: Map<string, StoredCommand>): Promise<OutboxRecord[]> {
    rows = [...rows].sort((left, right) => BigInt(left.localRevision) < BigInt(right.localRevision) ? -1 : BigInt(left.localRevision) > BigInt(right.localRevision) ? 1 : left.createdAt.localeCompare(right.createdAt));
    const ready = new Map<string, CommandRecord>(), result: OutboxRecord[] = [];
    for (const row of rows) {
      const stored = row.commandOperationId ? commands.get(row.commandOperationId) : undefined;
      const command = row.command ?? (stored ? await this.materializeCommand(stored, commands, ready, new Set(), false) : undefined);
      if (!command || command.projectId !== row.projectId) throw new StorageError('SAVE_FAILED', '送信待ちに必要な履歴が不足しています。', row.operationId);
      const before = new Map<string, TargetRecord>([...command.before.entities, ...command.before.relations, headerTarget(command.before)].map(record => [record.id, record]));
      const after = new Map<string, TargetRecord>([...command.after.entities, ...command.after.relations, headerTarget(command.after)].map(record => [record.id, record]));
      const { commandOperationId: _commandOperationId, ...metadata } = row;
      result.push({ ...metadata, command, changes: row.changes.map(change => ({ ...change, before: Object.hasOwn(change, 'before') ? change.before! : before.get(change.targetId) ?? null, after: Object.hasOwn(change, 'after') ? change.after! : after.get(change.targetId) ?? null })) });
    }
    return result;
  }
  async listOutbox(projectId: string): Promise<OutboxRecord[]> {
    const captured = await this.db.transaction('r', ['outbox', 'commands'], async () => ({ rows: await this.db.outbox.where('projectId').equals(projectId).toArray(), commands: await this.db.commands.where('projectId').equals(projectId).toArray() }));
    return this.materializeOutbox(captured.rows, new Map(captured.commands.map(row => [row.operationId, row])));
  }
  async getSaveState(projectId: string): Promise<{ localSaved: boolean; pendingCount: number; recoveredPendingCount: number; serverRevision: string; syncState: 'pending' | 'synced' | 'conflict' }> {
    return this.db.transaction('r', ['projects', 'outbox', 'syncMetadata', 'recoveredPending'], async () => {
      const [project, metadata, pendingCount, recoveredPendingCount] = await Promise.all([this.db.projects.get(projectId), this.db.syncMetadata.get(projectId), this.db.outbox.where('projectId').equals(projectId).count(), this.db.recoveredPending.where('projectId').equals(projectId).count()]);
      return { localSaved: !!project, pendingCount, recoveredPendingCount, serverRevision: metadata?.serverRevision ?? '0', syncState: metadata?.state ?? 'pending' };
    });
  }
  async listRecoveredPending(projectId: string): Promise<RecoveredPendingIntent[]> { return copy((await this.db.recoveredPending.where('projectId').equals(projectId).toArray()).sort((a, b) => a.sequence - b.sequence)); }

  /** An acknowledgement is persisted before an applied operation is removed. Conflicts retain the outbox. */
  async commitAck(projectId: string, ack: PersistedAck): Promise<void> {
    if (ack.projectId !== projectId || !/^(?:0|[1-9]\d*)$/.test(ack.serverRevision) || !['applied', 'conflict'].includes(ack.status)) throw new StorageError('VALIDATION_FAILED', '同期ackの作品・revision・結果が不正です。');
    try { await this.db.transaction('rw', ['outbox', 'acks', 'syncMetadata'], async () => {
      const previous = await this.db.acks.get(ack.operationId);
      if (previous) {
        if (!equalJson(previous, ack)) throw new StorageError('OPERATION_CONFLICT', '同じ操作に異なるackが届きました。');
        return;
      }
      const pending = await this.db.outbox.get(ack.operationId), metadata = await this.db.syncMetadata.get(projectId);
      if (!pending || pending.projectId !== projectId || pending.accountId !== this.accountId) throw new StorageError('NOT_FOUND', 'この領域の送信待ち操作が見つかりません。');
      if (metadata && BigInt(ack.serverRevision) < BigInt(metadata.serverRevision)) throw new StorageError('REVISION_CONFLICT', '古いサーバーrevisionのackです。');
      await this.db.acks.add(copy(ack));
      if (ack.status === 'applied') await this.db.outbox.delete(ack.operationId);
      const pendingCount = await this.db.outbox.where('projectId').equals(projectId).count();
      await this.db.syncMetadata.put({ projectId, serverRevision: ack.serverRevision, state: ack.status === 'conflict' ? 'conflict' : pendingCount ? 'pending' : 'synced' });
    }); } catch (error) { throw saveError(error); }
  }

  async getViewState(projectId: string, userId: string, deviceClass: ViewState['deviceClass'], viewId: string): Promise<ViewState | undefined> {
    const stored = await this.db.viewStates.get(canonicalJson([projectId, userId, deviceClass, viewId]));
    if (!stored) return undefined;
    const { key: _key, projectId: _projectId, ...view } = stored; return view;
  }
  async saveViewState(projectId: string, state: ViewState): Promise<void> {
    await this.db.viewStates.put({ ...copy(state), projectId, key: canonicalJson([projectId, state.userId, state.deviceClass, state.viewId]) });
  }

  async createRestorePoint(projectId: string, reason: string): Promise<RestorePoint> {
    return this.db.transaction('rw', this.writeTables, async () => {
      const read = await this.readProject(projectId), project = read?.project;
      if (!project) throw new StorageError('NOT_FOUND', '復元点を作る作品が見つかりません。');
      await this.writeAssets([], project, true);
      const point = { id: newId(), projectId, createdAt: new Date().toISOString(), reason, project, assetHashes: attachmentMetadata(project).map(item => item.contentHash) };
      await this.db.restorePoints.add(point); return point;
    });
  }
  async listRestorePoints(projectId: string): Promise<RestorePoint[]> { return this.db.restorePoints.where('projectId').equals(projectId).reverse().toArray(); }
  async restorePointPage(projectId: string, page = 0, size = 30) {
    size = Math.max(1, Math.min(60, Number.isSafeInteger(size) ? size : 30));
    const total = await this.db.restorePoints.where('projectId').equals(projectId).count(), maximum = Math.max(0, Math.ceil(total / size) - 1);
    page = Math.max(0, Math.min(maximum, Number.isSafeInteger(page) ? page : 0));
    const rows = await this.db.restorePoints.where('projectId').equals(projectId).offset(page * size).limit(size).toArray();
    return { entries: rows.map(({ id, createdAt, reason, project, assetHashes }) => ({ id, createdAt, reason, revision: project.revision, assetCount: assetHashes.length })), total, page, maximum, size };
  }
  async previewRestorePoint(projectId: string, restorePointId: string) {
    const [point, current] = await Promise.all([this.db.restorePoints.get(restorePointId), this.getProjectForEditing(projectId)]);
    if (!point || point.projectId !== projectId || !current) throw new StorageError('NOT_FOUND', 'この作品の復元点が見つかりません。');
    const candidate = preservePublishedVersions({ ...copy(point.project), revision: current.revision, history: current.history }, current), changes = await targetChanges(withoutHistory(current), withoutHistory(candidate));
    const payload = { projectId, restorePointId, baseRevision: current.revision, sourceRevision: point.project.revision, pointHash: await sha256(jsonBytes(point.project)), changes: changes.map(change => ({ id: change.targetId, fields: change.fields.map(field => field.field) })) };
    return { ...payload, confirmationHash: await sha256(jsonBytes(payload)) };
  }
  async restorePoint(projectId: string, restorePointId: string, approved?: Awaited<ReturnType<ScenarioStore['previewRestorePoint']>>): Promise<SaveResult> {
    if (approved) {
      const { confirmationHash, ...payload } = copy(approved), fresh = await this.previewRestorePoint(projectId, restorePointId);
      if (payload.projectId !== projectId || payload.restorePointId !== restorePointId || await sha256(jsonBytes(payload)) !== confirmationHash || fresh.confirmationHash !== confirmationHash) throw new StorageError('REVISION_CONFLICT', '復元点の影響確認後に作品または差分が更新されました。選択を保持して再確認してください。');
    }
    const [point, current] = await Promise.all([this.db.restorePoints.get(restorePointId), this.getProject(projectId)]);
    if (!point || point.projectId !== projectId || !current) throw new StorageError('NOT_FOUND', 'この作品の復元点が見つかりません。');
    if (approved && current.revision !== approved.baseRevision) throw new StorageError('REVISION_CONFLICT', '復元点の確定前に作品が更新されました。');
    const next = preservePublishedVersions({ ...copy(point.project), revision: current.revision, history: current.history }, current);
    return this.saveProject(next, { reason: `復元点から作品全体を復元: ${point.reason}` });
  }
  async migrateProject(projectId: string, transform: (project: ProjectData) => ProjectData | Promise<ProjectData>): Promise<SaveResult> {
    const point = await this.createRestorePoint(projectId, '形式移行前の復元点');
    const worlds = await this.validationWorlds();
    const migrated = validated(await transform(copy(point.project)), worldSnapshotContents(worlds));
    if (migrated.projectId !== projectId) throw new StorageError('VALIDATION_FAILED', '移行で作品IDを変更できません。');
    migrated.revision = point.project.revision; migrated.history = point.project.history;
    return this.saveProject(migrated, { reason: '検証済みの形式移行' });
  }

  async exportProject(projectId: string, options: Omit<NonNullable<Parameters<typeof exportScenario>[1]>, 'loadAsset' | 'worlds' | 'recovery'> = {}): Promise<Uint8Array> {
    // Content, all history and pending intents come from one database read image.
    checkCancelled(options.signal);
    const captured = await this.db.transaction('r', this.writeTables, async () => ({ current: await this.readProject(projectId, false), commands: await this.db.commands.where('projectId').equals(projectId).toArray(), rows: await this.db.outbox.where('projectId').equals(projectId).toArray(), retained: await this.listRecoveredPending(projectId), metadata: await this.db.syncMetadata.get(projectId), registry: await this.validationWorlds() }));
    checkCancelled(options.signal);
    if (!captured.current) throw new StorageError('NOT_FOUND', '書き出す作品が見つかりません。');
    const commandRows = new Map(captured.commands.map(row => [row.operationId, row])), ready = new Map<string, CommandRecord>(), history: CommandRecord[] = [];
    for (const id of captured.current.historyIds) {
      checkCancelled(options.signal); const row = commandRows.get(id);
      if (!row) throw new StorageError('SAVE_FAILED', '完全保存に必要な履歴が不足しています。', id);
      history.push(await this.materializeCommand(row, commandRows, ready, new Set(), false));
    }
    const content = { ...captured.current.project, history }, capturedPending = await this.materializeOutbox(captured.rows, commandRows);
    const selected = options.snapshotId ? content.snapshots.find(snapshot => snapshot.id === options.snapshotId) : undefined;
    if (options.snapshotId && !selected) throw new StorageError('NOT_FOUND', '書き出す固定版が見つかりません。');
    const project = selected ? { ...copy(selected.content), snapshots: content.snapshots, history: content.history.filter(command => BigInt(command.revision) <= BigInt(selected.content.revision)) } : content;
    const pending = options.snapshotId ? [] : capturedPending, retained = options.snapshotId ? [] : captured.retained;
    const operations = new Map(retained.map(row => [row.operation.operationId, row.operation]));
    for (const row of pending) {
      const commandHash = await sha256(jsonBytes(row.command)), previous = operations.get(row.operationId);
      if (previous && previous.commandHash !== commandHash) throw new StorageError('OPERATION_CONFLICT', '復元した送信待ちと現在の送信待ちが同じIDで異なります。');
      operations.set(row.operationId, { operationId: row.operationId, command: row.command, commandHash, origin: { projectId, operationId: row.operationId, serverRevision: row.baseRevision } });
    }
    const recovery = operations.size ? { version: 1 as const, projectId, sourceRevision: project.revision, serverRevision: captured.metadata?.serverRevision ?? '0', pending: [...operations.values()] } : undefined;
    const worlds: Record<string, ProjectData> = {};
    let discovered = [project, ...recoveryImages(recovery)];
    while (discovered.length) {
      const next: ProjectData[] = [];
      for (const reference of referencedWorlds(discovered,captured.registry)) {
        if (worlds[reference.immutableSnapshotId]) continue;
        const world = captured.registry[reference.immutableSnapshotId];
        if (world) { worlds[reference.immutableSnapshotId] = world; next.push(world); }
      }
      discovered = next;
    }
    return exportScenario(project, { ...options, ...(recovery ? { recovery } : {}), worlds, loadAsset: hash => this.getAsset(hash) });
  }

  async previewImport(preparedInput: PreparedScenario, optionsInput: ImportOptions): Promise<ImportPreview> {
    const prepared = copy(preparedInput), options = { ...optionsInput, idMap: optionsInput.idMap ? copy(optionsInput.idMap) : undefined, resolutions: optionsInput.resolutions ? copy(optionsInput.resolutions) : undefined };
    const incoming = prepared.project, targetId = options.targetProjectId ?? incoming.projectId, target = await this.getProject(targetId);
    const pendingChanges = target ? (await this.listOutbox(targetId)).length : 0;
    if (options.mode === 'new') return { conflicts: target ? [{ id: targetId, kind: 'project', existing: target, incoming }] : [], pendingChanges, target, additions: incoming.entities.length + incoming.relations.length };
    if (options.mode === 'clone') return { conflicts: [], pendingChanges: 0, additions: incoming.entities.length + incoming.relations.length };
    if (!target) throw new StorageError('NOT_FOUND', '置換・統合する既存作品が見つかりません。', targetId);
    if (options.mode === 'mapped_merge') {
      if (!options.idMap) throw new StorageError('IMPORT_CONFLICT', '別作品の統合には全IDの明示対応表が必要です。');
      const mappedPlan = await planCrossProjectImport({ ...prepared, project: projectWithRecoveryHistory(prepared.project, prepared.recovery) }, target, { idMap: options.idMap, resolutions: options.resolutions, knownWorlds: await this.validationWorlds(prepared.worlds), loadAsset: hash => this.getAsset(hash), signal: options.signal });
      const mappedRecovery = prepared.recovery ? await mappedPortableRecovery(prepared.recovery, mappedPlan.mappedProject, mappedPlan.idMap) : undefined;
      const historyIds = new Set(prepared.project.history.map(command => mappedPlan.idMap[command.operationId]));
      mappedPlan.mappedProject.history = mappedPlan.mappedProject.history.filter(command => historyIds.has(command.operationId));
      const confirmationHash = await sha256(jsonBytes({ sourceContentHash: mappedPlan.sourceContentHash, manifest: prepared.manifest, targetId, targetRevision: target.revision, idMap: mappedPlan.idMap, resolutions: options.resolutions ?? {}, changes: mappedPlan.changes, assets: mappedPlan.assets }));
      return { conflicts: mappedPlan.conflicts, pendingChanges, target, additions: mappedPlan.changes.filter(change => change.action === 'add').length, mappedPlan, mappedRecovery, confirmationHash };
    }
    if (targetId !== incoming.projectId) throw new StorageError('IMPORT_CONFLICT', '置換・統合は同じprojectIdが必要です。別の作品には複製して追加してください。', targetId);
    const conflicts = mergeConflicts(target, incoming);
    const ids = new Set([...target.entities, ...target.relations].map(item => item.id));
    return { conflicts, pendingChanges, target, additions: [...incoming.entities, ...incoming.relations].filter(item => !ids.has(item.id)).length };
  }

  async saveImportDraft(draft: ImportDraft): Promise<void> {
    if (!draft.key || draft.bytes && draft.bytes.byteLength > 64 * 1024 * 1024) throw new StorageError('LIMIT_EXCEEDED', '復元入力の一時保存上限を超えています。');
    const submitted = copy(draft);
    if (submitted.bytes && await sha256(submitted.bytes) !== submitted.sourceHash) throw new StorageError('HASH_MISMATCH', '復元入力の元ファイルが変わっています。');
    try { await this.db.transaction('rw', this.db.importDrafts, async () => {
      const previous = await this.db.importDrafts.get(submitted.key);
      if (!submitted.bytes && previous && previous.sourceHash === submitted.sourceHash) submitted.bytes = previous.bytes;
      await this.db.importDrafts.put(submitted);
    }); } catch (cause) { throw saveError(cause); }
  }
  async getImportDraft(key: string): Promise<ImportDraft | undefined> { const draft = await this.db.importDrafts.get(key); return draft ? copy(draft) : undefined; }
  async clearImportDraft(key: string): Promise<void> { await this.db.importDrafts.delete(key); }

  async saveAuthorToolDraft(draft: AuthorToolDraft): Promise<void> {
    const submitted = copy(draft);
    if (!submitted.key || !ID_PATTERN.test(submitted.projectId) || !/^\d+$/.test(submitted.baseRevision) || jsonBytes(submitted.fields).byteLength > 1024 * 1024 || submitted.asset && submitted.asset.bytes.byteLength > 32 * 1024 * 1024) throw new StorageError('LIMIT_EXCEEDED', '制作入力の一時保存上限または作品識別が不正です。');
    if (submitted.asset && await sha256(submitted.asset.bytes) !== submitted.asset.contentHash) throw new StorageError('HASH_MISMATCH', '制作入力の素材bytesが変わっています。');
    try { await this.db.authorToolDrafts.put(submitted); } catch (cause) { throw saveError(cause); }
  }
  async getAuthorToolDraft(key: string): Promise<AuthorToolDraft | undefined> { const draft = await this.db.authorToolDrafts.get(key); return draft ? copy(draft) : undefined; }
  async clearAuthorToolDraft(key: string): Promise<void> { await this.db.authorToolDrafts.delete(key); }

  async importScenario(preparedInput: PreparedScenario, optionsInput: ImportOptions): Promise<ImportResult> {
    const options = { ...optionsInput, idMap: optionsInput.idMap ? copy(optionsInput.idMap) : undefined, resolutions: optionsInput.resolutions ? copy(optionsInput.resolutions) : undefined };
    try {
      checkCancelled(options.signal);
      if (!['new', 'clone', 'replace', 'merge', 'mapped_merge'].includes(options.mode)) throw new StorageError('FORMAT_UNSUPPORTED', '読み込みモードが未対応です。');
      const prepared = copy(preparedInput), operationId = options.operationId ?? newId();
      const knownWorlds = await this.validationWorlds(prepared.worlds), worldContents = worldSnapshotContents(knownWorlds);
      prepared.project = validated(prepared.project, worldContents);
      if (prepared.recovery) prepared.recovery = await validateRecovery(prepared.recovery, prepared.project, worldContents, options.signal);
      verifyWorlds([prepared.project, ...Object.values(prepared.worlds)], knownWorlds);
      if (prepared.manifest.projectId !== prepared.project.projectId) throw new StorageError('VALIDATION_FAILED', '読み込み候補とmanifestの作品IDが一致しません。');
      const preview = await this.previewImport(prepared, options);
      if (options.mode === 'new' && preview.target) throw new StorageError('IMPORT_CONFLICT', '同じ作品IDが既にあります。複製・置換・統合を選んでください。');
      if (options.mode === 'replace' && preview.pendingChanges) throw new StorageError('PENDING_CHANGES', '未送信の変更があります。同期・競合解決を済ませるか、複製して復元してください。');
      if (preview.target && options.baseRevision !== preview.target.revision) throw new StorageError('REVISION_CONFLICT', '確認した対象版と現在版が一致しません。読み込みの影響を確認し直してください。');
      let project = prepared.project, recovery = prepared.recovery, idMap: Record<string, string> | undefined;
      if (options.mode === 'mapped_merge') {
        if (!preview.mappedPlan?.candidate || preview.mappedPlan.unresolved.length) throw new StorageError('IMPORT_CONFLICT', '全IDの対応とすべての採用差分を確認してください。');
        if (!options.confirmationHash || options.confirmationHash !== preview.confirmationHash) throw new StorageError('REVISION_CONFLICT', '確認したID対応・採用差分・素材が変わりました。入力を保持して再確認してください。');
        project = preview.mappedPlan.candidate; idMap = preview.mappedPlan.idMap;
        recovery = preview.mappedRecovery;
      }
      if (options.mode === 'clone') {
        const cloned = await cloneProject(projectWithRecoveryHistory(project, recovery)); idMap = cloned.idMap;
        recovery = recovery ? await mappedPortableRecovery(recovery, cloned.project, idMap) : undefined;
        const historyIds = new Set(project.history.map(command => idMap![command.operationId]));
        project = { ...cloned.project, history: cloned.project.history.filter(command => historyIds.has(command.operationId)) };
      }
      if (options.mode === 'merge') project = mergeProjects(preview.target!, project, options.resolutions ?? {});
      if (options.mode === 'replace') {
        const snapshots = new Map(project.snapshots.map(item => [item.id, item]));
        for (const existing of preview.target!.snapshots) {
          const incoming = snapshots.get(existing.id);
          if (incoming && !equalJson(existing, incoming)) throw new StorageError('IMMUTABLE_SNAPSHOT', '同じsnapshot IDに異なる内容があります。', existing.id);
          snapshots.set(existing.id, existing);
        }
        project.snapshots = [...snapshots.values()];
        const ids = new Set(project.entities.map(entity => entity.id));
        project.entities.push(...preview.target!.entities.filter(entity => entity.kind === 'snapshot' && !ids.has(entity.id)));
      }
      const assetInputs = prepared.assets.map(asset => ({ contentHash: asset.contentHash, bytes: asset.bytes, mediaType: asset.mediaType, assetPath: asset.path }));
      const assets = await this.checkedAssets(assetInputs);
      await verifySnapshotHashes([project]);
      await validateDurableIntegrity(project, worldContents);
      const worlds = Object.entries(prepared.worlds).map(([id, world]) => ({ id, project: validated(world, worldContents) }));
      const now = new Date().toISOString(), before = preview.target ? withoutHistory(preview.target) : blankBefore(project);
      let command: CommandRecord;
      if (preview.target) {
        project = { ...project, revision: increment(preview.target.revision), history: combineHistories(preview.target.history, (preview.mappedPlan?.mappedProject.history ?? prepared.project.history).map((record, index) => options.mode === 'mapped_merge' ? { ...record, importOrigin: record.importOrigin ?? { sourceProjectId: prepared.project.projectId, sourceOperationId: prepared.project.history[index].operationId, importOperationId: operationId } } : record)) };
        project.entities = normalizeRecords(preview.target.entities, project.entities, operationId, now);
        project.relations = normalizeRecords(preview.target.relations, project.relations, operationId, now);
        protectSnapshots(preview.target, project);
        project = await reconcileDeliverables(preview.target, project);
        project.entities = normalizeRecords(preview.target.entities, project.entities, operationId, now);
      } else if (options.mode === 'clone') {
        project = { ...project, revision: increment(project.revision) };
      }
      project = validated(project, worldContents);
      const changes = await targetChanges(before, withoutHistory(project), !preview.target);
      command = { operationId, projectId: project.projectId, baseRevision: preview.target?.revision ?? '0', revision: project.revision, targetIds: changes.map(change => change.targetId), createdAt: now, reason: `専用ファイルを${options.mode}で復元`, before: copy(before), after: copy(withoutHistory(project)), ...(idMap ? { idMap } : {}) };
      if (preview.target || options.mode === 'clone') project.history = [...project.history, command];
      if (recovery) {
        const history = new Map(project.history.map(record => [record.operationId, record]));
        const pending = await Promise.all(recovery.pending.map(async item => {
          const retainedCommand = history.get(item.operationId) ?? item.command;
          return { ...item, command: retainedCommand, commandHash: await sha256(jsonBytes(retainedCommand)) };
        }));
        recovery = { ...recovery, projectId: project.projectId, sourceRevision: project.revision, pending };
      }
      project = validated(project, worldContents);
      await validateDurableIntegrity(project, worldContents);
      if (recovery) recovery = await validateRecovery({ ...recovery, projectId: project.projectId, sourceRevision: project.revision }, project, worldContents, options.signal);
      // New recovery retains the original content revisions/history; the local import audit is separate.
      const point: RestorePoint | undefined = preview.target ? { id: newId(), projectId: preview.target.projectId, createdAt: now, reason: `専用ファイル${options.mode}の前の復元点`, project: preview.target, assetHashes: attachmentMetadata(preview.target).map(item => item.contentHash) } : undefined;
      const result = await this.db.transaction('rw', this.writeTables, async () => {
        checkCancelled(options.signal);
        if (await this.db.importLogs.get(operationId) || await this.db.outbox.get(operationId) || await this.db.commands.get(operationId)) throw new StorageError('OPERATION_CONFLICT', 'この読み込み操作IDは既に使われています。');
        const header = await this.db.projects.get(project.projectId);
        if (preview.target ? !header || header.revision !== preview.target.revision : !!header) throw new StorageError('REVISION_CONFLICT', '読み込みの確定前に対象作品が変わりました。');
        if (options.mode === 'replace' && await this.db.outbox.where('projectId').equals(project.projectId).count()) throw new StorageError('PENDING_CHANGES', '確定前に未送信の変更が増えました。');
        await this.guardWorldRegistry([project, ...worlds.map(world => world.project)]);
        if (point) { await this.writeAssets([], point.project, true); await this.db.restorePoints.add(point); }
        await this.writeAssets(assets, project, prepared.manifest.assetMode === 'embedded');
        for (const world of worlds) {
          const existing = await this.db.worlds.get(world.id);
          if (existing && !equalJson(existing.project, world.project)) throw new StorageError('IMMUTABLE_SNAPSHOT', '既存の共通世界snapshotと内容が異なります。', world.id);
          await this.db.worlds.put(world);
        }
        await this.writeContent(project, preview.target); this.faultInjector?.('after-content');
        for (const record of project.history) {
          const old = await this.db.commands.get(record.operationId);
          if (old && !sameJson(await this.materializeCommand(old), record)) throw new StorageError('OPERATION_CONFLICT', '読み込む履歴の操作IDが既存履歴と衝突しています。', record.operationId);
          if (!old) await this.db.commands.add({ operationId: record.operationId, projectId: project.projectId, revision: record.revision, record });
        }
        this.faultInjector?.('after-history');
        const metadata = await this.db.syncMetadata.get(project.projectId);
        await this.db.outbox.add({ operationId, projectId: project.projectId, accountId: this.accountId, baseRevision: metadata?.serverRevision ?? '0', localRevision: project.revision, createdAt: now, targetIds: command.targetIds, changes, command });
        let recoveredSequence = (await this.listRecoveredPending(project.projectId)).reduce((maximum, row) => Math.max(maximum, row.sequence), -1) + 1;
        for (const retained of recovery?.pending ?? []) {
          const row: RecoveredPendingIntent = { key: `${project.projectId}:${retained.operationId}`, projectId: project.projectId, importOperationId: operationId, sequence: recoveredSequence++, operation: retained, status: 'needs_reconnect' }, previous = await this.db.recoveredPending.get(row.key);
          if (previous && !equalJson(previous.operation, retained)) throw new StorageError('OPERATION_CONFLICT', '同じ送信待ち操作の復元内容が異なります。');
          if (!previous) await this.db.recoveredPending.add(row);
        }
        await this.db.syncMetadata.put({ projectId: project.projectId, serverRevision: metadata?.serverRevision ?? '0', state: 'pending' });
        await this.db.importLogs.add({ operationId, projectId: project.projectId, mode: options.mode, createdAt: now, ...(idMap ? { idMap } : {}) });
        this.faultInjector?.('after-outbox'); checkCancelled(options.signal); this.faultInjector?.('before-commit');
        return { project, operationId, localSaved: true as const, pendingSync: true as const, mode: options.mode, ...(idMap ? { idMap } : {}), ...(point ? { restorePointId: point.id } : {}), warnings: prepared.warnings };
      });
      this.invalidateProjectCache(project.projectId);
      return result;
    } catch (error) { throw saveError(error); }
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]); }

async function mappedPortableRecovery(recovery: PortableRecovery, mapped: ProjectData, idMap: Record<string, string>): Promise<PortableRecovery> {
  const pending = await Promise.all(recovery.pending.map(async item => {
    const operationId = idMap[item.operationId], command = mapped.history.find(record => record.operationId === operationId);
    if (!operationId || !command) throw new StorageError('IMPORT_CONFLICT', '復元する送信待ち操作の明示ID対応が不足しています。', item.operationId);
    return { operationId, command, commandHash: await sha256(jsonBytes(command)), origin: item.origin ?? { projectId: recovery.projectId, operationId: item.operationId, serverRevision: recovery.serverRevision } };
  }));
  return { ...recovery, projectId: mapped.projectId, sourceRevision: mapped.revision, pending };
}

function preservePublishedVersions(candidate: ProjectData, current: ProjectData): ProjectData {
  const snapshots = new Map(candidate.snapshots.map(item => [item.id, item]));
  for (const version of current.snapshots) snapshots.set(version.id, copy(version));
  candidate.snapshots = [...snapshots.values()];
  if (current.authorAlternatives) candidate.authorAlternatives = copy(current.authorAlternatives);
  const published = new Map(current.entities.filter(entity => entity.kind === 'snapshot').map(entity => [entity.id, entity]));
  candidate.entities = candidate.entities.map(entity => copy(published.get(entity.id) ?? entity));
  const ids = new Set(candidate.entities.map(entity => entity.id));
  for (const [id, entity] of published) if (!ids.has(id)) candidate.entities.push(copy(entity));
  return candidate;
}

function combineHistories(existing: CommandRecord[], incoming: CommandRecord[]): CommandRecord[] {
  const operations = new Map(existing.map(command => [command.operationId, command]));
  for (const command of incoming) {
    const previous = operations.get(command.operationId);
    if (previous && !equalJson(previous, command)) throw new StorageError('IMPORT_CONFLICT', '同じ操作IDに異なる履歴があります。', command.operationId);
    if (!previous) operations.set(command.operationId, copy(command));
  }
  return [...operations.values()];
}

function compensate(current: ProjectData, command: CommandRecord): ProjectData {
  const next = copy(current);
  const apply = <T extends Entity | Relation>(before: T[], after: T[], now: T[]): T[] => {
    const old = new Map(before.map(item => [item.id, item])), changed = new Map(after.map(item => [item.id, item])), existing = new Map(now.map(item => [item.id, item]));
    for (const id of new Set([...old.keys(), ...changed.keys()])) {
      const previous = old.get(id), expected = changed.get(id);
      if (equalJson(previous ?? null, expected ?? null)) continue;
      const actual = existing.get(id);
      if (!equalJson(actual ? withoutRevision(actual) : null, expected ? withoutRevision(expected) : null)) throw new StorageError('RESTORE_CONFLICT', '取り消し対象がその後に変更されています。履歴の単体復元で内容を比較してください。', id);
      if (previous) existing.set(id, copy(previous)); else existing.delete(id);
    }
    return [...existing.values()];
  };
  next.entities = apply(command.before.entities, command.after.entities, current.entities);
  next.relations = apply(command.before.relations, command.after.relations, current.relations);
  for (const field of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences', 'snapshots', 'views'] as const) {
    if (equalJson(command.before[field], command.after[field])) continue;
    if (!equalJson(current[field], command.after[field])) throw new StorageError('RESTORE_CONFLICT', '取り消す項目がその後に変更されています。', field);
    (next as unknown as Record<string, unknown>)[field] = copy(command.before[field]);
  }
  return next;
}

export async function cloneProject(input: ProjectData): Promise<{ project: ProjectData; idMap: Record<string, string> }> {
  const idMap: Record<string, string> = { [input.projectId]: newId() };
  const collect = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(collect);
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (['id', 'operationId', 'instanceId', 'deletionOperationId'].includes(key) && typeof item === 'string' && /^[0-9a-f-]{36}$/.test(item)) idMap[item] ??= newId();
      if (key === 'bindings' && item && typeof item === 'object' && !Array.isArray(item)) for (const id of Object.values(item)) if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) idMap[id] ??= newId();
      collect(item);
    }
  };
  collect(input);
  const originalEntities = new Map<string, Entity>(), originalRelations = new Map<string, Relation>();
  const collectOwners = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(collectOwners); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string' && 'kind' in record && 'data' in record && 'projectId' in record) originalEntities.set(record.id, record as unknown as Entity);
    if (typeof record.id === 'string' && 'relationType' in record && 'fromId' in record && 'toId' in record) originalRelations.set(record.id, record as unknown as Relation);
    Object.values(record).forEach(collectOwners);
  };
  collectOwners(input);
  const readPath = (value: unknown, path: string[]): unknown => path.reduce<unknown>((current, segment) => current && typeof current === 'object' ? (current as Record<string, unknown>)[segment] : undefined, value);
  const writePath = (value: Record<string, unknown>, path: string[], item: unknown): void => {
    let cursor = value;
    for (const segment of path.slice(0, -1)) {
      if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    if (path.length) cursor[path[path.length - 1]!] = structuredClone(item);
  };
  const rewriteDeclarations = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(rewriteDeclarations); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string') record.id = idMap[record.id] ?? record.id;
    if (typeof record.instanceId === 'string' && 'quantity' in record && 'consumed' in record) record.instanceId = idMap[record.instanceId] ?? record.instanceId;
    if (record.mode === 'anonymize' && typeof record.publicId === 'string') record.publicId = idMap[record.publicId] ?? record.publicId;
    if (record.publicIds && typeof record.publicIds === 'object') for (const [key, id] of Object.entries(record.publicIds)) if (typeof id === 'string') (record.publicIds as Record<string, string>)[key] = idMap[id] ?? id;
    for (const item of Object.values(record)) rewriteDeclarations(item);
  };
  const rewrite = (value: unknown, key = '', parent?: Record<string, unknown>): unknown => {
    if (typeof value === 'string') {
      if (key === 'onceTriggers') return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, id => idMap[id] ?? id);
      if (key === 'key' && parent && typeof parent.scope === 'string' && Array.isArray(parent.path)) return [parent.scope, typeof parent.itemId === 'string' ? idMap[parent.itemId] ?? parent.itemId : '', ...parent.path.map(part => String(part))].map(part => encodeURIComponent(part)).join(':');
      return (/(?:Id|Ids)$/.test(key) || ['id', 'operationId'].includes(key) || key === 'value' && parent?.type === 'ref') && idMap[value] ? idMap[value] : value;
    }
    if (key === 'importOrigin' && value && typeof value === 'object') { const origin = value as NonNullable<CommandRecord['importOrigin']>; return { ...origin, importOperationId: idMap[origin.importOperationId] ?? origin.importOperationId }; }
    if (key === 'path' && Array.isArray(value)) return [...value];
    if (key === 'assignments' && value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([beat, sceneId]) => [beat, typeof sceneId === 'string' ? idMap[sceneId] ?? sceneId : sceneId]));
    if (Array.isArray(value)) return value.map(item => rewrite(item, key, parent));
    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>;
      if (['entity', 'relation', 'project', 'presentation'].includes(String(source.scope)) && Array.isArray(source.path) && source.before && source.after && 'present' in (source.before as object) && 'present' in (source.after as object)) {
        const scope = String(source.scope), path = source.path as string[], oldItemId = typeof source.itemId === 'string' ? source.itemId : undefined;
        const itemId = oldItemId ? idMap[oldItemId] ?? oldItemId : undefined;
        const mappedPath = [...path];
        const remapValue = (raw: unknown): unknown => {
          if (scope === 'entity' && oldItemId && originalEntities.has(oldItemId) && path.length) {
            const owner = structuredClone(originalEntities.get(oldItemId)!);
            writePath(owner as unknown as Record<string, unknown>, path, raw);
            const rewrittenOwner = rewriteEntityReferences(owner, idMap);
            rewrittenOwner.id = idMap[owner.id] ?? owner.id; rewrittenOwner.projectId = idMap[owner.projectId] ?? owner.projectId;
            if (rewrittenOwner.deletionOperationId) rewrittenOwner.deletionOperationId = idMap[rewrittenOwner.deletionOperationId] ?? rewrittenOwner.deletionOperationId;
            rewriteDeclarations(rewrittenOwner.data);
            return readPath(rewrittenOwner, path);
          }
          if (scope === 'relation' && oldItemId && originalRelations.has(oldItemId) && path.length) {
            const owner = structuredClone(originalRelations.get(oldItemId)!);
            writePath(owner as unknown as Record<string, unknown>, path, raw);
            const rewrittenOwner = rewriteRelationReferences(owner, idMap);
            rewrittenOwner.id = idMap[owner.id] ?? owner.id; rewrittenOwner.projectId = idMap[owner.projectId] ?? owner.projectId;
            return readPath(rewrittenOwner, path);
          }
          if (scope === 'project' && path[0] === 'worldReferences') return structuredClone(raw);
          if (scope === 'presentation' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const presentation = structuredClone(raw) as Record<string, unknown>;
            if (Array.isArray(presentation.chapterOrder)) presentation.chapterOrder = presentation.chapterOrder.map(id => typeof id === 'string' ? idMap[id] ?? id : id);
            return rewrite(presentation);
          }
          const leaf = path.at(-1) ?? '';
          return rewrite(raw, leaf);
        };
        const remapSide = (side: unknown) => {
          const snapshot = structuredClone(side) as Record<string, unknown>;
          if (snapshot.present === true) snapshot.value = remapValue(snapshot.value);
          return snapshot;
        };
        const patch: Record<string, unknown> = { ...source, ...(itemId ? { itemId } : {}), path: mappedPath, before: remapSide(source.before), after: remapSide(source.after) };
        patch.key = [scope, itemId ?? '', ...mappedPath].map(part => encodeURIComponent(part)).join(':');
        return patch;
      }
      const keyedByReference = ['variableValues', 'visitCounts', 'publicTexts', 'publicIds', 'byEntityId', 'bindings'].includes(key);
      const rewritten = Object.fromEntries(Object.entries(value).map(([name, item]) => [keyedByReference ? idMap[name] ?? name : name, ['idMap', 'bindings'].includes(key) && typeof item === 'string' ? idMap[item] ?? item : rewrite(item, name, value as Record<string, unknown>)]));
      if ('kind' in rewritten && 'data' in rewritten && 'projectId' in rewritten) return rewriteEntityReferences(rewritten as Entity, idMap);
      if ('relationType' in rewritten && 'fromId' in rewritten && 'toId' in rewritten) return rewriteRelationReferences(rewritten as unknown as Relation, idMap);
      if (Array.isArray(rewritten.patches) && Array.isArray(rewritten.selectedChangeKeys)) rewritten.selectedChangeKeys = rewritten.patches.map((patch: { key: string }) => patch.key).sort();
      return rewritten;
    }
    return value;
  };
  const project = rewrite(input) as ProjectData;
  const snapshots = new Map<string, Array<Record<string, unknown>>>();
  const collectSnapshots = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(collectSnapshots); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string' && record.content && typeof record.content === 'object' && 'versionLabel' in record && 'contentHash' in record) {
      const copies = snapshots.get(record.id) ?? []; copies.push(record); snapshots.set(record.id, copies);
    }
    Object.values(record).forEach(collectSnapshots);
  };
  collectSnapshots(project);
  const snapshotHashes = new Map<string, string>(), activeSnapshots = new Set<string>();
  const hashSnapshot = async (id: string): Promise<string> => {
    const cached = snapshotHashes.get(id); if (cached) return cached;
    const copies = snapshots.get(id); if (!copies?.length) throw new StorageError('HASH_MISMATCH', '参照したsnapshotがclone後に見つかりません。', id);
    if (activeSnapshots.has(id)) throw new StorageError('HASH_MISMATCH', 'snapshotの内容hashに循環があります。', id);
    activeSnapshots.add(id);
    for (const copy of copies) {
      const content = copy.content as ProjectContent;
      for (const entity of content.entities) if (entity.kind === 'snapshot' && snapshots.has(entity.id)) entity.data.contentHash = await hashSnapshot(entity.id);
    }
    const hash = await sha256(jsonBytes(copies[0]!.content));
    for (const copy of copies) copy.contentHash = hash;
    snapshotHashes.set(id, hash); activeSnapshots.delete(id); return hash;
  };
  for (const id of snapshots.keys()) await hashSnapshot(id);
  const refreshSnapshotReferences = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(refreshSnapshotReferences); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.kind === 'snapshot' && typeof record.id === 'string' && record.data && typeof record.data === 'object') {
      const contentHash = snapshotHashes.get(record.id);
      if (contentHash) (record.data as Record<string, unknown>).contentHash = contentHash;
    }
    Object.values(record).forEach(refreshSnapshotReferences);
  };
  refreshSnapshotReferences(project);
  const resealed = new Set<object>();
  const resealRetainedBranches = async (value: unknown): Promise<void> => {
    if (Array.isArray(value)) { for (const item of value) await resealRetainedBranches(item); return; }
    if (!value || typeof value !== 'object' || resealed.has(value)) return;
    resealed.add(value);
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.authorAlternatives)) record.authorAlternatives = await Promise.all((record.authorAlternatives as ProjectData['authorAlternatives'] ?? []).map(sealAuthorAlternative));
    for (const item of Object.values(record)) await resealRetainedBranches(item);
  };
  await resealRetainedBranches(project);
  return { project, idMap };
}

export function mergeConflicts(existing: ProjectData, incoming: ProjectData): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  for (const field of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const) if (!equalJson(existing[field], incoming[field])) conflicts.push({ id: `project.${field}`, kind: 'project', existing: existing[field], incoming: incoming[field] });
  for (const [field, kind] of [['entities', 'entity'], ['relations', 'relation'], ['snapshots', 'snapshot'], ['views', 'view'], ['authorAlternatives', 'alternative']] as const) {
    const map = new Map<string, unknown>((existing[field] ?? []).map(item => [item.id, item]));
    for (const item of incoming[field] ?? []) if (map.has(item.id) && !equalJson(map.get(item.id), item)) conflicts.push({ id: item.id, kind, existing: map.get(item.id), incoming: item });
  }
  return conflicts;
}
function mergeProjects(existing: ProjectData, incoming: ProjectData, resolutions: Record<string, 'existing' | 'incoming'>): ProjectData {
  const conflicts = mergeConflicts(existing, incoming);
  for (const conflict of conflicts) {
    if (!resolutions[conflict.id]) throw new StorageError('IMPORT_CONFLICT', '同じID・異なる内容の競合があります。採用する内容を選択してください。', conflict.id);
    if (conflict.kind === 'snapshot' && resolutions[conflict.id] !== 'existing') throw new StorageError('IMMUTABLE_SNAPSHOT', '既存snapshotは別の内容へ置き換えられません。', conflict.id);
    if (conflict.kind === 'alternative' && resolutions[conflict.id] !== 'existing') throw new StorageError('IMPORT_CONFLICT', '保存済み作者別案のIDへ別の履歴を上書きできません。', conflict.id);
  }
  const next = copy(existing);
  for (const field of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const) if (resolutions[`project.${field}`] === 'incoming') (next as unknown as Record<string, unknown>)[field] = copy(incoming[field]);
  for (const field of ['entities', 'relations', 'snapshots', 'views', 'authorAlternatives'] as const) {
    const map = new Map<string, unknown>((existing[field] ?? []).map(item => [item.id, item]));
    for (const item of incoming[field] ?? []) if (!map.has(item.id) || resolutions[item.id] === 'incoming') map.set(item.id, copy(item));
    (next as unknown as Record<string, unknown>)[field] = [...map.values()];
  }
  return next;
}

export const scenarioStore = new ScenarioStore();
