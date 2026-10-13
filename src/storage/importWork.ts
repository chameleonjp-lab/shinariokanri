import type {ProjectContent, ProjectData} from '../domain/types';
import {validateProject} from '../domain/model';
import {createProjectValidationSession, validateProjectIntegrity} from '../domain/projectRecordValidation';
import {captureImmutablePlainData, freezeCapturedPlainData} from '../domain/immutablePlainData';
import {internImmutableRecords} from '../domain/internImmutableRecords';
import {verifySnapshotHashes, verifyWorlds, type PreparedScenario} from './archiveData';
import {cloneProject} from './clone';
import {collectImportIds, planCrossProjectImport, type CrossProjectImportPlan, type ImportId} from './importMapping';
import type {ImportConflict} from './store';
import {projectWithRecoveryHistory, validateRecovery, type PortableRecovery} from './recovery';
import {validateSyncRecovery, type NativeSyncRecovery} from './syncRecovery';
import {createSharedArrayJsonEncoder} from './sharedArrayJson';
import {equalJson, jsonBytes, sha256, validateJsonValue} from './json';
import {checkCancelled, StorageError} from './errors';

export type ImportWorkStep = 'full_read' | 'structure' | 'worlds' | 'hashes' | 'integrity' | 'recovery' | 'sync_recovery' | 'ids' | 'clone' | 'map_recovery' | 'rehash_recovery' | 'mapped_plan' | 'merge_conflicts' | 'merge' | 'combine_history';
export interface ImportWork {
  step: ImportWorkStep; project: ProjectData; worlds: Record<string, ProjectContent>;
  recovery?: PortableRecovery; syncRecovery?: NativeSyncRecovery[]; idMap?: Record<string, string>;
  target?: ProjectData; resolutions?: Record<string, 'existing' | 'incoming'>;
  knownWorlds?: Record<string, ProjectData>;
  mapped?: {source: PreparedScenario; knownWorlds: Record<string, ProjectData>};
}
export interface ImportWorkResult {
  project?: ProjectData; recovery?: PortableRecovery; syncRecovery?: NativeSyncRecovery[];
  ids?: ImportId[]; cloned?: {project: ProjectData; idMap: Record<string, string>};
  mappedPlan?: CrossProjectImportPlan; conflicts?: ImportConflict[]; history?: ProjectData['history'];
}

const immutableImportValidationSteps: ReadonlySet<ImportWorkStep> = new Set([
  'full_read', 'structure', 'integrity', 'recovery', 'ids', 'hashes', 'map_recovery', 'rehash_recovery',
]);

/** Freeze only private transport copies whose work is read-only validation.
 * Result-bearing transformations retain their existing mutable/frozen output
 * contracts and continue on the original path. Unsupported graphs are left
 * wholly untouched by freezeCapturedPlainData's all-or-none proof. */
export function freezeCapturedImportWork(work: ImportWork): ImportWork {
  if (immutableImportValidationSteps.has(work.step)) freezeCapturedPlainData(work);
  return work;
}

/** Return a mutable copy without exposing aliases introduced only for private validation/encoding. */
function cloneMutableCaptured<T>(input: T): T {
  const copies = new WeakMap<object, object>();
  const copy = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    const existing = copies.get(value); if (existing) return existing;
    const array = Array.isArray(value), output: unknown[] | Record<string, unknown> = array ? new Array((value as unknown[]).length) : Object.create(Object.getPrototypeOf(value));
    copies.set(value, output);
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== 'string' || !descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Captured plain data changed shape before mutable clone');
      Object.defineProperty(output, key, {value: copy(descriptor.value), enumerable: descriptor.enumerable, writable: true, configurable: true});
    }
    return output;
  };
  return copy(input) as T;
}

type CapturedPublisher = <T>(value: T) => T;
function publishWorkerCaptured<T>(value: T): T { return value; }

/** The same pure checks and transformations run in Node or the browser worker.
 * No database, account authority or mutable target is available here. */
