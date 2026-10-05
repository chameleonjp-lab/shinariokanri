import Dexie, { type Table } from 'dexie';
import type { Block, CommandRecord, ContentState, Entity, ProjectContent, ProjectData, ProjectSnapshot, Relation, SavedView, ViewState } from '../domain/types';
import { collectReferences, newId, rewriteEntityReferences, rewriteRelationReferences, validateProject } from '../domain/model';
import { reconcileDeliverables } from '../domain/production';
import { assetPath, attachmentMetadata, exportScenario, referencedWorlds, validateAsset, verifySnapshotHashes, verifyWorlds, worldSnapshotContents, type PreparedScenario } from './archive';
import { checkCancelled, saveError, StorageError } from './errors';
import { canonicalJson, equalJson, jsonBytes, sha256 } from './json';

type StoredProject = Omit<ProjectData, 'entities' | 'relations' | 'snapshots' | 'history' | 'views'> & {
  entityIds: string[]; relationIds: string[]; snapshotIds: string[]; historyIds: string[]; viewIds: string[];
};
interface StoredEntity { id: string; projectId: string; kind: Entity['kind']; record: unknown }
interface StoredBlock { id: string; projectId: string; entityId: string; block: Block }
interface StoredCommand { operationId: string; projectId: string; revision: string; requestHash?: string; record: CommandRecord }
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
export interface PersistedAck { operationId: string; projectId: string; serverRevision: string; status: 'applied' | 'conflict'; payload?: unknown }
interface SyncMetadata { projectId: string; serverRevision: string; state: 'pending' | 'synced' | 'conflict' }
export interface RestorePoint { id: string; projectId: string; createdAt: string; reason: string; project: ProjectData; assetHashes: string[] }
interface StoredView extends SavedView { projectId: string }
interface StoredViewState extends ViewState { key: string; projectId: string }
interface ImportLog { operationId: string; projectId: string; mode: ImportMode; createdAt: string; idMap?: Record<string, string> }
export interface SaveResult { project: ProjectData; operationId: string; localSaved: true; pendingSync: boolean }
export interface SaveOptions { reason: string; operationId?: string; assets?: AssetInput[]; signal?: AbortSignal; compensatesOperationId?: string }
export type FaultStage = 'after-content' | 'after-history' | 'after-outbox' | 'before-commit';
export interface StoreOptions { databaseName?: string; accountId?: string; faultInjector?: (stage: FaultStage) => void }
export type ImportMode = 'new' | 'clone' | 'replace' | 'merge';
export interface ImportOptions {
  mode: ImportMode; targetProjectId?: string; baseRevision?: string; operationId?: string; signal?: AbortSignal;
  resolutions?: Record<string, 'existing' | 'incoming'>;
}
export interface ImportConflict { id: string; kind: 'project' | 'entity' | 'relation' | 'snapshot' | 'view'; existing: unknown; incoming: unknown }
export interface ImportResult extends SaveResult { mode: ImportMode; idMap?: Record<string, string>; restorePointId?: string; warnings: string[] }

class ScenarioDatabase extends Dexie {
  projects!: Table<StoredProject, string>;
  entities!: Table<StoredEntity, [string, string]>;
  relations!: Table<Relation, [string, string]>;
  blocks!: Table<StoredBlock, [string, string]>;
  snapshots!: Table<ProjectSnapshot & { projectId: string }, [string, string]>;
  commands!: Table<StoredCommand, string>;
  outbox!: Table<OutboxRecord, string>;
  assets!: Table<AssetRecord, string>;
  views!: Table<StoredView, [string, string]>;
  viewStates!: Table<StoredViewState, string>;
  syncMetadata!: Table<SyncMetadata, string>;
  acks!: Table<PersistedAck, string>;
  restorePoints!: Table<RestorePoint, string>;
  worlds!: Table<{ id: string; project: ProjectData }, string>;
  importLogs!: Table<ImportLog, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      projects: 'projectId,name', entities: '[projectId+id],projectId,[projectId+kind]', relations: '[projectId+id],projectId,[projectId+fromId],[projectId+toId]',
      blocks: '[projectId+id],projectId,[projectId+entityId]', snapshots: '[projectId+id],projectId',
      commands: 'operationId,projectId,[projectId+revision]', outbox: 'operationId,projectId,accountId', assets: 'contentHash',
      views: '[projectId+id],projectId', viewStates: 'key,projectId', syncMetadata: 'projectId', acks: 'operationId,projectId',
      restorePoints: 'id,projectId,createdAt', worlds: 'id', importLogs: 'operationId,projectId',
    });
  }
}