async function runImportWorkCore(work: ImportWork, signal: AbortSignal | undefined,
  loadAsset: ((hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined) | undefined,
  publishCaptured: CapturedPublisher): Promise<ImportWorkResult> {
  checkCancelled(signal);
  const {project, worlds, recovery} = work;
  let result: ImportWorkResult = {};
  switch (work.step) {
    case 'full_read': {
      // One read owns the complete manuscript and exact fixed dependencies.
      // Only successful proofs over this private immutable capture can share
      // structural work; unsupported graphs retain the uncached checks.
      const owned = internImmutableRecords(captureImmutablePlainData({project, worlds, knownWorlds: work.knownWorlds ?? {}}).value);
      const validation = createProjectValidationSession({worldSnapshots: owned.worlds});
      const structural = validation.validate(owned.project);
      if (!structural.ok) throw Object.assign(new StorageError('VALIDATION_FAILED', structural.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues: structural.issues});
      validateJsonValue(structural.value);
      checkCancelled(signal);
      verifyWorlds([owned.project], owned.knownWorlds);
      checkCancelled(signal);
      await verifySnapshotHashes([owned.project]);
      checkCancelled(signal);
      const issues = await validation.integrity(owned.project, owned.project.history.length > 0);
      if (issues.length) throw Object.assign(new StorageError('VALIDATION_FAILED', issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues});
      // The caller retains its private database image. Sending the entire
      // history back would add a discarded transfer without a new proof.
      break;
    }
    case 'structure': {
      const captured = captureImmutablePlainData(project);
      if (captured.captured) {
        // Each imported image owns a fresh full validation scope. Worker input
        // is an untrusted mutable DTO; only the private capture can share
        // record/content checks across its current, snapshots, and history.
        const owned = internImmutableRecords(captured.value);
        const validation = createProjectValidationSession({worldSnapshots: worlds});
        const structural = validation.validate(owned);
        if (!structural.ok) throw Object.assign(new StorageError('VALIDATION_FAILED', structural.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues: structural.issues});
        validateJsonValue(structural.value);
        // Publish the pre-intern capture: the public runner clones it to keep
        // its mutable contract; the worker runner lets postMessage clone it.
        result.project = publishCaptured(captured.value);
      } else {
        // Unsupported own-data graphs retain the complete uncached validator.
        const validation = validateProject(project, {worldSnapshots: worlds});
        if (!validation.ok) throw Object.assign(new StorageError('VALIDATION_FAILED', validation.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues: validation.issues});
        validateJsonValue(validation.value);
        result.project = validation.value;
      }
      break;
    }
    case 'worlds': verifyWorlds([project], work.knownWorlds ?? {}); break;
    case 'hashes': await verifySnapshotHashes([project]); break;
    case 'integrity': {
      const captured = captureImmutablePlainData({project, worlds});
      let issues: Awaited<ReturnType<typeof validateProjectIntegrity>>;
      if (captured.captured) {
        const owned = internImmutableRecords(captured.value);
        issues = await createProjectValidationSession({worldSnapshots: owned.worlds}).integrity(owned.project, owned.project.history.length > 0);
      } else issues = await validateProjectIntegrity(project, {worldSnapshots: worlds}, project.history.length > 0);
      if (issues.length) throw Object.assign(new StorageError('VALIDATION_FAILED', issues.map(issue => `${issue.path}: ${issue.message}`).join('\n')), {issues});
      break;
    }
    case 'recovery': {
      const captured = captureImmutablePlainData({project, recovery, worlds});
      if (captured.captured) {
        const owned = internImmutableRecords(captured.value);
        await validateRecovery(owned.recovery, owned.project, owned.worlds, signal);
        result.recovery = publishCaptured(captured.value.recovery!);
      } else result.recovery = await validateRecovery(recovery, project, worlds, signal);
      break;
    }
    case 'sync_recovery': result.syncRecovery = await validateSyncRecovery(work.syncRecovery, worlds, signal); break;
    case 'ids': {
      const captured = captureImmutablePlainData({project, recovery});
      if (captured.captured) {
        const owned = internImmutableRecords(captured.value);
        result.ids = collectImportIds(projectWithRecoveryHistory(owned.project, owned.recovery));
      } else result.ids = collectImportIds(projectWithRecoveryHistory(project, recovery));
      break;
    }
    case 'clone': result.cloned = await cloneProject(projectWithRecoveryHistory(project, recovery)); break;
    case 'mapped_plan': {
      if (!work.mapped || !work.target || !work.idMap) throw new StorageError('IMPORT_CONFLICT', '別作品の統合候補と全IDの明示対応が必要です。');
      const source = work.mapped.source;
      result.mappedPlan = await planCrossProjectImport({...source, project: projectWithRecoveryHistory(source.project, source.recovery)}, work.target, {
        idMap: work.idMap, resolutions: work.resolutions, knownWorlds: work.mapped.knownWorlds, loadAsset, signal,
      });
      break;
    }
    case 'merge_conflicts':
      if (!work.target) throw new StorageError('NOT_FOUND', '統合先がありません。');
      result.conflicts = mergeImportConflicts(work.target, project); break;
    case 'merge':
      if (!work.target) throw new StorageError('NOT_FOUND', '統合先がありません。');
      result.project = mergeImportProjects(work.target, project, work.resolutions ?? {}); break;
    case 'combine_history': {
      if (!work.target) throw new StorageError('NOT_FOUND', '統合先がありません。');
      const operations = new Map(work.target.history.map(command => [command.operationId, command]));
      for (const command of project.history) {
        const previous = operations.get(command.operationId);
        if (previous && !equalJson(previous, command)) throw new StorageError('IMPORT_CONFLICT', '同じ操作IDに異なる履歴があります。', command.operationId);
        if (!previous) operations.set(command.operationId, structuredClone(command));
      }
      result.history = [...operations.values()]; break;
    }
    case 'map_recovery': {
      if (!recovery || !work.idMap) throw new StorageError('IMPORT_CONFLICT', '復元する送信待ち操作の明示ID対応が不足しています。');
      const captured = captureImmutablePlainData({project, recovery, idMap: work.idMap});
      if (captured.captured) {
        const owned = internImmutableRecords(captured.value), history = new Map(captured.value.project.history.map(record => [record.operationId, record]));
        const hashHistory = new Map(owned.project.history.map(record => [record.operationId, record]));
        const pending: PortableRecovery['pending'] = [], encodeCommand = createSharedArrayJsonEncoder();
        for (const item of captured.value.recovery.pending) {
          checkCancelled(signal);
          const operationId = captured.value.idMap[item.operationId], command = history.get(operationId), hashCommand = hashHistory.get(operationId);
          if (!operationId || !command || !hashCommand) throw new StorageError('IMPORT_CONFLICT', '復元する送信待ち操作の明示ID対応が不足しています。', item.operationId);
          pending.push({operationId, command, commandHash: await sha256(encodeCommand(hashCommand)), origin: item.origin ?? {projectId: captured.value.recovery.projectId, operationId: item.operationId, serverRevision: captured.value.recovery.serverRevision}});
        }
        result.recovery = publishCaptured({...captured.value.recovery, projectId: captured.value.project.projectId, sourceRevision: captured.value.project.revision, pending});
      } else {
        const history = new Map(project.history.map(record => [record.operationId, record]));
        const pending: PortableRecovery['pending'] = [];
        for (const item of recovery.pending) {
          checkCancelled(signal);
          const operationId = work.idMap[item.operationId], command = history.get(operationId);
          if (!operationId || !command) throw new StorageError('IMPORT_CONFLICT', '復元する送信待ち操作の明示ID対応が不足しています。', item.operationId);
          pending.push({operationId, command, commandHash: await sha256(jsonBytes(command)), origin: item.origin ?? {projectId: recovery.projectId, operationId: item.operationId, serverRevision: recovery.serverRevision}});
        }
        result.recovery = {...recovery, projectId: project.projectId, sourceRevision: project.revision, pending};
      }
      break;
    }
    case 'rehash_recovery': {
      if (!recovery) throw new StorageError('VALIDATION_FAILED', '送信待ち復元情報がありません。');
      const captured = captureImmutablePlainData({project, recovery});
      if (captured.captured) {
        const owned = internImmutableRecords(captured.value), history = new Map(captured.value.project.history.map(record => [record.operationId, record]));
        const hashHistory = new Map(owned.project.history.map(record => [record.operationId, record]));
        const pending: PortableRecovery['pending'] = [], encodeCommand = createSharedArrayJsonEncoder();
        for (const [index, item] of captured.value.recovery.pending.entries()) {
          checkCancelled(signal);
          const hashItem = owned.recovery.pending[index]!;
          const command = history.get(item.operationId) ?? item.command, hashCommand = hashHistory.get(hashItem.operationId) ?? hashItem.command;
          pending.push({...item, command, commandHash: await sha256(encodeCommand(hashCommand))});
        }
        result.recovery = publishCaptured({...captured.value.recovery, projectId: captured.value.project.projectId, sourceRevision: captured.value.project.revision, pending});
      } else {
        const history = new Map(project.history.map(record => [record.operationId, record]));
        const pending: PortableRecovery['pending'] = [];
        for (const item of recovery.pending) {
          checkCancelled(signal);
          const command = history.get(item.operationId) ?? item.command;
          pending.push({...item, command, commandHash: await sha256(jsonBytes(command))});
        }
        result.recovery = {...recovery, projectId: project.projectId, sourceRevision: project.revision, pending};
      }
      break;
    }
    default: throw new StorageError('FORMAT_UNSUPPORTED', '読み込みの検査工程が未対応です。');
  }
  checkCancelled(signal);
  return result;
}

/** Public Node/direct-call path retains detached, editable captured results. */
export function runImportWork(work: ImportWork, signal?: AbortSignal, loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined): Promise<ImportWorkResult> {
  return runImportWorkCore(work, signal, loadAsset, cloneMutableCaptured);
}

/** @internal Worker-only path. Its caller must immediately post the result so
 * the worker message clone is the mutable, detached publication boundary. */
export function runImportWorkForWorker(work: ImportWork, signal?: AbortSignal, loadAsset?: (hash: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined): Promise<ImportWorkResult> {
  return runImportWorkCore(work, signal, loadAsset, publishWorkerCaptured);
}

export function mergeImportConflicts(existing: ProjectData, incoming: ProjectData): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  for (const field of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const) if (!equalJson(existing[field], incoming[field])) conflicts.push({ id: `project.${field}`, kind: 'project', existing: existing[field], incoming: incoming[field] });
  for (const [field, kind] of [['entities', 'entity'], ['relations', 'relation'], ['snapshots', 'snapshot'], ['views', 'view'], ['authorAlternatives', 'alternative']] as const) {
    const map = new Map<string, unknown>((existing[field] ?? []).map(item => [item.id, item]));
    for (const item of incoming[field] ?? []) if (map.has(item.id) && !equalJson(map.get(item.id), item)) conflicts.push({ id: item.id, kind, existing: map.get(item.id), incoming: item });
  }
  return conflicts;
}

export function mergeImportProjects(existing: ProjectData, incoming: ProjectData, resolutions: Record<string, 'existing' | 'incoming'>): ProjectData {
  const conflicts = mergeImportConflicts(existing, incoming);
  for (const conflict of conflicts) {
    if (!resolutions[conflict.id]) throw new StorageError('IMPORT_CONFLICT', '同じID・異なる内容の競合があります。採用する内容を選択してください。', conflict.id);
    if (conflict.kind === 'snapshot' && resolutions[conflict.id] !== 'existing') throw new StorageError('IMMUTABLE_SNAPSHOT', '既存snapshotは別の内容へ置き換えられません。', conflict.id);
    if (conflict.kind === 'alternative' && resolutions[conflict.id] !== 'existing') throw new StorageError('IMPORT_CONFLICT', '保存済み作者別案のIDへ別の履歴を上書きできません。', conflict.id);
  }
  const next = structuredClone(existing);
  for (const field of ['name', 'calendarId', 'mainStart', 'calendars', 'worldReferences'] as const) if (resolutions[`project.${field}`] === 'incoming') (next as unknown as Record<string, unknown>)[field] = structuredClone(incoming[field]);
  for (const field of ['entities', 'relations', 'snapshots', 'views', 'authorAlternatives'] as const) {
    const map = new Map<string, unknown>((existing[field] ?? []).map(item => [item.id, item]));
    for (const item of incoming[field] ?? []) if (!map.has(item.id) || resolutions[item.id] === 'incoming') map.set(item.id, structuredClone(item));
    (next as unknown as Record<string, unknown>)[field] = [...map.values()];
  }
  return next;
}