const copy = <T>(value: T): T => structuredClone(value);
const increment = (revision: string): string => (BigInt(revision) + 1n).toString();
const withoutHistory = ({ history: _history, ...content }: ProjectData): ContentState => content;
const blankBefore = (project: ProjectData): ContentState => ({ ...withoutHistory(project), entities: [], relations: [], snapshots: [], views: [], revision: '0' });

function validated(input: unknown, worldSnapshots: Record<string, ProjectContent> = {}): ProjectData {
  const result = validateProject(input, { worldSnapshots });
  if (!result.ok) throw new StorageError('VALIDATION_FAILED', result.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
  canonicalJson(result.value);
  return result.value;
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
    if (equalJson(withoutRevision(previous), withoutRevision(record))) return copy(previous);
    return { ...copy(record), revision: increment(previous.revision), ...('updatedAt' in record ? { updatedAt: time } : {}) };
  });
  const ids = new Set(incoming.map(record => record.id));
  for (const previous of before) if (!ids.has(previous.id)) {
    result.push(previous.deletedAt ? copy(previous) : { ...copy(previous), deletedAt: time, deletionOperationId: operationId, revision: increment(previous.revision), ...('updatedAt' in previous ? { updatedAt: time } : {}) });
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
    if (id !== after.projectId && equalJson(previous ? withoutRevision(previous) : null, next ? withoutRevision(next) : null)) continue;
    const fields: FieldChange[] = [];
    for (const field of new Set([...Object.keys(previous ?? {}), ...Object.keys(next ?? {})])) {
      if (['revision', 'updatedAt'].includes(field)) continue;
      const previousValue: Presence = previous && field in previous ? { present: true, value: (previous as unknown as Record<string, unknown>)[field] } : { present: false };
      const nextValue: Presence = next && field in next ? { present: true, value: (next as unknown as Record<string, unknown>)[field] } : { present: false };
      if (!equalJson(previousValue, nextValue)) fields.push({ field, oldValueHash: await sha256(jsonBytes(previousValue)), before: previousValue, after: nextValue });
    }
    result.push({ targetId: id, before: previous, after: next, fields });
  }
  return result;
}

export class ScenarioStore {
  private readonly db: ScenarioDatabase;
  readonly accountId: string | null;
  private readonly faultInjector?: StoreOptions['faultInjector'];
  constructor(options: StoreOptions = {}) {
    this.accountId = options.accountId ?? null;
    this.faultInjector = options.faultInjector;
    this.db = new ScenarioDatabase(options.databaseName ?? (this.accountId ? `scenario-manager-account-${encodeURIComponent(this.accountId)}` : 'scenario-manager-local-v1'));
  }
  // Store names avoid Dexie's recursive KeyPaths expansion on the domain's large discriminated unions.
  private get writeTables(): string[] { return ['projects', 'entities', 'relations', 'blocks', 'snapshots', 'commands', 'outbox', 'assets', 'views', 'syncMetadata', 'restorePoints', 'worlds', 'importLogs']; }
  close(): void { this.db.close(); }
  async deleteDatabase(): Promise<void> { await this.db.delete(); }

  private async readProject(projectId: string): Promise<ProjectData | undefined> {
    const header = await this.db.projects.get(projectId);
    if (!header) return undefined;
    const { entityIds, relationIds, snapshotIds, historyIds, viewIds, ...project } = header;
    const [entities, relations, snapshots, commands, views, blockRows] = await Promise.all([
      this.db.entities.bulkGet(entityIds.map(id => [projectId, id] as [string, string])),
      this.db.relations.bulkGet(relationIds.map(id => [projectId, id] as [string, string])),
      this.db.snapshots.bulkGet(snapshotIds.map(id => [projectId, id] as [string, string])),
      this.db.commands.bulkGet(historyIds), this.db.views.bulkGet(viewIds.map(id => [projectId, id] as [string, string])),
      this.db.blocks.where('projectId').equals(projectId).toArray(),
    ]);
    if ([...entities, ...relations, ...snapshots, ...commands, ...views].some(item => !item)) throw new StorageError('SAVE_FAILED', '作品の保存情報が不足しています。完全保存ファイルから復元してください。', projectId);
    const blocks = new Map(blockRows.map(row => [row.id, row.block]));
    return { ...project, entities: entities.map(row => hydrateBlocks(row!.record, blocks)), relations: relations as Relation[],
      snapshots: snapshots.map(row => { const { projectId: _projectId, ...snapshot } = row!; return snapshot; }),
      history: commands.map(row => row!.record), views: views.map(row => { const { projectId: _projectId, ...view } = row!; return view; }) };
  }

  async getProject(projectId: string): Promise<ProjectData | undefined> {
    try { return await this.db.transaction('r', this.writeTables, () => this.readProject(projectId)); }
    catch (error) { throw saveError(error); }
  }
  async listProjects(): Promise<ProjectData[]> {
    try {
      return await this.db.transaction('r', this.writeTables, async () => {
        const headers = await this.db.projects.toArray();
        return (await Promise.all(headers.map(header => this.readProject(header.projectId)))).filter((item): item is ProjectData => !!item);
      });
    } catch (error) { throw saveError(error); }
  }
  async listHistory(projectId: string): Promise<CommandRecord[]> { return (await this.getProject(projectId))?.history ?? []; }
  private async validationWorlds(extra: Record<string, ProjectData> = {}): Promise<Record<string, ProjectData>> {
    const rows = await this.db.worlds.toArray();
    const worlds = Object.fromEntries(rows.map(row => [row.id, row.project]));
    for (const [id, world] of Object.entries(extra)) worlds[id] = world;
    return worlds;
  }
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

  private async writeContent(project: ProjectData): Promise<void> {
    const { entities, relations, snapshots, history, views, ...header } = project;
    const extracted = entities.map(entity => ({ entity, ...extractBlocks(entity) }));
    const blocks = extracted.flatMap(row => row.blocks);
    if (new Set(blocks.map(row => row.id)).size !== blocks.length) throw new StorageError('VALIDATION_FAILED', '作品内の本文block IDが重複しています。');
    await Promise.all(['entities', 'relations', 'blocks', 'snapshots', 'views'].map(name => this.db.table(name).where('projectId').equals(project.projectId).delete()));
    await this.db.projects.put({ ...header, entityIds: entities.map(row => row.id), relationIds: relations.map(row => row.id), snapshotIds: snapshots.map(row => row.id), historyIds: history.map(row => row.operationId), viewIds: views.map(row => row.id) });
    await Promise.all([
      this.db.entities.bulkPut(extracted.map(row => ({ id: row.entity.id, projectId: project.projectId, kind: row.entity.kind, record: row.record }))),
      this.db.relations.bulkPut(relations), this.db.blocks.bulkPut(blocks),
      this.db.snapshots.bulkPut(snapshots.map(row => ({ ...row, projectId: project.projectId }))),
      this.db.views.bulkPut(views.map(row => ({ ...row, projectId: project.projectId }))),
    ]);
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
    try {
      checkCancelled(options.signal);
      const draft = copy(input), operationId = options.operationId ?? newId(), now = new Date().toISOString();
      const assets = await this.checkedAssets(options.assets);
      const requestHash = await sha256(jsonBytes({ draft, reason: options.reason, assets: (options.assets ?? []).map(asset => ({ contentHash: asset.contentHash, mediaType: asset.mediaType, path: asset.assetPath ?? null })), compensatesOperationId: options.compensatesOperationId ?? null }));
      const duplicate = await this.db.commands.get(operationId);
      if (duplicate) return this.duplicateResult(duplicate, requestHash, draft.projectId);
      const previous = await this.getProject(draft.projectId);
      const worlds = await this.validationWorlds(), worldContents = worldSnapshotContents(worlds);
      if (previous && previous.revision !== draft.revision || !previous && draft.revision !== '0') throw new StorageError('REVISION_CONFLICT', '別の編集が先に保存されています。現在版を読み直して変更を比較してください。', draft.projectId);
      if (previous && !equalJson(previous.history, draft.history)) throw new StorageError('OPERATION_CONFLICT', '履歴は保存コマンドからのみ追加できます。');
      if (!previous && draft.history.length) throw new StorageError('OPERATION_CONFLICT', '既存履歴の復元には専用読み込みを使用してください。');
      if (!options.reason.trim()) throw new StorageError('VALIDATION_FAILED', '変更の理由を指定してください。');
      let candidate = { ...draft, entities: normalizeRecords(previous?.entities ?? [], draft.entities, operationId, now), relations: normalizeRecords(previous?.relations ?? [], draft.relations, operationId, now), revision: increment(draft.revision) };
      if (previous) {
        protectSnapshots(previous, candidate);
        candidate = await reconcileDeliverables(previous, candidate);
        candidate.entities = normalizeRecords(previous.entities, candidate.entities, operationId, now);
      }
      candidate = validated(candidate, worldContents);
      verifyWorlds([candidate], worlds);
      await verifySnapshotHashes([candidate]);
      const before = copy(previous ? withoutHistory(previous) : blankBefore(draft)), after = copy(withoutHistory(candidate));
      const changes = await targetChanges(before, after, !previous);
      const command: CommandRecord = { operationId, projectId: candidate.projectId, baseRevision: draft.revision, revision: candidate.revision, targetIds: changes.map(change => change.targetId), reason: options.reason, createdAt: now, before, after, ...(options.compensatesOperationId ? { compensatesOperationId: options.compensatesOperationId } : {}) };
      candidate.history = [...(previous?.history ?? []), command];
      candidate = validated(candidate, worldContents);
      return await this.db.transaction('rw', this.writeTables, async () => {
        checkCancelled(options.signal);
        const replay = await this.db.commands.get(operationId);
        if (replay) return this.duplicateResult(replay, requestHash, candidate.projectId);
        const header = await this.db.projects.get(candidate.projectId);
        if (previous ? !header || header.revision !== previous.revision : !!header) throw new StorageError('REVISION_CONFLICT', '保存中に現在版が変わりました。変更を比較して再試行してください。', candidate.projectId);
        await this.writeAssets(assets, candidate, false);
        await this.writeContent(candidate);
        this.faultInjector?.('after-content');
        await this.db.commands.add({ operationId, projectId: candidate.projectId, revision: candidate.revision, requestHash, record: command });
        this.faultInjector?.('after-history');
        const metadata = await this.db.syncMetadata.get(candidate.projectId);
        await this.db.outbox.add({ operationId, projectId: candidate.projectId, accountId: this.accountId, baseRevision: metadata?.serverRevision ?? '0', localRevision: candidate.revision, createdAt: now, targetIds: command.targetIds, changes, command });
        await this.db.syncMetadata.put({ projectId: candidate.projectId, serverRevision: metadata?.serverRevision ?? '0', state: 'pending' });
        this.faultInjector?.('after-outbox');
        checkCancelled(options.signal); this.faultInjector?.('before-commit');
        return { project: candidate, operationId, localSaved: true as const, pendingSync: true as const };
      });
    } catch (error) { throw saveError(error); }
  }

  private async duplicateResult(command: StoredCommand, hash: string, projectId: string): Promise<SaveResult> {
    if (command.projectId !== projectId || command.requestHash !== hash) throw new StorageError('OPERATION_CONFLICT', '同じ操作IDが異なる変更に使われています。', command.operationId);
    const project = await this.getProject(projectId);
    if (!project) throw new StorageError('NOT_FOUND', '作品が見つかりません。', projectId);
    return { project: { ...copy(command.record.after), history: project.history.filter(record => BigInt(record.revision) <= BigInt(command.revision)) }, operationId: command.operationId, localSaved: true, pendingSync: !!(await this.db.outbox.get(command.operationId)) };
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
    const current = await this.getProject(projectId);
    const command = current?.history.find(record => record.operationId === historyOperationId), source = command?.[side].entities.find(entity => entity.id === entityId);
    if (!current || !command || !source) throw new StorageError('NOT_FOUND', '指定した版の情報が見つかりません。', entityId);
    const referrers = current.entities.filter(entity => entity.id !== entityId && collectReferences(entity).some(reference => reference.id === entityId)).map(entity => entity.id);
    return { project: current, source: copy(source), referrers, warnings: referrers.length ? [`${referrers.length}件の参照があります。翻訳・音声・媒体版は内容の変更に応じて確認待ちになります。`] : [] };
  }
  async restoreEntity(projectId: string, historyOperationId: string, entityId: string, side: 'before' | 'after' = 'after'): Promise<SaveResult> {
    const preview = await this.previewRestoreEntity(projectId, historyOperationId, entityId, side);
    const project = preview.project;
    project.entities = project.entities.some(entity => entity.id === entityId) ? project.entities.map(entity => entity.id === entityId ? preview.source : entity) : [...project.entities, preview.source];
    return this.saveProject(project, { reason: `履歴から単体復元: ${preview.source.name}`, compensatesOperationId: historyOperationId });
  }
  async restoreRelation(projectId: string, historyOperationId: string, relationId: string, side: 'before' | 'after' = 'after'): Promise<SaveResult> {
    const current = await this.getProject(projectId), command = current?.history.find(item => item.operationId === historyOperationId);
    const source = command?.[side].relations.find(item => item.id === relationId);
    if (!current || !source) throw new StorageError('NOT_FOUND', '指定した版の関係が見つかりません。', relationId);
    current.relations = current.relations.some(item => item.id === relationId) ? current.relations.map(item => item.id === relationId ? copy(source) : item) : [...current.relations, copy(source)];
    return this.saveProject(current, { reason: '履歴から関係を単体復元', compensatesOperationId: historyOperationId });
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
  async listOutbox(projectId: string): Promise<OutboxRecord[]> { return (await this.db.outbox.where('projectId').equals(projectId).toArray()).sort((left, right) => BigInt(left.localRevision) < BigInt(right.localRevision) ? -1 : 1); }
  async getSaveState(projectId: string): Promise<{ localSaved: boolean; pendingCount: number; serverRevision: string; syncState: 'pending' | 'synced' | 'conflict' }> {
    return this.db.transaction('r', ['projects', 'outbox', 'syncMetadata'], async () => {
      const [project, metadata, pendingCount] = await Promise.all([this.db.projects.get(projectId), this.db.syncMetadata.get(projectId), this.db.outbox.where('projectId').equals(projectId).count()]);
      return { localSaved: !!project, pendingCount, serverRevision: metadata?.serverRevision ?? '0', syncState: metadata?.state ?? 'pending' };
    });
  }

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
      const project = await this.readProject(projectId);
      if (!project) throw new StorageError('NOT_FOUND', '復元点を作る作品が見つかりません。');
      await this.writeAssets([], project, true);
      const point = { id: newId(), projectId, createdAt: new Date().toISOString(), reason, project, assetHashes: attachmentMetadata(project).map(item => item.contentHash) };
      await this.db.restorePoints.add(point); return point;
    });
  }
  async listRestorePoints(projectId: string): Promise<RestorePoint[]> { return this.db.restorePoints.where('projectId').equals(projectId).reverse().toArray(); }
  async restorePoint(projectId: string, restorePointId: string): Promise<SaveResult> {
    const [point, current] = await Promise.all([this.db.restorePoints.get(restorePointId), this.getProject(projectId)]);
    if (!point || point.projectId !== projectId || !current) throw new StorageError('NOT_FOUND', 'この作品の復元点が見つかりません。');
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

  async exportProject(projectId: string, options: Omit<NonNullable<Parameters<typeof exportScenario>[1]>, 'loadAsset' | 'worlds'> = {}): Promise<Uint8Array> {
    const project = options.snapshotId ? await this.getProjectAtSnapshot(projectId, options.snapshotId) : await this.getProject(projectId);
    if (!project) throw new StorageError('NOT_FOUND', '書き出す作品が見つかりません。');
    const worlds: Record<string, ProjectData> = {};
    let discovered = [project];
    while (discovered.length) {
      const next: ProjectData[] = [];
      for (const reference of referencedWorlds(discovered)) {
        if (worlds[reference.immutableSnapshotId]) continue;
        const row = await this.db.worlds.get(reference.immutableSnapshotId);
        if (row) { worlds[reference.immutableSnapshotId] = row.project; next.push(row.project); }
      }
      discovered = next;
    }
    return exportScenario(project, { ...options, worlds, loadAsset: hash => this.getAsset(hash) });
  }

  async previewImport(prepared: PreparedScenario, options: ImportOptions): Promise<{ conflicts: ImportConflict[]; pendingChanges: number; target?: ProjectData; additions: number }> {
    const incoming = prepared.project, targetId = options.targetProjectId ?? incoming.projectId, target = await this.getProject(targetId);
    const pendingChanges = target ? (await this.listOutbox(targetId)).length : 0;
    if (options.mode === 'new') return { conflicts: target ? [{ id: targetId, kind: 'project', existing: target, incoming }] : [], pendingChanges, target, additions: incoming.entities.length + incoming.relations.length };
    if (options.mode === 'clone') return { conflicts: [], pendingChanges: 0, additions: incoming.entities.length + incoming.relations.length };
    if (!target) throw new StorageError('NOT_FOUND', '置換・統合する既存作品が見つかりません。', targetId);
    if (targetId !== incoming.projectId) throw new StorageError('IMPORT_CONFLICT', '置換・統合は同じprojectIdが必要です。別の作品には複製して追加してください。', targetId);
    const conflicts = mergeConflicts(target, incoming);
    const ids = new Set([...target.entities, ...target.relations].map(item => item.id));
    return { conflicts, pendingChanges, target, additions: [...incoming.entities, ...incoming.relations].filter(item => !ids.has(item.id)).length };
  }

  async importScenario(preparedInput: PreparedScenario, options: ImportOptions): Promise<ImportResult> {
    try {
      checkCancelled(options.signal);
      if (!['new', 'clone', 'replace', 'merge'].includes(options.mode)) throw new StorageError('FORMAT_UNSUPPORTED', '読み込みモードが未対応です。');
      const prepared = copy(preparedInput), operationId = options.operationId ?? newId();
      const knownWorlds = await this.validationWorlds(prepared.worlds), worldContents = worldSnapshotContents(knownWorlds);
      prepared.project = validated(prepared.project, worldContents);
      verifyWorlds([prepared.project, ...Object.values(prepared.worlds)], knownWorlds);
      if (prepared.manifest.projectId !== prepared.project.projectId) throw new StorageError('VALIDATION_FAILED', '読み込み候補とmanifestの作品IDが一致しません。');
      const preview = await this.previewImport(prepared, options);
      if (options.mode === 'new' && preview.target) throw new StorageError('IMPORT_CONFLICT', '同じ作品IDが既にあります。複製・置換・統合を選んでください。');
      if (options.mode === 'replace' && preview.pendingChanges) throw new StorageError('PENDING_CHANGES', '未送信の変更があります。同期・競合解決を済ませるか、複製して復元してください。');
      if (preview.target && options.baseRevision !== preview.target.revision) throw new StorageError('REVISION_CONFLICT', '確認した対象版と現在版が一致しません。読み込みの影響を確認し直してください。');
      let project = prepared.project, idMap: Record<string, string> | undefined;
      if (options.mode === 'clone') { ({ project, idMap } = await cloneProject(project)); }
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
      const worlds = Object.entries(prepared.worlds).map(([id, world]) => ({ id, project: validated(world, worldContents) }));
      const now = new Date().toISOString(), before = preview.target ? withoutHistory(preview.target) : blankBefore(project);
      let command: CommandRecord;
      if (preview.target) {
        project = { ...project, revision: increment(preview.target.revision), history: combineHistories(preview.target.history, prepared.project.history) };
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
      project = validated(project, worldContents);
      // New recovery retains the original content revisions/history; the local import audit is separate.
      const point: RestorePoint | undefined = preview.target ? { id: newId(), projectId: preview.target.projectId, createdAt: now, reason: `専用ファイル${options.mode}の前の復元点`, project: preview.target, assetHashes: attachmentMetadata(preview.target).map(item => item.contentHash) } : undefined;
      return await this.db.transaction('rw', this.writeTables, async () => {
        checkCancelled(options.signal);
        if (await this.db.importLogs.get(operationId) || await this.db.outbox.get(operationId) || await this.db.commands.get(operationId)) throw new StorageError('OPERATION_CONFLICT', 'この読み込み操作IDは既に使われています。');
        const header = await this.db.projects.get(project.projectId);
        if (preview.target ? !header || header.revision !== preview.target.revision : !!header) throw new StorageError('REVISION_CONFLICT', '読み込みの確定前に対象作品が変わりました。');
        if (options.mode === 'replace' && await this.db.outbox.where('projectId').equals(project.projectId).count()) throw new StorageError('PENDING_CHANGES', '確定前に未送信の変更が増えました。');
        if (point) { await this.writeAssets([], point.project, true); await this.db.restorePoints.add(point); }
        await this.writeAssets(assets, project, prepared.manifest.assetMode === 'embedded');
        for (const world of worlds) {
          const existing = await this.db.worlds.get(world.id);
          if (existing && !equalJson(existing.project, world.project)) throw new StorageError('IMMUTABLE_SNAPSHOT', '既存の共通世界snapshotと内容が異なります。', world.id);
          await this.db.worlds.put(world);
        }
        await this.writeContent(project); this.faultInjector?.('after-content');
        for (const record of project.history) {
          const old = await this.db.commands.get(record.operationId);
          if (old && !equalJson(old.record, record)) throw new StorageError('OPERATION_CONFLICT', '読み込む履歴の操作IDが既存履歴と衝突しています。', record.operationId);
          if (!old) await this.db.commands.add({ operationId: record.operationId, projectId: project.projectId, revision: record.revision, record });
        }
        this.faultInjector?.('after-history');
        const metadata = await this.db.syncMetadata.get(project.projectId);
        await this.db.outbox.add({ operationId, projectId: project.projectId, accountId: this.accountId, baseRevision: metadata?.serverRevision ?? '0', localRevision: project.revision, createdAt: now, targetIds: command.targetIds, changes, command });
        await this.db.syncMetadata.put({ projectId: project.projectId, serverRevision: metadata?.serverRevision ?? '0', state: 'pending' });
        await this.db.importLogs.add({ operationId, projectId: project.projectId, mode: options.mode, createdAt: now, ...(idMap ? { idMap } : {}) });
        this.faultInjector?.('after-outbox'); checkCancelled(options.signal); this.faultInjector?.('before-commit');
        return { project, operationId, localSaved: true as const, pendingSync: true as const, mode: options.mode, ...(idMap ? { idMap } : {}), ...(point ? { restorePointId: point.id } : {}), warnings: prepared.warnings };
      });
    } catch (error) { throw saveError(error); }
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]); }

function preservePublishedVersions(candidate: ProjectData, current: ProjectData): ProjectData {
  const snapshots = new Map(candidate.snapshots.map(item => [item.id, item]));
  for (const version of current.snapshots) snapshots.set(version.id, copy(version));
  candidate.snapshots = [...snapshots.values()];
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
      collect(item);
    }
  };
  collect(input);
  const rewrite = (value: unknown, key = '', parent?: Record<string, unknown>): unknown => {
    if (typeof value === 'string') {
      if (key === 'onceTriggers') return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, id => idMap[id] ?? id);
      return (/(?:Id|Ids)$/.test(key) || ['id', 'operationId'].includes(key) || key === 'value' && parent?.type === 'ref') && idMap[value] ? idMap[value] : value;
    }
    if (Array.isArray(value)) return value.map(item => rewrite(item, key, parent));
    if (value && typeof value === 'object') {
      const keyedByReference = ['variableValues', 'visitCounts', 'publicTexts', 'publicIds', 'byEntityId'].includes(key);
      const rewritten = Object.fromEntries(Object.entries(value).map(([name, item]) => [keyedByReference ? idMap[name] ?? name : name, key === 'idMap' && typeof item === 'string' ? idMap[item] ?? item : rewrite(item, name, value as Record<string, unknown>)]));
      if ('kind' in rewritten && 'data' in rewritten && 'projectId' in rewritten) return rewriteEntityReferences(rewritten as Entity, idMap);
      if ('relationType' in rewritten && 'fromId' in rewritten && 'toId' in rewritten) return rewriteRelationReferences(rewritten as unknown as Relation, idMap);
      return rewritten;
    }
    return value;
  };
  const project = rewrite(input) as ProjectData;
  const refresh = async (value: unknown): Promise<void> => {
    if (Array.isArray(value)) { for (const item of value) await refresh(item); return; }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    for (const item of Object.values(record)) await refresh(item);
    if (record.content && typeof record.content === 'object' && 'versionLabel' in record && 'contentHash' in record) record.contentHash = await sha256(jsonBytes(record.content));
  };
  await refresh(project);
  return { project, idMap };
}

export function mergeConflicts(existing: ProjectData, incoming: ProjectData): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  for (const field of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const) if (!equalJson(existing[field], incoming[field])) conflicts.push({ id: `project.${field}`, kind: 'project', existing: existing[field], incoming: incoming[field] });
  for (const [field, kind] of [['entities', 'entity'], ['relations', 'relation'], ['snapshots', 'snapshot'], ['views', 'view']] as const) {
    const map = new Map<string, unknown>(existing[field].map(item => [item.id, item]));
    for (const item of incoming[field]) if (map.has(item.id) && !equalJson(map.get(item.id), item)) conflicts.push({ id: item.id, kind, existing: map.get(item.id), incoming: item });
  }
  return conflicts;
}
function mergeProjects(existing: ProjectData, incoming: ProjectData, resolutions: Record<string, 'existing' | 'incoming'>): ProjectData {
  const conflicts = mergeConflicts(existing, incoming);
  for (const conflict of conflicts) {
    if (!resolutions[conflict.id]) throw new StorageError('IMPORT_CONFLICT', '同じID・異なる内容の競合があります。採用する内容を選択してください。', conflict.id);
    if (conflict.kind === 'snapshot' && resolutions[conflict.id] !== 'existing') throw new StorageError('IMMUTABLE_SNAPSHOT', '既存snapshotは別の内容へ置き換えられません。', conflict.id);
  }
  const next = copy(existing);
  for (const field of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const) if (resolutions[`project.${field}`] === 'incoming') (next as unknown as Record<string, unknown>)[field] = copy(incoming[field]);
  for (const field of ['entities', 'relations', 'snapshots', 'views'] as const) {
    const map = new Map<string, unknown>(existing[field].map(item => [item.id, item]));
    for (const item of incoming[field]) if (!map.has(item.id) || resolutions[item.id] === 'incoming') map.set(item.id, copy(item));
    (next as unknown as Record<string, unknown>)[field] = [...map.values()];
  }
  return next;
}

export const scenarioStore = new ScenarioStore();
